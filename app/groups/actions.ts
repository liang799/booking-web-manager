"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DomainError } from "@/domain";
import { createManageGroup } from "@/use-case-config/groups";
import { GroupChangedError } from "@/use-cases/groups/manage-group";
import { createClient } from "@/lib/supabase/server";
import { answerInvitationErrorMessage, groupErrorMessage, inviteErrorMessage, leaveGroupErrorMessage } from "./messages";
import { groupIdSchema, groupNameSchema, invitePlayerSchema } from "./schemas";

export interface GroupFormState {
  readonly status: "idle" | "error" | "saved";
  readonly message?: string;
}

/** What the Invite dialog shows after sending (ADR-0022). */
export interface InvitePlayerState {
  readonly status: "idle" | "sent" | "error";
  readonly message?: string;
}

/** What the buttons get back: nothing when it worked, or a message to show. */
export interface GroupActionResult {
  readonly error?: string;
}

/** The logged-in user's id, or null. Every action checks this on the server. */
async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Refreshes the group list and this group's page after a change. */
function refresh(groupId: string): void {
  revalidatePath("/groups");
  revalidatePath(`/groups/${groupId}`);
}

/** UC1-06: create a group. The creator becomes its owner and first member. */
export async function createGroup(_previous: GroupFormState, formData: FormData): Promise<GroupFormState> {
  const name = groupNameSchema.safeParse(formData.get("name") ?? "");
  if (!name.success) return { status: "error", message: name.error.issues[0]?.message };

  const userId = await currentUserId();
  if (userId === null) return { status: "error", message: "Please log in again." };

  let groupId: string;
  try {
    const group = await createManageGroup().create({ ownerId: userId, name: name.data });
    groupId = group.groupId;
  } catch (error) {
    console.error("UC1-06 create group failed:", error);
    return { status: "error", message: groupErrorMessage(error) };
  }
  revalidatePath("/groups");
  redirect(`/groups/${groupId}`);
}

/** UC1-06: owner renames the group. */
export async function renameGroup(
  groupId: string,
  _previous: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const name = groupNameSchema.safeParse(formData.get("name") ?? "");
  if (!name.success) return { status: "error", message: name.error.issues[0]?.message };

  const userId = await currentUserId();
  if (userId === null) return { status: "error", message: "Please log in again." };

  try {
    await createManageGroup().rename({ actorId: userId, groupId, name: name.data });
  } catch (error) {
    return { status: "error", message: groupErrorMessage(error) };
  }
  refresh(groupId);
  return { status: "saved", message: "Group name saved." };
}

/** Runs one owner action and turns a refusal into a message. */
async function ownerAction(
  groupId: string,
  run: (userId: string) => Promise<unknown>,
): Promise<GroupActionResult> {
  const userId = await currentUserId();
  if (userId === null) return { error: "Please log in again." };
  try {
    await run(userId);
  } catch (error) {
    return { error: groupErrorMessage(error) };
  }
  refresh(groupId);
  return {};
}

/** UC1-06: owner removes a member. */
export async function removeMember(groupId: string, memberId: string): Promise<GroupActionResult> {
  return ownerAction(groupId, (userId) =>
    createManageGroup().removeMember({ actorId: userId, groupId, userId: memberId }),
  );
}

/** UC1-06: owner issues a new invitation link (the old one stops working). */
export async function rotateInvitation(groupId: string): Promise<GroupActionResult> {
  return ownerAction(groupId, (userId) => createManageGroup().rotateInvitation({ actorId: userId, groupId }));
}

/** UC1-06: owner turns the invitation link off. */
export async function revokeInvitation(groupId: string): Promise<GroupActionResult> {
  return ownerAction(groupId, (userId) => createManageGroup().revokeInvitation({ actorId: userId, groupId }));
}

/** Owner: withdraw a pending invitation for one player, without disabling the group link. */
export async function cancelPendingInvitation(groupId: string, inviteeId: string): Promise<GroupActionResult> {
  const id = groupIdSchema.safeParse(groupId);
  if (!id.success || !inviteeId.trim()) return { error: "That invitation wasn't found." };
  return ownerAction(id.data, (userId) => createManageGroup().cancelPendingInvitation({ actorId: userId, groupId: id.data, inviteeId }));
}

/** UC1-06: owner archives the group (read-only afterwards). */
export async function archiveGroup(groupId: string): Promise<GroupActionResult> {
  return ownerAction(groupId, (userId) => createManageGroup().archive({ actorId: userId, groupId }));
}

/** UC1-06: a member (not the owner) leaves the group, then returns to their group list. */
export async function leaveGroup(groupId: string): Promise<GroupActionResult> {
  const id = groupIdSchema.safeParse(groupId);
  if (!id.success) return { error: "That group wasn't found." };

  const userId = await currentUserId();
  if (userId === null) return { error: "Please log in again." };

  try {
    await createManageGroup().leave({ actorId: userId, groupId: id.data });
  } catch (error) {
    return { error: leaveGroupErrorMessage(error) };
  }
  refresh(id.data);
  redirect("/groups?left=1");
}

/** UC1-06: join through an invitation link, then open the group. */
export async function joinGroup(invitationToken: string): Promise<GroupActionResult> {
  const userId = await currentUserId();
  if (userId === null) return { error: "Please log in again." };

  let groupId: string;
  try {
    const { group } = await createManageGroup().join({ userId, invitationToken });
    groupId = group.groupId;
  } catch (error) {
    return { error: groupErrorMessage(error) };
  }
  refresh(groupId);
  redirect(`/groups/${groupId}`);
}
/**
 * ADR-0022: a member invites a player, found by user ID, to one of their groups. The
 * player joins only by accepting on their Groups page.
 */
export async function invitePlayer(_previous: InvitePlayerState, formData: FormData): Promise<InvitePlayerState> {
  const parsed = invitePlayerSchema.safeParse({ handle: formData.get("handle") ?? "", groupId: formData.get("groupId") ?? "" });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the details and try again." };

  const userId = await currentUserId();
  if (userId === null) return { status: "error", message: "Please log in again." };

  try {
    const { invitee, result } = await createManageGroup().inviteByHandle({ actorId: userId, ...parsed.data });
    refresh(parsed.data.groupId);
    return {
      status: "sent",
      message: result === "INVITED"
        ? `Invitation sent. ${invitee.displayName} will see it on their Groups page.`
        : `${invitee.displayName} already has an invitation to this group.`,
    };
  } catch (error) {
    if (!(error instanceof DomainError) && !(error instanceof GroupChangedError)) console.error("UC1-06 invite failed:", error);
    return { status: "error", message: inviteErrorMessage(error) };
  }
}

/** ADR-0022: the invited player joins, then opens the group. */
export async function acceptGroupInvitation(groupId: string): Promise<GroupActionResult> {
  const id = groupIdSchema.safeParse(groupId);
  if (!id.success) return { error: "That invitation wasn't found." };

  const userId = await currentUserId();
  if (userId === null) return { error: "Please log in again." };

  try {
    await createManageGroup().acceptInvitation({ actorId: userId, groupId: id.data });
  } catch (error) {
    return { error: answerInvitationErrorMessage(error) };
  }
  refresh(id.data);
  redirect(`/groups/${id.data}`);
}

/** ADR-0022: the invited player says no; the invitation disappears from their Groups page. */
export async function declineGroupInvitation(groupId: string): Promise<GroupActionResult> {
  const id = groupIdSchema.safeParse(groupId);
  if (!id.success) return { error: "That invitation wasn't found." };

  const userId = await currentUserId();
  if (userId === null) return { error: "Please log in again." };

  try {
    await createManageGroup().declineInvitation({ actorId: userId, groupId: id.data });
  } catch (error) {
    return { error: groupErrorMessage(error) };
  }
  revalidatePath("/groups");
  return {};
}
