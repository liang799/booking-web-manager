import {
  DomainError,
  FundHold,
  type FundHoldDetails,
  Money,
  Participation,
  type ParticipationDetails,
} from "@/domain";
import { describe, expect, test } from "vitest";

const createdAt = new Date("2026-10-01");
const settledAt = new Date("2026-10-03");

describe("Participation", () => {
  describe("Construction and isolation", () => {
    test("constructor_WhenDatesAreMutated_PreservesTimestampAndImmutableHold", () => {
      // Input
      const input = participationDetails();

      // Log
      const participation = new Participation(input);
      input.committedAt?.setTime(0);
      participation.committedAt?.setTime(0);

      // Oracle
      expect(participation.committedAt).toEqual(createdAt);
      expect(participation.hold).toBe(input.hold);
    });

    test("constructor_WhenHoldBelongsToAnotherParticipation_ThrowsDomainError", () => {
      // Input
      const details = participationDetails({
        hold: new FundHold(holdDetails({ participationId: "foreign" })),
      });

      // Log & Oracle
      expect(() => new Participation(details)).toThrow(DomainError);
    });

    test("constructor_WhenCommittedHoldIsMissing_ThrowsDomainError", () => {
      // Input
      const details = participationDetails({ hold: undefined });

      // Log & Oracle
      expect(() => new Participation(details)).toThrow(DomainError);
    });

    test("constructor_WhenCommitmentDateIsMissing_ThrowsDomainError", () => {
      // Input
      const details = participationDetails({ committedAt: undefined });

      // Log & Oracle
      expect(() => new Participation(details)).toThrow(DomainError);
    });

    test("constructor_WhenAttendanceHasNoVerification_ThrowsDomainError", () => {
      // Input
      const details = participationDetails({ attendance: "ATTENDED" });

      // Log & Oracle
      expect(() => new Participation(details)).toThrow(DomainError);
    });

    test("constructor_WhenUnverifiedAttendanceHasMetadata_ThrowsDomainError", () => {
      // Input
      const details = participationDetails({
        verifiedAt: settledAt,
        verificationMethod: "BOOKER",
      });

      // Log & Oracle
      expect(() => new Participation(details)).toThrow(DomainError);
    });

    test("constructor_WhenWaitlistMetadataIsMissing_ThrowsDomainError", () => {
      // Input
      const details = participationDetails({
        status: "WAITLISTED",
        hold: undefined,
      });

      // Log & Oracle
      expect(() => new Participation(details)).toThrow(DomainError);
    });

    test("constructor_WhenWaitlistedParticipationHasHold_ThrowsDomainError", () => {
      // Input
      const details = participationDetails({
        status: "WAITLISTED",
        waitlistedAt: createdAt,
        queueSequence: 1,
      });

      // Log & Oracle
      expect(() => new Participation(details)).toThrow(DomainError);
    });

    test("constructor_WhenWithdrawnParticipationHasHeldFunds_ThrowsDomainError", () => {
      // Input
      const details = participationDetails({
        status: "WITHDRAWN",
        withdrawnAt: settledAt,
      });

      // Log & Oracle
      expect(() => new Participation(details)).toThrow(DomainError);
    });

    test("constructor_WhenCancelledParticipationHasHeldFunds_ThrowsDomainError", () => {
      // Input
      const details = participationDetails({ status: "CANCELLED" });

      // Log & Oracle
      expect(() => new Participation(details)).toThrow(DomainError);
    });

    test("constructor_WhenRemovedParticipationHasHold_ThrowsDomainError", () => {
      // Input
      const details = participationDetails({ status: "REMOVED" });

      // Log & Oracle
      expect(() => new Participation(details)).toThrow(DomainError);
    });

    test("constructor_WhenQueueSequenceIsZero_ThrowsDomainError", () => {
      // Input
      const details = participationDetails({ queueSequence: 0 });

      // Log & Oracle
      expect(() => new Participation(details)).toThrow(DomainError);
    });

    test("constructor_WhenParticipationReplacesItself_ThrowsDomainError", () => {
      // Input
      const details = participationDetails({
        replacesParticipationId: "participation",
      });

      // Log & Oracle
      expect(() => new Participation(details)).toThrow(DomainError);
    });

    test("constructor_WhenCommittedParticipationHasReplacementInvitation_ThrowsDomainError", () => {
      // Input
      const details = participationDetails({
        replacementMode: "DIRECT_INVITE",
        replacementInviteeId: "ben",
      });

      // Log & Oracle
      expect(() => new Participation(details)).toThrow(DomainError);
    });

    test("constructor_WhenInvitationHasNoNamedInvitee_RejectsInvitation", () => {
      // Input
      const details = participationDetails({
        status: "WITHDRAWN",
        withdrawnAt: settledAt,
        hold: new FundHold(holdDetails()).awaitReplacement(),
        replacementMode: "DIRECT_INVITE",
      });

      // Log & Oracle
      expect(() => new Participation(details)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenInvitationHasBlankNamedInvitee_RejectsInvitation", () => {
      // Input
      const details = participationDetails({
        status: "WITHDRAWN",
        withdrawnAt: settledAt,
        hold: new FundHold(holdDetails()).awaitReplacement(),
        replacementMode: "DIRECT_INVITE",
        replacementInviteeId: " ",
      });

      // Log & Oracle
      expect(() => new Participation(details)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenInvitationNamesWithdrawingParticipant_RejectsSelfReplacement", () => {
      // Input
      const details = participationDetails({
        status: "WITHDRAWN",
        withdrawnAt: settledAt,
        hold: new FundHold(holdDetails()).awaitReplacement(),
        replacementMode: "DIRECT_INVITE",
        replacementInviteeId: "user",
      });

      // Log & Oracle
      expect(() => new Participation(details)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenOpenPlaceHasNamedInvitee_RejectsReservationMetadata", () => {
      // Input
      const details = participationDetails({
        status: "WITHDRAWN",
        withdrawnAt: settledAt,
        hold: new FundHold(holdDetails()).awaitReplacement(),
        replacementMode: "OPEN_SLOT",
        replacementInviteeId: "ben",
      });

      // Log & Oracle
      expect(() => new Participation(details)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenInviteeHasNoReplacementMode_RejectsReservationMetadata", () => {
      // Input
      const details = participationDetails({
        status: "WITHDRAWN",
        withdrawnAt: settledAt,
        hold: new FundHold(holdDetails()).awaitReplacement(),
        replacementInviteeId: "ben",
      });

      // Log & Oracle
      expect(() => new Participation(details)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });
  });

  describe("Commitment and replacement", () => {
    test("commit_WhenPromotedAsReplacement_PreservesQueueEntryAndReplacementIdentity", () => {
      // Input
      const queued = Participation.createWaitlisted({
        participationId: "participation",
        userId: "user",
        waitlistedAt: createdAt,
        queueSequence: 1,
      });

      // Log
      const committed = queued.commit(
        new FundHold(holdDetails()),
        createdAt,
        "previous",
      );

      const queuedStatus = queued.status;
      const queuedHold = queued.hold;

      // Oracle
      expect(committed.replacesParticipationId).toBe("previous");
      expect(queuedStatus).toBe("WAITLISTED");
      expect(queuedHold).toBeUndefined();
    });

    test("withdraw_WhenEarlyWithdrawalInvitesOneNamedPerson_PreservesInvitationWithRefund", () => {
      // Input
      const committed = new Participation(participationDetails());

      // Log
      const withdrawn = committed.withdraw(
        committed.hold!.refund(settledAt),
        settledAt,
        "DIRECT_INVITE",
        "ben",
      );

      const withdrawnHoldState = withdrawn.hold?.state;
      const withdrawnReplacementMode = withdrawn.replacementMode;
      const withdrawnInviteeId = withdrawn.replacementInviteeId;
      const originalStatus = committed.status;
      const originalInviteeId = committed.replacementInviteeId;

      // Oracle
      expect(withdrawn.status).toBe("WITHDRAWN");
      expect(withdrawnHoldState).toBe("REFUNDED");
      expect(withdrawnReplacementMode).toBe("DIRECT_INVITE");
      expect(withdrawnInviteeId).toBe("ben");
      expect(originalStatus).toBe("COMMITTED");
      expect(originalInviteeId).toBeUndefined();
    });

    test("withdraw_WhenLateWithdrawalInvitesOneNamedPerson_PreservesInvitationWhileAwaitingReplacement", () => {
      // Input
      const committed = new Participation(participationDetails());

      // Log
      const withdrawn = committed.withdraw(
        committed.hold!.awaitReplacement(),
        settledAt,
        "DIRECT_INVITE",
        "ben",
      );

      const withdrawnHoldState = withdrawn.hold?.state;
      const withdrawnInviteeId = withdrawn.replacementInviteeId;
      const originalHoldState = committed.hold?.state;

      // Oracle
      expect(withdrawn.status).toBe("WITHDRAWN");
      expect(withdrawnHoldState).toBe("AWAITING_REPLACEMENT");
      expect(withdrawnInviteeId).toBe("ben");
      expect(originalHoldState).toBe("HELD");
    });

    test("withdraw_WhenPersonalInvitationAlreadyChosen_RejectsSwitchToOpenPlace", () => {
      // Input
      const committed = new Participation(participationDetails());
      const withdrawn = committed.withdraw(
        committed.hold!.refund(settledAt),
        settledAt,
        "DIRECT_INVITE",
        "ben",
      );

      // Log & Oracle
      expect(() =>
        withdrawn.withdraw(withdrawn.hold!, settledAt, "OPEN_SLOT"),
      ).toThrow(expect.objectContaining({ code: "INVALID_STATE" }));
      expect(withdrawn.replacementMode).toBe("DIRECT_INVITE");
      expect(withdrawn.replacementInviteeId).toBe("ben");
      expect(withdrawn.hold?.state).toBe("REFUNDED");
    });

    test("withdraw_WhenOpenPlaceAlreadyChosen_RejectsSwitchToPersonalInvitation", () => {
      // Input
      const committed = new Participation(participationDetails());
      const withdrawn = committed.withdraw(
        committed.hold!.awaitReplacement(),
        settledAt,
        "OPEN_SLOT",
      );

      // Log & Oracle
      expect(() =>
        withdrawn.withdraw(withdrawn.hold!, settledAt, "DIRECT_INVITE", "ben"),
      ).toThrow(expect.objectContaining({ code: "INVALID_STATE" }));
      expect(withdrawn.replacementMode).toBe("OPEN_SLOT");
      expect(withdrawn.replacementInviteeId).toBeUndefined();
      expect(withdrawn.hold?.state).toBe("AWAITING_REPLACEMENT");
    });

    test("cancel_WhenWithdrawalHasPersonalInvitation_ClearsReservationMetadata", () => {
      // Input
      const committed = new Participation(participationDetails());
      const withdrawn = committed.withdraw(
        committed.hold!.awaitReplacement(),
        createdAt,
        "DIRECT_INVITE",
        "ben",
      );

      // Log
      const cancelled = withdrawn.cancel(withdrawn.hold!.refund(settledAt));

      const withdrawnInviteeId = withdrawn.replacementInviteeId;

      // Oracle
      expect(cancelled.status).toBe("CANCELLED");
      expect(cancelled.replacementMode).toBeUndefined();
      expect(cancelled.replacementInviteeId).toBeUndefined();
      expect(withdrawnInviteeId).toBe("ben");
    });

    test("refundReplacement_WhenReplacementIsFound_ReturnsNewChild", () => {
      // Input
      const committed = new Participation(participationDetails());
      const withdrawn = committed.withdraw(
        committed.hold!.awaitReplacement(),
        createdAt,
        "DIRECT_INVITE",
        "ben",
      );

      // Log
      const finalized = withdrawn.refundReplacement(settledAt);

      const originalStatus = committed.status;
      const originalHoldState = committed.hold?.state;
      const withdrawnHoldState = withdrawn.hold?.state;

      // Oracle
      expect(originalStatus).toBe("COMMITTED");
      expect(originalHoldState).toBe("HELD");
      expect(withdrawnHoldState).toBe("AWAITING_REPLACEMENT");
      expect(finalized.hold?.state).toBe("REFUNDED");
      expect(finalized.replacementInviteeId).toBe("ben");
    });
  });

  describe("Settlement", () => {
    test("expireReplacement_WhenReplacementIsStillAwaited_ReturnsForfeitureDueCopy", () => {
      // Input
      const withdrawn = new Participation(
        participationDetails({
          status: "WITHDRAWN",
          withdrawnAt: createdAt,
          hold: new FundHold(holdDetails({ state: "AWAITING_REPLACEMENT" })),
          replacementMode: "DIRECT_INVITE",
          replacementInviteeId: "ben",
        }),
      );

      // Log
      const expired = withdrawn.expireReplacement(settledAt);

      const withdrawnHoldState = withdrawn.hold?.state;

      // Oracle
      expect(expired).not.toBe(withdrawn);
      expect(expired.hold?.state).toBe("FORFEITURE_DUE");
      expect(expired.replacementInviteeId).toBe("ben");
      expect(withdrawnHoldState).toBe("AWAITING_REPLACEMENT");
    });

    test("settleHold_WhenReplacementForfeitureIsDue_ReturnsForfeitedCopy", () => {
      // Input
      const withdrawn = new Participation(
        participationDetails({
          status: "WITHDRAWN",
          withdrawnAt: createdAt,
          hold: new FundHold(holdDetails({ state: "FORFEITURE_DUE" })),
        }),
      );

      // Log
      const finalized = withdrawn.settleHold("FORFEIT", "payout", settledAt);

      const withdrawnHoldState = withdrawn.hold?.state;

      // Oracle
      expect(finalized).not.toBe(withdrawn);
      expect(withdrawnHoldState).toBe("FORFEITURE_DUE");
      expect(finalized.hold?.state).toBe("FORFEITED");
      expect(finalized.hold?.payoutId).toBe("payout");
    });

    test("reliabilityOutcome_WhenReplacementForfeitureIsSettled_ReturnsZero", () => {
      // Input
      const withdrawn = new Participation(
        participationDetails({
          status: "WITHDRAWN",
          withdrawnAt: createdAt,
          hold: new FundHold(holdDetails({ state: "FORFEITURE_DUE" })),
        }),
      );
      const finalized = withdrawn.settleHold("FORFEIT", "payout", settledAt);

      // Log
      const reliabilityValue = finalized.reliabilityOutcome(settledAt)?.value;

      // Oracle
      expect(reliabilityValue).toBe(0);
    });

    test("settleHold_WhenAttendanceIsUnverified_RejectsRelease", () => {
      // Input
      const committed = new Participation(participationDetails());

      // Log & Oracle
      expect(() =>
        committed.settleHold("RELEASE", "payout", settledAt),
      ).toThrow(DomainError);
    });

    test("settleHold_WhenAttendanceIsVerified_ReturnsReleasedCopy", () => {
      // Input
      const committed = new Participation(participationDetails());
      const attended = committed.verify("ATTENDED", "BOOKER", settledAt);

      // Log
      const settled = attended.settleHold("RELEASE", "payout", settledAt);

      const verifiedHoldState = attended.hold?.state;

      // Oracle
      expect(settled.hold?.state).toBe("RELEASED");
      expect(verifiedHoldState).toBe("HELD");
    });

    test("settleHold_WhenParticipantAttended_RejectsForfeiture", () => {
      // Input
      const committed = new Participation(participationDetails());
      const attended = committed.verify("ATTENDED", "BOOKER", settledAt);

      // Log & Oracle
      expect(() => attended.settleHold("FORFEIT", "payout", settledAt)).toThrow(
        DomainError,
      );
    });
  });
});

function holdDetails(
  overrides: Partial<FundHoldDetails> = {},
): FundHoldDetails {
  return {
    holdId: "hold",
    participationId: "participation",
    holdingAccountId: "platform",
    walletId: "wallet",
    amount: Money.fromCents(500),
    state: "HELD",
    createdAt: new Date(createdAt),
    ...overrides,
  };
}

function participationDetails(
  overrides: Partial<ParticipationDetails> = {},
): ParticipationDetails {
  return {
    participationId: "participation",
    userId: "user",
    status: "COMMITTED",
    attendance: "UNVERIFIED",
    committedAt: new Date(createdAt),
    hold: new FundHold(holdDetails()),
    ...overrides,
  };
}
