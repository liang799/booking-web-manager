import { GroupInvitation, GroupMembership, RegularGroup, type UUID } from "@/domain";
import type { UserSummary } from "@/use-cases/accounts/user-handles";
import type { ManageGroupDependencies } from "@/use-cases/groups/manage-group";

/** Copies a group the way a database round trip would, so tests can't share one object by accident. */
function copy(group: RegularGroup): RegularGroup {
  return new RegularGroup({
    groupId: group.groupId,
    ownerId: group.ownerId,
    name: group.name,
    invitationToken: group.invitationToken,
    invitationActive: group.invitationActive,
    status: group.status,
    memberships: group.memberships.map(
      (member) => new GroupMembership({ userId: member.userId, joinedAt: member.joinedAt }),
    ),
    invitations: group.invitations.map(
      (invitation) =>
        new GroupInvitation({
          inviteeId: invitation.inviteeId,
          invitedBy: invitation.invitedBy,
          invitedAt: invitation.invitedAt,
        }),
    ),
  });
}

/**
 * ManageGroup dependencies backed by a Map instead of Supabase.
 * Ids and tokens are predictable ("group-1", "token-1", …) so tests can refer to them.
 * `players` are the active accounts that can be found by user ID.
 */
export function inMemoryGroupDependencies(
  options: { readonly unsettledLinkedSessions?: number; readonly players?: readonly UserSummary[] } = {},
) {
  const rows = new Map<UUID, RegularGroup>();
  let nextId = 1;
  let nextToken = 1;

  const deps: ManageGroupDependencies = {
    groups: {
      get: async (id) => {
        const group = rows.get(id);
        return group === undefined ? null : copy(group);
      },
      save: async (group) => {
        rows.set(group.groupId, copy(group));
      },
    },
    queries: {
      findByInvitationToken: async (token) => {
        const group = [...rows.values()].find((row) => row.invitationToken === token);
        return group === undefined ? null : copy(group);
      },
      listForMember: async (userId) =>
        [...rows.values()]
          .filter((row) => row.memberships.some((member) => member.userId === userId))
          .map(copy),
      countUnsettledLinkedSessions: async () => options.unsettledLinkedSessions ?? 0,
      listInvitingGroups: async (userId) =>
        [...rows.values()]
          .filter((row) => row.invitations.some((invitation) => invitation.inviteeId === userId))
          .map(copy),
    },
    newId: () => `group-${nextId++}`,
    newInvitationToken: () => `token-${nextToken++}`,
    now: () => new Date("2026-10-01T08:00:00Z"),
    players: {
      findActiveByHandle: async (handle) =>
        options.players?.find((player) => player.handle === handle.toString()) ?? null,
    },
  };

  return { deps, rows };
}