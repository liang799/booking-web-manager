# Domain unit tests

Domain tests document the behavior of entities and value objects through their
public APIs. For new and refactored tests, follow the unit-test style in
[SC2002-Project](https://github.com/liang799/SC2002-Project), particularly
[HitPointsTest](https://github.com/liang799/SC2002-Project/blob/main/src/test/java/sc2002/turnbased/domain/HitPointsTest.java),
[CombatantTest](https://github.com/liang799/SC2002-Project/blob/main/src/test/java/sc2002/turnbased/domain/CombatantTest.java),
and [SpecialSkillTest](https://github.com/liang799/SC2002-Project/blob/main/src/test/java/sc2002/turnbased/domain/SpecialSkillTest.java).

## Structure and naming

- Use a file named after the entity or value object, with one top-level
  `describe`. Keep smaller suites flat, with tests ordered by method.
- Focused behavior files for the same entity may remain separate, such as
  Money arithmetic, Session admission, reliability history, and User related
  data. Each file still tests one entity and names its top-level `describe`
  after that entity. Separate suites that mix different entities.
- Larger entities may use one additional level of `describe` groups for related
  behaviors, such as construction, profile changes, payout setup, and
  deactivation. Order tests by method within each group, include related getters,
  and avoid deeper nesting or shared setup hooks.
- Split files when responsibilities, fixtures, dependencies, or ownership warrant
  it. Line count alone is not a reason to split a cohesive entity's tests.
- Name each test `method_WhenCondition_ExpectedResult`. Use `constructor` for
  construction and the property name for a getter. Use `test` consistently.
- Give each test one observable domain behavior. Arrange prerequisite transitions
  before exercising that behavior; split cases that independently check joining,
  withdrawal, promotion, or payout completion.
- A domain unit test may use real collaborating entities and value objects.
  Test the subject's public behavior without replacing those collaborators with
  mocks merely to reduce the number of objects in the test.
- Prefer explicitly named tests over field-driven tables so each business rule
  and its important inputs are visible without expanding a table or helper.

## Writing a scenario

Use the five ingredients from *Lecture 16: Testing Introduction*, slides 15–18:
the test title is its **Name**, its file path is its **Location**, **Input** is
the data or commands, **Log** is the actual output, and **Oracle** is the expected
output. The lecture's code example captures a result before comparing it with
the expected value in an assertion.

Use `// Input`, `// Log`, and `// Oracle` to identify these ingredients:

- **Input:** declare the subject's starting state and the data or commands it receives.
- **Log:** capture an actual return value or read the resulting public state into
  a named variable. A bare call to a void method is a command, not an output.
- **Oracle:** compare that observation with concrete expected values directly
  in assertions. Derive expectations from the business rule, independently of
  the implementation being tested.

These labels describe what the code represents, rather than renaming
Arrange/Act/Assert phases. For a method that returns a value, execution and
observation can share the assignment:

```ts
test("add_WhenBothAmountsArePositive_ReturnsTheirSum", () => {
  // Input
  const first = Money.fromCents(500);
  const second = Money.fromCents(700);

  // Log
  const result = first.add(second);

  // Oracle
  expect(result.toCents()).toBe(1200);
});
```

For a void method, group the command and its immediately captured result under
`// Log change result`. This keeps the change beside the observation, as
SC2002's Combatant examples capture hit points and attack values after commands:

```ts
test("changeVisibility_WhenOwnerIsUnverified_ChangesPublicSessionToPrivate", () => {
  // Input
  const visibilityChangeTime = hoursBeforeSessionStart(48);
  const bookingSession = new Session(sessionDetails({ visibility: "PUBLIC" }));
  const booker = createTestUser({
    userId: "booker",
    emailVerified: false,
  }).asBooker();

  // Log change result
  booker.changeVisibility(bookingSession, "PRIVATE", visibilityChangeTime);
  const visibility = bookingSession.visibility;

  // Oracle
  expect(visibility).toBe("PRIVATE");
});
```

Test instrumentation, such as spies and injected failures, is separate from
domain input. Introduce it with a brief comment explaining the failure being
simulated. Construct a simulated thrown error inside the stub and state the
expected code or message directly in the exception assertion. Avoid a shared
`failure` object serving as both the stub's output and its own expected result.
Restore spies in `finally`. Keep before/after `sessionState` comparisons for
rejection atomicity; the captured before-state is the baseline the Oracle must
preserve, and the after-state is the Log.

Keep each test independent: use fresh objects, with all prerequisite state
established inside that test or a small construction fixture. A test must work
on its own or in a different execution order. A focused idempotency test may
repeat the same operation in Log. For a retry test, the previous attempt
establishes Input and Log performs the retry. If a scenario separately verifies rejection atomicity and
successful recovery, preserve those checks in separate tests.
When that starting state requires an earlier rejection, a direct `toThrow`
assertion in Input may establish the precondition; assertions about the
rejection's effects belong in its dedicated failure test.

Name observed results after what they represent, then assert concrete values.

```ts
test("completeSetup_WhenSetupIsPending_ReturnsCompletedCopy", () => {
  // Input
  const pendingAccount = PayoutAccount.create({
    payoutAccountId: "account",
    userId: "owner",
    providerAccountReference: "provider",
  });

  // Log
  const completedAccount = pendingAccount.completeSetup("bank");

  // Oracle
  expect(pendingAccount.setupStatus).toBe("PENDING");
  expect(completedAccount).not.toBe(pendingAccount);
  expect(completedAccount.setupStatus).toBe("COMPLETE");
  expect(completedAccount.bankAccountReference).toBe("bank");
});
```

Use fresh objects for independent scenarios. Assert rejections directly with
`expect(() => action()).toThrow(expect.objectContaining({ code: "..." }))`.
Label this combined section `// Log & Oracle`: the matcher executes the command,
observes the thrown error, and compares it with the expected error. Keep this
direct assertion instead of adding an error-capture helper.
Run the assertion while the subject is in the state named by the test; do not
save an action callback and invoke it after subsequent state changes. When
atomicity matters, also assert that rejection leaves state unchanged.

Reuse fixtures for routine defaults, but keep scenario-specific inputs and
transitions in the test. Put small local helper functions below the tests.
Use descriptive names for people and pass relevant funds directly to the user
fixture, keeping routine wallet construction inside the fixture:

```ts
const alice = createTestUser({ userId: "alice", availableFundsCents: 500 });
```

Keep explicit wallet and transaction-history setup when the history itself is
part of the behavior under test, such as balance derivation or hydration.

Use `createTestSession` for routine starting state; it builds that state through
validated constructors:

```ts
const bookingSession = createTestSession({
  totalSlots: 2,
  committedUserIds: ["alice", "ben"],
  waitlistedUserIds: ["cara"],
});
```

For payout callback and reconstruction tests, use `pendingPayoutDetails` to
declare an attendance-verified session with held shares and a pending payout.
Use `verifiedParticipation` for individual attended or absent participation
records. These fixtures construct valid state directly; they do not run Booker
workflows or calculate which shares production code should release or forfeit.
Keep unusual attendance, withdrawal times, invalid fields, and retry identities
explicit in the scenario instead of adding a general-purpose state builder.

```ts
test("completeSettlement_WhenPayoutIsPending_ReleasesHeldShares", () => {
  // Input
  const session = new Session(pendingPayoutDetails(["alice", "ben"]));

  // Log
  const completion = session.completeSettlement("out", sessionEndsAt);

  // Oracle
  expect(session.status).toBe("SETTLED");
  expect(session.pendingSettlement).toBeUndefined();
  expect(
    session.participantList.participations.map((p) => p.hold?.state),
  ).toEqual(["RELEASED", "RELEASED"]);
  expect(
    completion.instructions.map(({ kind, amount }) => [kind, amount.toCents()]),
  ).toEqual([["RELEASE", 500], ["RELEASE", 500]]);
});
```

Keep actual `Participant.join` calls visible when testing admission, capacity,
queue changes, or financial instructions, and keep timing-dependent transitions
explicit. Use `sessionDetails` for special hydration scenarios.

Read roster facts through `bookingSession.participantList`: use its readonly
`participations`, `nextQueueSequence`, and `committedCount` values or its lookup
queries. For example, `bookingSession.participantList.nextWaitlisted()?.userId`
identifies the next waiter. Session hydration still takes arrays through
`sessionDetails`.

```ts
const aliceParticipation = bookingSession.participantList.requireParticipation("p-alice");
expect(aliceParticipation.status).toBe("COMMITTED");
```

Test collection query/immutability behavior separately from role workflows;
failed Session recording must preserve both roster and queue state.

Avoid generic error-capture helpers and setup hooks that hide the scenario.
Domain tests exercise business constraints through declared input types.
Constructor-hydration cases also preserve deliberate malformed-state checks,
including missing required related data; keep their necessary type escapes
local to the invalid input. External request parsing belongs in boundary tests.

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
The lecture terminology and result snapshots are recorded in
[ADR-0018: Domain test inputs, oracles, and logs](../../docs/adr/0018-domain-test-input-oracle-log.md).

Examples following this standard are
[user.test.ts](./accounts/user.test.ts) and
[payout-account.test.ts](./accounts/payout-account.test.ts).

When restructuring tests, preserve distinct behaviors, error codes, immutability
checks, and unchanged-state assertions. Map the old assertions to their new
cases before removing or consolidating a test; test count alone does not prove
that coverage was retained. Fix scenarios whose setup does not match their
names. Run the affected files, then `npm test`, `npm run typecheck`, and
`npm run lint`. Splitting scenarios may increase the test count without changing
production behavior. Report newly exposed production defects separately during
a tests-only cleanup.

## Result snapshots

The **2026-10-23** snapshot covers **600 passing cases across 43 files**. Each
table has a linked Name and Location, Input, Oracle (expected result), Log
(actual outcome verified by assertions), and separate execution status.

| Area | Cases | Tables |
|---|---:|---|
| Accounts | 94 | [Account cases](./accounts/README.md) |
| Booker | 54 | [Booker cases](./accounts/booker/README.md) |
| Participant | 77 | [Participant cases](./accounts/participant/README.md) |
| Finance | 55 | [Finance cases](./finance/README.md) |
| Money | 83 | [Money cases](./finance/money/README.md) |
| Groups | 34 | [Group cases](./groups/README.md) |
| Reliability | 33 | [Reliability cases](./reliability/README.md) |
| Sessions | 88 | [Session value and pricing cases](./sessions/README.md) |
| Session lifecycle | 82 | [Session lifecycle cases](./sessions/session/README.md) |

The [execution evidence and refresh procedure](./results/README.md) retain the
JSON report, source hashes, and baseline-to-final scenario mapping. Log values
are assertion-verified observations, not captured runtime payloads. The report
is a dated snapshot and must be refreshed after relevant source changes.
