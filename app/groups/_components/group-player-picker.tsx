"use client";

import { AtSign, X } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initials } from "@/components/ui/initials";
import type { FindPlayerState } from "@/app/users/find-player-action";
import { userHandleSchema } from "@/app/users/schemas";
import styles from "./group-create.module.css";

export interface QueuedPlayer { readonly handle: string; readonly displayName: string }
export type FindGroupPlayer = (previous: FindPlayerState, form: FormData) => Promise<FindPlayerState>;

/** Resolves exact IDs now; invitations are sent only when the group is created. */
export function GroupPlayerPicker({ players, onChange, onBusyChange, findAction, disabled = false }: {
  readonly players: readonly QueuedPlayer[];
  readonly onChange: (players: readonly QueuedPlayer[]) => void;
  readonly onBusyChange: (busy: boolean) => void;
  readonly findAction: FindGroupPlayer;
  readonly disabled?: boolean;
}) {
  const id = useId();
  const [handle, setHandle] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || disabled) return;
    const parsed = userHandleSchema.safeParse(handle);
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? "Enter a user ID."); return; }
    if (players.some((player) => player.handle === parsed.data)) { setMessage("This player is already on your list."); return; }
    if (players.length >= 20) { setMessage("Invite up to 20 players now. You can invite more after creating the group."); return; }
    setMessage("");
    const form = new FormData();
    form.set("handle", parsed.data);
    onBusyChange(true);
    startTransition(async () => {
      try {
        const result = await findAction({ status: "idle" }, form);
        if (result.status === "found") {
          if (result.player.isSelf) { setMessage("You're already the owner. Add another player."); return; }
          onChange([...players, { handle: result.player.handle, displayName: result.player.displayName }]);
          setHandle("");
        } else if (result.status === "not-found") setMessage(`No player has the user ID @${result.handle}.`);
        else if (result.status === "error") setMessage(result.message);
      } catch {
        setMessage("We couldn't find that player right now. Please try again.");
      } finally {
        onBusyChange(false);
      }
    });
  }

  return (
    <div>
      <form onSubmit={add} noValidate>
        <Label htmlFor={id}>Find players</Label>
        <div className={styles.searchRow}>
          <div className={styles.searchInput}>
            <AtSign size={18} aria-hidden="true" />
            <Input id={id} value={handle} onChange={(event) => { setHandle(event.target.value); setMessage(""); }}
              placeholder="Enter a user ID (e.g. joseph)" maxLength={33} disabled={pending || disabled}
              autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              aria-invalid={Boolean(message)} aria-describedby={`${id}-hint ${id}-message`} />
          </div>
          <Button type="submit" disabled={pending || disabled}>{pending ? "Finding…" : "Add"}</Button>
        </div>
        <p id={`${id}-hint`} className={styles.hint}>Enter the exact user ID of the player you want to invite.</p>
        <p id={`${id}-message`} role="status" className={styles.error}>{message}</p>
      </form>
      <div className={styles.playersHeading}><h2>Players to invite</h2><span aria-live="polite">{players.length} added</span></div>
      {players.length === 0 ? <p className={styles.emptyPlayers}>Your crew starts here. Add a player, or invite people later.</p> : (
        <ul className={styles.players} aria-label="Players to invite">
          {players.map((player) => <li key={player.handle}>
            <span className={styles.avatar} aria-hidden="true">{initials(player.displayName)}</span>
            <span className={styles.playerName}><span>{player.displayName}</span><small>@{player.handle}</small></span>
            <Button variant="ghost" size="icon" aria-label={`Remove ${player.displayName}`} disabled={pending || disabled}
              onClick={() => onChange(players.filter((other) => other.handle !== player.handle))}><X aria-hidden="true" /></Button>
          </li>)}
        </ul>
      )}
    </div>
  );
}
