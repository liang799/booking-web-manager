import { copyDate } from "../shared/date";
import { DomainError } from "../shared/errors";
import type { UUID } from "../shared/types";

export interface GroupInvitationDetails {
  readonly inviteeId: UUID;
  readonly invitedBy: UUID;
  readonly invitedAt: Date;
}

/**
 * Immutable child entity of the RegularGroup aggregate root: a player invited by
 * user ID who has not accepted or declined yet (ADR-0022). Invitations are sent,
 * accepted and declined through RegularGroup commands, which enforce who may
 * invite and that a member is never also invited.
 */
export class GroupInvitation {
  readonly #inviteeId: UUID;
  readonly #invitedBy: UUID;
  readonly #invitedAt: Date;

  constructor(details: GroupInvitationDetails) {
    DomainError.require(
      details.inviteeId.trim() !== "",
      "INVALID_INPUT",
      "An invitation needs an invited user",
    );
    DomainError.require(
      details.invitedBy.trim() !== "",
      "INVALID_INPUT",
      "An invitation needs the member who sent it",
    );
    DomainError.require(
      details.inviteeId !== details.invitedBy,
      "INVALID_INPUT",
      "A player cannot invite themselves",
    );
    DomainError.require(
      Number.isFinite(details.invitedAt.getTime()),
      "INVALID_INPUT",
      "invitedAt must be a valid Date",
    );

    this.#inviteeId = details.inviteeId;
    this.#invitedBy = details.invitedBy;
    this.#invitedAt = copyDate(details.invitedAt, "invitedAt");
  }

  get inviteeId(): UUID {
    return this.#inviteeId;
  }
  get invitedBy(): UUID {
    return this.#invitedBy;
  }
  get invitedAt(): Date {
    return copyDate(this.#invitedAt, "invitedAt");
  }
}
