"use client";

import { ArrowLeft, ArrowRight, Check, LockKeyhole } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { userHandleSchema } from "@/app/users/schemas";
import type { CreateGroupState } from "../create-group-action";
import { groupNameSchema } from "../schemas";
import { GroupPlayerPicker, type FindGroupPlayer, type QueuedPlayer } from "./group-player-picker";
import styles from "./group-create.module.css";

const draftSchema = z.object({ name: z.string().max(60), players: z.array(z.object({ handle: userHandleSchema, displayName: z.string().max(200) })).max(20) });

export function CreateGroupWizard({ createAction, findAction, draftKey }: {
  readonly createAction: (previous: CreateGroupState, form: FormData) => Promise<CreateGroupState>;
  readonly findAction: FindGroupPlayer;
  readonly draftKey: string;
}) {
  const router = useRouter();
  const formId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState("");
  const [players, setPlayers] = useState<readonly QueuedPlayer[]>([]);
  const [step, setStep] = useState(1);
  const [message, setMessage] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const [result, setResult] = useState<CreateGroupState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const [finding, setFinding] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(draftKey);
      if (saved !== null) {
        const draft = draftSchema.safeParse(JSON.parse(saved));
        if (draft.success) { setName(draft.data.name); setPlayers(draft.data.players); setDraftMessage("Your saved draft has been restored."); }
      }
    } catch { /* Unavailable storage or an old draft must not block creation. */ }
  }, [draftKey]);

  useEffect(() => { if (step === 2) heading.current?.focus({ preventScroll: true }); }, [step]);

  function saveDraft() {
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ name, players }));
      setDraftMessage("Draft saved for this browser session.");
    } catch { setDraftMessage("We couldn't save your draft. You can still create your group."); }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || finding || result.status === "created") return;
    const parsed = groupNameSchema.safeParse(name);
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? "Enter a group name."); setStep(1); return; }
    setMessage("");
    if (step === 1) { setStep(2); return; }
    const form = new FormData();
    form.set("name", parsed.data);
    players.forEach((player) => form.append("players", player.handle));
    startTransition(async () => {
      try {
        const next = await createAction({ status: "idle" }, form);
        setResult(next);
        if (next.status === "error") setMessage(next.message);
        if (next.status === "created") {
          try { sessionStorage.removeItem(draftKey); } catch { /* Creation succeeded without storage. */ }
          if (next.failedInvites.length === 0) router.push(`/groups/${next.groupId}`);
        }
      } catch { setMessage("We couldn't confirm whether your group was created. Check Your groups before trying again."); }
    });
  }

  if (result.status === "created") return (
    <div className={styles.success}>
      <Check size={36} aria-hidden="true" /><p className={styles.eyebrow}>Your crew / your game</p>
      <h1>Your group is ready.</h1>
      {result.failedInvites.length > 0 ? <>
        <p>The group was created. These invitations couldn&apos;t be sent; you can try them again from the group page.</p>
        <ul>{result.failedInvites.map((failure) => <li key={failure.handle}><strong>@{failure.handle}</strong> — {failure.message}</li>)}</ul>
      </> : <p>Opening your group…</p>}
      <Button asChild><Link href={`/groups/${result.groupId}`}>Open group <ArrowRight aria-hidden="true" /></Link></Button>
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.topbar}><p>Create group</p><Button variant="ghost" onClick={saveDraft} disabled={pending || finding}>Save draft</Button></div>
      <ol className={styles.steps} aria-label="Create group progress">
        <li data-current={step === 1 || undefined} data-complete={step > 1 || undefined} aria-current={step === 1 ? "step" : undefined}><span>{step > 1 ? <Check size={16} aria-label="Complete" /> : "01"}</span>Details</li>
        <li data-current={step === 2 || undefined} aria-current={step === 2 ? "step" : undefined}><span>02</span>Invite players</li>
      </ol>
      <p className={styles.draftMessage} role="status">{draftMessage}</p>
      <div className={styles.content}>
        <div className={styles.formColumn}>
          <p className={styles.eyebrow}>{step === 1 ? "01 / Group details" : "02 / Invite players"}</p>
          <h1 ref={heading} tabIndex={-1}>{step === 1 ? "Bring your people together." : "Who’s joining your group?"}</h1>
          <p className={styles.intro}>{step === 1 ? "Create a space for your regular players. Give your group a name and make it yours." : "Add players by their user ID. You can also invite more people after creating the group."}</p>
          <form id={formId} onSubmit={submit} noValidate>
            {step === 1 && <div className={styles.nameField}>
              <Label htmlFor={`${formId}-name`}>Group name <span aria-hidden="true" className={styles.required}>*</span></Label>
              <Input id={`${formId}-name`} value={name} onChange={(event) => { setName(event.target.value); setMessage(""); }}
                name="name" placeholder="e.g. Weekend Tennis Crew" maxLength={60} required
                aria-invalid={Boolean(message)} aria-describedby={`${formId}-hint ${formId}-error`} />
              <p id={`${formId}-hint`} className={styles.hint}>Choose something your players will recognise.</p>
            </div>}
          </form>
          {step === 2 && <GroupPlayerPicker players={players} onChange={setPlayers} onBusyChange={setFinding} findAction={findAction} disabled={pending} />}
          <p id={`${formId}-error`} role="alert" className={styles.error}>{message}{message.includes("Check Your groups") && <> <Link href="/groups" className="underline">Your groups</Link></>}</p>
          {step === 1 && <p className={styles.privacy}><LockKeyhole size={20} aria-hidden="true" />Groups are private. Only invited players can join.</p>}
          {step === 2 && <p className={styles.hint}>Invitations are sent when you create the group. Players join after accepting.</p>}
        </div>
        <aside className={styles.artwork} aria-label="Group inspiration">
          <div className={styles.photo}><Image src="/images/sessions/court.webp" alt="" fill priority sizes="(min-width: 1100px) 45vw, 50vw" /></div>
          <p className={styles.eyebrow}>Your crew / your game</p>
          <h2>{step === 1 ? "Better games, together." : "Good games start with good company."}</h2>
          <p>{step === 1 ? "One place for your players, shared sessions and future games." : "Your regular players, all in one place."}</p>
        </aside>
      </div>
      <footer className={styles.footer}>
        {step === 1 ? <Button asChild variant="ghost"><Link href="/groups"><ArrowLeft aria-hidden="true" />Cancel</Link></Button> : <Button variant="ghost" onClick={() => { setStep(1); setMessage(""); }} disabled={pending || finding}><ArrowLeft aria-hidden="true" />Back</Button>}
        <Button type="submit" form={formId} disabled={pending || finding}>{pending ? "Creating…" : step === 1 ? "Continue" : "Create group"}<ArrowRight aria-hidden="true" /></Button>
      </footer>
    </div>
  );
}
