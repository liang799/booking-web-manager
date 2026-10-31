"use client";

import { ArrowLeft, UsersRound } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
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

export interface GroupDetailViewProps {
  readonly groupId: string;
  readonly name: string;
  readonly ownerName: string;
  readonly isOwner: boolean;
  readonly archived: boolean;
  readonly members: readonly GroupDetailMember[];
  readonly invitation?: ReactNode;
  readonly membership?: ReactNode;
  readonly settings?: ReactNode;
}

/** Display-only member projection; mutation controls remain server-owned slots. */
export function GroupDetailView({ groupId, name, ownerName, isOwner, archived, members, invitation, membership, settings }: GroupDetailViewProps) {
  const [tab, setTab] = useState("members");
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <Link href="/groups" className={styles.back}><ArrowLeft size={18} aria-hidden="true" />All groups</Link>
        <div className={styles.heroCopy}>
          <div className={styles.title}><h1>{name}</h1><p>Organised by {ownerName}<span aria-hidden="true"> · </span>{members.length} {members.length === 1 ? "member" : "members"}</p></div>
          <div className={styles.headerActions}>
            <p className={styles.activity} data-archived={archived || undefined}><span aria-hidden="true" />{archived ? "Archived" : "Active"}</p>
            <div><span className={styles.role}>{isOwner ? "Owner" : "Member"}</span><div className={styles.menu}><GroupOptions group={{ groupId, name, isOwner, archived }} onNavigate={() => setTab("members")} /></div></div>
          </div>
        </div>
      </header>
      <div className={styles.content}>
        {archived && <p className={styles.archiveNote}>This group is archived. Your members and their history are still here.</p>}
        <Tabs value={archived ? "members" : tab} onValueChange={setTab}>
          <TabsList className={styles.tabs} aria-label="Group details">
            <TabsTrigger value="members">Members</TabsTrigger>
            {!archived && <TabsTrigger value="invitations">Invitations</TabsTrigger>}
          </TabsList>
          <TabsContent value="members" className={styles.tabContent}>
            <div className={styles.columns}>
              <section id="members" aria-labelledby="member-list-heading" className={styles.memberSection}>
                <h2 id="member-list-heading">Members ({members.length})</h2>
                {members.length > 0 ? <ul className={styles.members}>
                  {members.map((member) => <li key={member.key}>
                    <span className={styles.avatar} aria-hidden="true">{initials(member.name)}</span>
                    <div className={styles.memberCopy}>
                      <div className={styles.memberTop}><span className={styles.memberName}>{member.name}{member.isYou && " (you)"}</span>{member.isOwner && <span className={styles.ownerBadge}>Owner</span>}</div>
                      <div className={styles.memberMeta}>{member.handle !== null && <span>@{member.handle}</span>}<span>Joined {member.joined}</span></div>
                    </div>
                    {member.removeControl}
                  </li>)}
                </ul> : <p className={styles.empty}><UsersRound aria-hidden="true" />No members to show.</p>}
              </section>
              {(invitation || membership) && <aside className={styles.sidebar} aria-label="Invitations and membership">{invitation}{membership}</aside>}
            </div>
          </TabsContent>
          {!archived && <TabsContent value="invitations" className={styles.tabContent}>
            <div className={styles.invitationColumns}><div><p className={styles.eyebrow}>Your crew / your game</p><h2>Make room for your regulars.</h2><p className={styles.muted}>Share a link or invite a player by user ID. Players invited by ID choose whether to join from their Groups page.</p></div><div className={styles.sidebar}>{invitation}</div></div>
          </TabsContent>}
        </Tabs>
        {settings}
      </div>
    </div>
  );
}
