import { z } from "zod";
import { userHandleSchema } from "@/app/users/schemas";

/** UC1-06: a group name, e.g. "Weekend Tennis Crew". */
export const groupNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a group name")
  .max(60, "Keep the name under 60 characters");

/** A group id sent by the browser to a group action. */
export const groupIdSchema = z.string().uuid();
/** ADR-0022: who to invite (their user ID) and to which of the inviter's groups. */
export const invitePlayerSchema = z.object({
  handle: userHandleSchema,
  groupId: z.string().uuid("Choose a group to invite them to"),
});
