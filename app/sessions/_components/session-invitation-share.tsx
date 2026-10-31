"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Link as LinkIcon } from "lucide-react";
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
  const copied = state.status === "ready" && state.clipboard === "copied";

  // A successful copy is transient feedback, not a new panel that resizes the dialog.
  useEffect(() => {
    if (state.status !== "ready" || state.clipboard !== "copied") return;
    const timeout = window.setTimeout(() => {
      setState((current) => current === state ? { status: "idle" } : current);
    }, 2000);
    return () => window.clearTimeout(timeout);
  }, [state]);

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
    <Button type="button" variant={presentation === "details" ? "default" : "outline"} className={presentation === "details" ? details.inviteButton : "min-h-11"} disabled={disabled || state.status === "loading"} onClick={copyInvitation}>
      {copied ? <Check aria-hidden="true" /> : presentation === "details" ? <LinkIcon aria-hidden="true" /> : <Copy className="mr-2 h-4 w-4" aria-hidden="true" />}
      {state.status === "loading" ? "Loading invitation…" : copied ? "Link copied" : "Copy invitation link"}
    </Button>
    </div>
    <span role="status" aria-live="polite" className="sr-only">{copied ? "Invitation link copied." : ""}</span>
    {state.status === "ready" && state.clipboard === "manual" && <div className="mt-3 space-y-2 rounded-lg bg-muted p-3">
      <p className="text-sm">Copy the invitation link below.</p>
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
