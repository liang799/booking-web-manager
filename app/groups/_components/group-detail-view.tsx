"use client";

import { ArrowLeft, Mail, UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { initials } from "@/components/ui/initials";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GroupOptions } from "./groups-view";
import styles from "./group-detail.module.css";

export interface GroupDetailMember {
  readonly key: string;
  readonly name: string;
  readonly handle: string | null;
  readonly joined: string;
  readonly isOwner: boolean;
  readonly isYou: boolean;
  readonly removeControl?: ReactNode;
}

export interface GroupPendingInvitation {
  readonly key: string;
  readonly name: string;
  readonly handle: string | null;
  readonly invited: string;
  readonly revokeControl?: ReactNode;
}

export interface GroupDetailViewProps {
  readonly groupId: string;
  readonly name: string;
  readonly ownerName: string;
  readonly isOwner: boolean;
  readonly archived: boolean;
  readonly members: readonly GroupDetailMember[];
  readonly pendingInvitations?: readonly GroupPendingInvitation[];
  /** The invitation dialog trigger and its content, wired to existing server actions. */
  readonly invitation?: ReactNode;
  readonly membership?: ReactNode;
  readonly settings?: ReactNode;
}

function tabForHash(hash: string): string {
  if (hash === "#settings" || hash === "#leave") return "settings";
  if (hash === "#invite" || hash === "#invitations") return "invitations";
  return "members";
}

/** Editorial group management. Only server-provided controls can mutate a group. */
export function GroupDetailView({
  groupId, name, ownerName, isOwner, archived, members, pendingInvitations = [], invitation, membership, settings,
}: GroupDetailViewProps) {
  const [tab, setTab] = useState("members");
  const canOpenSettings = !archived && Boolean(settings || membership);

  useEffect(() => {
    const updateFromHash = () => {
      const next = tabForHash(window.location.hash);
      setTab(archived ? "members" : next === "settings" && !canOpenSettings ? "members" : next);
    };
    updateFromHash();
    window.addEventListener("hashchange", updateFromHash);
    return () => window.removeEventListener("hashchange", updateFromHash);
  }, [archived, canOpenSettings]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <Link href="/groups" className={styles.back}><ArrowLeft size={18} aria-hidden="true" />All groups</Link>
        <div className={styles.heroCopy}>
          <div className={styles.title}>
            <h1>{name}</h1>
            <p>Organised by {ownerName}<span aria-hidden="true"> · </span>{members.length} {members.length === 1 ? "member" : "members"}</p>
          </div>
          <div className={styles.headerActions}>
            <p className={styles.activity} data-archived={archived || undefined}><span aria-hidden="true" />{archived ? "Archived" : "Active"}</p>
            <div className={styles.menu}>
              <GroupOptions group={{ groupId, name, isOwner, archived }} onNavigate={(href) => setTab(tabForHash(href.slice(href.indexOf("#"))))} />
            </div>
          </div>
        </div>
      </header>
      <div className={styles.content}>
        {archived && <p className={styles.archiveNote}>This group is archived. Your members and their history are still here.</p>}
        <Tabs value={archived ? "members" : tab} onValueChange={setTab}>
          <TabsList className={styles.tabs} aria-label="Group details">
            <TabsTrigger value="members">Members</TabsTrigger>
            {!archived && <TabsTrigger value="invitations">Invitations</TabsTrigger>}
            {canOpenSettings && <TabsTrigger value="settings">Settings</TabsTrigger>}
          </TabsList>
          <TabsContent value="members" className={styles.tabContent}>
            <section id="members" aria-labelledby="member-list-heading">
              <div className={styles.sectionHeader}>
                <div>
                  <h2 id="member-list-heading">Members ({members.length})</h2>
                  <p>People in this group can join sessions and invite others.</p>
                </div>
                {!archived && invitation}
              </div>
              {members.length > 0 ? <ul className={styles.rows}>
                {members.map((member) => (
                  <li key={member.key} className={styles.personRow}>
                    <span className={styles.avatar} aria-hidden="true">{initials(member.name)}</span>
                    <div className={styles.personCopy}>
                      <span className={styles.personName}>{member.name}{member.isYou && " (you)"}</span>
                      {member.handle !== null && <span className={styles.handle}>@{member.handle}</span>}
                    </div>
                    <div className={styles.personRight}>
                      {member.isOwner && <span className={styles.ownerBadge}>Owner</span>}
                      <span className={styles.date}>Joined {member.joined}</span>
                    </div>
                    {member.removeControl}
                  </li>
                ))}
              </ul> : <div className={styles.empty}><UsersRound aria-hidden="true" /><h3>No members to show</h3></div>}
            </section>
          </TabsContent>
          {!archived && <TabsContent value="invitations" className={styles.tabContent}>
            <section id="invitations" aria-labelledby="pending-invitations-heading">
              {pendingInvitations.length > 0 ? (
                <>
                  <div className={styles.sectionHeader}>
                    <div><h2 id="pending-invitations-heading">Pending invitations</h2><p>People who have been invited to join this group.</p></div>
                    {invitation}
                  </div>
                  <ul className={styles.rows}>
                    {pendingInvitations.map((pending) => (
                      <li key={pending.key} className={styles.personRow}>
                        <span className={styles.avatar} aria-hidden="true">{initials(pending.name)}</span>
                        <div className={styles.personCopy}>
                          <div className={styles.invitationName}><span className={styles.personName}>{pending.name}</span><span className={styles.pendingBadge}>Pending</span></div>
                          {pending.handle !== null && <span className={styles.handle}>@{pending.handle}</span>}
                        </div>
                        <span className={styles.date}>Invited {pending.invited}</span>
                        {pending.revokeControl}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className={styles.emptyState} aria-labelledby="pending-invitations-heading">
                  <Mail size={40} strokeWidth={1.35} aria-hidden="true" />
                  <h2 id="pending-invitations-heading">No pending invitations</h2>
                  <p>Invitations you send to join this group will appear here.</p>
                </div>
              )}
            </section>
          </TabsContent>}
          {canOpenSettings && <TabsContent value="settings" className={styles.tabContent}>
            {settings ?? membership}
          </TabsContent>}
        </Tabs>
      </div>
    </div>
  );
}
