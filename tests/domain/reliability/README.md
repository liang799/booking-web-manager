# Reliability test cases

Snapshot: **2026-10-24** · **33 cases**. See the [domain testing guide](../README.md) and [execution evidence](../results/README.md).

Each row is one test case. The first input value links to its test definition. Input columns precede **Expected Result** (Oracle) and **Test Result** (Log). Test Result records only assertion-verified outcomes from the passing snapshot, not captured runtime payloads. Matching result cells are expected for passing cases; partial matches, identity checks and approximate comparisons retain their stated limits.

## ReliabilityScore.fromHistory — weighted outcomes

All histories are scored for `alice`. Unless stated otherwise, the calculation cutoff is **2026-09-15 00:00 UTC**. Ages are whole days before that cutoff. ATTENDED/ABSENT entries are committed participations with 100-cent held funds; commitment and hold creation occur one day before attendance finalization. Attendance is finalized at the session end unless a row supplies a different finalization date. ATTENDED entries use BOOKER verification; ABSENT entries use AUTOMATIC verification. The withdrawal row instead has a 100-cent FORFEITED hold, committed two days before the end, withdrawn one day before the end, and settled at the end with payout `payout`, replacement mode `OPEN_SLOT`, and UNVERIFIED attendance.

**Input:** Participation IDs, Outcomes, Session ages (days), Calculation cutoff · **Oracle:** Expected Result · **Log:** Test Result

Execution: **4 passed / 4 cases**.

| Participation IDs | Outcomes | Session ages (days) | Calculation cutoff | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- |
| [None](reliability-score-history.test.ts#L10) | Empty history | — | 2026-09-15 | 100 | 100 |
| [`a`, `b`](reliability-score-history.test.ts#L18) | ATTENDED, ABSENT | 1, 91 | 2026-09-15 | ≈ 66.66666666666667 (precision 8) | ≈ 66.66666666666667 (precision 8) |
| [`attended`, `p`](reliability-score-history.test.ts#L31) | ATTENDED, finalized WITHDRAWN | 1, 1 | 2026-09-15 | 50 | 50 |
| [`a`, `b`](reliability-score-history.test.ts#L64) | ATTENDED, ABSENT | 1, 91 at the first cutoff | 2026-09-15, then 2027-09-15 | Later score equals the original exactly; ≈ 66.66666666666667 (precision 8) | Later score equals the original exactly; ≈ 66.66666666666667 (precision 8) |

## ReliabilityScore.fromHistory — identity and date validation

The target user remains `alice`. A waitlisted entry has queue sequence 1 and waitlist time 2026-09-14 00:00 UTC.

**Input:** Participation IDs, Participation users, Outcomes, Session end, Calculation cutoff · **Oracle:** Expected Result · **Log:** Test Result

Execution: **4 passed / 4 cases**.

| Participation IDs | Participation users | Outcomes | Session end | Calculation cutoff | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- |
| [`a`, `a` (same entry twice)](reliability-score-history.test.ts#L84) | alice, alice | ATTENDED, ATTENDED | 2026-09-14 | 2026-09-15 | Throws RangeError | Throws RangeError |
| [`foreign`](reliability-score-history.test.ts#L92) | ben | WAITLISTED | 2026-09-14 | 2026-09-15 | Throws RangeError | Throws RangeError |
| [None](reliability-score-history.test.ts#L109) | — | Empty history | — | Invalid Date | Throws RangeError | Throws RangeError |
| [`a`](reliability-score-history.test.ts#L117) | alice | ATTENDED | Invalid Date | 2026-09-15 | Throws RangeError | Throws RangeError |

## ReliabilityScore.fromHistory — finalized outcome cutoff

The calculation cutoff is 2026-09-15 00:00 UTC. All entries belong to `alice`; all dates below are at 00:00 UTC.

**Input:** Participation ID, Outcome, Session end, Finalized at · **Oracle:** Expected Result · **Log:** Test Result

Execution: **4 passed / 4 cases**.

| Participation ID | Outcome | Session end | Finalized at | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- |
| [`waiting`](reliability-score-history.test.ts#L127) | WAITLISTED; queue sequence 1 | 2026-09-14 | Not finalized | 100 | 100 |
| [`future-end`](reliability-score-history.test.ts#L141) | ABSENT | 2026-09-16 | 2026-09-16 | 100 | 100 |
| [`future-finalization`](reliability-score-history.test.ts#L152) | ABSENT | 2026-09-14 | 2026-09-16 | 100 | 100 |
| [`at-cutoff`](reliability-score-history.test.ts#L166) | ABSENT | 2026-09-15 | 2026-09-15 | 0; score instance is frozen | 0; score instance is frozen |

## ReliabilityScore.from — score bounds


**Input:** Score · **Oracle:** Expected Result · **Log:** Test Result

Execution: **10 passed / 10 cases**.

| Score | Expected Result | Test Result |
| --- | --- | --- |
| [0](reliability-score.test.ts#L6) | 0 | 0 |
| [100](reliability-score.test.ts#L14) | 100 | 100 |
| [48](reliability-score.test.ts#L22) | 48 | 48 |
| [66.66666666666667](reliability-score.test.ts#L30) | 66.66666666666667 | 66.66666666666667 |
| [−0](reliability-score.test.ts#L38) | 0 (positive zero) | 0 (positive zero) |
| [−0.001](reliability-score.test.ts#L46) | Throws RangeError | Throws RangeError |
| [100.001](reliability-score.test.ts#L52) | Throws RangeError | Throws RangeError |
| [NaN](reliability-score.test.ts#L58) | Throws RangeError | Throws RangeError |
| [+Infinity](reliability-score.test.ts#L64) | Throws RangeError | Throws RangeError |
| [−Infinity](reliability-score.test.ts#L70) | Throws RangeError | Throws RangeError |

## ReliabilityScore.toNumber — immutable value


**Input:** Stored score · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 case**.

| Stored score | Expected Result | Test Result |
| --- | --- | --- |
| [66.66666666666667](reliability-score.test.ts#L76) | 66.66666666666667; score instance is frozen | 66.66666666666667; score instance is frozen |

## ReliabilityScore.equals — value equality


**Input:** Score, Other score · **Oracle:** Expected Result · **Log:** Test Result

Execution: **2 passed / 2 cases**.

| Score | Other score | Expected Result | Test Result |
| --- | --- | --- | --- |
| [75.5](reliability-score.test.ts#L87) | 75.5 | true; operands are different instances | true; operands are different instances |
| [75.5](reliability-score.test.ts#L97) | 80 | false | false |

## ReliabilityScore.compareTo — ordering


**Input:** Score, Other score · **Oracle:** Expected Result · **Log:** Test Result

Execution: **3 passed / 3 cases**.

| Score | Other score | Expected Result | Test Result |
| --- | --- | --- | --- |
| [75.5](reliability-score.test.ts#L106) | 75.5 | 0 | 0 |
| [75.5](reliability-score.test.ts#L115) | 80 | −1 | −1 |
| [80](reliability-score.test.ts#L124) | 75.5 | 1 | 1 |

## ReliabilityScore.meetsMinimum — admission threshold


**Input:** Score, Minimum score · **Oracle:** Expected Result · **Log:** Test Result

Execution: **5 passed / 5 cases**.

| Score | Minimum score | Expected Result | Test Result |
| --- | --- | --- | --- |
| [75.5](reliability-score.test.ts#L135) | 75 | true | true |
| [75.5](reliability-score.test.ts#L144) | 75.5 | true | true |
| [75.5](reliability-score.test.ts#L153) | 75.5001 | false | false |
| [0](reliability-score.test.ts#L162) | 0 | true | true |
| [100](reliability-score.test.ts#L171) | 100 | true | true |
