"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { Input } from "@/components/ui/input";
import { loadSessionInvitation, type LoadSessionInvitation } from "../invitation-transport";
import details from "./session-details.module.css";

type ShareState =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "error"; readonly message: string; readonly signIn: boolean }
  | { readonly status: "ready"; readonly url: string; readonly clipboard: "copied" | "manual" };

export interface SessionInvitationShareProps {
  readonly sessionId: string;
  readonly presentation?: "default" | "details";
  readonly disabled?: boolean;
  readonly loadInvitation?: LoadSessionInvitation;
  readonly copyText?: (value: string) => Promise<void>;
}

/** Resolves the owner-only link on click; a rejected clipboard write leaves a selectable URL. */
export function SessionInvitationShare({ sessionId, disabled, presentation = "default", loadInvitation = loadSessionInvitation,
  copyText = (value) => navigator.clipboard.writeText(value) }: SessionInvitationShareProps) {
  const [state, setState] = useState<ShareState>({ status: "idle" });
  const busy = useRef(false);
  const inputId = useId();

  async function copyInvitation() {
    if (busy.current || disabled) return;
    busy.current = true;
    setState({ status: "loading" });
    try {
      const result = await loadInvitation(sessionId);
      if (result.status === "error") { setState(result); return; }
      const url = new URL(result.invitationPath, window.location.origin).href;
      try {
        await copyText(url);
        setState({ status: "ready", url, clipboard: "copied" });
      } catch {
        setState({ status: "ready", url, clipboard: "manual" });
      }
    } catch {
      setState({ status: "error", signIn: false, message: "We couldn't load the invitation link. Please try again." });
    } finally { busy.current = false; }
  }

  return <div className={presentation === "details" ? details.invitation : "mt-4 space-y-3"}>
    <div className={presentation === "details" ? details.inviteRow : undefined}>
    {presentation === "details" && <div><h3>Invite your friends</h3><p>Share a link to join this session.</p></div>}
    <Button type="button" variant={presentation === "details" ? "default" : "outline"} className={presentation === "details" ? details.inviteButton : "min-h-11"} disabled={disabled || state.status === "loading"} onClick={copyInvitation}>
      {presentation === "details" ? <Link2 className="mr-2 h-4 w-4" aria-hidden="true" /> : <Copy className="mr-2 h-4 w-4" aria-hidden="true" />}
      {state.status === "loading" ? "Loading invitation…" : presentation === "details" ? "Copy link" : "Copy invitation link"}
    </Button>
    </div>
    {state.status === "ready" && <div className="mt-3 space-y-2 rounded-lg bg-muted p-3">
      <p role="status" className="text-sm">{state.clipboard === "copied" ? "Invitation link copied." : "Copy the invitation link below."}</p>
      <label htmlFor={inputId} className="sr-only">Invitation link</label>
      <Input id={inputId} value={state.url} readOnly onFocus={(event) => event.currentTarget.select()} className="min-h-11 bg-background" />
      <p className="text-xs leading-relaxed text-muted-foreground">Anyone with this link can view the session details and request to join.</p>
    </div>}
    {state.status === "error" && <div className="mt-3 space-y-2">
      <ErrorMessage>{state.message}</ErrorMessage>
      {state.signIn && <Button asChild variant="link" className="h-auto p-0"><Link href="/login?next=%2Fsessions">Log in</Link></Button>}
    </div>}
  </div>;
}
