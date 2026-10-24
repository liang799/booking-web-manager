import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";

/** Only the runner's disposable loopback stack may receive readiness probes. */
function disposableSettings(environment) {
  const databaseUrl = environment.SESSION_TEST_DATABASE_URL;
  const supabaseUrl = environment.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = environment.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const invalid = () => new Error("Realtime readiness requires the disposable loopback stack on 55321/55322");
  if (!databaseUrl || !supabaseUrl || !anonKey ||
      !environment.SESSION_TEST_STACK_ID?.startsWith("bwm-session-tests-")) throw invalid();
  let database;
  let api;
  try {
    database = new URL(databaseUrl);
    api = new URL(supabaseUrl);
  } catch {
    throw invalid();
  }
  const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (!loopback.has(database.hostname) || database.port !== "55322" ||
      database.pathname !== "/postgres" || database.search !== "" ||
      !["postgres:", "postgresql:"].includes(database.protocol) ||
      !loopback.has(api.hostname) || api.port !== "55321" || api.protocol !== "http:" ||
      environment.DATABASE_URL !== databaseUrl) throw invalid();
  return { databaseUrl, supabaseUrl, anonKey };
}

/**
 * SUBSCRIBED can precede creation of Supabase's database replication slot.
 * Prove a database-to-anonymous-client round trip before starting any suite.
 * Keep this subscription alive through builds/tests; the returned disposer is
 * called by the runner before it removes the disposable stack.
 */
export async function prepareSessionRealtime(environment) {
  const settings = disposableSettings(environment);
  const topic = `session-tests:ready:${randomUUID()}`;
  const nonce = randomUUID();
  const pool = new Pool({
    connectionString: settings.databaseUrl,
    max: 1,
    connectionTimeoutMillis: 2_000,
    query_timeout: 2_000,
    statement_timeout: 2_000,
  });
  const client = createClient(settings.supabaseUrl, settings.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let delivered = false;
  let channelFailure;
  const channel = client.channel(topic, { config: { private: false } })
    .on("broadcast", { event: "ready" }, (message) => {
      if (message.payload?.nonce === nonce) delivered = true;
    });
  const dispose = async () => {
    try {
      await client.removeChannel(channel);
    } finally {
      client.realtime.disconnect();
    }
  };
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Disposable Realtime subscription timed out")), 10_000);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeout);
          resolve();
        } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
          clearTimeout(timeout);
          channelFailure = new Error(`Disposable Realtime subscription failed: ${status}`);
          reject(channelFailure);
        }
      });
    });
    const deadline = Date.now() + 15_000;
    while (!delivered && Date.now() < deadline) {
      if (channelFailure) throw channelFailure;
      await pool.query("select realtime.send($1::jsonb, 'ready', $2, false)", [JSON.stringify({ nonce }), topic]);
      // A retry interval, not a readiness assumption: only receipt of the nonce succeeds.
      if (!delivered) await delay(100);
    }
    if (!delivered) throw new Error("Disposable Realtime database broadcast did not arrive within 15 seconds");
    return dispose;
  } catch (error) {
    await dispose();
    throw error;
  } finally {
    await pool.end();
  }
}
