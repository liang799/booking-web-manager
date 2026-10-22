"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  disablePushNotifications,
  enablePushNotifications,
  isPushEnabled,
  pushSupport,
} from "@/app/commit/push-client";

type State = "loading" | "unsupported" | "denied" | "off" | "on" | "saving";

const descriptions: Record<State, string> = {
  loading: "Checking this browser…",
  unsupported: "Not available in this browser",
  denied: "Blocked in your browser settings",
  off: "Get promotions, replacement invitations and reminders on this device",
  on: "On for this device",
  saving: "Saving…",
};

/**
 * Settings row that turns commitment notifications (waitlist promotion,
 * replacement invitations, forfeiture warnings, attendance reminders) on or
 * off for this browser. Styled to match SettingsRow (mockup 10).
 */
export function PushNotificationsRow() {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const support = pushSupport();
    if (support === "unsupported" || support === "unconfigured") setState("unsupported");
    else if (support === "denied") setState("denied");
    else void isPushEnabled().then((enabled) => setState(enabled ? "on" : "off"), () => setState("off"));
  }, []);

  async function toggle() {
    const wasOn = state === "on";
    setError(null);
    setState("saving");
    try {
      if (wasOn) {
        await disablePushNotifications();
        setState("off");
      } else {
        const enabled = await enablePushNotifications();
        setState(enabled ? "on" : pushSupport() === "denied" ? "denied" : "off");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Notification settings could not be saved");
      setState(wasOn ? "on" : "off");
    }
  }

  const actionable = state === "on" || state === "off" || state === "saving";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 md:gap-x-5 md:px-6">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
        aria-hidden
      >
        <Bell className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <span className="min-w-[140px] flex-1">
        <span className="block text-sm font-medium md:text-base">Session notifications</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground md:text-sm" aria-live="polite">
          {error ?? descriptions[state]}
        </span>
      </span>
      {actionable && (
        <Button
          type="button"
          variant={state === "on" ? "outline" : "default"}
          className="min-h-11 shrink-0"
          disabled={state === "saving"}
          onClick={toggle}
        >
          {state === "on" ? "Turn off" : "Turn on"}
        </Button>
      )}
    </div>
  );
}
