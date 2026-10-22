import { DomainError } from "@/domain";
import { GroupChangedError } from "@/use-cases/groups/manage-group";

/** Turns a rule the domain refused into a sentence a player understands. */
export function groupErrorMessage(error: unknown): string {
  if (error instanceof GroupChangedError) return error.message;
  if (!(error instanceof DomainError)) return "Something went wrong. Please try again.";
  switch (error.code) {
    case "INACTIVE_ACCOUNT":
      return "This action is no longer available because an account involved was deactivated.";
    case "UNAUTHORIZED":
      return "Only the group owner can do that.";
    case "OWNER_REMOVAL":
      return "The group owner can't be removed.";
    case "INVALID_INVITATION":
      return "This invitation link is invalid or has been turned off. Ask the group owner for a new one.";
    case "INVALID_STATE":
      return "This group is archived, so it can't be changed.";
    case "ACTIVE_OBLIGATIONS":
      return "This group still has sessions that aren't settled, so it can't be archived yet.";
    case "NOT_FOUND":
      return "That group or member wasn't found.";
    default:
      return "Please check the details and try again.";
  }
}

/** Leaving refuses the owner with the same rule that stops them being removed; say what to do instead. */
export function leaveGroupErrorMessage(error: unknown): string {
  if (error instanceof DomainError && error.code === "OWNER_REMOVAL") {
    return "As the owner, you can't leave this group. Archive it instead.";
  }
  if (error instanceof DomainError && error.code === "NOT_FOUND") return "You're no longer a member of this group.";
  return groupErrorMessage(error);
}
