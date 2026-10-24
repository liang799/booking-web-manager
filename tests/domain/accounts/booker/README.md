# accounts/booker test cases

Snapshot: **2026-10-24** · **55 cases, 55 passed**. See the [domain testing guide](../../README.md) and [execution evidence](../../results/README.md).

Each row is one executed test. Columns before **Expected Result** are inputs; **Expected Result** is the oracle and **Test Result** is the log. Test results are assertion-verified outcomes from the dated passing run, not captured runtime payloads. The first input value links to the test definition. Only checked fields are reported; matching fields do not imply equality of an entire returned object.

Shared defaults: session `s`, owner `booker`, public visibility, `OPEN`, two slots, minimum headcount two, booking cost 1,000 cents and share 500 cents. The booking runs 10 October 2026, 10:00–12:00 UTC; relative times below use its start or end. Accounts are active with verified email, 10,000 available cents, reliability 100 and no groups unless a row says otherwise. Existing participants use IDs `p-<user>`, holds `h-<user>` and wallets `w-<user>`. Committed participants have a 500-cent `HELD` hold; waiters have no hold and receive queue positions in listed order, starting at 1. Empty rosters and no payout history are the default.

“Session unchanged” means the test compares the complete observed session snapshot: lifecycle, visibility, invited group, queue counter, payout identities/batch, the captured participation and hold fields. It does not claim equality of unobserved state.

Booker defaults: actor `booker` owns session `s`; a ready payout account is `pa`, provider reference `provider`, bank reference `bank`. Where deactivation is exercised, available/held balances and all blocking counts are zero. A withdrawn `OPEN_SLOT` participant leaves a seat available; `DIRECT_INVITE` reserves it for the named invitee.

## cancel — cancel a session

**Input:** Booker, Account, Roster / holds, Time before start, Cancellation failure · **Oracle:** Expected Result · **Log:** Test Result

Execution: **9 passed / 9 cases**.

| Booker | Account | Roster / holds | Time before start | Cancellation failure | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- |
| [booker](administration.test.ts#L16) | ACTIVE | Empty | 48 h | None | Owner remains `booker`; session `CANCELLED`; instructions empty. | Owner remains `booker`; session `CANCELLED`; instructions empty. |
| [booker](administration.test.ts#L53) | ACTIVE | alice, ben committed; waiting waitlisted | 48 h | Ben: INVALID_STATE, Second cancellation failed | Error code `INVALID_STATE`: “Second cancellation failed”; session unchanged. | Error code `INVALID_STATE`: “Second cancellation failed”; session unchanged. |
| [booker](administration.test.ts#L86) | ACTIVE | alice, ben committed; waiting waitlisted | 48 h | Ben fails once; retry after recovery | First attempt throws Error code `INVALID_STATE`: “Second cancellation failed”; retry instruction kinds `[REFUND, REFUND]`; session and all three participations `CANCELLED`. | First attempt throws Error code `INVALID_STATE`: “Second cancellation failed”; retry instruction kinds `[REFUND, REFUND]`; session and all three participations `CANCELLED`. |
| [booker](administration.test.ts#L129) | INACTIVE | alice committed | 48 h | None | Session `CANCELLED`; first instruction kind `REFUND`. | Session `CANCELLED`; first instruction kind `REFUND`. |
| [booker](administration.test.ts#L143) | ACTIVE | alice committed | 0 h | None | Error code `SESSION_STARTED`; session unchanged. | Error code `SESSION_STARTED`; session unchanged. |
| [booker](administration.test.ts#L154) | ACTIVE | alice withdrawn at −2 h, OPEN_SLOT, AWAITING_REPLACEMENT; ben committed; cara waitlisted | 1 h | None | Exactly two instructions; kinds `[REFUND, REFUND]`; session `CANCELLED`; no next waiter; hold states `[REFUNDED, REFUNDED, absent]` for alice, ben, cara. | Exactly two instructions; kinds `[REFUND, REFUND]`; session `CANCELLED`; no next waiter; hold states `[REFUNDED, REFUNDED, absent]` for alice, ben, cara. |
| [other](authorization.test.ts#L11) | ACTIVE | alice committed | 48 h | None | Error code `UNAUTHORIZED`; session unchanged. | Error code `UNAUTHORIZED`; session unchanged. |
| [booker](cancellation-history.test.ts#L13) | ACTIVE | alice REMOVED and REFUNDED at −48 h; ben committed; cara waitlisted | 24 h | None | Session `CANCELLED`; alice participation retains the same object identity; instruction participation/amount pairs exactly `[(p-ben, 500 cents)]`; cara `CANCELLED`. | Session `CANCELLED`; alice participation retains the same object identity; instruction participation/amount pairs exactly `[(p-ben, 500 cents)]`; cara `CANCELLED`. |
| [booker](cancellation-history.test.ts#L43) | ACTIVE | alice CANCELLED and REFUNDED at −48 h | 24 h | None | alice participation retains the same object identity; instructions empty. | alice participation retains the same object identity; instructions empty. |

## assertCanCancel — check cancellation eligibility

**Input:** Booker email, Committed users, Time before start · **Oracle:** Expected Result · **Log:** Test Result

Execution: **2 passed / 2 cases**.

| Booker email | Committed users | Time before start | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [Present, unverified](administration.test.ts#L28) | alice | 48 h | Returns without error; session unchanged. | Returns without error; session unchanged. |
| [Present, verified](administration.test.ts#L42) | None | 0 h | Error code `SESSION_STARTED`; session unchanged. | Error code `SESSION_STARTED`; session unchanged. |

## changeVisibility — change visibility

All cases start `PUBLIC` and run 48 hours before the session starts.

**Input:** Booker, Account, Email verified, Committed users, Requested visibility · **Oracle:** Expected Result · **Log:** Test Result

Execution: **4 passed / 4 cases**.

| Booker | Account | Email verified | Committed users | Requested visibility | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- |
| [booker](administration.test.ts#L222) | ACTIVE | No | None | PRIVATE | Visibility `PRIVATE`. | Visibility `PRIVATE`. |
| [booker](administration.test.ts#L237) | INACTIVE | No; email absent | None | PRIVATE | Visibility `PRIVATE`. | Visibility `PRIVATE`. |
| [booker](administration.test.ts#L250) | ACTIVE | Yes | alice, ben | PRIVATE | Error code `CAPACITY_EXCEEDED`; session unchanged. | Error code `CAPACITY_EXCEEDED`; session unchanged. |
| [other](authorization.test.ts#L23) | ACTIVE | Yes | None | PRIVATE | Error code `UNAUTHORIZED`; session unchanged. | Error code `UNAUTHORIZED`; session unchanged. |

## assertCanChangeVisibility — check visibility eligibility

Actor is the owner; current visibility is `PUBLIC`; time is 48 hours before start.

**Input:** Booker email, Committed users, Requested visibility · **Oracle:** Expected Result · **Log:** Test Result

Execution: **2 passed / 2 cases**.

| Booker email | Committed users | Requested visibility | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [Present, unverified](administration.test.ts#L188) | None | PRIVATE | Returns without error; session unchanged. | Returns without error; session unchanged. |
| [Present, verified](administration.test.ts#L205) | alice, ben | PRIVATE | Error code `CAPACITY_EXCEEDED`; session unchanged. | Error code `CAPACITY_EXCEEDED`; session unchanged. |

## removeParticipant — remove a committed participant

alice is the sole committed participant; removal is 48 hours before start. Instruction descriptions specify the checked fields only.

**Input:** Booker, Account, Participation · **Oracle:** Expected Result · **Log:** Test Result

Execution: **3 passed / 3 cases**.

| Booker | Account | Participation | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [booker](administration.test.ts#L270) | INACTIVE | p-alice | alice `REMOVED`; hold `REFUNDED`; first instruction kind `REFUND`. | alice `REMOVED`; hold `REFUNDED`; first instruction kind `REFUND`. |
| [other](administration.test.ts#L291) | ACTIVE | p-alice | Error code `UNAUTHORIZED`; session unchanged. | Error code `UNAUTHORIZED`; session unchanged. |
| [booker](administration.test.ts#L307) | ACTIVE | p-alice | Exactly one instruction with kind `REFUND`, participation `p-alice`, hold `h-alice`, wallet `w-alice`, amount 500 cents; alice `REMOVED`; hold `REFUNDED`. | Exactly one instruction with kind `REFUND`, participation `p-alice`, hold `h-alice`, wallet `w-alice`, amount 500 cents; alice `REMOVED`; hold `REFUNDED`. |

## verifyAttendance — record attendance

Every listed participant is committed before the command.

**Input:** Booker, Account, Existing attendance, Marks in order, Time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **5 passed / 5 cases**.

| Booker | Account | Existing attendance | Marks in order | Time | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- |
| [booker](attendance.test.ts#L12) | INACTIVE | alice UNVERIFIED | p-alice: ATTENDED | Session end | alice attendance `ATTENDED`; session `AWAITING_PAYOUT`. | alice attendance `ATTENDED`; session `AWAITING_PAYOUT`. |
| [booker](attendance.test.ts#L31) | ACTIVE | alice, ben UNVERIFIED | p-alice: ATTENDED | 1 h before end | Error code `SESSION_NOT_ENDED`; session unchanged. | Error code `SESSION_NOT_ENDED`; session unchanged. |
| [booker](attendance.test.ts#L49) | ACTIVE | alice ATTENDED; ben UNVERIFIED | p-ben: ATTENDED; p-alice: ABSENT | Session end | Error code `ATTENDANCE_CONFLICT`; session unchanged. | Error code `ATTENDANCE_CONFLICT`; session unchanged. |
| [booker](attendance.test.ts#L70) | ACTIVE | alice ATTENDED; ben UNVERIFIED | p-ben: ABSENT | Session end | Session `AWAITING_PAYOUT`. | Session `AWAITING_PAYOUT`. |
| [other](authorization.test.ts#L39) | ACTIVE | alice UNVERIFIED | p-alice: ATTENDED | Session end | Error code `UNAUTHORIZED`; session unchanged. | Error code `UNAUTHORIZED`; session unchanged. |

## createSession — account eligibility

Creation uses the shared booking, two slots, minimum headcount two, holding account `platform`, room token `room`, public visibility, and time 48 hours before start.

**Input:** Account / role timing, Email, Payout setup · **Oracle:** Expected Result · **Log:** Test Result

Execution: **5 passed / 5 cases**.

| Account / role timing | Email | Payout setup | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [ACTIVE](creation.test.ts#L18) | Present, unverified | COMPLETE | Created session owner `booker`. | Created session owner `booker`. |
| [ACTIVE](creation.test.ts#L40) | Absent | COMPLETE | Error code `EMAIL_REQUIRED`. | Error code `EMAIL_REQUIRED`. |
| [INACTIVE; role created before deactivation](creation.test.ts#L53) | Cleared by deactivation | COMPLETE | Error code `INACTIVE_ACCOUNT`. | Error code `INACTIVE_ACCOUNT`. |
| [INACTIVE before role creation](creation.test.ts#L74) | Absent | No account | Error code `INACTIVE_ACCOUNT`. | Error code `INACTIVE_ACCOUNT`. |
| [ACTIVE](creation.test.ts#L86) | Present, verified | New account pa; provider reference provider; setup incomplete | Error code `PAYOUT_ACCOUNT_NOT_READY`. | Error code `PAYOUT_ACCOUNT_NOT_READY`. |

## assertCanCreateSession — check creation eligibility

**Input:** Account, Email, Payout setup · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Account | Email | Payout setup | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [ACTIVE](creation.test.ts#L30) | Present, unverified | COMPLETE | No exception. | No exception. |

## createSession — optional settings

The owner has a ready payout account; other creation details use the shared defaults and time 48 hours before start.

**Input:** Visibility, Invited group, Minimum reliability, Booking share (cents) · **Oracle:** Expected Result · **Log:** Test Result

Execution: **2 passed / 2 cases**.

| Visibility | Invited group | Minimum reliability | Booking share (cents) | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- |
| [Omitted](creation.test.ts#L104) | None | None | Default: 500 | Owner `booker`; visibility `PRIVATE`; status `OPEN`; participations and payout ID/key histories empty; next queue sequence 1; pending settlement absent. | Owner `booker`; visibility `PRIVATE`; status `OPEN`; participations and payout ID/key histories empty; next queue sequence 1; pending settlement absent. |
| [PUBLIC](creation.test.ts#L123) | group | 80 | 750 | Visibility `PUBLIC`; invited group `group`; minimum reliability 80; booking share 750 cents. | Visibility `PUBLIC`; invited group `group`; minimum reliability 80; booking share 750 cents. |

## createSession — booking and capacity

The owner is active with a ready payout account; no custom share is supplied.

**Input:** Total cost (cents), Slots, Minimum headcount, Creation time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **6 passed / 6 cases**.

| Total cost (cents) | Slots | Minimum headcount | Creation time | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- |
| [1,000](creation.test.ts#L143) | 1,001 | 2 | 48 h before start | Error code `INVALID_INPUT`. | Error code `INVALID_INPUT`. |
| [1,000](creation.test.ts#L151) | 1 | 2 | 48 h before start | Error code `INVALID_INPUT`. | Error code `INVALID_INPUT`. |
| [1,000](creation.test.ts#L159) | 2 | 1 | 48 h before start | Error code `INVALID_INPUT`. | Error code `INVALID_INPUT`. |
| [1,000](creation.test.ts#L167) | 3 | 4 | 48 h before start | Error code `INVALID_INPUT`. | Error code `INVALID_INPUT`. |
| [1,000](creation.test.ts#L175) | 3 | 3 | 48 h before start | Minimum headcount 3. | Minimum headcount 3. |
| [1,000](creation.test.ts#L186) | 2 | 2 | Session end | Error code `SESSION_STARTED`. | Error code `SESSION_STARTED`. |

## preparePayout — eligibility and settlement

Commands run at session end. Destination fields are payout account ID / user ID / provider account reference / bank account reference. Listed attended participants are committed with held funds unless described as withdrawn.

**Input:** Booker / account, Session status, Participants / attendance, Payout ID, Idempotency key · **Oracle:** Expected Result · **Log:** Test Result

Execution: **5 passed / 5 cases**.

| Booker / account | Session status | Participants / attendance | Payout ID | Idempotency key | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- |
| [booker; INACTIVE after role creation](settlement.test.ts#L18) | OPEN | None | out | key | Error code `INACTIVE_ACCOUNT`; session unchanged. | Error code `INACTIVE_ACCOUNT`; session unchanged. |
| [booker; ACTIVE](settlement.test.ts#L48) | OPEN | alice ATTENDED; ben UNVERIFIED | out | key | Error code `ATTENDANCE_INCOMPLETE`; session unchanged. | Error code `ATTENDANCE_INCOMPLETE`; session unchanged. |
| [booker; ACTIVE](settlement.test.ts#L67) | AWAITING_PAYOUT | alice withdrawn at −2 h, OPEN_SLOT, AWAITING_REPLACEMENT; ben ATTENDED | out | key | Session `PAYOUT_PENDING`; destination exactly pa/booker/provider/bank; line kinds `[FORFEIT, RELEASE]`; alice/ben hold states `[FORFEITURE_DUE, HELD]`. | Session `PAYOUT_PENDING`; destination exactly pa/booker/provider/bank; line kinds `[FORFEIT, RELEASE]`; alice/ben hold states `[FORFEITURE_DUE, HELD]`. |
| [booker; ACTIVE](settlement.test.ts#L102) | OPEN | None | unused | unused | No payout returned; session `SETTLED`. | No payout returned; session `SETTLED`. |
| [other; ACTIVE](authorization.test.ts#L54) | AWAITING_PAYOUT | alice ATTENDED | out | key | Error code `UNAUTHORIZED`; session unchanged. | Error code `UNAUTHORIZED`; session unchanged. |

## preparePayout — pending payouts and retries

Owner retries at session end. Release-only participants are marked `ATTENDED`; the forfeiture case has alice withdrawn at −2 h using `OPEN_SLOT`, and ben attended. Failure history remains recorded after settlement failure.

**Input:** Previous payout, Existing hold states, Requested payout ID, Requested key · **Oracle:** Expected Result · **Log:** Test Result

Execution: **4 passed / 4 cases**.

| Previous payout | Existing hold states | Requested payout ID | Requested key | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- |
| [out / key; PAYOUT_PENDING](settlement.test.ts#L118) | alice FORFEITURE_DUE; ben HELD | another | key2 | Error code `PAYOUT_IN_PROGRESS`; session unchanged. | Error code `PAYOUT_IN_PROGRESS`; session unchanged. |
| [out / key; failed at session end](settlement.test.ts#L134) | alice FORFEITURE_DUE; ben HELD | out | new | Error code `DUPLICATE_ID`; session unchanged. | Error code `DUPLICATE_ID`; session unchanged. |
| [original-payout / original-key; failed at session end](settlement.test.ts#L151) | alice, ben HELD | retry | original-key | Error code `DUPLICATE_ID`, message “A payout idempotency key can only be used once for this session”; session unchanged. | Error code `DUPLICATE_ID`, message “A payout idempotency key can only be used once for this session”; session unchanged. |
| [out / key; failed at session end](settlement.test.ts#L179) | alice, ben HELD | retry | retry-key | Returned payout `retry`, key `retry-key`; session `PAYOUT_PENDING`, pending payout `retry`; histories `[out, retry]` / `[key, retry-key]`; both hold objects retain identity and stay `HELD`. | Returned payout `retry`, key `retry-key`; session `PAYOUT_PENDING`, pending payout `retry`; histories `[out, retry]` / `[key, retry-key]`; both hold objects retain identity and stay `HELD`. |

## preparePayout — expire replacement holds

All attempts use payout ID `out`, key `key`, and session-end time; ben, when present, is committed.

**Input:** Booker attempts, Ben attendance, Session status, Outstanding withdrawal · **Oracle:** Expected Result · **Log:** Test Result

Execution: **4 passed / 4 cases**.

| Booker attempts | Ben attendance | Session status | Outstanding withdrawal | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- |
| [booker](settlement.test.ts#L222) | No ben participant | OPEN | alice: −2 h, OPEN_SLOT, AWAITING_REPLACEMENT | alice hold `FORFEITURE_DUE`; exactly one payout line with kind `FORFEIT` (other fields unconstrained). | alice hold `FORFEITURE_DUE`; exactly one payout line with kind `FORFEIT` (other fields unconstrained). |
| [booker](settlement.test.ts#L249) | UNVERIFIED | OPEN | alice: −2 h, OPEN_SLOT, AWAITING_REPLACEMENT | Error code `ATTENDANCE_INCOMPLETE`; session unchanged; alice hold remains `AWAITING_REPLACEMENT`. | Error code `ATTENDANCE_INCOMPLETE`; session unchanged; alice hold remains `AWAITING_REPLACEMENT`. |
| [foreign](settlement.test.ts#L280) | ATTENDED | AWAITING_PAYOUT | alice: −2 h, OPEN_SLOT, AWAITING_REPLACEMENT | Error code `UNAUTHORIZED`; session unchanged; payout ID and key histories empty. | Error code `UNAUTHORIZED`; session unchanged; payout ID and key histories empty. |
| [foreign, then booker](settlement.test.ts#L311) | ATTENDED | AWAITING_PAYOUT | alice: −2 h, OPEN_SLOT, AWAITING_REPLACEMENT | Foreign attempt error code `UNAUTHORIZED`; owner receives line kinds `[FORFEIT, RELEASE]`; alice hold `FORFEITURE_DUE`; histories `[out]` / `[key]`. | Foreign attempt error code `UNAUTHORIZED`; owner receives line kinds `[FORFEIT, RELEASE]`; alice hold `FORFEITURE_DUE`; histories `[out]` / `[key]`. |

## preparePayout — restore failed payout history

Restored sessions are `AWAITING_PAYOUT`, have no pending settlement, and contain alice marked `ATTENDED` with a 500-cent held share. Owner prepares the payout at session end.

**Input:** Restored history, Requested payout ID, Requested key, Session copies · **Oracle:** Expected Result · **Log:** Test Result

Execution: **3 passed / 3 cases**.

| Restored history | Requested payout ID | Requested key | Session copies | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- |
| [out / key](settlement.test.ts#L353) | out | retry-key | One | Error code `DUPLICATE_ID`; session unchanged. | Error code `DUPLICATE_ID`; session unchanged. |
| [out / key](settlement.test.ts#L374) | retry | key | One | Error code `DUPLICATE_ID`; session unchanged. | Error code `DUPLICATE_ID`; session unchanged. |
| [out / key](settlement.test.ts#L395) | retry | retry-key | Original and independently restored | Returned payout `retry`, key `retry-key`; restored session `PAYOUT_PENDING`, pending payout `retry`; histories `[out, retry]` / `[key, retry-key]`; original session unchanged. | Returned payout `retry`, key `retry-key`; restored session `PAYOUT_PENDING`, pending payout `retry`; histories `[out, retry]` / `[key, retry-key]`; original session unchanged. |
