"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DomainError } from "@/domain";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { createManageSessionInvitations } from "@/use-case-config/session-invitations";
import type { SessionInviteSummary } from "@/use-cases/sessions/ManageSessionInvitations";

const uuid = z.string().uuid();
const userIds = z.array(z.string().min(1).max(33)).min(1).max(50);
const memberIds = z.array(uuid).min(1).max(50);

export type SendSessionInvitationsResult =
  | ({ readonly status: "sent" } & SessionInviteSummary)
  | { readonly status: "error"; readonly message: string };

export interface SessionInviteDisplay {
  readonly inviteeId: string;
  readonly displayName: string;
  readonly handle: string | null;
  readonly status: "PENDING" | "ACCEPTED" | "DECLINED";
  readonly invitedAt: string;
}

function invitationError(error: unknown): SendSessionInvitationsResult {
  if (error instanceof DomainError) return { status: "error", message: error.message };
  console.error("Session invitation failed:", error);
  return { status: "error", message: "Could not send session invitations. Try again." };
}

export async function sendDirectSessionInvitations(sessionId: string, handles: readonly string[]): Promise<SendSessionInvitationsResult> {
  const parsedSession = uuid.safeParse(sessionId);
  const parsedPlayers = userIds.safeParse(handles);
  if (!parsedSession.success || !parsedPlayers.success) return { status: "error", message: "Select 1 to 50 valid players." };
  try {
    const user = await getCurrentUser();
    if (!user) return { status: "error", message: "Log in again to invite players." };
    const outcome = await createManageSessionInvitations().inviteByHandles(user.id, parsedSession.data, parsedPlayers.data);
    revalidatePath(`/sessions/${parsedSession.data}/participants`);
    return { status: "sent", ...outcome };
  } catch (error) { return invitationError(error); }
}

export async function sendGroupSessionInvitations(
  sessionId: string, groupId: string, selectedUserIds: readonly string[],
): Promise<SendSessionInvitationsResult> {
  const parsedSession = uuid.safeParse(sessionId);
  const parsedGroup = uuid.safeParse(groupId);
  const parsedMembers = memberIds.safeParse(selectedUserIds);
  if (!parsedSession.success || !parsedGroup.success || !parsedMembers.success)
    return { status: "error", message: "Select 1 to 50 valid group members." };
  try {
    const user = await getCurrentUser();
    if (!user) return { status: "error", message: "Log in again to invite members." };
    const outcome = await createManageSessionInvitations().inviteFromGroup(
      user.id, parsedSession.data, parsedGroup.data, parsedMembers.data,
    );
    revalidatePath(`/sessions/${parsedSession.data}/participants`);
    return { status: "sent", ...outcome };
  } catch (error) { return invitationError(error); }
}

export async function loadSessionInvitations(sessionId: string): Promise<readonly SessionInviteDisplay[]> {
  const parsedSession = uuid.parse(sessionId);
  const user = await getCurrentUser();
  if (!user) return [];
  const rows = await createManageSessionInvitations().listForBooker(user.id, parsedSession);
  return rows.map((invitation) => ({
    ...invitation, invitedAt: invitation.invitedAt.toISOString(),
  }));
}
