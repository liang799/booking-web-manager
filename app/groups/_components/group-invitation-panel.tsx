"use client";

import { useActionState, useId, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { InvitePlayerState } from "../actions";
import { InvitationLink } from "./invitation-link";
import styles from "./group-detail.module.css";

const idle: InvitePlayerState = { status: "idle" };

export function GroupInvitationPanel({ groupId, url, active, inviteAction, controls }: {
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
    <section id="invite" className={styles.invitation} aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Invite a player</h2>
      {active ? <Tabs defaultValue="link">
        <TabsList className={styles.shareTabs} aria-label="Invitation method">
          <TabsTrigger value="link">Share a link</TabsTrigger>
          <TabsTrigger value="id">By user ID</TabsTrigger>
        </TabsList>
        <TabsContent value="link" className={styles.shareContent}>
          <p>Anyone with this link can join the group. The owner can revoke it at any time.</p>
          <InvitationLink url={url} />
        </TabsContent>
        <TabsContent value="id" className={styles.shareContent}>
          <p>Invite a player by their exact user ID. They join after accepting the invitation.</p>
          <form onSubmit={submit} className={styles.inviteForm}>
            <input type="hidden" name="groupId" value={groupId} />
            <Label htmlFor={`${id}-handle`}>User ID</Label>
            <Input id={`${id}-handle`} name="handle" placeholder="e.g. joseph" maxLength={33} required
              autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              aria-invalid={state.status === "error"} aria-describedby={`${id}-result`} />
            <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send invitation"}</Button>
            <p id={`${id}-result`} role="status" className={state.status === "error" ? styles.error : undefined}>{state.message}</p>
          </form>
        </TabsContent>
      </Tabs> : <p className={styles.muted}>The invitation link is turned off. Invitations by user ID are also unavailable until the owner turns it on.</p>}
      {controls && <div className={styles.linkControls}>{controls}</div>}
    </section>
  );
}
