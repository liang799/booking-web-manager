# Domain test execution evidence

Snapshot run: **23 October 2026, 23:55:50 SGT**
(`2026-10-23T15:55:50.016Z`). All **603 tests in 43 files passed**.

```sh
rtk npm test -- tests/domain --reporter=default --reporter=json --outputFile.json=tests/domain/results/2026-10-23-vitest.json
```

- [Vitest execution report](./2026-10-23-vitest.json): exact test identities,
  statuses, timings, and failure diagnostics from this run.
- [Tested-source manifest](./2026-10-23-sources.json): SHA-256 hashes of domain
  implementation, domain tests and fixtures, Vitest/TypeScript configuration,
  and package manifests. Aggregate digest:
  `e56ad0c4e4c69019b29a9b81634d0c628609c65c98741cb30e171c191f970cc5`.
- [Coverage mapping](./2026-10-23-coverage-map.json): all 598 release-baseline cases
  mapped to 602 retained scenarios, plus one new visibility-change case.
  Includes before/after assertion expressions for changed explicit scenarios.
- [Table index](../README.md#result-snapshots): nine directories, 603 rows,
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

Input lists domain data and commands, excluding spy configuration and cleanup.
Oracle states the expected outcomes; Log records what the executed assertions
establish. Named results, where useful, identify how observations were obtained.
Simple public-state assertions need no intermediate binding. These table
columns are reporting concepts, independent of comments in the test source.

Vitest's standard report records status and failures, not successful return
values. These tables interpret the executed source assertions alongside their
passing statuses; they are not raw runtime payload captures. Pass/fail remains
a separate column. A failed case must report the available actual diagnostics,
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

The final suite contains **603 cases and 1,229 assertions**, including eight
prerequisite assertions. The three behavior splits preserve every assertion
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

## Other validation

| Check | Result |
|---|---|
| Domain suite | 603 passed across 43 files |
| Shuffled domain suite, seed `2006` | 603 passed across 43 files |
| Full `rtk npm test` | 2,794 passed; 3 failed; 42 skipped; 1 todo |
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

## Refreshing this snapshot

1. Run the domain command above against the intended sources. For a new date,
   use that date in the artifact names and table headers.
2. Review each final case's setup, commands, and assertions to populate Input,
   Oracle, and Log; do not parse phase comments or require reporting metadata in
   test bodies. Record only the concrete observations established by its executed assertions, respecting reference,
   partial-match, and tolerance semantics. Include actual failure diagnostics
   when available; never infer an observed result from an unexecuted test.
3. Reconcile every table's linked test name and file with the JSON report.
   Update line anchors and reject missing or duplicate rows.
4. Refresh every file hash and the aggregate digest in the source manifest.
   Update this run time, command, counts, and validation results.
5. Recheck the tables and linked sources together. Keep the historical mapping
   for this cleanup distinct from any future changes in coverage.
