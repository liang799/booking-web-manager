"use client";

import { ChevronRight, Link2, MoreHorizontal, Plus, Settings2, UsersRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { InfoNote } from "@/components/ui/info-note";
import { initials } from "@/components/ui/initials";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SessionViewNavigation } from "@/app/sessions/_components/session-view-navigation";
import styles from "./groups-view.module.css";

export interface GroupOverview {
  readonly groupId: string;
  readonly name: string;
  readonly ownerName: string;
  readonly isOwner: boolean;
  readonly archived: boolean;
  readonly memberCount: number;
  readonly memberNames: readonly string[];
}

export interface GroupsViewProps {
  readonly groups: readonly GroupOverview[];
  /** Player search by user ID (ADR-0021), shown above the filters. */
  readonly findPlayer?: ReactNode;
  /** Invitations by user ID waiting for an answer (ADR-0022), shown first. */
  readonly invitations?: ReactNode;
  readonly leftGroup?: boolean;
}

const filters = [
  { value: "all", label: "All", includes: () => true, empty: "Your next game starts with good company." },
  { value: "owned", label: "Owned", includes: (group: GroupOverview) => group.isOwner && !group.archived, empty: "Create a group and bring your regular players together." },
  { value: "joined", label: "Joined", includes: (group: GroupOverview) => !group.isOwner && !group.archived, empty: "Ask a group owner for an invitation link to join their players." },
  { value: "archived", label: "Archived", includes: (group: GroupOverview) => group.archived, empty: "Groups you archive will appear here, with their member history." },
] as const;

// Existing decorative court photography; groups do not have uploaded covers.
const covers = ["/images/sessions/court.webp", "/images/session-court.webp", "/images/sessions/bench.webp", "/images/sports/tennis.jpg"] as const;

const mobileQuery = "(max-width: 767px)";
function subscribeToMobile(onChange: () => void) {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const isMobileScreen = () => window.matchMedia(mobileQuery).matches;
const isServerScreenMobile = () => false;

/** Synchronous UC1-06 overview; server-owned slots provide search and invitations. */
export function GroupsView({ groups, findPlayer, invitations, leftGroup = false }: GroupsViewProps) {
  const [filterValue, setFilterValue] = useState("all");
  const mobile = useSyncExternalStore(subscribeToMobile, isMobileScreen, isServerScreenMobile);
  return (
    <div className={styles.page}>
      <div className={styles.heroArtwork} aria-hidden="true" />
      <header className={styles.header}>
        <div className={styles.mobileNavigation}><SessionViewNavigation active="groups" /></div>
        <div className={styles.headerCopy}>
          <p className={styles.eyebrow}>Groups</p>
          <h1>Your groups</h1>
          <p className={styles.intro}>Play together. Organise sessions with your regular players.</p>
        </div>
        <Button asChild className={styles.createButton}><Link href="/groups/new"><Plus aria-hidden="true" /><span>Create group</span></Link></Button>
      </header>

      {leftGroup && <div className={styles.notice}><InfoNote icon><span role="status">You left the group.</span></InfoNote></div>}

      {invitations !== undefined && <div className={styles.invitations}>{invitations}</div>}

      {findPlayer !== undefined && (
        <section className={styles.findPlayer} aria-labelledby="find-player-heading">
          <div className={styles.findPlayerCopy}>
            <h2 id="find-player-heading">Find a player</h2>
            <p>Search by their exact user ID.</p>
          </div>
          {findPlayer}
        </section>
      )}

      <Tabs value={mobile ? "all" : filterValue} onValueChange={setFilterValue} className={styles.tabs}>
        <TabsList aria-label="Filter groups" className={styles.filters}>
          {filters.map((filter) => <TabsTrigger key={filter.value} value={filter.value} className={styles.filter}>{filter.label}<span className={styles.filterCount} aria-hidden="true">{groups.filter(filter.includes).length}</span></TabsTrigger>)}
        </TabsList>
        {filters.map((filter) => {
          const visible = groups.map((group, index) => ({ group, index })).filter(({ group }) => filter.includes(group));
          return (
            <TabsContent key={filter.value} value={filter.value} className={styles.panel}>
              {visible.length > 0 ? (
                <ul className={styles.list} aria-label={`${filter.label} groups`}>
                  {visible.map(({ group, index }) => <GroupRow key={group.groupId} group={group} coverIndex={index} />)}
                </ul>
              ) : (
                <div className={styles.empty}>
                  <span className={styles.emptyIcon}><UsersRound aria-hidden="true" size={28} strokeWidth={1.5} /></span>
                  <h2>{groups.length === 0 ? "No groups yet" : `No ${filter.label.toLowerCase()} groups`}</h2>
                  <p>{groups.length === 0 ? "Create a group for the people you play with, then share its invitation link." : filter.empty}</p>
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

function GroupRow({ group, coverIndex }: { readonly group: GroupOverview; readonly coverIndex: number }) {
  const remainder = group.memberCount - group.memberNames.length;
  return (
    <li className={styles.row} data-archived={group.archived || undefined}>
      <Link href={`/groups/${group.groupId}`} className={styles.rowLink} aria-label={`Open ${group.name}`}>
        <span className={styles.cover}>
          <Image src={covers[coverIndex % covers.length] ?? covers[0]} alt="" fill sizes="(min-width: 1101px) 160px, (min-width: 768px) 120px, 76px" className={styles.coverImage} />
        </span>
        <span className={styles.monogram} data-tone={coverIndex % 4} aria-hidden="true">{initials(group.name.replace(/[&+]/g, " "))}</span>
        <span className={styles.copy}>
          <span className={styles.name}>{group.name}</span>
          <span className={styles.description}>Organised by {group.ownerName}</span>
          <span className={styles.members}>
            <span className={styles.avatars} aria-hidden="true">
              {group.memberNames.map((name, index) => <span key={index} className={styles.avatar} title={name}>{initials(name)}</span>)}
              {remainder > 0 && <span className={styles.remainder}>+{remainder}</span>}
            </span>
            <span className={styles.memberCount}>{group.memberCount} {group.memberCount === 1 ? "member" : "members"}</span>
            <span className={styles.mobileRole}>{group.archived ? "Archived" : group.isOwner ? "Owner" : "Member"}</span>
          </span>
        </span>
        <span className={styles.status}>
          <span className={styles.activity} data-archived={group.archived || undefined}><span aria-hidden="true" />{group.archived ? "Archived" : "Active"}</span>
          <span className={`${styles.role} ${group.isOwner ? styles.owner : ""}`}>{group.isOwner ? "Owner" : "Member"}</span>
        </span>
        <span className={styles.optionsSpace} aria-hidden="true" />
        <ChevronRight className={styles.chevron} size={22} strokeWidth={1.5} aria-hidden="true" />
      </Link>
      <GroupOptions group={group} />
    </li>
  );
}

/** Native disclosure links retain normal Tab navigation, outside dismissal and Escape focus. */
export function GroupOptions({ group, onNavigate }: { readonly group: Pick<GroupOverview, "groupId" | "name" | "isOwner" | "archived">; readonly onNavigate?: (href: string) => void }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      const details = ref.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) details.open = false;
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  return (
    <details ref={ref} className={styles.options} onKeyDown={(event) => {
      if (event.key === "Escape" && ref.current?.open) {
        event.preventDefault();
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    }}>
      <summary aria-label={`Options for ${group.name}`}><MoreHorizontal size={22} strokeWidth={1.8} aria-hidden="true" /></summary>
      <div className={styles.optionsPanel} onClick={(event) => { if (ref.current) ref.current.open = false; const href = (event.target as Element).closest("a")?.getAttribute("href"); if (href) onNavigate?.(href); }}>
        <Link href={`/groups/${group.groupId}#members`}><UsersRound aria-hidden="true" />View members</Link>
        {!group.archived && <Link href={`/groups/${group.groupId}#invite`}><Link2 aria-hidden="true" />Invitation link</Link>}
        {!group.archived && group.isOwner && <Link href={`/groups/${group.groupId}#settings`}><Settings2 aria-hidden="true" />Group settings</Link>}
        {!group.archived && !group.isOwner && <Link href={`/groups/${group.groupId}#leave`}><Settings2 aria-hidden="true" />Membership settings</Link>}
      </div>
    </details>
  );
}
