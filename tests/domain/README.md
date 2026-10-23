# Domain unit tests

Domain tests document the behavior of entities and value objects through their
public APIs. For new and refactored tests, follow the unit-test style in
[SC2002-Project](https://github.com/liang799/SC2002-Project), particularly
[HitPointsTest](https://github.com/liang799/SC2002-Project/blob/main/src/test/java/sc2002/turnbased/domain/HitPointsTest.java),
[CombatantTest](https://github.com/liang799/SC2002-Project/blob/main/src/test/java/sc2002/turnbased/domain/CombatantTest.java),
and [SpecialSkillTest](https://github.com/liang799/SC2002-Project/blob/main/src/test/java/sc2002/turnbased/domain/SpecialSkillTest.java).

## Structure and naming

- Use a file named after the entity or value object, with one top-level
  `describe` that names its responsibility: `Money arithmetic`, `Participant
  admission`, or `Booker administration`. Keep focused suites flat when one
  behavior label already explains their scope.
- Focused behavior files for the same entity may remain separate, such as
  Money arithmetic, Session admission, reliability history, and User related
  data. Each file still tests one entity; its suite label adds the behavior so
  the test runner shows more than a class name. Separate suites that mix
  different entities.
- Mixed suites may use one additional level of `describe` groups for related
  behaviors, such as profile changes, payout setup, account deactivation, or
  session cancellation. Use domain concerns rather than generic success/error
  buckets. Keep related getters and permission guards beside their commands,
  and failure/retry cases together.
- Avoid deeper nesting, redundant single-group wrappers, and shared setup hooks.
  Groups organize independent tests; they do not imply a workflow or execution
  order. Preserve each case's visible setup and descriptive method/condition/result
  name when moving it into a group.
- Split files when responsibilities, fixtures, dependencies, or ownership warrant
  it. Line count alone is not a reason to split a cohesive entity's tests.
- Name each test `method_WhenCondition_ExpectedResult`. Use `constructor` for
  construction and the property name for a getter. Use `test` consistently.
- Give each test one observable domain behavior. Construct its prerequisite state
  with fixtures before exercising that behavior; split cases that independently check joining,
  withdrawal, promotion, or payout completion.
- Keep multiple assertions when they describe the same outcome, such as a
  cancellation's status, refunds, and roster changes. Give reconstruction and
  independent reliability rules their own cases. Each case establishes its own
  prerequisites before exercising the behavior named by the test.
- A domain unit test may use real collaborating entities and value objects.
  Test the subject's public behavior without replacing those collaborators with
  mocks merely to reduce the number of objects in the test.
- Prefer explicitly named tests over field-driven tables so each business rule
  and its important inputs are visible without expanding a table or helper.

## Writing a scenario

Use blank lines to separate setup, the behavior being exercised, and its
assertions. Keep comments that explain a business rule, an unusual prerequisite,
or an injected failure. Routine phase labels add no information to these tests.
This follows the emphasis on focused behaviors and readable, self-contained
examples in [Google's unit-testing guidance](https://abseil.io/resources/swe-book/html/ch12.html).

Capture a meaningful returned result and compare it with explicit expectations:

```ts
test("add_WhenBothAmountsArePositive_ReturnsTheirSum", () => {
  const first = Money.fromCents(500);
  const second = Money.fromCents(700);

  const sum = first.add(second);

  expect(sum.toCents()).toBe(1200);
});
```

For a void command, execute it once and inspect the resulting public state.
A temporary variable that merely renames a simple property is unnecessary:

```ts
test("changeVisibility_WhenOwnerIsUnverified_ChangesPublicSessionToPrivate", () => {
  const visibilityChangeTime = hoursBeforeSessionStart(48);
  const bookingSession = new Session(sessionDetails({ visibility: "PUBLIC" }));
  const booker = createTestUser({
    userId: "booker",
    emailVerified: false,
  }).asBooker();

  booker.changeVisibility(bookingSession, "PRIVATE", visibilityChangeTime);

  expect(bookingSession.visibility).toBe("PRIVATE");
});
```

Permission guards check whether a command is allowed; they do not perform it.
Test those contracts separately. An unexpected exception already fails the test:

```ts
test("assertCanCancel_WhenOwnerIsUnverified_AllowsExitWithoutChangingSession", () => {
  const cancellationTime = hoursBeforeSessionStart(48);
  const bookingSession = createTestSession({ committedUserIds: ["alice"] });
  const booker = createTestUser({
    userId: "booker",
    emailVerified: false,
  }).asBooker();
  const previousState = sessionState(bookingSession);

  booker.assertCanCancel(bookingSession, cancellationTime);

  expect(sessionState(bookingSession)).toEqual(previousState);
});
```

Keep named captures when they clarify a domain result, avoid repeating a lookup,
record an earlier state or identity, or observe a value before another mutation.
Never move an observation across a mutation or execute a command again merely
to inline its result. Prefer concrete states, cents, instructions, and collection
contents to vague change checks or collection-wide booleans. Derive expected
values independently of the implementation being tested.

## Rejections, retries, and injected failures

Assert rejections directly and keep related unchanged-state checks together:

```ts
test("changeVisibility_WhenBookerIsForeign_RejectsWithoutChangingState", () => {
  const visibilityChangeTime = hoursBeforeSessionStart(48);
  const bookingSession = createTestSession();
  const previousState = sessionState(bookingSession);

  expect(() =>
    readyBooker("other").changeVisibility(
      bookingSession,
      "PRIVATE",
      visibilityChangeTime,
    ),
  ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
  expect(sessionState(bookingSession)).toEqual(previousState);
});
```

Preserve both concrete outcomes and `sessionState` comparisons where rejection
atomicity matters. Run the exception assertion in the state named by the test;
do not save a callback and invoke it after subsequent state changes.

Fault injection is test instrumentation. Explain the failure being simulated,
construct the thrown error inside the stub, and state the expected error
independently in the assertion. Restore spies in `finally`:

```ts
// Simulate Ben's cancellation failing after Alice has been processed.
const cancelBen = vi
  .spyOn(bookingSession.participantList.requireParticipation("p-ben"), "cancel")
  .mockImplementationOnce(() => {
    throw new DomainError("INVALID_STATE", "Second cancellation failed");
  });

try {
  expect(() => booker.cancel(bookingSession, cancellationTime)).toThrow(
    new DomainError("INVALID_STATE", "Second cancellation failed"),
  );
  expect(cancelBen).toHaveBeenCalledOnce();
  expect(sessionState(bookingSession)).toEqual(previousState);
} finally {
  cancelBen.mockRestore();
}
```

Each test creates fresh state and runs independently, including in shuffled
order. A focused idempotency test may repeat an operation. A retry test may use
a previous failed attempt as a prerequisite; its direct `toThrow` assertion
establishes that precondition. Keep independent assertions about the first
failure's effects in the dedicated failure case. Do not split a retry or
idempotency behavior merely because it needs multiple calls.

## Fixtures and visible inputs

Reuse small fixtures for routine construction. A test that needs a withdrawn
participant, failed payout account, or archived group should start in that state
instead of replaying the workflow that produced it. Prefer validated constructors
inside those fixtures. Keep scenario-defining amounts, dates, identities, invalid
fields, and the transition being tested visible. Preserve exported
fixture defaults because use-case and other suites consume them. Keep local
helpers below the tests; avoid setup hooks or builders that hide the scenario.

```ts
const alice = createTestUser({ userId: "alice", availableFundsCents: 500 });
const bookingSession = createTestSession({
  totalSlots: 2,
  committedUserIds: ["alice", "ben"],
  waitlistedUserIds: ["cara"],
});
```

For a partially marked roster, declare existing attendance in the fixture.
These marks are hydrated as Booker-verified at `sessionEndsAt`; unlisted
committed users remain unverified. The fixture keeps its default `OPEN` status
and does not run attendance commands:

```ts
const bookingSession = createTestSession({
  committedUserIds: ["alice", "ben"],
  attendanceByUserId: { alice: "ATTENDED" },
});

readyBooker().verifyAttendance(bookingSession, {
  marks: [{ participationId: "p-ben", attendance: "ABSENT" }],
  now: sessionEndsAt,
});

expect(bookingSession.status).toBe("AWAITING_PAYOUT");
```

`participationOverrides` replaces named roster entries in place, retaining their
order. State fixtures such as `withdrawnParticipation`, `removedParticipation`,
`cancelledParticipation`, and `leftWaitlistedParticipation` describe existing
history. Declare the financial state explicitly rather than having a fixture
calculate the withdrawal rule:

```ts
const bookingSession = createTestSession({
  committedUserIds: ["alice", "ben"],
  participationOverrides: {
    alice: withdrawnParticipation("alice", {
      withdrawnAt: hoursBeforeSessionStart(10),
      replacementMode: "DIRECT_INVITE",
      replacementInviteeId: "cara",
      holdState: "AWAITING_REPLACEMENT",
    }),
  },
});
```

Verified, withdrawn, removed, and cancelled participation fixtures default to a
500-cent platform hold committed 48 hours before start. Pass session terms for a
different share or holding account. `committedParticipation` uses the supplied
session terms; `leftWaitlistedParticipation` has queue metadata and no hold.
Refunded withdrawals default their settlement time to the withdrawal time;
specify `settledAt` for a later replacement refund. Closed committed entries
require their refund time. Fixture state must match the scenario, including
attendance metadata, queue sequence, replacement history, and hold identity.

Keep repeated calls when they establish the behavior: retries after injected
failures, idempotency, stale-source rejection, role liveness, or mutation isolation.
Do not replace an asserted earlier result with an invented fixture result. If
moving a prerequisite removes the only exercised success path of a method, give
that transition a focused test of its own.

Keep explicit wallet and transaction-history setup when that history is being
tested. Use `createTestSession` for routine state built through validated
constructors. For payout callbacks, `pendingPayoutDetails` supplies an
attendance-verified session with held shares and a pending payout;
`verifiedParticipation` supplies an attended or absent participation. These
fixtures construct state without running Booker workflows or calculating
production release/forfeiture decisions. Keep unusual withdrawal times,
verification, failures, and retry identities explicit when they explain the
scenario.

Keep actual `Participant.join` calls visible when testing admission, capacity,
queue changes, or financial instructions. Read roster facts through
`bookingSession.participantList`, using its readonly values and public queries.
Use `sessionDetails` for hydration, preserving deliberate malformed-state tests
and keeping necessary type escapes local to the invalid input. Test standalone
collection query and immutability contracts in collection suites; keep workflow
atomicity and identity checks with the role behavior. External request parsing
belongs in boundary tests.

## Time expressions

Time expressions must reveal their unit, direction, and anchor. Use the shared
session fixture's `sessionStartsAt` and `sessionEndsAt` for those exact instants,
and its named helpers for offsets:

```ts
const withdrawalTime = hoursBeforeSessionStart(10);
const acceptanceTime = hoursBeforeSessionStart(9);
const joiningTime = hoursBeforeSessionStart(48);
const prematureVerificationTime = hoursBeforeSessionEnd(1);
```

Use scenario-specific variables when a test contains multiple events or reuses
a timestamp. A single-use timestamp can stay inline when the helper states its
meaning clearly. Keep milliseconds-per-hour conversion inside the fixture, and
use positive offsets with the helper that describes the intended direction.

Name exact boundaries and their one-millisecond offsets explicitly:

```ts
const refundCutoff = hoursBeforeSessionStart(30);
const oneMillisecondBeforeRefundCutoff = new Date(refundCutoff.getTime() - 1);
const automaticVerificationDueAt = hoursAfterSessionEnd(72);
const oneMillisecondBeforeAutomaticVerification = new Date(
  automaticVerificationDueAt.getTime() - 1,
);
```

The refund boundary is measured from session start; automatic attendance
verification is measured from session end. Exactly 30 hours before session start
still requires a replacement for a refund. One millisecond earlier is inside the
full-refund window. Automatic verification is allowed exactly 72 hours after
session end and rejected one millisecond earlier.

## Examples and verification

The suite structure follows
[ADR-0005: Domain unit-test structure](../../docs/adr/0005-domain-unit-test-structure.md).
The readability convention and result snapshots are recorded in
[ADR-0018: Readable domain tests and execution evidence](../../docs/adr/0018-domain-test-input-oracle-log.md).

Examples following this standard are
[user.test.ts](./accounts/user.test.ts) and
[payout-account.test.ts](./accounts/payout-account.test.ts).

When restructuring tests, preserve distinct behaviors, error codes, immutability
checks, and unchanged-state assertions. Map the old assertions to their new
cases before removing or consolidating a test; test count alone does not prove
that coverage was retained. Fix scenarios whose setup does not match their
names. Run the affected files, the complete domain suite, a shuffled domain
run with recorded seed `2006`, then `rtk npm test`, `rtk npm run typecheck`, and
`rtk npm run lint`. Splitting scenarios may increase the test count without changing
production behavior. Report newly exposed production defects separately during
a tests-only cleanup.

## Result snapshots

The table vocabulary follows *Lecture 16: Testing Introduction*, slides 15–18.
Input means data or commands, Oracle means the expected result, and Log means
the observed result. These are reporting concepts, not mandatory code comments.

The **2026-10-24** snapshot covers **607 passing cases across 43 files**. Each
table follows its suite’s behavior headings and has a linked Name and Location,
Input, Oracle (expected result), Log
(actual outcome verified by assertions), and separate execution status.

| Area | Cases | Tables |
|---|---:|---|
| Accounts | 96 | [Account cases](./accounts/README.md) |
| Booker | 55 | [Booker cases](./accounts/booker/README.md) |
| Participant | 77 | [Participant cases](./accounts/participant/README.md) |
| Finance | 55 | [Finance cases](./finance/README.md) |
| Money | 83 | [Money cases](./finance/money/README.md) |
| Groups | 35 | [Group cases](./groups/README.md) |
| Reliability | 33 | [Reliability cases](./reliability/README.md) |
| Sessions | 89 | [Session value and pricing cases](./sessions/README.md) |
| Session lifecycle | 84 | [Session lifecycle cases](./sessions/session/README.md) |

The [execution evidence and refresh procedure](./results/README.md) retain the
JSON report, source hashes, and baseline-to-final scenario mapping. Log values
are assertion-verified observations, not captured runtime payloads. The report
is a dated snapshot and must be refreshed after relevant source changes.
