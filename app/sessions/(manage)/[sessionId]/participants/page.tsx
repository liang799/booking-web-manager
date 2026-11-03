import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { memberProfiles } from "@/lib/supabase/profile-names";
import { createManageGroup } from "@/use-case-config/groups";
import { SessionParticipantsController } from "@/app/sessions/_components/session-participants-controller";
import type { ImportGroup } from "@/app/sessions/_components/session-participants-invitations";
import { listSessionParticipants } from "@/app/sessions/removal-actions";
import { loadSessionInvitations } from "@/app/sessions/session-invitation-actions";

export const dynamic = "force-dynamic";

/** Resolve groups only after the authenticated owner-only roster action succeeds. */
async function importableGroups(userId: string): Promise<readonly ImportGroup[]> {
  const memberships = await createManageGroup().listMine({ actorId: userId });
  const active = memberships.filter((group) => group.status === "ACTIVE");
  const profiles = await memberProfiles([...new Set(active.flatMap((group) => group.memberships.map((member) => member.userId)))]);
  return active.map((group) => ({
    groupId: group.groupId,
    name: group.name,
    memberCount: group.memberships.length,
    members: group.memberships.filter((member) => member.userId !== userId && profiles.get(member.userId)?.handle !== null).map((member) => ({
      userId: member.userId,
      displayName: profiles.get(member.userId)?.name ?? "Unnamed player",
      handle: profiles.get(member.userId)?.handle ?? null,
    })),
  }));
}

/** The authenticated list action checks active ownership before returning participant names. */
export default async function SessionParticipantsPage({ params }: { readonly params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const user = await getCurrentUser();
  if (user === null) redirect(`/login?next=${encodeURIComponent(`/sessions/${sessionId}/participants`)}`);
  const outcome = await listSessionParticipants(sessionId);
  const [groups, invitations] = outcome.status === "ready"
    ? await Promise.all([importableGroups(user.id), loadSessionInvitations(sessionId)])
    : [[], []] as const;
  return <SessionParticipantsController sessionId={sessionId} userId={user.id} outcome={outcome} groups={groups} invitations={invitations} />;
}
