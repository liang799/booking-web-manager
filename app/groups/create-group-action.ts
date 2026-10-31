"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createManageGroup } from "@/use-case-config/groups";
import { userHandleSchema } from "@/app/users/schemas";
import { groupNameSchema } from "./schemas";
import { groupErrorMessage, inviteErrorMessage } from "./messages";

export type CreateGroupState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "created"; readonly groupId: string; readonly failedInvites: readonly { readonly handle: string; readonly message: string }[] };

/** A queued player receives an invitation, never automatic membership. */
export async function createGroupWithPlayers(_previous: CreateGroupState, formData: FormData): Promise<CreateGroupState> {
  const parsed = z.object({
    name: groupNameSchema,
    players: z.array(userHandleSchema).max(20, "Invite up to 20 players when creating a group."),
  }).safeParse({ name: formData.get("name") ?? "", players: formData.getAll("players") });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the group details." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user === null) return { status: "error", message: "Please log in again." };

  const manageGroup = createManageGroup();
  let groupId: string;
  try {
    groupId = (await manageGroup.create({ ownerId: user.id, name: parsed.data.name })).groupId;
  } catch (error) {
    return { status: "error", message: groupErrorMessage(error) };
  }

  // Creation has committed. Return its identity even if a later invitation fails,
  // so the browser never offers to create this group a second time.
  const failedInvites: { handle: string; message: string }[] = [];
  for (const handle of new Set(parsed.data.players)) {
    try {
      await manageGroup.inviteByHandle({ actorId: user.id, groupId, handle });
    } catch (error) {
      failedInvites.push({ handle, message: inviteErrorMessage(error) });
    }
  }
  revalidatePath("/groups");
  return { status: "created", groupId, failedInvites };
}
