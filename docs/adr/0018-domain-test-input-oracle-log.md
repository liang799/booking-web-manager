# ADR-0018: Readable domain tests and execution evidence

- Status: Accepted
- Date: 2026-10-23
- Table layout superseded by
  [ADR-0019](./0019-domain-result-table-layout.md). Test readability and
  assertion-verified evidence remain accepted.
- Supersedes: the Arrange/Act/Assert comment requirement in
  [ADR-0005](./0005-domain-unit-test-structure.md). Its suite organization,
  public-behavior testing, and coverage-preservation decisions remain accepted.

Domain tests follow the readable scenarios of SC2002's HitPointsTest,
CombatantTest, and SpecialSkillTest: visible inputs, a clear action, and concrete
expectations. Blank lines separate setup, execution, and assertions. Comments
explain business rules, unusual prerequisites, or injected failures. Mandatory
phase labels and property-only result variables obscured simple scenarios, so
this convention preserves useful observations without requiring that ceremony.

Each test checks one coherent behavior, with multiple related assertions when
needed. Keep meaningful returned results, before-state and identity captures,
and observations whose timing matters. Void commands can be followed by direct
public-state assertions. Keep rejection and unchanged-state assertions together.
Fresh fixtures and explicit prerequisites make every case independent; retries
and idempotency may legitimately require multiple calls.
Fixtures construct prerequisite state through validated constructors instead
of replaying unrelated workflows. Keep the transition under test visible, and
give a former setup-only success path its own focused case when needed to
preserve coverage.

Suite labels name domain responsibilities, such as Money arithmetic or
Participant admission. Focused suites remain flat; mixed suites use at most one
level of behavior groups. Guards stay beside their commands and failure/retry
cases stay together. Grouping changes labels and navigation, without shared
setup hooks, hidden prerequisites, or dependencies on execution order.

Tests target supported contracts rather than every language-visible method.
Actor commands, application-used permission guards, validated hydration, and
value operations are public boundaries. Session recording invariants remain
directly tested under the collaboration contract in ADR-0009; internal price
resolution is exercised through Session construction. This applies
[Google's public-API and state-testing guidance](https://abseil.io/resources/swe-book/html/ch12.html)
without changing production interfaces.

Value immutability means stable values and isolated mutable data, without
requiring freezing or new object allocation for identity operations. Entity
identity, replacement history, and defensive-copy contracts retain focused
assertions. Child-method failure injection remains a limited instrumentation
exception for atomicity and retry coverage: verify distinctive failures and
public outcomes, omit exact call counts, and always restore spies.

The [domain testing guide](../../tests/domain/README.md) holds the maintained
convention and examples. Adjacent README tables retain Lecture 16's Input,
Oracle, and Log terminology, with one row per executed case and statuses in the
execution report, following ADR-0019. These dated snapshots describe only assertion-verified observations,
linked to the Vitest JSON execution report and tested-source digest. They do
not claim raw return-value capture: standard Vitest JSON records statuses and
failure diagnostics. Refresh the tables from reviewed source assertions and
execution identities after relevant changes, independently of code comments.
Reporting adds no test-body metadata, custom matchers, or production APIs.
