# Session black-box and white-box testing

[Download the editable Word report](session-testing-report.docx).

The report covers Neoh's UC2-01 discovery, UC2-02 creation, and UC2-03a/b/c
visibility, participant removal and session cancellation. It contains 40
browser/API scenario groups, five scoped control-flow diagrams, basis paths,
cyclomatic-complexity calculations and 46 executed creation boundary cases.
The test-table and path-diagram format follows the supplied senior's
`SRS.pdf` section 6.9. That reference's application behavior and pass results
are not requirements or results for this project.

The manual scenarios are **Not run / Pending**. The focused automated snapshot
records **223 passing tests across 12 files**. The later PR validation records
**2,458 passing tests, 33 skipped and 2 TODO**, with type checking and lint passing.
The focused tests are included in the full-suite total; do not add the totals.
No browser, real PostgreSQL, payment-provider or instrumented coverage run is
claimed by this package.

## Diagrams

Each PNG has an editable Graphviz source beside it. The graph's scope matters:
these are selected implementation functions or blocks, not a complexity value
for an entire use case. Shared domain helpers support these use cases without
being attributed exclusively to the session feature owner.

| Use case | Subject | N | E | V = E - N + 2 | Editable source |
| --- | --- | ---: | ---: | ---: | --- |
| UC2-01 | Discovery SQL filter construction | 13 | 17 | 6 | [DOT](figures/discovery-cfg.dot) |
| UC2-02 | Creation account-policy helper | 7 | 8 | 3 | [DOT](figures/creation-cfg.dot) |
| UC2-03a | Visibility input parser | 7 | 8 | 3 | [DOT](figures/visibility-cfg.dot) |
| UC2-03b | Removal confirmation callback | 6 | 6 | 2 | [DOT](figures/removal-cfg.dot) |
| UC2-03c | Cancellation preparation helper | 9 | 12 | 5 | [DOT](figures/cancellation-cfg.dot) |

### UC2-01 discovery

![Discovery query control-flow graph](figures/discovery-cfg.png)

Source: [PostgresSessionDiscoveryReader.search](../../../lib/sessions/postgres-session-discovery-reader.ts).
Five source-level filter guards give six independent paths: no filters, then
one optional filter at a time. Existing tests include a no-filter case and
combined-filter cases. Five isolated one-filter basis cases remain proposed.
SQL execution and row-mapping internals are outside the graph.

### UC2-02 creation

![Creation account-policy control-flow graph](figures/creation-cfg.png)

Source: [bookingAccountIneligibility](../../../domain/accounts/booking-account-eligibility.ts).
Inactive account, missing email and eligible account are the three paths.
Payout readiness, price, time, capacity and persistence are separate checks.

### UC2-03a visibility

![Visibility parser control-flow graph](figures/visibility-cfg.png)

Source: [parseSessionVisibilityInput](../../../app/sessions/visibility-input.ts).
Both schema parsers run before the condition. The two operands of the
short-circuit OR are counted separately. Downstream ownership, lifecycle and
capacity checks are excluded from this parser's graph.

### UC2-03b removal

![Removal confirmation control-flow graph](figures/removal-cfg.png)

Source: [RemoveParticipant](../../../use-cases/sessions/RemoveParticipant.ts).
The graph covers the inner confirmation callback only. Domain preparation
precedes the version check. A stale-version test must assert unchanged
persisted state, not the absence of tentative in-memory mutation.

### UC2-03c cancellation

![Cancellation preparation control-flow graph](figures/cancellation-cfg.png)

Source: [Booker.prepareCancellation](../../../domain/accounts/booker.ts).
The graph expands atomic short-circuit predicates. The five concrete basis
cases preserve terminal history, handle no hold or an already-refunded hold,
and refund a live held share once. The caller's participant loop is excluded.

## Traceability and evidence

- [Manual test cases](manual-cases.json) contain the 40 scenario groups.
- [White-box cases](white-box-cases.json) contain paths, inputs, expected outputs
  and execution status.
- [Graph manifest](figures/graphs.json) contains complete nodes, edges, source
  lines, path sets and arithmetic audits. Graph arithmetic is not runtime
  coverage.
- [Creation observations](evidence/testing-black-box-observations.json) record
  all 46 expected/actual comparisons.
- [Cancellation observations](evidence/testing-booker-observations.json) record
  five expected/actual state and instruction comparisons.
- [Focused run](evidence/current-session-unit-20261020T075208Z.json):
  153 tests in seven files.
- [Boundary run](evidence/current-session-boundary-unit-20261020T075359Z.json):
  70 tests in five files.
- [PR validation](evidence/pr-validation/) contains the full unit, typecheck and
  lint logs and exit-code metadata.

The focused runs used implementation revision
`135064c0244fc684c9773ff947d8bf44e60f085e`. Relevant production source and the
existing focused tests are unchanged at PR base
`7aacdc97e2ab7d72724429b13eb7f17ee398010b`. The two report-specific test files are
included under `tests/lab4/`; other local Lab 4 deliverables are outside this
change. The Word report's 223-result snapshot stays separate from later
full-suite verification.

## Reproduce

Install the repository's locked Node 22 dependencies first. Run from its root:

```sh
rtk npm ci
rtk env LAB4_EVIDENCE_DIR=docs/testing/session-testing/evidence \
  npm test -- tests/lab4
rtk npm test
rtk npm run typecheck
rtk npm run lint
```

The environment variable is optional; omit it to avoid rewriting saved
observations. `tests/lab4` contains 46 creation partition/boundary cases and five
cancellation basis cases. The timestamped focused metadata records the exact
12-file selection used for the report.

To rebuild the Word document, use Python with `python-docx` and Pillow:

```sh
rtk python3 docs/testing/session-testing/build_report.py
```

To regenerate a diagram with Graphviz:

```sh
rtk dot -Tpng -Gdpi=220 \
  docs/testing/session-testing/figures/discovery-cfg.dot \
  -o docs/testing/session-testing/figures/discovery-cfg.png
```

The document's tables and text are editable in Word. Diagrams are embedded PNGs;
edit their DOT sources and rebuild to change them. Rendered review PDFs and page
images are local QA intermediates and are not part of the committed report.
