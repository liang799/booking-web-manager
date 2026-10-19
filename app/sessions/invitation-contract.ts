import { z } from "zod";
import type { SessionInvitation } from "@/use-cases/sessions/GetSessionInvitation";

export const sessionInvitationParamsSchema = z.object({ sessionId: z.string().uuid() });
export const sessionInvitationResponseSchema = z.object({ invitationPath: z.string() });

/** Build a same-origin relative path from server-owned values, preserving the exact token. */
export function toSessionInvitationResponse(invitation: SessionInvitation): { invitationPath: string } {
  return { invitationPath: `/sessions/${encodeURIComponent(invitation.sessionId)}/join?token=${encodeURIComponent(invitation.roomToken)}` };
}
