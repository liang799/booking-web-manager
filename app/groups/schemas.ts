import { z } from "zod";

/** UC1-06: a group name, e.g. "Weekend Tennis Crew". */
export const groupNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a group name")
  .max(60, "Keep the name under 60 characters");

/** A group id sent by the browser to a group action. */
export const groupIdSchema = z.string().uuid();