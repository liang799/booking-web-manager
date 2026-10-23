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

The maintained convention and examples live in the
[domain testing guide](../../tests/domain/README.md). Adjacent README tables
document one row per case with input, expected outcome, assertion-verified
actual outcome, and a separate status. These are dated snapshots of an executed
suite, tied to a JSON execution report and tested-source digest. They describe
only observations established by the assertions; Vitest's standard JSON report
does not capture successful return values. Refresh the tables after relevant
source changes. This intentionally keeps reporting metadata out of test bodies
and adds no custom matcher, scenario runner, or production API.
