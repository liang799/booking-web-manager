import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

/**
 * UC1-06 invitations by user ID (ADR-0022) against real Postgres: save_regular_group
 * saves invitations in the same guarded write as memberships, checks both accounts,
 * and still ends invitations when the app version before 0017 saves a group.
 *
 * Skipped unless `GROUP_INVITATIONS_TEST_DATABASE_URL` points at a throwaway database,
 * because CI has no Postgres. It drops and recreates the `public` schema, so it only runs
 * against a loopback host and a database with "test" in its name. Set up as in
 * UC1-01-provisioning.db.test.ts, using its own database.
 */

const DATABASE_URL = process.env.GROUP_INVITATIONS_TEST_DATABASE_URL;

const MIGRATIONS = [
  "0001_wallet_ledger.sql",
  "0002_idempotency_and_reconciliation.sql",
  "0003_ledger_rls.sql",
  "0004_profiles.sql",
  "0005_regular_groups.sql",
  "0010_group_account_guards.sql",
  "0011_profile_policy_guards.sql",
  "0016_user_handles.sql",
  "0017_group_invitations.sql",
];

const OWNER = "00000000-0000-4000-8000-000000000201";
const AISHA = "00000000-0000-4000-8000-000000000202";
const BEN = "00000000-0000-4000-8000-000000000203";
const GONE = "00000000-0000-4000-8000-000000000204";
const GROUP = "00000000-0000-4000-8000-0000000002a1";

/** Refuses anything but a local database named for testing, because this suite drops the public schema. */
function requireDisposableDatabase(url: string): string {
  const parsed = new URL(url);
  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!loopback || !databaseName.includes("test")) {
    throw new Error(
      `GROUP_INVITATIONS_TEST_DATABASE_URL must be a local database with "test" in its name (got ${parsed.hostname}/${databaseName}).`,
    );
  }
  return url;
}

interface PgClient {
  connect(): Promise<void>;
  query<Row = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: Row[] }>;
  end(): Promise<void>;
}

interface PgModule {
  readonly Client: new (config: { connectionString: string }) => PgClient;
}

// A string variable so TypeScript doesn't try to resolve `pg` for this optional suite.
const DRIVER: string = "pg";

interface Save {
  readonly version: number | null;
  readonly invitationActive?: boolean;
  readonly status?: string;
  readonly addedMembers?: readonly { user_id: string; joined_at: string }[];
  readonly addedInvitations?: readonly { invitee_id: string; invited_by: string; invited_at: string }[];
  readonly removedInvitations?: readonly string[];
  /** Calls with the nine arguments the app sent before 0017. */
  readonly previousApp?: boolean;
}

describe.skipIf(!DATABASE_URL)("UC1-06 group invitations against Postgres", () => {
  let client: PgClient;

  async function signUp(userId: string, name: string): Promise<void> {
    await client.query("insert into auth.users (id, raw_user_meta_data) values ($1, $2::jsonb)", [
      userId,
      JSON.stringify({ display_name: name }),
    ]);
  }

  async function save(change: Save): Promise<number> {
    const invitationArguments = change.previousApp
      ? ""
      : ", p_added_invitations => $9::jsonb, p_removed_invitations => $10::uuid[]";
    const values: unknown[] = [
      GROUP,
      OWNER,
      "Sunday badminton",
      "first-token",
      change.invitationActive ?? true,
      change.status ?? "ACTIVE",
      change.version,
      JSON.stringify(change.addedMembers ?? []),
    ];
    if (!change.previousApp) {
      values.push(JSON.stringify(change.addedInvitations ?? []), change.removedInvitations ?? []);
    }
    const { rows } = await client.query<{ version: number }>(
      `select public.save_regular_group(
         p_group_id => $1, p_owner_id => $2, p_name => $3, p_invitation_token => $4,
         p_invitation_active => $5, p_status => $6, p_expected_version => $7,
         p_added_members => $8::jsonb, p_removed_members => '{}'::uuid[]${invitationArguments}) as version`,
      values,
    );
    return rows[0]?.version ?? -1;
  }

  async function invitees(): Promise<string[]> {
    const { rows } = await client.query<{ invitee_id: string }>(
      "select invitee_id from public.group_invitations where group_id = $1 order by invitee_id",
      [GROUP],
    );
    return rows.map((row) => row.invitee_id);
  }

  async function members(): Promise<string[]> {
    const { rows } = await client.query<{ user_id: string }>(
      "select user_id from public.group_memberships where group_id = $1 order by user_id",
      [GROUP],
    );
    return rows.map((row) => row.user_id);
  }

  const invite = (inviteeId: string, invitedBy = OWNER) => ({
    invitee_id: inviteeId,
    invited_by: invitedBy,
    invited_at: "2026-10-28T08:00:00Z",
  });

  /** Starts each test from a fresh group owned by OWNER, without invitations. */
  async function freshGroup(): Promise<number> {
    await client.query("delete from public.group_invitations");
    await client.query("delete from public.group_memberships");
    await client.query("delete from public.regular_groups");
    return save({ version: null, addedMembers: [{ user_id: OWNER, joined_at: "2026-10-28T07:00:00Z" }] });
  }

  beforeAll(async () => {
    const pg = (await import(DRIVER)) as PgModule;
    client = new pg.Client({ connectionString: requireDisposableDatabase(DATABASE_URL as string) });
    await client.connect();

    // Fresh schemas. A test database has no Supabase Auth, so stand in for the parts these migrations use.
    await client.query("drop schema if exists public cascade");
    await client.query("drop schema if exists auth cascade");
    await client.query("create schema public");
    await client.query(`
      create schema auth;
      create table auth.users (id uuid primary key, raw_user_meta_data jsonb not null default '{}');
      create function auth.uid() returns uuid language sql stable
        as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    `);
    for (const migration of MIGRATIONS) {
      await client.query(await readFile(path.join(process.cwd(), "supabase", "migrations", migration), "utf8"));
    }
    await signUp(OWNER, "Marcus Lim");
    await signUp(AISHA, "Aisha Tan");
    await signUp(BEN, "Ben Lee");
    await signUp(GONE, "Gone");
    await client.query("update public.profiles set handle = null, account_status = 'INACTIVE' where user_id = $1", [GONE]);
  });

  afterAll(async () => {
    await client?.end();
  });

  test("saves an invitation without making the player a member", async () => {
    const version = await freshGroup();

    await save({ version, addedInvitations: [invite(AISHA)] });

    expect(await invitees()).toEqual([AISHA]);
    expect(await members()).toEqual([OWNER]);
  });

  test("accepting adds the membership and removes the invitation in one save", async () => {
    let version = await freshGroup();
    version = await save({ version, addedInvitations: [invite(AISHA)] });

    await save({
      version,
      addedMembers: [{ user_id: AISHA, joined_at: "2026-10-28T09:00:00Z" }],
      removedInvitations: [AISHA],
    });

    expect(await members()).toEqual([OWNER, AISHA]);
    expect(await invitees()).toEqual([]);
  });

  test("refuses to invite an inactive account (GRP02) and saves nothing", async () => {
    const version = await freshGroup();

    await expect(save({ version, addedInvitations: [invite(GONE)] })).rejects.toMatchObject({ code: "GRP02" });
    expect(await invitees()).toEqual([]);
  });

  test("refuses an invitation from a stale read (40001)", async () => {
    const version = await freshGroup();
    await save({ version, addedInvitations: [invite(AISHA)] });

    await expect(save({ version, addedInvitations: [invite(BEN)] })).rejects.toMatchObject({ code: "40001" });
    expect(await invitees()).toEqual([AISHA]);
  });

  test("refuses a player inviting themselves", async () => {
    const version = await freshGroup();

    await expect(save({ version, addedInvitations: [invite(OWNER, OWNER)] })).rejects.toMatchObject({ code: "23514" });
  });

  describe("saves from the app version before 0017", () => {
    test("still save with nine arguments", async () => {
      const version = await freshGroup();

      const saved = await save({ version, previousApp: true });

      expect(saved).toBe(version + 1);
    });

    test("a join by link ends that player's invitation", async () => {
      let version = await freshGroup();
      version = await save({ version, addedInvitations: [invite(AISHA), invite(BEN)] });

      await save({ version, previousApp: true, addedMembers: [{ user_id: AISHA, joined_at: "2026-10-28T09:00:00Z" }] });

      expect(await invitees()).toEqual([BEN]);
    });

    test("turning the link off ends every invitation", async () => {
      let version = await freshGroup();
      version = await save({ version, addedInvitations: [invite(AISHA)] });

      await save({ version, previousApp: true, invitationActive: false });

      expect(await invitees()).toEqual([]);
    });

    test("archiving ends every invitation", async () => {
      let version = await freshGroup();
      version = await save({ version, addedInvitations: [invite(AISHA)] });

      await save({ version, previousApp: true, invitationActive: false, status: "ARCHIVED" });

      expect(await invitees()).toEqual([]);
    });
  });

  test("keeps invitations out of the browser's reach", async () => {
    const { rows } = await client.query<{ privilege: boolean }>(
      "select has_table_privilege('authenticated', 'public.group_invitations', 'select') as privilege",
    );

    expect(rows[0]?.privilege).toBe(false);
  });
});
