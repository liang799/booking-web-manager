import { FundHold, Money, Participation, ReliabilityScore } from "@/domain";
import { describe, expect, test } from "vitest";

const day = 86_400_000;
const asOf = new Date("2026-09-15T00:00:00Z");
const recentEnd = new Date(asOf.getTime() - day);

describe("ReliabilityScore", () => {
  test("fromHistory_WhenHistoryIsEmpty_ReturnsMaximumScore", () => {
    const history: { participation: Participation; endAt: Date }[] = [];

    const score = ReliabilityScore.fromHistory("alice", history, asOf);

    expect(score.toNumber()).toBe(100);
  });

  test("fromHistory_WhenAbsenceIsOneHalfLifeOlder_WeightsItByHalf", () => {
    const olderEnd = new Date(recentEnd.getTime() - 90 * day);
    const history = [
      { participation: attended("a"), endAt: recentEnd },
      { participation: absent("b", olderEnd), endAt: olderEnd },
    ];

    const score = ReliabilityScore.fromHistory("alice", history, asOf);

    // One attendance has twice the weight of the older absence.
    expect(score.toNumber()).toBeCloseTo(66.66666666666667, 8);
  });

  test("fromHistory_WhenLateWithdrawalIsFinalized_CountsOneNegativeOutcome", () => {
    const end = recentEnd;
    const forfeitedHold = new FundHold({
      holdId: "h",
      participationId: "p",
      holdingAccountId: "platform",
      walletId: "w",
      amount: Money.fromCents(100),
      state: "FORFEITED",
      createdAt: new Date(end.getTime() - 2 * day),
      settledAt: end,
      payoutId: "payout",
    });
    const finalizedWithdrawal = new Participation({
      participationId: "p",
      userId: "alice",
      status: "WITHDRAWN",
      attendance: "UNVERIFIED",
      committedAt: new Date(end.getTime() - 2 * day),
      withdrawnAt: new Date(end.getTime() - day),
      replacementMode: "OPEN_SLOT",
      hold: forfeitedHold,
    });
    const history = [
      { participation: attended("attended", end), endAt: end },
      { participation: finalizedWithdrawal, endAt: end },
    ];

    const score = ReliabilityScore.fromHistory("alice", history, asOf);

    expect(score.toNumber()).toBe(50);
  });

  test("fromHistory_WhenClockAdvances_PreservesRelativeWeights", () => {
    const olderEnd = new Date(recentEnd.getTime() - 90 * day);
    const history = [
      { participation: attended("a"), endAt: recentEnd },
      { participation: absent("b", olderEnd), endAt: olderEnd },
    ];
    const originalScore = ReliabilityScore.fromHistory("alice", history, asOf);

    const laterScore = ReliabilityScore.fromHistory(
      "alice",
      history,
      new Date(asOf.getTime() + 365 * day),
    );

    expect(laterScore.toNumber()).toBe(originalScore.toNumber());
    expect(laterScore.toNumber()).toBeCloseTo(66.66666666666667, 8);
  });

  test("fromHistory_WhenParticipationIsDuplicated_ThrowsRangeError", () => {
    const entry = { participation: attended("a"), endAt: recentEnd };

    expect(() =>
      ReliabilityScore.fromHistory("alice", [entry, entry], asOf),
    ).toThrow(RangeError);
  });

  test("fromHistory_WhenParticipationBelongsToAnotherUser_ThrowsRangeError", () => {
    const participation = Participation.createWaitlisted({
      participationId: "foreign",
      userId: "ben",
      waitlistedAt: recentEnd,
      queueSequence: 1,
    });

    expect(() =>
      ReliabilityScore.fromHistory(
        "alice",
        [{ participation, endAt: recentEnd }],
        asOf,
      ),
    ).toThrow(RangeError);
  });

  test("fromHistory_WhenParticipationIsUnfinished_ExcludesEntry", () => {
    const participation = Participation.createWaitlisted({
      participationId: "waiting",
      userId: "alice",
      waitlistedAt: recentEnd,
      queueSequence: 1,
    });
    const history = [{ participation, endAt: recentEnd }];

    const score = ReliabilityScore.fromHistory("alice", history, asOf);

    expect(score.toNumber()).toBe(100);
  });

  test("fromHistory_WhenSessionEndsInFuture_ExcludesEntry", () => {
    const future = new Date(asOf.getTime() + day);
    const history = [
      { participation: absent("future-end", future), endAt: future },
    ];

    const score = ReliabilityScore.fromHistory("alice", history, asOf);

    expect(score.toNumber()).toBe(100);
  });

  test("fromHistory_WhenOutcomeIsFinalizedInFuture_ExcludesEntry", () => {
    const future = new Date(asOf.getTime() + day);
    const history = [
      {
        participation: absent("future-finalization", future),
        endAt: recentEnd,
      },
    ];

    const score = ReliabilityScore.fromHistory("alice", history, asOf);

    expect(score.toNumber()).toBe(100);
  });

  test("fromHistory_WhenOutcomeIsFinalizedAtCutoff_IncludesOutcomeInImmutableScore", () => {
    const history = [{ participation: absent("at-cutoff", asOf), endAt: asOf }];

    const score = ReliabilityScore.fromHistory("alice", history, asOf);

    expect(score.toNumber()).toBe(0);
    expect(Object.isFrozen(score)).toBe(true);
  });

  test("fromHistory_WhenCalculationDateIsInvalid_ThrowsRangeError", () => {
    const invalidDate = new Date(NaN);

    expect(() => ReliabilityScore.fromHistory("alice", [], invalidDate)).toThrow(
      RangeError,
    );
  });

  test("fromHistory_WhenSessionEndDateIsInvalid_ThrowsRangeError", () => {
    const history = [{ participation: attended("a"), endAt: new Date(NaN) }];

    expect(() => ReliabilityScore.fromHistory("alice", history, asOf)).toThrow(
      RangeError,
    );
  });
});

function attended(id: string, endAt = recentEnd): Participation {
  const hold = FundHold.create({
    holdId: `h-${id}`,
    participationId: id,
    holdingAccountId: "platform",
    walletId: `w-${id}`,
    amount: Money.fromCents(100),
    createdAt: new Date(endAt.getTime() - day),
  });
  return Participation.createCommitted({
    participationId: id,
    userId: "alice",
    committedAt: new Date(endAt.getTime() - day),
    hold,
  }).verify("ATTENDED", "BOOKER", endAt);
}

function absent(id: string, endAt = recentEnd): Participation {
  const hold = FundHold.create({
    holdId: `h-${id}`,
    participationId: id,
    holdingAccountId: "platform",
    walletId: `w-${id}`,
    amount: Money.fromCents(100),
    createdAt: new Date(endAt.getTime() - day),
  });
  return Participation.createCommitted({
    participationId: id,
    userId: "alice",
    committedAt: new Date(endAt.getTime() - day),
    hold,
  }).verify("ABSENT", "AUTOMATIC", endAt);
}
