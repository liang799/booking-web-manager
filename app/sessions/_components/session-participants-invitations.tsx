"use client";

import { useId, useState } from "react";
import { Check, Copy, Link2, UserRound, UserRoundPlus, UsersRound, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { initials } from "@/components/ui/initials";
import { findPlayer } from "@/app/users/find-player-action";
import { userHandleSchema } from "@/app/users/schemas";
import { loadSessionInvitation } from "../invitation-transport";
import styles from "./session-participants.module.css";

export interface ImportGroup {
  readonly groupId: string;
  readonly name: string;
  readonly members: readonly { readonly userId: string; readonly displayName: string; readonly handle: string | null }[];
}

type CopyState = { readonly message: string; readonly url?: string };

async function getShareLink(sessionId: string): Promise<CopyState> {
  const result = await loadSessionInvitation(sessionId);
  if (result.status === "error") return { message: result.message };
  const url = new URL(result.invitationPath, window.location.origin).href;
  try {
    await navigator.clipboard.writeText(url);
    return { message: "Invitation link copied. Share it with the selected players; they join and confirm their own places." };
  } catch {
    return { message: "Copy the invitation link below and share it with your players.", url };
  }
}

function Avatar({ name }: { readonly name: string }) {
  return <span className={styles.avatar} aria-hidden="true">{initials(name)}</span>;
}

/** Mirrors the editorial invitation design while respecting the existing link-based session admission contract. */
export function SessionInviteDialog({ sessionId, open, onOpenChange }: {
  readonly sessionId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const inputId = useId();
  const [tab, setTab] = useState<"id" | "link">("id");
  const [handle, setHandle] = useState("");
  const [players, setPlayers] = useState<readonly { handle: string; displayName: string }[]>([]);
  const [finding, setFinding] = useState(false);
  const [copying, setCopying] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState<CopyState | null>(null);

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (finding) return;
    const parsed = userHandleSchema.safeParse(handle);
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? "Enter a user ID."); return; }
    if (players.some((player) => player.handle === parsed.data)) { setMessage("This player is already on the list."); return; }
    setFinding(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("handle", parsed.data);
      const outcome = await findPlayer({ status: "idle" }, form);
      if (outcome.status === "found") {
        if (outcome.player.isSelf) { setMessage("You are already hosting this session."); return; }
        setPlayers((previous) => [...previous, { handle: outcome.player.handle, displayName: outcome.player.displayName }]);
        setHandle("");
      } else if (outcome.status === "not-found") setMessage("No player has this user ID.");
      else if (outcome.status === "error") setMessage(outcome.message);
    } catch {
      setMessage("Player lookup is unavailable. Try again.");
    } finally { setFinding(false); }
  }

  async function copy() {
    if (copying) return;
    setCopying(true);
    setCopied(null);
    try { setCopied(await getShareLink(sessionId)); }
    catch { setCopied({ message: "Could not load the invitation link. Try again." }); }
    finally { setCopying(false); }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={styles.dialog}>
      <div className={styles.dialogHeader}>
        <span className={styles.dialogIcon} aria-hidden="true"><UserRoundPlus /></span>
        <div>
          <DialogTitle className={styles.dialogTitle}>Invite players</DialogTitle>
          <DialogDescription className={styles.dialogDescription}>Add players to this session.</DialogDescription>
        </div>
      </div>
      <div className={styles.dialogBody}>
        <div className={styles.modalTabs} role="tablist" aria-label="Invite method">
          <button type="button" role="tab" aria-selected={tab === "id"} className={styles.modalTab} onClick={() => { setTab("id"); setCopied(null); }}>By user ID</button>
          <button type="button" role="tab" aria-selected={tab === "link"} className={styles.modalTab} onClick={() => { setTab("link"); setCopied(null); }}>By invite link</button>
        </div>
        {tab === "id" ? <>
          <form onSubmit={(event) => void add(event)}>
            <label className={styles.fieldLabel} htmlFor={inputId}>User ID</label>
            <div className={styles.searchRow}>
              <div className={styles.inputWrap}>
                <UserRound size={24} aria-hidden="true" />
                <input id={inputId} value={handle} onChange={(event) => { setHandle(event.target.value); setMessage(""); }}
                  placeholder="Enter a user ID (e.g. @tian_pok_neoh)" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={33} />
              </div>
              <button type="submit" disabled={finding} className={styles.primaryButton}>{finding ? "Finding…" : "Add"}</button>
            </div>
          </form>
          {message && <p className={styles.modalStatus} role="status">{message}</p>}
          <ul className={styles.queue} aria-label="Players selected for invitations">
            {players.map((player) => <li className={styles.queueItem} key={player.handle}>
              <Avatar name={player.displayName} />
              <span>@{player.handle}</span>
              <button type="button" aria-label={`Remove @${player.handle}`} onClick={() => setPlayers((previous) => previous.filter((item) => item.handle !== player.handle))}><X size={22} /></button>
            </li>)}
          </ul>
          {players.length > 0 && <p className={styles.hint}>Players must accept the session through its invitation link. Adding a user ID does not reserve or charge their place.</p>}
        </> : <div>
          <label className={styles.fieldLabel} htmlFor={inputId + "-link"}>Session invitation link</label>
          <p className={styles.hint}>Anyone with the link can review the session and choose to join. The session host controls availability.</p>
          <div className={styles.searchRow} style={{ marginTop: 20 }}>
            <div className={styles.inputWrap}><Link2 size={23} aria-hidden="true" /><input id={inputId + "-link"} readOnly value={copied?.url ?? "Generate a secure invitation link"} onFocus={(event) => event.currentTarget.select()} /></div>
            <button type="button" className={styles.primaryButton} onClick={() => void copy()} disabled={copying}><Copy size={18} /> {copying ? "Loading…" : "Copy"}</button>
          </div>
        </div>}
      </div>
      {copied && <div role="status" className={styles.modalStatus}>{copied.message}{copied.url && <input aria-label="Invitation URL to copy" readOnly value={copied.url} onFocus={(event) => event.currentTarget.select()} className={styles.inputWrap} style={{ width: "100%", minHeight: 48, marginTop: 10, padding: 12 }} />}</div>}
      <div className={styles.modalFooter}>
        {tab === "id" && <span className={styles.footerCount}>Invite {players.length} {players.length === 1 ? "player" : "players"}</span>}
        <button type="button" className={styles.secondaryButton} onClick={() => onOpenChange(false)}>Cancel</button>
        <button type="button" className={styles.primaryButton} disabled={copying || (tab === "id" && players.length === 0)}
          onClick={() => void copy()}>{copying ? "Loading…" : tab === "id" ? "Copy invite link" : "Copy invite link"}</button>
      </div>
    </DialogContent>
  </Dialog>;
}

/** Group memberships are read server-side. Import prepares a shareable invitation, never silently enrolls or charges another player. */
export function SessionGroupImportDialog({ sessionId, groups, open, onOpenChange }: {
  readonly sessionId: string;
  readonly groups: readonly ImportGroup[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const [groupId, setGroupId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<ReadonlyMap<string, ReadonlySet<string>>>(new Map());
  const [copied, setCopied] = useState<CopyState | null>(null);
  const [copying, setCopying] = useState(false);
  const activeGroup = groups.find((group) => group.groupId === groupId) ?? groups[0];
  const members = activeGroup?.members ?? [];
  const selected = (activeGroup && overrides.get(activeGroup.groupId)) ?? new Set(members.map((member) => member.userId));
  const selectedCount = members.filter((member) => selected.has(member.userId)).length;

  function changeSelection(userId: string, enabled: boolean) {
    if (!activeGroup) return;
    const next = new Set(selected);
    if (enabled) next.add(userId); else next.delete(userId);
    setOverrides((previous) => new Map(previous).set(activeGroup.groupId, next));
  }
  async function copy() {
    if (copying || selectedCount === 0) return;
    setCopying(true);
    setCopied(null);
    try { setCopied(await getShareLink(sessionId)); }
    catch { setCopied({ message: "Could not load the invitation link. Try again." }); }
    finally { setCopying(false); }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={`${styles.dialog} ${styles.dialogWide}`}>
      <div className={styles.dialogHeader}>
        <span className={styles.dialogIcon} aria-hidden="true"><UsersRound /></span>
        <div>
          <DialogTitle className={styles.dialogTitle}>Import from group</DialogTitle>
          <DialogDescription className={styles.dialogDescription}>Add members from one of your groups to this session.</DialogDescription>
        </div>
      </div>
      <div className={styles.groupColumns}>
        <section className={styles.groupColumn} aria-labelledby="import-group-heading">
          <h3 id="import-group-heading" className={styles.groupHeading}>Select group</h3>
          <div className={styles.groupList}>
            {groups.length === 0 ? <p className={styles.hint}>You don’t belong to any active groups yet.</p> : groups.map((group) => {
              const sport = /badminton/i.test(group.name) ? "badminton" : /basketball|hoops/i.test(group.name) ? "basketball" : "tennis";
              return <button type="button" key={group.groupId} className={styles.groupChoice} aria-pressed={activeGroup?.groupId === group.groupId}
                onClick={() => { setGroupId(group.groupId); setCopied(null); }}>
                <span aria-hidden="true" className={styles.groupThumbnail} data-sport={sport} />
                <span className={styles.groupIdentity}><strong>{group.name}</strong><small>{group.members.length + 1} members</small></span>
                {activeGroup?.groupId === group.groupId && <Check size={25} aria-hidden="true" />}
              </button>;
            })}
          </div>
        </section>
        <section className={styles.groupColumn} aria-labelledby="import-members-heading">
          <h3 id="import-members-heading" className={`${styles.groupHeading} ${styles.memberHeading}`}>Members to import</h3>
          <p className={styles.memberSubheading}>{activeGroup ? `${selectedCount} members from ${activeGroup.name}` : "Select a group"}</p>
          <ul className={styles.memberList} aria-label="Choose group members">
            {members.length === 0 && <li className={styles.hint}>No other members available.</li>}
            {members.map((member) => <li key={member.userId} className={styles.memberRow}>
              <label>
                <Avatar name={member.displayName} />
                <span>{member.displayName}</span>
                <input className={styles.check} type="checkbox" checked={selected.has(member.userId)}
                  onChange={(event) => changeSelection(member.userId, event.target.checked)} aria-label={`Select ${member.displayName}`} />
              </label>
            </li>)}
          </ul>
        </section>
      </div>
      {copied && <div className={styles.modalStatus} role="status">{copied.message}{copied.url && <input aria-label="Invitation URL to copy" readOnly value={copied.url} onFocus={(event) => event.currentTarget.select()} className={styles.inputWrap} style={{ width: "100%", minHeight: 48, marginTop: 10, padding: 12 }} />}</div>}
      <div className={styles.modalFooter}>
        <span className={styles.hint} style={{ marginRight: "auto", maxWidth: 340 }}>Members must join themselves. Copy the session link to share with the selected group.</span>
        <button type="button" className={styles.secondaryButton} onClick={() => onOpenChange(false)}>Cancel</button>
        <button type="button" className={styles.primaryButton} disabled={copying || selectedCount === 0} onClick={() => void copy()}>
          {copying ? "Loading…" : `Copy link for ${selectedCount} ${selectedCount === 1 ? "member" : "members"}`}
        </button>
      </div>
    </DialogContent>
  </Dialog>;
}
