"use client";

import { Link2, UsersRound } from "lucide-react";
import { useActionState, useId, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { InvitePlayerState } from "../actions";
import { InvitationLink } from "./invitation-link";
import styles from "./group-detail.module.css";

const idle: InvitePlayerState = { status: "idle" };

/** One invitation entry point on both detail tabs; methods live inside the dialog. */
export function GroupInvitationPanel({ groupId, url, active, inviteAction, controls }: {
  readonly groupId: string;
  readonly url: string;
  readonly active: boolean;
  readonly inviteAction: (previous: InvitePlayerState, form: FormData) => Promise<InvitePlayerState>;
  readonly controls?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" className={styles.inviteButton}><UsersRound aria-hidden="true" />Invite players</Button></DialogTrigger>
      <DialogContent className={styles.inviteDialog}>
        <DialogHeader className={styles.dialogHero}>
          <DialogTitle>Invite members</DialogTitle>
          <DialogDescription>Share a link for people to join this group.</DialogDescription>
        </DialogHeader>
        {/* Remount when opened so the last submission is not shown the next time. */}
        {open && <InvitationMethods groupId={groupId} url={url} active={active} inviteAction={inviteAction} controls={controls} />}
      </DialogContent>
    </Dialog>
  );
}

function InvitationMethods({ groupId, url, active, inviteAction, controls }: {
  readonly groupId: string;
  readonly url: string;
  readonly active: boolean;
  readonly inviteAction: (previous: InvitePlayerState, form: FormData) => Promise<InvitePlayerState>;
  readonly controls?: ReactNode;
}) {
  const id = useId();
  const [state, formAction, pending] = useActionState(inviteAction, idle);
  const [, startTransition] = useTransition();
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    startTransition(() => formAction(form));
  }
  return (
    <Tabs defaultValue="link" className={styles.inviteMethods}>
      <TabsList className={styles.shareTabs} aria-label="Invitation method">
        <TabsTrigger value="link">Share a link</TabsTrigger>
        <TabsTrigger value="id">Invite by user ID</TabsTrigger>
      </TabsList>
      <TabsContent value="link" className={styles.shareContent}>
        <div className={styles.inviteCard}>
          <div className={styles.linkHeader}>
            <span className={styles.linkIcon}><Link2 size={23} aria-hidden="true" /></span>
            <div><h3>Group invite link</h3><p>Anyone with this link can join the group. The owner can revoke it at any time.</p></div>
          </div>
          {active ? <InvitationLink url={url} /> : <p className={styles.disabledNote}>This invitation link is turned off.</p>}
          {controls && <div className={styles.linkControls}>{controls}</div>}
        </div>
      </TabsContent>
      <TabsContent value="id" className={styles.shareContent}>
        {active ? (
          <div className={styles.inviteCard}>
            <h3>Invite a player</h3>
            <p>Enter their exact user ID. They can join once they accept the invitation.</p>
            <form onSubmit={submit} className={styles.inviteForm}>
              <input type="hidden" name="groupId" value={groupId} />
              <Label htmlFor={id + "-handle"}>User ID</Label>
              <Input id={id + "-handle"} name="handle" placeholder="e.g. joseph" maxLength={33} required
                autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                aria-invalid={state.status === "error"} aria-describedby={id + "-result"} />
              <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send invitation"}</Button>
              <p id={id + "-result"} role="status" className={state.status === "error" ? styles.error : styles.formResult}>{state.message}</p>
            </form>
          </div>
        ) : <p className={styles.disabledNote}>Invitations are turned off. The group owner needs to enable the link first.</p>}
      </TabsContent>
    </Tabs>
  );
}
