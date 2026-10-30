import { redirect } from "next/navigation";
import { memberProfiles } from "@/lib/supabase/profile-names";
import { createManageGroup } from "@/use-case-config/groups";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { FindPlayer } from "@/app/users/_components/find-player";
import { findPlayer } from "@/app/users/find-player-action";
import { CreateGroupForm } from "./_components/group-controls";
import { GroupsView } from "./_components/groups-view";

interface GroupsPageProps {
  /** e.g. /groups?left=1 after leaving a group. */
  readonly searchParams: Promise<{ left?: string | string[] }>;
}

/**
 * UC1-06: read memberships on the server and expose only the overview's display data,
 * with player search by user ID (ADR-0021).
 */
export default async function GroupsPage({ searchParams }: GroupsPageProps) {
  const user = await getCurrentUser();
  if (user === null) redirect("/login");
  const { left } = await searchParams;

  const groups = await createManageGroup().listMine({ actorId: user.id });
  const previewIds = [...new Set(groups.flatMap((group) => [
    group.ownerId,
    ...group.memberships.slice(0, 4).map((member) => member.userId),
  ]))];
  const profiles = await memberProfiles(previewIds);
  const nameOf = (userId: string) => profiles.get(userId)?.name ?? "Unnamed player";
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
      createForm={<CreateGroupForm />}
      findPlayer={<FindPlayer action={findPlayer} />}
    />
  );
}
