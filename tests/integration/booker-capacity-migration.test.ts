import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { sessionTestContext } from "../support/session-test-context";

test("booker capacity migration preserves existing places, accepted prices and funded history", async () => {
  const context = sessionTestContext();
  const connection = await context.pool.connect();
  try {
    // Temporary tables shadow the real schema for an isolated migration rehearsal.
    await connection.query(`create temporary table sessions (
      session_id text, booker_id text, total_slots integer,
      minimum_headcount integer not null,
      booking_share_cents bigint,
      constraint sessions_total_slots_check check (total_slots between 1 and 30),
      constraint sessions_price_within_range check (booking_share_cents > 0)
    )`);
    await connection.query(`create temporary table participations (
      session_id text, user_id text, status text, held_cents bigint,
      participation_id text, replacement_mode text, replacement_invitee_id text,
      replaces_participation_id text
    )`);
    await connection.query(`create temporary table fund_holds (
      participation_id text, state text, amount_cents bigint
    )`);
    await connection.query(`insert into sessions values
      ('maximum', 'host', 30, 2, 2000),
      ('quoted', 'host', 2, 2, 1000),
      ('already-counted', 'host', 2, 2, 500),
      ('waitlisted-host', 'host', 2, 2, 500)`);
    await connection.query(`insert into participations (session_id, user_id, status, held_cents) values
      ('maximum', 'guest', 'COMMITTED', 2000),
      ('already-counted', 'host', 'COMMITTED', 500),
      ('waitlisted-host', 'host', 'WAITLISTED', null)`);
    await connection.query(`insert into participations
      (session_id, user_id, status, participation_id, replacement_mode, replacement_invitee_id)
      values ('quoted', 'withdrawn-guest', 'WITHDRAWN', 'withdrawal', 'DIRECT_INVITE', 'host')`);
    await connection.query("insert into fund_holds values ('withdrawal', 'AWAITING_REPLACEMENT', 1000)");

    await connection.query(await readFile("supabase/migrations/0019_booker_participation.sql", "utf8"));

    expect((await connection.query("select * from sessions order by session_id")).rows).toEqual([
      { session_id: "already-counted", booker_id: "host", total_slots: 2, booking_share_cents: "500" },
      { session_id: "maximum", booker_id: "host", total_slots: 31, booking_share_cents: "2000" },
      { session_id: "quoted", booker_id: "host", total_slots: 3, booking_share_cents: "1000" },
      { session_id: "waitlisted-host", booker_id: "host", total_slots: 3, booking_share_cents: "500" },
    ]);
    expect((await connection.query("select held_cents from participations where participation_id is null order by session_id")).rows)
      .toEqual([{ held_cents: "500" }, { held_cents: "2000" }, { held_cents: null }]);
    expect((await connection.query("select status from participations where session_id = 'waitlisted-host'")).rows)
      .toEqual([{ status: "LEFT_WAITLIST" }]);
    expect((await connection.query("select replacement_mode, replacement_invitee_id from participations where participation_id = 'withdrawal'")).rows)
      .toEqual([{ replacement_mode: "OPEN_SLOT", replacement_invitee_id: null }]);
    expect((await connection.query("select * from fund_holds")).rows)
      .toEqual([{ participation_id: "withdrawal", state: "AWAITING_REPLACEMENT", amount_cents: "1000" }]);
    await connection.query("insert into sessions values ('solo', 'host', 1, 1000)");
    await expect(connection.query("insert into sessions values ('bad', 'host', 2, 0)"))
      .rejects.toMatchObject({ code: "23514" });
  } finally {
    await connection.query("rollback");
    connection.release(true);
    await context.pool.end();
  }
});
