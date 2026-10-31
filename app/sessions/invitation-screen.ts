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
  | {
      readonly status: "ready";
      readonly session: InvitationSessionView;
      readonly roomToken?: string;
      readonly invitationPath: string;
      readonly viewerId: string | null;
    };

/** Reads private display facts only after token validation; optional identity never blocks preview. */
export async function loadInvitationScreen(
  sessionId: string,
  token: string | string[] | undefined,
): Promise<InvitationScreen> {
  if (
    !z.string().uuid().safeParse(sessionId).success ||
    (token !== undefined && (typeof token !== "string" || token.length === 0))
  ) {
    return { status: "unavailable" };
  }
  try {
    // Tokenless previews disclose nothing until the current active identity is known.
    let user =
      token === undefined && isAuthenticationConfigured()
        ? await getCurrentUser().catch(() => null)
        : null;
    if (token === undefined && user?.accountStatus !== "ACTIVE")
      return { status: "unavailable" };
    const { preview } = await getSessionInvitationPreviewDependencies();
    const session =
      token === undefined
        ? await preview.forGroupMember(sessionId, user!.id)
        : await preview.byToken(sessionId, token);
    if (session === null) return { status: "unavailable" };
    if (token !== undefined)
      user = isAuthenticationConfigured()
        ? await getCurrentUser().catch(() => null)
        : null;
    return {
      status: "ready",
      session: {
        sessionId: session.sessionId,
        venueName: session.venueName,
        sport: session.sport,
        region: session.region,
        startAt: session.startAt.toISOString(),
        endAt: session.endAt.toISOString(),
        totalSlots: session.totalSlots,
        bookingShareCents: session.bookingShareCents,
      },
      ...(token === undefined ? {} : { roomToken: token }),
      invitationPath: `/sessions/${encodeURIComponent(sessionId)}/join${token === undefined ? "" : `?${new URLSearchParams({ token })}`}`,
      viewerId: user?.accountStatus === "ACTIVE" ? user.id : null,
    };
  } catch {
    return { status: "error" };
  }
}
