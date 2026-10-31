import { redirect } from "next/navigation";
import { memberProfiles } from "@/lib/supabase/profile-names";
import { createManageGroup } from "@/use-case-config/groups";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { findPlayer } from "@/app/users/find-player-action";
import { acceptGroupInvitation, declineGroupInvitation, invitePlayer } from "./actions";
import { GroupFindPlayer } from "./_components/group-find-player";
import { GroupInvitations } from "./_components/group-invitations";
import { GroupsView } from "./_components/groups-view";

interface GroupsPageProps {
  /** e.g. /groups?left=1 after leaving a group. */
  readonly searchParams: Promise<{ left?: string | string[] }>;
}

/**
 * UC1-06: read memberships on the server and expose only the overview's display data,
 * with player search by user ID (ADR-0021) and invitations by user ID (ADR-0022).
 */
export default async function GroupsPage({ searchParams }: GroupsPageProps) {
  const user = await getCurrentUser();
  if (user === null) redirect("/login");
  const { left } = await searchParams;

  const manageGroup = createManageGroup();
  const [groups, invitations] = await Promise.all([
    manageGroup.listMine({ actorId: user.id }),
    manageGroup.listInvitations({ actorId: user.id }),
  ]);
  const profileIds = [...new Set([
    ...groups.flatMap((group) => [
      group.ownerId,
      ...group.memberships.slice(0, 4).map((member) => member.userId),
    ]),
    ...invitations.map((invitation) => invitation.invitedBy),
  ])];
  const profiles = await memberProfiles(profileIds);
  const nameOf = (userId: string) => profiles.get(userId)?.name ?? "Unnamed player";
  // Any member may invite while the group's link is on, as the link gives the same access.
  const inviteGroups = groups
    .filter((group) => group.status === "ACTIVE" && group.invitationActive)
    .map((group) => ({ groupId: group.groupId, name: group.name }));
  return (
    <GroupsView
      groups={groups.map((group) => ({
        groupId: group.groupId,
        name: group.name,
        ownerName: nameOf(group.ownerId),
        isOwner: group.ownerId === user.id,
        archived: group.status === "ARCHIVED",
        memberCount: group.memberships.length,
        memberNames: group.memberships.slice(0, 4).map((member) => nameOf(member.userId)),
      }))}
      leftGroup={left === "1"}
      findPlayer={<GroupFindPlayer findAction={findPlayer} inviteAction={invitePlayer} inviteGroups={inviteGroups} />}
      invitations={invitations.length === 0 ? undefined : (
        <GroupInvitations
          invitations={invitations.map((invitation) => ({
            groupId: invitation.groupId,
            groupName: invitation.groupName,
            inviterName: nameOf(invitation.invitedBy),
            inviterHandle: profiles.get(invitation.invitedBy)?.handle ?? null,
            invitedAt: invitation.invitedAt.toISOString(),
          }))}
          accept={acceptGroupInvitation}
          decline={declineGroupInvitation}
        />
      )}
    />
  );
}
