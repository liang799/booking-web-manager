import {
  DomainError,
  RegularGroup,
  UserHandle,
  type GroupInviteResult,
  type GroupJoinResult,
  type UUID,
} from "@/domain";
import type { UserDirectory, UserSummary } from "../accounts/user-handles";
import type { Repository } from "../shared/contracts";
import type { NotificationIntent, NotificationKind } from "../notifications/notification-intents";

export interface GroupRepository extends Repository<RegularGroup> {
  save(group: RegularGroup, notifications?: readonly NotificationIntent[]): Promise<void>;
}

function notice(group: RegularGroup, kind: NotificationKind, recipientId: UUID): NotificationIntent {
  return { kind, recipientId, groupId: group.groupId, subjectName: group.name };
}

function joinedNotices(group: RegularGroup, inviterId: UUID | undefined): NotificationIntent[] {
  return inviterId === undefined
    ? [notice(group, "GROUP_MEMBER_JOINED", group.ownerId)]
    : [notice(group, "GROUP_INVITATION_ACCEPTED", inviterId), ...(inviterId === group.ownerId ? [] : [notice(group, "GROUP_MEMBER_JOINED", group.ownerId)])];
}

/** Group lookups that the plain get/save Repository contract doesn't cover. */
export interface GroupQueries {
  findByInvitationToken(token: string): Promise<RegularGroup | null>;
  /** Every group the user belongs to (owned or joined). */
  listForMember(userId: UUID): Promise<readonly RegularGroup[]>;
  /** Sessions invited from this group that are not settled yet; archiving waits for these. */
  countUnsettledLinkedSessions(groupId: UUID): Promise<number>;
  /** Every group with an unanswered invitation for the user (ADR-0022). */
  listInvitingGroups(userId: UUID): Promise<readonly RegularGroup[]>;
}

/** An invitation the signed-in player hasn't answered yet, as their Groups page shows it. */
export interface PendingGroupInvitation {
  readonly groupId: UUID;
  readonly groupName: string;
  readonly invitedBy: UUID;
  readonly invitedAt: Date;
}

/**
 * Someone else saved the group after this request read it, so saving would overwrite their change.
 * Each store reports its own conflict signal (Supabase: SQLSTATE 40001) as this error.
 */
export class GroupChangedError extends Error {
  constructor() {
    super("The group was changed by someone else. Refresh the page and try again.");
    this.name = "GroupChangedError";
  }
}


export interface ManageGroupDependencies {
  /**
   * `groups` and `queries` must come from the same store: a group loaded through either one
   * is saved through `groups`, and the store remembers which version it loaded.
   */
  readonly groups: GroupRepository;
  readonly queries: GroupQueries;
  readonly newId: () => UUID;
  /** A long random value that is hard to guess; it becomes the invitation link. */
  readonly newInvitationToken: () => string;
  readonly now: () => Date;
  /** Finds the player to invite by exact user ID (ADR-0021). */
  readonly players: Pick<UserDirectory, "findActiveByHandle">;
}

/**
 * UC1-06 Manage Group: create a regular group, share and control its invitation link,
 * invite players by user ID (ADR-0022), and manage its members, who may also leave on
 * their own. RegularGroup (Rishi's domain)
 * enforces the rules, such as "only the owner may remove members" and "the owner can't be
 * removed or leave"; this class loads the group, asks it to act, and saves it.
 */
export class ManageGroup {
  readonly #deps: ManageGroupDependencies;

  constructor(deps: ManageGroupDependencies) {
    this.#deps = deps;
  }

  /** Creates a group owned by (and containing) the creator, with an active invitation link. */
  async create(command: { readonly ownerId: UUID; readonly name: string }): Promise<RegularGroup> {
    const group = RegularGroup.create({
      groupId: this.#deps.newId(),
      ownerId: command.ownerId,
      name: command.name,
      invitationToken: this.#deps.newInvitationToken(),
      now: this.#deps.now(),
    });
    await this.#deps.groups.save(group);
    return group;
  }

  /**
   * The groups shown on the signed-in user's Groups page. There is no user to choose:
   * it lists only groups the actor belongs to, and the actor comes from the session.
   */
  async listMine(command: { readonly actorId: UUID }): Promise<readonly RegularGroup[]> {
    return this.#deps.queries.listForMember(command.actorId);
  }

  /** One group's details, for its members only. Non-members get NOT_FOUND so they learn nothing. */
  async viewAsMember(command: { readonly actorId: UUID; readonly groupId: UUID }): Promise<RegularGroup> {
    const group = await this.#deps.groups.get(command.groupId);
    const isMember = group?.memberships.some((member) => member.userId === command.actorId) ?? false;
    if (group === null || !isMember) throw new DomainError("NOT_FOUND", "The group was not found");
    return group;
  }

  /** The group behind an invitation link, so the join page can show its name before joining. */
  async previewInvitation(token: string): Promise<RegularGroup> {
    const group = await this.#deps.queries.findByInvitationToken(token);
    if (group === null || !group.invitationActive || group.status !== "ACTIVE") {
      throw new DomainError("INVALID_INVITATION", "The invitation token is invalid or revoked");
    }
    return group;
  }

  /** Joins through an invitation link. Joining twice is harmless: the result is ALREADY_MEMBER. */
  async join(command: {
    readonly userId: UUID;
    readonly invitationToken: string;
  }): Promise<{ readonly group: RegularGroup; readonly result: GroupJoinResult }> {
    const group = await this.#deps.queries.findByInvitationToken(command.invitationToken);
    if (group === null) throw new DomainError("INVALID_INVITATION", "The invitation token is invalid or revoked");

    const invitation = group.invitations.find((entry) => entry.inviteeId === command.userId);
    const result = group.join({
      userId: command.userId,
      invitationToken: command.invitationToken,
      now: this.#deps.now(),
    });
    if (result === "JOINED") await this.#deps.groups.save(group, joinedNotices(group, invitation?.invitedBy));
    return { group, result };
  }

  /**
   * A member invites a player by exact user ID. The player joins only by accepting.
   * Throws INVALID_INPUT for a malformed ID and NOT_FOUND when nobody active holds it.
   */
  async inviteByHandle(command: {
    readonly actorId: UUID;
    readonly groupId: UUID;
    readonly handle: string;
  }): Promise<{ readonly invitee: UserSummary; readonly result: GroupInviteResult }> {
    const invitee = await this.#deps.players.findActiveByHandle(UserHandle.parse(command.handle));
    if (invitee === null) throw new DomainError("NOT_FOUND", "No player has this user ID");

    const group = await this.#load(command.groupId);
    const result = group.invite({ actorId: command.actorId, inviteeId: invitee.userId, now: this.#deps.now() });
    if (result === "INVITED") await this.#deps.groups.save(group, [notice(group, "GROUP_INVITATION", invitee.userId)]);
    return { invitee, result };
  }

  /** The signed-in player's unanswered invitations, newest first. */
  async listInvitations(command: { readonly actorId: UUID }): Promise<readonly PendingGroupInvitation[]> {
    const groups = await this.#deps.queries.listInvitingGroups(command.actorId);
    return groups
      .flatMap((group) =>
        group.invitations
          .filter((invitation) => invitation.inviteeId === command.actorId)
          .map((invitation) => ({
            groupId: group.groupId,
            groupName: group.name,
            invitedBy: invitation.invitedBy,
            invitedAt: invitation.invitedAt,
          })),
      )
      .sort((first, second) => second.invitedAt.getTime() - first.invitedAt.getTime());
  }

  /** The invited player joins. Accepting twice is harmless: the result is ALREADY_MEMBER. */
  async acceptInvitation(command: { readonly actorId: UUID; readonly groupId: UUID }): Promise<GroupJoinResult> {
    const group = await this.#deps.groups.get(command.groupId);
    if (group === null) throw new DomainError("INVALID_INVITATION", "This invitation is no longer available");
    const invitation = group.invitations.find((entry) => entry.inviteeId === command.actorId);
    const result = group.acceptInvitation({ userId: command.actorId, now: this.#deps.now() });
    if (result === "JOINED") await this.#deps.groups.save(group, joinedNotices(group, invitation?.invitedBy));
    return result;
  }

  /** The invited player says no. Declining an invitation that is already gone changes nothing. */
  async declineInvitation(command: { readonly actorId: UUID; readonly groupId: UUID }): Promise<void> {
    const group = await this.#deps.groups.get(command.groupId);
    if (group === null) return;
    const invited = group.invitations.find((invitation) => invitation.inviteeId === command.actorId);
    if (!invited) return;
    group.declineInvitation({ userId: command.actorId });
    await this.#deps.groups.save(group, [notice(group, "GROUP_INVITATION_DECLINED", invited.invitedBy)]);
  }

  /** Owner only: removes a member (never the owner). */
  async removeMember(command: {
    readonly actorId: UUID;
    readonly groupId: UUID;
    readonly userId: UUID;
  }): Promise<void> {
    const group = await this.#load(command.groupId);
    group.removeMember({ actorId: command.actorId, userId: command.userId });
    await this.#deps.groups.save(group, [notice(group, "GROUP_MEMBER_REMOVED", command.userId)]);
  }

  /**
   * A member leaves the group themselves; the actor is the leaving member. The owner can't
   * leave (they archive the group instead), and a non-member gets NOT_FOUND.
   */
  async leave(command: { readonly actorId: UUID; readonly groupId: UUID }): Promise<void> {
    const group = await this.#load(command.groupId);
    group.leave({ userId: command.actorId });
    await this.#deps.groups.save(group, [notice(group, "GROUP_MEMBER_LEFT", group.ownerId)]);
  }

  /** Owner only: renames the group. */
  async rename(command: { readonly actorId: UUID; readonly groupId: UUID; readonly name: string }): Promise<void> {
    const group = await this.#load(command.groupId);
    const before = group.name;
    group.rename({ actorId: command.actorId, name: command.name });
    await this.#deps.groups.save(group, before === group.name ? [] : group.memberships.filter((entry) => entry.userId !== command.actorId).map((entry) => notice(group, "GROUP_RENAMED", entry.userId)));
  }

  /** Owner only: issues a new link. The old link stops working. Returns the new token. */
  async rotateInvitation(command: { readonly actorId: UUID; readonly groupId: UUID }): Promise<string> {
    const group = await this.#load(command.groupId);
    group.rotateInvitation({ actorId: command.actorId, invitationToken: this.#deps.newInvitationToken() });
    await this.#deps.groups.save(group);
    return group.invitationToken;
  }

  /** Owner only: turns the invitation link off until a new one is issued. */
  async revokeInvitation(command: { readonly actorId: UUID; readonly groupId: UUID }): Promise<void> {
    const group = await this.#load(command.groupId);
    const ended = group.invitations.map((entry) => notice(group, "GROUP_INVITATION_ENDED", entry.inviteeId));
    group.revokeInvitation(command.actorId);
    await this.#deps.groups.save(group, ended);
  }

  /** Owner only: archives the group once none of its sessions are still unsettled. */
  async archive(command: { readonly actorId: UUID; readonly groupId: UUID }): Promise<void> {
    const group = await this.#load(command.groupId);
    const unsettledLinkedSessions = await this.#deps.queries.countUnsettledLinkedSessions(command.groupId);
    const ended = group.invitations.map((entry) => notice(group, "GROUP_INVITATION_ENDED", entry.inviteeId));
    group.archive({ actorId: command.actorId, unsettledLinkedSessions });
    await this.#deps.groups.save(group, [...group.memberships.filter((entry) => entry.userId !== command.actorId).map((entry) => notice(group, "GROUP_ARCHIVED", entry.userId)), ...ended]);
  }

  async #load(groupId: UUID): Promise<RegularGroup> {
    const group = await this.#deps.groups.get(groupId);
    if (group === null) throw new DomainError("NOT_FOUND", "The group was not found");
    return group;
  }
}