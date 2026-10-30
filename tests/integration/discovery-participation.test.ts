import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { GET } from "@/app/api/sessions/route";
import { loadDiscoveryScreen } from "@/app/discover/load-screen";
import { getDiscoveryDependencies } from "@/app/discover/server-dependencies";
import { PostgresSessionDiscoveryTransaction } from "@/lib/sessions/postgres-session-discovery-transaction";
import { DiscoverSessions } from "@/use-cases/sessions/DiscoverSessions";
import { sessionTestEnvironment } from "../support/session-test-context";

vi.mock("@/app/discover/server-dependencies", () => ({ getDiscoveryDependencies: vi.fn() }));

const viewerId = "10000000-0000-4000-8000-000000000001";
const otherId = "10000000-0000-4000-8000-000000000002";
const sessionId = "20000000-0000-4000-8000-000000000001";
const now = new Date("2040-01-01T00:00:00Z");

describe("discovery excludes the viewer's active participation", () => {
  let pool: Pool;
  let discoverSessions: DiscoverSessions;
  let authenticatedUserId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: sessionTestEnvironment().databaseUrl, max: 1 });
    // Connection-local fixtures exercise real PostgreSQL without changing persisted sessions.
    await pool.query(`
      create temporary table sessions (
        session_id uuid primary key, venue_name text, sport text, region text,
        start_at timestamptz, end_at timestamptz, total_slots integer,
        booking_share_cents bigint, visibility text, status text
      );
      create temporary table participations (
        session_id uuid, user_id uuid, status text
      );
    `);
    discoverSessions = new DiscoverSessions({
      transaction: new PostgresSessionDiscoveryTransaction(() => pool),
      clock: { now: () => now },
    });
    vi.mocked(getDiscoveryDependencies).mockResolvedValue({
      authenticate: async () => authenticatedUserId,
      discoverSessions,
    });
  });

  afterAll(async () => { await pool?.end(); });

  beforeEach(async () => {
    authenticatedUserId = viewerId;
    await pool.query("truncate sessions, participations");
    await pool.query(
      `insert into sessions values ($1, 'Discovery fixture', 'Badminton', 'West',
       '2040-06-01T10:00:00Z', '2040-06-01T12:00:00Z', 8, 500, 'PUBLIC', 'OPEN')`,
      [sessionId],
    );
  });

  async function participate(status: string, userId = viewerId) {
    await pool.query("insert into participations values ($1, $2, $3)", [sessionId, userId, status]);
  }

  async function apiPage(query = "") {
    const response = await GET(new Request(`http://localhost/api/sessions?${query}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    return response.json();
  }

  test("joining removes the session on the next discovery read only for that viewer", async () => {
    expect((await apiPage()).items.map((item: { sessionId: string }) => item.sessionId)).toEqual([sessionId]);

    await participate("COMMITTED");

    // URL input cannot replace the authenticated viewer used for exclusion.
    expect(await apiPage(`viewerId=${otherId}`)).toEqual({ items: [], nextCursor: null });
    authenticatedUserId = otherId;
    expect((await apiPage()).items.map((item: { sessionId: string }) => item.sessionId)).toEqual([sessionId]);
  });

  test("waitlisted sessions are also absent from discovery", async () => {
    await participate("WAITLISTED");
    expect(await apiPage()).toEqual({ items: [], nextCursor: null });
  });

  test("the initial server screen excludes sessions already joined by its viewer", async () => {
    await participate("COMMITTED");
    const screen = await loadDiscoveryScreen({}, viewerId);
    expect(screen.outcome).toEqual({ status: "ready", page: { items: [], nextCursor: null } });
  });

  test.each(["LEFT_WAITLIST", "WITHDRAWN", "REMOVED", "CANCELLED"])(
    "past %s participation does not hide a session", async (status) => {
      await participate(status);
      expect((await apiPage()).items.map((item: { sessionId: string }) => item.sessionId)).toEqual([sessionId]);
    },
  );

  test("a withdrawn session reappears on the next discovery read", async () => {
    await participate("COMMITTED");
    expect((await apiPage()).items).toEqual([]);
    await pool.query("update participations set status = 'WITHDRAWN'");
    expect((await apiPage()).items.map((item: { sessionId: string }) => item.sessionId)).toEqual([sessionId]);
  });

  test("excludes joined sessions before pagination so the first page stays full", async () => {
    await pool.query(`insert into sessions
      select ('20000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
        'Discovery fixture', 'Badminton', 'West', '2040-06-01T10:00:00Z'::timestamptz,
        '2040-06-01T12:00:00Z'::timestamptz, 8, 500, 'PUBLIC', 'OPEN'
      from generate_series(2, 21) n`);
    await participate("COMMITTED");

    const page = await apiPage("sport=Badminton&region=West");

    expect(page.items).toHaveLength(20);
    expect(page.items.map((item: { sessionId: string }) => item.sessionId)).not.toContain(sessionId);
    expect(page.nextCursor).toBeNull();
    expect(Object.keys(page.items[0]).sort()).toEqual([
      "bookingShareCents", "endAt", "region", "sessionId", "sport", "startAt", "totalSlots", "venueName",
    ]);
  });
});
