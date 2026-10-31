import { beforeEach, describe, expect, test, vi } from "vitest";
import { DomainError, RegularGroup } from "@/domain";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseGroupStore } from "@/lib/supabase/group-store";
import { GroupChangedError } from "@/use-cases/groups/manage-group";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const OWNER = "00000000-0000-4000-8000-00000000000a";
const JOINER = "00000000-0000-4000-8000-00000000000b";
const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const JOINED_AT = "2026-09-30T08:00:00.000Z";
const INVITED_AT = "2026-09-29T08:00:00.000Z";

type Call = readonly [method: string, ...args: unknown[]];

/** A regular_groups row as the store selects it, at the given version. */
function groupRow(version: number) {
  return {
    group_id: GROUP_ID,
    owner_id: OWNER,
    name: "Weekend Tennis",
    invitation_token: "token-1",
    invitation_active: true,
    status: "ACTIVE",
    version,
    group_memberships: [{ user_id: OWNER, joined_at: JOINED_AT }],
    group_invitations: [] as { invitee_id: string; invited_by: string; invited_at: string }[],
  };
}

/**
 * A stand-in for the Supabase admin client: `from()` queries record their calls and resolve to
 * `select`; `rpc()` calls are recorded and resolve to `rpc`.
 */
function fakeAdmin(results: { readonly select?: unknown; readonly rpc?: unknown }) {
  const queries: { table: string; calls: Call[] }[] = [];
  const rpc = vi.fn(async () => results.rpc);
  const client = {
    rpc,
    from(table: string) {
      const query = { table, calls: [] as Call[] };
      queries.push(query);
      const builder: object = new Proxy(
        {},
        {
          get(_target, property) {
            if (property === "then") {
              return (resolve: (value: unknown) => void) => resolve(results.select);
            }
            return (...args: unknown[]) => {
              query.calls.push([String(property), ...args]);
              return builder;
            };
          },
        },
      );
      return builder;
    },
  };
  vi.mocked(createAdminClient).mockReturnValue(client as never);
  return { queries, rpc };
}

describe("supabaseGroupStore (UC1-06)", () => {
  beforeEach(() => {
    vi.mocked(createAdminClient).mockReset();
  });

  test("saves a new group and its owner's membership in one call", async () => {
    // Arrange
    const { rpc } = fakeAdmin({ rpc: { data: 0, error: null } });
    const group = RegularGroup.create({
      groupId: GROUP_ID,
      ownerId: OWNER,
      name: "Weekend Tennis",
      invitationToken: "token-1",
      now: new Date(JOINED_AT),
    });

    // Act
    await supabaseGroupStore().groups.save(group);

    // Assert
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "save_regular_group",
      expect.objectContaining({
        p_expected_version: null,
        p_added_members: [{ user_id: OWNER, joined_at: JOINED_AT }],
        p_removed_members: [],
        p_added_invitations: [],
        p_removed_invitations: [],
      }),
    );
  });

  test("saves a join against the version the group was read at", async () => {
    // Arrange
    const { rpc } = fakeAdmin({ select: { data: groupRow(4), error: null }, rpc: { data: 5, error: null } });
    const { groups } = supabaseGroupStore();
    const group = (await groups.get(GROUP_ID))!;
    group.join({ userId: JOINER, invitationToken: "token-1", now: new Date(JOINED_AT) });

    // Act
    await groups.save(group);

    // Assert
    expect(rpc).toHaveBeenCalledWith(
      "save_regular_group",
      expect.objectContaining({
        p_expected_version: 4,
        p_invitation_active: true,
        p_added_members: [{ user_id: JOINER, joined_at: JOINED_AT }],
      }),
    );
  });

  test("saves a new invitation by user ID with the member who sent it (ADR-0022)", async () => {
    // Arrange
    const { rpc } = fakeAdmin({ select: { data: groupRow(4), error: null }, rpc: { data: 5, error: null } });
    const { groups } = supabaseGroupStore();
    const group = (await groups.get(GROUP_ID))!;
    group.invite({ actorId: OWNER, inviteeId: JOINER, now: new Date(INVITED_AT) });

    // Act
    await groups.save(group);

    // Assert
    expect(rpc).toHaveBeenCalledWith(
      "save_regular_group",
      expect.objectContaining({
        p_expected_version: 4,
        p_added_members: [],
        p_added_invitations: [{ invitee_id: JOINER, invited_by: OWNER, invited_at: INVITED_AT }],
        p_removed_invitations: [],
      }),
    );
  });

  test("saves an accepted invitation as a new member and a removed invitation", async () => {
    // Arrange: the stored group has JOINER's unanswered invitation.
    const row = { ...groupRow(4), group_invitations: [{ invitee_id: JOINER, invited_by: OWNER, invited_at: INVITED_AT }] };
    const { rpc } = fakeAdmin({ select: { data: row, error: null }, rpc: { data: 5, error: null } });
    const { groups } = supabaseGroupStore();
    const group = (await groups.get(GROUP_ID))!;
    group.acceptInvitation({ userId: JOINER, now: new Date(JOINED_AT) });

    // Act
    await groups.save(group);

    // Assert
    expect(rpc).toHaveBeenCalledWith(
      "save_regular_group",
      expect.objectContaining({
        p_added_members: [{ user_id: JOINER, joined_at: JOINED_AT }],
        p_added_invitations: [],
        p_removed_invitations: [JOINER],
      }),
    );
  });

  test("lists the groups that invited a player, reading their invitations", async () => {
    // Arrange: both queries resolve to the same fake result, which suits each step here.
    const row = { ...groupRow(4), group_invitations: [{ invitee_id: JOINER, invited_by: OWNER, invited_at: INVITED_AT }] };
    const { queries } = fakeAdmin({ select: { data: [row], error: null } });

    // Act
    const groups = await supabaseGroupStore().queries.listInvitingGroups(JOINER);

    // Assert
    expect(queries.map((query) => query.table)).toEqual(["group_invitations", "regular_groups"]);
    expect(queries[0]?.calls).toContainEqual(["eq", "invitee_id", JOINER]);
    expect(groups[0]?.invitations.map((invitation) => [invitation.inviteeId, invitation.invitedBy])).toEqual([
      [JOINER, OWNER],
    ]);
  });

  test("reports GroupChangedError when someone saved the group after it was read", async () => {
    // Arrange: save_regular_group found a newer version (serialization failure).
    fakeAdmin({
      select: { data: groupRow(4), error: null },
      rpc: { data: null, error: { code: "40001", message: "GROUP_CHANGED" } },
    });
    const { groups } = supabaseGroupStore();
    const group = (await groups.get(GROUP_ID))!;
    group.join({ userId: JOINER, invitationToken: "token-1", now: new Date(JOINED_AT) });

    // Act & Assert
    await expect(groups.save(group)).rejects.toBeInstanceOf(GroupChangedError);
  });

  test("reports ACTIVE_OBLIGATIONS when the database refuses to archive a group with unsettled sessions", async () => {
    // Arrange: save_regular_group's own SQLSTATE for "linked session still unsettled".
    fakeAdmin({
      select: { data: groupRow(4), error: null },
      rpc: { data: null, error: { code: "GRP01", message: "ACTIVE_OBLIGATIONS" } },
    });
    const { groups } = supabaseGroupStore();
    const group = (await groups.get(GROUP_ID))!;
    group.archive({ actorId: OWNER, unsettledLinkedSessions: 0 });

    // Act
    const attempt = groups.save(group);

    // Assert: the owner is told about the sessions, not that someone else changed the group.
    await expect(attempt).rejects.toBeInstanceOf(DomainError);
    await expect(attempt).rejects.toMatchObject({ code: "ACTIVE_OBLIGATIONS" });
  });

  test("counts the group's unsettled linked sessions through the database", async () => {
    // Arrange
    const { rpc } = fakeAdmin({ rpc: { data: 1, error: null } });

    // Act
    const count = await supabaseGroupStore().queries.countUnsettledLinkedSessions(GROUP_ID);

    // Assert
    expect(count).toBe(1);
    expect(rpc).toHaveBeenCalledWith("count_unsettled_linked_sessions", { p_group_id: GROUP_ID });
  });

  test("reports INACTIVE_ACCOUNT when deactivation wins before a group save", async () => {
    fakeAdmin({ rpc: { data: null, error: { code: "GRP02", message: "INACTIVE_ACCOUNT" } } });
    const group = RegularGroup.create({
      groupId: GROUP_ID, ownerId: OWNER, name: "Weekend Tennis",
      invitationToken: "token-1", now: new Date(JOINED_AT),
    });

    await expect(supabaseGroupStore().groups.save(group)).rejects.toMatchObject({
      name: "DomainError", code: "INACTIVE_ACCOUNT",
    });
  });

  test("passes on a database error while counting linked sessions", async () => {
    // Arrange
    fakeAdmin({ rpc: { data: null, error: { code: "57014", message: "canceling statement" } } });

    // Act
    const attempt = supabaseGroupStore().queries.countUnsettledLinkedSessions(GROUP_ID);

    // Assert
    await expect(attempt).rejects.toMatchObject({ code: "57014" });
  });
});


describe("atomic group notification transport", () => {
  test("includes the canonical notification in the same version-checked save and publishes only after success", async () => {
    const { rpc } = fakeAdmin({ select: { data: groupRow(4), error: null }, rpc: { data: 5, error: null } });
    const publish = vi.fn();
    const { groups } = supabaseGroupStore(publish);
    const group = (await groups.get(GROUP_ID))!;
    group.invite({ actorId: OWNER, inviteeId: JOINER, now: new Date(JOINED_AT) });
    await groups.save(group, [{ kind: "GROUP_INVITATION", groupId: GROUP_ID, recipientId: JOINER, subjectName: group.name }]);
    expect(rpc).toHaveBeenCalledWith("save_regular_group", expect.objectContaining({ p_expected_version: 4, p_notifications: [expect.objectContaining({
      recipient_id: JOINER, group_id: GROUP_ID, kind: "GROUP_INVITATION", push_enabled: true,
      source_key: JSON.stringify(["GROUP_INVITATION", GROUP_ID, JSON.stringify(["group", GROUP_ID, 5])]),
    })] }));
    expect(publish).toHaveBeenCalledWith([JOINER]);
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(publish.mock.invocationCallOrder[0]!);
  });

  test("a refused group save publishes no hint and a failed hint never changes a successful save", async () => {
    const publish = vi.fn(() => { throw new Error("Hint unavailable"); });
    fakeAdmin({ select: { data: groupRow(4), error: null }, rpc: { data: null, error: { code: "40001" } } });
    const rejected = supabaseGroupStore(publish).groups;
    const group = (await rejected.get(GROUP_ID))!;
    const notices = [{ kind: "GROUP_INVITATION" as const, groupId: GROUP_ID, recipientId: JOINER }];
    await expect(rejected.save(group, notices)).rejects.toBeInstanceOf(GroupChangedError);
    expect(publish).not.toHaveBeenCalled();
    fakeAdmin({ select: { data: groupRow(4), error: null }, rpc: { data: 5, error: null } });
    const saved = supabaseGroupStore(publish).groups;
    await expect(saved.save((await saved.get(GROUP_ID))!, notices)).resolves.toBeUndefined();
    expect(publish).toHaveBeenCalledOnce();
  });
});
