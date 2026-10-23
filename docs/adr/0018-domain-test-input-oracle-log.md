# ADR-0018: Domain test inputs, oracles, and logs

- Status: Accepted
- Date: 2026-10-23
- Supersedes: the Arrange/Act/Assert comment requirement in
  [ADR-0005](./0005-domain-unit-test-structure.md). Its suite organization,
  public-behavior testing, and coverage-preservation decisions remain accepted.

Domain tests retain the readable scenarios of SC2002's HitPointsTest,
CombatantTest, and SpecialSkillTest while using the terminology taught in
Lecture 16: Testing Introduction, slides 15–18. Each test has a distinct name
and source location. Its Input declares the starting state and command data;
Log captures the actual result; Oracle supplies the expected value directly in
an assertion. Direct exception assertions combine Log and Oracle because the
matcher executes the command and checks its thrown error. Independent cases
use fresh state and remain executable without earlier tests.

Input, Log, and Oracle identify test ingredients, not renamed execution phases.
Across every domain suite, group the tested action and its captured result in
the same Log block. For a void command, execute it immediately before reading
the resulting public state into a named variable under `// Log` or
`// Log change result`. Capture a value-returning command directly in Log.
Oracle compares the captured result with the expected value. Input contains
starting state, command data, and prerequisite transitions.
Unchanged-state checks after a rejection stay beside the exception assertion
under its existing `// Log & Oracle` comment. They compare state directly,
without starting another Log/Oracle pair or adding state-only temporaries.
Fault-injection stubs and spy cleanup are test instrumentation, explained
separately from domain input. Simulated errors are constructed inside stubs;
their expected codes or messages appear directly in the Oracle.

The maintained convention and examples live in the
[domain testing guide](../../tests/domain/README.md). Adjacent README tables
document one row per case with input, expected outcome, assertion-verified
actual outcome, and a separate status. These are dated snapshots of an executed
suite, tied to a JSON execution report and tested-source digest. They describe
only observations established by the assertions; Vitest's standard JSON report
does not capture successful return values. Refresh the tables after relevant
source changes. This intentionally keeps reporting metadata out of test bodies
and adds no custom matcher, scenario runner, or production API.
