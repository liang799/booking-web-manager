import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { DomainError } from "@/domain";
import { memberProfiles } from "@/lib/supabase/profile-names";
import { createManageGroup } from "@/use-case-config/groups";
import { getCurrentUser } from "@/lib/supabase/current-user";
import {
  ArchiveGroupButton,
  InvitationControls,
  LeaveGroupButton,
  RemoveMemberButton,
  RenameGroupForm,
} from "../_components/group-controls";
import { GroupDetailView } from "../_components/group-detail-view";
import { GroupInvitationPanel } from "../_components/group-invitation-panel";
import { invitePlayer } from "../actions";
import styles from "../_components/group-detail.module.css";

const joinedDate = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" });

interface GroupPageProps {
  readonly params: Promise<{ groupId: string }>;
}

/** UC1-06 Manage Group: one group's members (with their user IDs, ADR-0021) and invitation link. Owners also get the controls. */
export default async function GroupPage({ params }: GroupPageProps) {
  const { groupId } = await params;
  const user = await getCurrentUser();
  if (user === null) redirect("/login");

  let group;
  try {
    group = await createManageGroup().viewAsMember({ actorId: user.id, groupId });
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const profiles = await memberProfiles(group.memberships.map((member) => member.userId));
  const isOwner = group.ownerId === user.id;
  const active = group.status === "ACTIVE";

  // The full link someone opens to join, e.g. http://localhost:3000/groups/join/abc…
  const requestHeaders = await headers();
  const origin = `${requestHeaders.get("x-forwarded-proto") ?? "http"}://${requestHeaders.get("host") ?? "localhost:3000"}`;
  const invitationUrl = `${origin}/groups/join/${group.invitationToken}`;

  return (
    <GroupDetailView
      groupId={group.groupId} name={group.name} ownerName={profiles.get(group.ownerId)?.name ?? "Unnamed player"}
      isOwner={isOwner} archived={!active}
      members={group.memberships.map((member) => {
        const profile = profiles.get(member.userId);
        const name = profile?.name ?? "Unnamed player";
        const memberIsOwner = member.userId === group.ownerId;
        return {
          key: member.userId, name, handle: profile?.handle ?? null,
          joined: joinedDate.format(member.joinedAt), isOwner: memberIsOwner, isYou: member.userId === user.id,
          removeControl: isOwner && active && !memberIsOwner
            ? <RemoveMemberButton groupId={group.groupId} memberId={member.userId} memberName={name} /> : undefined,
        };
      })}
      invitation={active ? <GroupInvitationPanel groupId={group.groupId} url={invitationUrl}
        active={group.invitationActive} inviteAction={invitePlayer}
        controls={isOwner ? <InvitationControls groupId={group.groupId} active={group.invitationActive} /> : undefined} /> : undefined}
      membership={!isOwner && active ? <section id="leave" className={styles.membership} aria-labelledby="membership-heading">
        <h2 id="membership-heading">Your membership</h2>
        <p>You can leave this group at any time. You&apos;ll need another invitation to rejoin. Sessions you&apos;ve already joined stay as they are.</p>
        <LeaveGroupButton groupId={group.groupId} groupName={group.name} />
      </section> : undefined}
      settings={isOwner && active ? <section id="settings" className={styles.settings} aria-labelledby="settings-heading">
        <h2 id="settings-heading">Group settings</h2>
        <RenameGroupForm groupId={group.groupId} name={group.name} />
        <div><p>Finished playing with this group? Archive it to turn off invitations and keep your member history.</p><ArchiveGroupButton groupId={group.groupId} /></div>
      </section> : undefined}
    />
  );
}
