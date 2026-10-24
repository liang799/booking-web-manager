# ADR-0019: Domain result tables follow the lecture format

- Status: Accepted
- Date: 2026-10-24
- Supersedes: only the result-table layout in
  [ADR-0018](./0018-domain-test-input-oracle-log.md). Its test-readability,
  coverage-preservation, and assertion-verified evidence principles remain accepted.

The lecture reference presents one test case per row, with distinct input
fields followed by expected and observed results. Bundled setup code and
repeated assertion expressions made the domain tables difficult to compare.
Use native GitHub Markdown with operation headings, domain-specific input
columns and units, and the exact final headings **Expected Result** and
**Test Result**. Describe Input, Oracle, and Log above each table. Keep shared
prerequisites and execution counts there too.

Link the first input value to the test definition; do not add test-name,
operation, or status columns. Cases remain individually traceable through their
source definitions and full execution identities. Use concise concrete values,
states, and effects, preserving all related assertions, partial-match limits,
approximation, reference identity, and unchanged-state observations.

Test Result remains assertion-verified, not a runtime payload capture. Explain
that once per README. A failed case records available actual diagnostics; a
skipped or unexecuted case says Not run without an observation. A layout-only
edit preserves the original run date and evidence when source hashes match.

Keep reporting in documentation: no test-body metadata, custom matchers, new
reporting dependency, or production API is introduced. Existing JSON evidence
plus reviewed source assertions supports this format. The maintained examples
and reconciliation procedure live in the [domain testing guide](../../tests/domain/README.md)
and [execution evidence](../../tests/domain/results/README.md).
