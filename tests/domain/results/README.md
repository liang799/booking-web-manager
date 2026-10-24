# Domain test execution evidence

Snapshot run: **24 October 2026, 01:17:29 SGT**
(`2026-10-23T17:17:29.248Z`). All **624 tests in 44 files passed**.

```sh
rtk npm test -- tests/domain --reporter=default --reporter=json --outputFile.json=tests/domain/results/2026-10-24-vitest.json
```

- [Vitest execution report](./2026-10-24-vitest.json): exact test identities,
  statuses, timings, and failure diagnostics from this run.
- [Tested-source manifest](./2026-10-24-sources.json): SHA-256 hashes of domain
  implementation, domain tests and fixtures, Vitest/TypeScript configuration,
  and package manifests. Aggregate digest:
  `6c095de7e925d56547b003a81c69a1d7b5c9f0bc60b91e4ae679c8d47b118164`.
- [Coverage mapping](./2026-10-24-coverage-map.json): all 598 release-baseline cases
  mapped to 602 retained scenarios, plus 22 focused additions: visibility,
  creation settings, two payout-setup failure cases, invitation revocation,
  three replacement-history transitions, and fourteen shared-fixture contracts.
  Includes before/after assertion expressions for changed explicit scenarios.
- [Table index](../README.md#result-snapshots): nine directories, 624 rows,
  exactly one row per final case. Each row links to its test definition.

Base revision: `00f6c88462e16ffce8f91dd78b72aa649918e9f7`. The run includes the
test cleanup; the source manifest identifies the actual tested
contents. The aggregate is SHA-256 of the UTF-8 `JSON.stringify(files)` object
in manifest insertion order. Each entry hashes the exact file bytes. Snapshot
documentation and result artifacts are excluded to avoid a circular digest.

## Meaning of Log

The tables describe **assertion-verified observations**. For example, a passing
`expect(sum.toCents()).toBe(1200)` establishes 1,200 cents. A passing partial
match establishes only the listed fields; a tolerance check establishes an
approximate value; a reference check establishes the same or a different
instance. Rejection snapshots establish that the observed state is unchanged.

Input occupies separate domain-specific columns with concrete values and units.
The heading identifies the operation, and shared prerequisites appear above
the table. Oracle is the **Expected Result** column; Log is the **Test Result**
column. These columns state concise domain outcomes, including all related
asserted effects. Each row's first input value links to its test definition;
test names, operation labels, and status do not occupy additional columns.
This layout follows
[ADR-0019](../../../docs/adr/0019-domain-result-table-layout.md) and is independent
of comments or local variable names in the test source.

Vitest's standard report records status and failures, not successful return
values. These tables interpret the executed source assertions alongside their
passing statuses; they are not raw runtime payload captures. Execution counts
appear above each table, and per-case statuses remain in the JSON report.
A failed case must report the available actual diagnostics,
and a skipped or unexecuted case must be marked **Not run**, with no claimed
observation. No test-body reporting hooks or custom matchers are required.

## Coverage review

The original baseline was **593 passing tests in 45 files**. Before release,
main added five group-leaving cases, and its updated baseline passed **598 tests
in 45 files**. This cleanup preserves both sets of cases and assertions:

- Five standalone role cases moved into the existing Booker administration
  and Participant admission/withdrawal suites. The two empty source files were
  removed; the scenario names were retained.
- All 26 pricing cases remain: 25 table-generated rows became individually
  named examples, alongside the existing default-share case. Exact bounds and
  invalid-input coverage remain. The collection-safety check now uses the
  actual returned maximum instead of the table's expected maximum.
- One custom-price scenario became two independent cases for payout
  preparation and completion. The batch amount and released amount/state
  assertions remain, adding one test.
- Cancellation and reconstruction of its removed-participant history now have
  separate cases. Two settlement cases also have separate reliability-query
  cases. Each split keeps the four related action assertions together and
  moves one independent assertion into its own freshly prepared scenario.
- A separate visibility-change case starts with a PUBLIC session, calls
  `changeVisibility` as an unverified owner, and checks that the resulting
  visibility is PRIVATE. The existing permission-check case remains independent.
- Role suites retain mixed release/forfeiture payout setup, failure injection,
  spy restoration, FIFO and timing boundaries, role liveness, identity history,
  and unchanged-state assertions. Concrete states replace vague change checks.
- Value suites retain all 299 names, including the five newer group cases.
  Concrete cents and exact member contents
  replace indirect boolean checks; copy, identity, and payout outcome checks
  are retained or strengthened. Registration's expected reliability is an
  independent literal rather than another call to production calculation.

The mapping was reconciled by source path and test identity. Assertion changes
were reviewed, including cases with renamed local variables; equal test counts
alone were not used as coverage evidence.

The suite before prerequisite-fixture cleanup contained **603 cases and 1,229
assertions**, including eight prerequisite assertions. The three behavior splits preserve every assertion
from the preceding 600-case revision (`acac1b5`), including matcher, negation,
expected argument, and observed expression. Their original case names remain;
the three new names identify the moved reconstruction and reliability checks.
The readability pass preserves all 603 identities and 1,229 assertions from
`a7f21a1`. Routine phase comments and redundant aliases are removed. Named
command results, identity captures, before-state snapshots, and observations
whose timing matters remain. Matcher, negation, and expected arguments are
compared against that revision; observed expressions are compared after
expanding removed aliases. A separate source review checks execution order and
captures across mutations, which expression equivalence alone cannot prove.
Direct unchanged-state comparisons stay beside their rejection assertions.
Fault-injection expectations remain independent of stubbed errors.

The attendance fixture follow-up declares existing marks through
`attendanceByUserId`. Two Booker cases now exercise only their final/conflicting
command, and two automatic-attendance cases declare their mixed starting roster
directly. All four retain their assertions. A fixture-equivalence check compared
hydrated ATTENDED/ABSENT state with the prior setup workflow for two- and
three-slot sessions, including 500/333-cent holds. Existing fixture defaults and
verification metadata remain unchanged.

The prerequisite-fixture pass reviewed every case in all 43 files. Ordinary
withdrawal, reservation, cancellation, payout, account and group prerequisites
now use constructor state. Shared fixture exports and existing defaults remain
compatible. All 603 prior cases and 1,229 assertions remain; four focused cases
add 14 assertions for successful payout-setup failure, invitation revocation,
and custom session-creation settings previously covered indirectly in setup.
Before the review fixes, the suite had **607 cases and 1,243 assertions**, including eight
prerequisite assertions.

Every original matcher, negation, expected argument, and assertion order is
preserved. One `recordAdmission` rejection now receives a preconstructed
refunded invitation instead of computing that prerequisite inside the throwing
callback; the rejected input and unchanged-state check remain equivalent.
Sixteen shared fixture-state comparisons and 48 changed role-scenario setup
comparisons matched the previous workflows, including amounts, timestamps,
roster order, loaded-user state, and replacement history. Separate source
reviews retained identity handles, observation timing, failure injection, and
sequences whose repeated calls are the behavior under test. The coverage map
contains per-case notes for changed scenarios and reasons for the four added
cases.

Every domain test file now has a responsibility-specific suite label. Thirty
mixed suites use one level of behavior groups; thirteen focused suites remain
flat. Guards stay beside commands, and failure/retry cases remain together.
The original Booker administration groups are retained; the other 42 files
have updated labels or groups. All 607 test names, 1,243 assertions, callback
syntax trees, comments, imports, and helper declarations are preserved.
Suite scopes contain only `describe` and `test` declarations, so grouping adds
no shared setup or execution-order dependencies.

The coverage map records each file's grouping rationale and maps the previous
and current execution prefixes for every case. At the grouping revision, the
result tables used the same outer and inner behavior headings. At `ecdc64b`, all 607 full execution identities, source
links, and tested-source hashes reconciled with that JSON run, including the 591
cases whose execution prefixes changed in this pass.

## Review fixes

Three focused Participation tests now verify that withdrawal, removal, and cancellation preserve accepted replacement history. Fourteen fixture contract tests cover attendance hydration, rounded/custom shares, roster order, override rejection, fresh instances, historical states, and payout defaults/identity overrides. The duplicate-key test declares its original key explicitly. The payout-intent test reads `amount.toCents()`; matching a Money object cannot verify its private cents field.

The current suite has **624 cases and 1,311 assertions across 44 files**.

[Mutation checks](./2026-10-24-mutation-checks.json) deliberately drop replacement links and return the wrong payout amount in isolated copies. All 607 previous tests passed those defects; the repaired suite rejects them in the four intended tests. Production code is unchanged. Current execution, hashes, mapping locations, and all 624 table rows were reconciled after these fixes. Earlier pass counts above describe their historical revisions.

## Other validation

| Check | Result |
|---|---|
| Domain suite | 624 passed across 44 files |
| Shuffled domain suite, seed `2006` | 624 passed across 44 files |
| Full `rtk npm test` | 2,815 passed; 3 failed; 42 skipped; 1 todo |
| `rtk npm run typecheck` | Failed on 25 existing errors in the profile page and app shell |
| `rtk npx eslint tests/domain` | Passed |
| `rtk npm run lint` | Failed on an existing unused `MobileNavigation` import in the app shell |

The three failing unit tests are in `tests/app/profile/settings-links.test.ts`:
each reports `ReferenceError: PageHeader is not defined` from
`app/profile/page.tsx:20`. Typecheck errors concern missing profile-page symbols,
unsupported `SettingsRow` props, and unresolved app-shell navigation symbols
and types. These production files are outside the cleanup and remain unchanged.
The same three test failures, 25 typecheck errors, and one lint error were
reproduced on the unchanged base revision above.

The preceding snapshot remains available as the
[23 October execution report](./2026-10-23-vitest.json),
[source manifest](./2026-10-23-sources.json), and
[coverage mapping](./2026-10-23-coverage-map.json). Its historical source digest
identifies that revision; the tables above link to the current snapshot.

## Table layout and tooling

The lecture-format revision retains all 624 case identities and the original
24 October execution time. It changes documentation only: the 89 recorded
source hashes, execution JSON, coverage mapping, and mutation evidence are
unchanged. Operation headings and compatible input columns may subdivide the
original behavior groups; first-input links still identify the exact cases.

Layout validation reconciled 624 unique rows across 190 tables with source
definitions and full execution identities, checked Markdown column widths and
per-table counts, and verified all 89 hashes and the aggregate digest. A second
source-based review checked every case's inputs and asserted outcomes. Local
Markdown previews covered numeric, state-transition, rejection, retry, identity,
approximation, and multi-outcome examples; `git diff --check` passed. These are
documentation checks against the saved run, not a new execution of the tests.

No reporting dependency is needed for these assertion-verified tables:

- [vitest-md-reporter](https://github.com/robertozmc/vitest-md-reporter)
  provides execution summaries, but does not extract domain inputs or successful
  assertion values into this layout.
- [@cronn/vitest-file-snapshots](https://github.com/cronn/file-snapshots/tree/main/packages/vitest-file-snapshots)
  formats supplied data as Markdown snapshots, requiring additional authored
  data and matcher calls in tests.
- [@vitest/eslint-plugin](https://github.com/vitest-dev/eslint-plugin-vitest)
  offers useful test-quality checks, but does not validate the reporting tables.
  Consider it separately from this documentation correction.

## Refreshing this snapshot

1. Run the domain command above against the intended sources. For a new date,
   use that date in the artifact names and table headers.
2. Review each final case's setup, inline command arguments, and assertions.
   Group compatible cases under an operation heading; give concrete input fields
   their own columns and finish with Expected Result and Test Result. State
   shared prerequisites and Input/Oracle/Log roles above the table. Do not parse
   phase comments or require reporting metadata in test bodies. Preserve every
   asserted effect, including reference, partial-match, and tolerance semantics.
   Include available actual failure diagnostics; mark skipped or unexecuted
   cases Not run without claiming an observation.
3. Resolve each first-input link to its source test and full suite identity in
   the JSON report. Reconcile exactly one row per case, update line anchors, and
   reject missing or duplicate rows. Check column counts and Markdown escaping;
   put execution counts above each table rather than in a status column.
4. Refresh every file hash and the aggregate digest in the source manifest.
   Update this run time, command, counts, and validation results.
5. Preview numeric, state-transition, rejection, retry, identity, and multi-outcome
   tables. Recheck the tables and linked assertions together. Keep the historical
   mapping for this cleanup distinct from any future changes in coverage.

For a layout-only edit, verify all recorded source hashes and reconcile the
existing report instead of changing the run date or regenerating evidence.
Only a new execution establishes a new execution time.
