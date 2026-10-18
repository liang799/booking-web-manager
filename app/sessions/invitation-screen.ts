import { z } from "zod";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { isAuthenticationConfigured } from "@/lib/supabase/is-configured";
import { getSessionInvitationPreviewDependencies } from "./invitation-preview-server-dependencies";

export interface InvitationSessionView {
  readonly sessionId: string;
  readonly venueName: string;
  readonly sport: string;
  readonly region: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly totalSlots: number;
  readonly bookingShareCents: number;
}

export type InvitationScreen =
  | { readonly status: "unavailable" | "error" }
  | { readonly status: "ready"; readonly session: InvitationSessionView; readonly roomToken: string;
    readonly invitationPath: string; readonly viewerId: string | null };

/** Reads private display facts only after token validation; optional identity never blocks preview. */
export async function loadInvitationScreen(sessionId: string, token: string | string[] | undefined): Promise<InvitationScreen> {
  if (!z.string().uuid().safeParse(sessionId).success || typeof token !== "string" || token.length === 0) {
    return { status: "unavailable" };
  }
  try {
    const { preview } = await getSessionInvitationPreviewDependencies();
    const session = await preview.byToken(sessionId, token);
    if (session === null) return { status: "unavailable" };
    const user = isAuthenticationConfigured() ? await getCurrentUser().catch(() => null) : null;
    return {
      status: "ready",
      session: {
        sessionId: session.sessionId, venueName: session.venueName, sport: session.sport, region: session.region,
        startAt: session.startAt.toISOString(), endAt: session.endAt.toISOString(),
        totalSlots: session.totalSlots, bookingShareCents: session.bookingShareCents,
      },
      roomToken: token,
      invitationPath: `/sessions/${encodeURIComponent(sessionId)}/join?${new URLSearchParams({ token })}`,
      viewerId: user?.accountStatus === "ACTIVE" ? user.id : null,
    };
  } catch {
    return { status: "error" };
  }
}
