# Session test cases

Snapshot: **2026-10-24, payout refactor** · **98 cases, 98 passed**. See the [domain testing guide](../../README.md) and [execution evidence](../../results/README.md).

Each row is one independently executable test; its first input value links to the test definition. **Test Result** contains assertion-verified observations derived from executed assertions and their recorded status, not captured runtime payloads. Expected Result is the **Oracle**; Test Result is the **Log**. A matching result reports only the stated assertions, including partial matches, identity and unchanged-state checks. Refresh the snapshot after relevant source changes.

Shared defaults: session s, booker booker, Court / North / Badminton, PUBLIC and OPEN, two slots, minimum headcount two, total cost 1,000 cents, share 500 cents (an omitted price uses the cost divided by slots, rounded down), holding account platform, room token room, empty roster and payout history, next queue sequence 1. **Start** is 2026-10-10 10:00 UTC; **end** is 2026-10-10 12:00 UTC. Relative times name these anchors. Participants use IDs p-user, holds h-user and wallets w-user, with the actual user ID replacing user; commitments and waitlist entries begin 48 hours before start. Unspecified attendance is UNVERIFIED. Booker marks are recorded at end. Users are active with 10,000 cents unless overridden; booker has completed payout setup.

A **pending payout** has status PAYOUT_PENDING, payout out, request time end, destination account pa / user booker / provider provider / bank bank, and a 500-cent RELEASE line for each attended participant. Its payout history contains out; holds remain HELD. Withdrawn, removed and cancelled fixtures default to 500-cent holds committed 48 hours before start; refunded withdrawals settle at withdrawal unless a later time is stated. Scenario values below override these defaults. **State unchanged** refers to the source test’s complete public-state comparison, including roster, financial metadata, queue and payout history.

## Admission and availability

Source: [admission.test.ts](admission.test.ts).

### Record admission

**Input:** Slots, Committed users, Admitted user, Admission state, Queue sequence, Admission time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **2 passed / 2 cases**.

| Slots | Committed users | Admitted user | Admission state | Queue sequence | Admission time | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [8](admission.test.ts#L11) | alice, ben, cara, dana, evan, farah, grace | booker | COMMITTED | Absent | 48 hours before start | Booker lookup is supplied admission instance; all eight entries COMMITTED; available slots 0 | Booker lookup is supplied admission instance; all eight entries COMMITTED; available slots 0 |
| [8](admission.test.ts#L51) | booker, alice, ben, cara, dana, evan, farah, grace | waiting | WAITLISTED | 1 | 48 hours before start | ID lookup and next waiter are supplied waiting instance; committed count 8; next queue sequence 2; available slots 0 | ID lookup and next waiter are supplied waiting instance; committed count 8; next queue sequence 2; available slots 0 |

### Read available slots

**Input:** Session state, Roster, Observation time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Session state | Roster | Observation time | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [OPEN](admission.test.ts#L83) | Empty | Start | 0 | 0 |

## Automatic attendance verification

Source: [attendance.test.ts](attendance.test.ts).

### Automatically verify remaining attendance

**Input:** Committed users, Existing attendance, Verification time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **2 passed / 2 cases**.

| Committed users | Existing attendance | Verification time | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [alice, ben](attendance.test.ts#L9) | alice ABSENT / BOOKER; ben UNVERIFIED | 72 hours after end minus 1 ms | AUTO_VERIFICATION_NOT_DUE; state unchanged | AUTO_VERIFICATION_NOT_DUE; state unchanged |
| [alice, ben](attendance.test.ts#L28) | alice ABSENT / BOOKER; ben UNVERIFIED | 72 hours after end | alice ABSENT / BOOKER; ben ATTENDED / AUTOMATIC | alice ABSENT / BOOKER; ben ATTENDED / AUTOMATIC |

## Session participant pricing

Source: [custom-pricing.test.ts](custom-pricing.test.ts).

### Construct Session with chosen participant price

An OPEN, PUBLIC session uses the shared booking details; the total booking cost and capacity below replace their defaults. Session construction resolves or rejects the booking share.

**Input:** Booking cost (cents), Slots, Chosen share (cents) · **Oracle:** Expected Result · **Log:** Test Result

Execution: **7 passed / 7 cases**.

| Booking cost (cents) | Slots | Chosen share (cents) | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [1001](custom-pricing.test.ts#L16) | 3 | Omitted | 333 | 333 |
| [1001](custom-pricing.test.ts#L27) | 3 | 167 | 167 | 167 |
| [1001](custom-pricing.test.ts#L39) | 3 | 334 | 334 | 334 |
| [1001](custom-pricing.test.ts#L51) | 3 | 666 | 666 | 666 |
| [1001](custom-pricing.test.ts#L63) | 3 | 0 | INVALID_INPUT | INVALID_INPUT |
| [1001](custom-pricing.test.ts#L75) | 3 | 166 | INVALID_INPUT | INVALID_INPUT |
| [1001](custom-pricing.test.ts#L87) | 3 | 667 | INVALID_INPUT | INVALID_INPUT |

### Join at chosen price

**Input:** Joining user, Available funds (cents), Share (cents), Join time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Joining user | Available funds (cents) | Share (cents) | Join time | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- |
| [alice](custom-pricing.test.ts#L101) | 750 | 750 | 48 hours before start | One LOCK for 750 cents; alice hold 750 cents; share 750 cents | One LOCK for 750 cents; alice hold 750 cents; share 750 cents |

### Withdraw at chosen price

**Input:** Committed user, Available funds (cents), Share (cents), Withdrawal time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Committed user | Available funds (cents) | Share (cents) | Withdrawal time | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- |
| [alice](custom-pricing.test.ts#L128) | 750 | 750 | 31 hours before start | One REFUND for 750 cents; alice hold REFUNDED | One REFUND for 750 cents; alice hold REFUNDED |

### Cancel at chosen price

**Input:** Booker, Committed user, Share (cents), Cancellation time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Booker | Committed user | Share (cents) | Cancellation time | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- |
| [booker](custom-pricing.test.ts#L154) | alice | 750 | 30 hours before start | One REFUND for 750 cents; share 750 cents | One REFUND for 750 cents; share 750 cents |

### Prepare payout at chosen price

**Input:** Session state, Attendance, Share (cents), Payout ID, Request time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Session state | Attendance | Share (cents) | Payout ID | Request time | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- |
| [AWAITING_PAYOUT](custom-pricing.test.ts#L172) | alice ATTENDED / BOOKER | 750 | out | End | One RELEASE line for 750 cents; PAYOUT_PENDING; alice hold HELD | One RELEASE line for 750 cents; PAYOUT_PENDING; alice hold HELD |

### Complete payout at chosen price

**Input:** Pending payout, Participant, Share (cents), Completion time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Pending payout | Participant | Share (cents) | Completion time | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- |
| [out](custom-pricing.test.ts#L195) | alice | 750 | End | One RELEASE for 750 cents; alice hold RELEASED | One RELEASE for 750 cents; alice hold RELEASED |

## Restoration and ownership invariants

Source: [reconstruction.test.ts](reconstruction.test.ts).

### Restore session — roster, dates and history isolation

**Input:** Committed users, Payout attempts, Source collection edits, Returned value edits · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Committed users | Payout attempts | Source collection edits | Returned value edits | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- |
| [alice](reconstruction.test.ts#L16) | earlier | Remove roster entry; append leak to payout history | Remove roster and history entries; change start, commitment and hold creation years to 2000 | One roster entry; alice retains original instance; start unchanged; alice commitment and hold creation remain 48 hours before start; attempts earlier; next queue sequence 1 | One roster entry; alice retains original instance; start unchanged; alice commitment and hold creation remain 48 hours before start; attempts earlier; next queue sequence 1 |

### Read pending payout — isolate nested values

**Input:** Pending payout, Participants, Source batch edits, Returned batch edits · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Pending payout | Participants | Source batch edits | Returned batch edits | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- |
| [out](reconstruction.test.ts#L51) | alice | Request year 2000; bank changed; remove line | Request year 2001; bank changed-again; remove line | Request time end; bank bank; one 500-cent line; attempts out | Request time end; bank bank; one 500-cent line; attempts out |

### Complete restored payout independently

**Input:** Pending payout, Participants, Session copies, Completion time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Pending payout | Participants | Session copies | Completion time | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- |
| [out](reconstruction.test.ts#L76) | alice | Original and restored from the same details | End | One RELEASE; restored SETTLED; original PAYOUT_PENDING with alice hold HELD | One RELEASE; restored SETTLED; original PAYOUT_PENDING with alice hold HELD |

### Restore session lifecycle status

Cara joined the waitlist 48 hours before start with sequence 1; the cancelled roster has next queue sequence 2.

**Input:** Session state, Roster states, Hold states · **Oracle:** Expected Result · **Log:** Test Result

Execution: **3 passed / 3 cases**.

| Session state | Roster states | Hold states | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [CANCELLED](reconstruction.test.ts#L99) | alice REMOVED; ben CANCELLED; cara CANCELLED from waitlist | alice REFUNDED 48 hours before start; ben REFUNDED 24 hours before start; cara none | alice REMOVED | alice REMOVED |
| [SETTLED](reconstruction.test.ts#L127) | Empty | None | SETTLED; booking end unchanged | SETTLED; booking end unchanged |
| [SETTLED](reconstruction.test.ts#L136) | alice COMMITTED | alice HELD | DomainError | DomainError |

### Restore roster — unique ownership

Entries with holds are COMMITTED; queue entries without holds are WAITLISTED unless labelled otherwise.

**Input:** Roster user IDs, Participation IDs, Hold IDs, Queue sequences, Next queue sequence · **Oracle:** Expected Result · **Log:** Test Result

Execution: **5 passed / 5 cases**.

| Roster user IDs | Participation IDs | Hold IDs | Queue sequences | Next queue sequence | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- |
| [alice, alice](reconstruction.test.ts#L151) | p-alice, p-alice | h-alice, h-alice | Absent | 1 | DomainError | DomainError |
| [alice, ben](reconstruction.test.ts#L163) | p-shared, p-shared | None | 1, 2 | 3 | DUPLICATE_ID | DUPLICATE_ID |
| [alice, alice](reconstruction.test.ts#L187) | p-alice-first, p-alice-second | None | 1, 2 | 3 | DUPLICATE_ID | DUPLICATE_ID |
| [alice, ben](reconstruction.test.ts#L211) | p-alice, p-ben | h-alice, h-alice | Absent | 1 | DUPLICATE_ID | DUPLICATE_ID |
| [alice LEFT_WAITLIST, ben WAITLISTED](reconstruction.test.ts#L238) | p-alice, p-ben | None | 1, 1 | 2 | DUPLICATE_ID | DUPLICATE_ID |

### Restore queue continuity

**Input:** Waitlisted user, Participation ID, Queue sequence, Next queue sequence · **Oracle:** Expected Result · **Log:** Test Result

Execution: **2 passed / 2 cases**.

| Waitlisted user | Participation ID | Queue sequence | Next queue sequence | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- |
| [queued-user](reconstruction.test.ts#L264) | queued | 5 | 5 | DomainError | DomainError |
| [queued-user](reconstruction.test.ts#L292) | queued | 5 | 6 | Next waiter queued-user | Next waiter queued-user |

### Restore hold account ownership

**Input:** Committed user, Session holding account, Hold holding account · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Committed user | Session holding account | Hold holding account | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [alice](reconstruction.test.ts#L279) | foreign | platform | DomainError | DomainError |

### Restore payout history

Pending and failed-payout inputs contain attended alice with a HELD share. OPEN inputs have an empty roster. History cells are ordered lists unless explicitly marked as a string or omitted.

**Input:** Session state, Pending batch, Attempt history · **Oracle:** Expected Result · **Log:** Test Result

Execution: **5 passed / 5 cases**.

| Session state | Pending batch | Attempt history | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [OPEN](reconstruction.test.ts#L313) | Absent | Omitted | INVALID_INPUT | INVALID_INPUT |
| [OPEN](reconstruction.test.ts#L325) | Absent | String earlier (not a list) | INVALID_INPUT | INVALID_INPUT |
| [PAYOUT_PENDING](reconstruction.test.ts#L334) | out | Omitted | INVALID_INPUT | INVALID_INPUT |
| [AWAITING_PAYOUT](reconstruction.test.ts#L346) | Absent | out | AWAITING_PAYOUT; no pending batch; attempts out; alice hold HELD | AWAITING_PAYOUT; no pending batch; attempts out; alice hold HELD |
| [OPEN](reconstruction.test.ts#L362) | Absent | same, same | DomainError | DomainError |

### Restore pending payout ownership

Session state is PAYOUT_PENDING; a present batch contains alice’s share.

**Input:** Pending batch, Batch session ID, Line wallet, Attempt history · **Oracle:** Expected Result · **Log:** Test Result

Execution: **4 passed / 4 cases**.

| Pending batch | Batch session ID | Line wallet | Attempt history | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- |
| [Absent](reconstruction.test.ts#L370) | — | — | Empty list | DomainError | DomainError |
| [out](reconstruction.test.ts#L376) | foreign | w-alice | out | DomainError | DomainError |
| [out](reconstruction.test.ts#L389) | s | foreign | out | DomainError | DomainError |
| [out](reconstruction.test.ts#L405) | s | w-alice | Empty list | DomainError | DomainError |

## Transition recording

Source: [recording.test.ts](recording.test.ts).

### Record admission against a personal reservation

Alice withdrew 10 hours before start with an AWAITING_REPLACEMENT hold and DIRECT_INVITE. All admissions are COMMITTED nine hours before start; the supplied refund, when present, settles then and retains the invitation to cara.

**Input:** Committed users, Reservation owner, Invitee, Joining user, Replaced participation ID, Supplied refund · **Oracle:** Expected Result · **Log:** Test Result

Execution: **3 passed / 3 cases**.

| Committed users | Reservation owner | Invitee | Joining user | Replaced participation ID | Supplied refund | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [ben](recording.test.ts#L21) | alice | cara | dana | Absent | Absent | CAPACITY_EXCEEDED; state unchanged | CAPACITY_EXCEEDED; state unchanged |
| [None](recording.test.ts#L47) | alice | cara | cara | Absent | Absent | INVALID_STATE; same roster instance; state unchanged; available slots 1 | INVALID_STATE; same roster instance; state unchanged; available slots 1 |
| [None](recording.test.ts#L75) | alice | cara | dana | p-alice | alice REFUNDED | INVALID_STATE; state unchanged | INVALID_STATE; state unchanged |

### Restore capacity including reservations

Alice is WITHDRAWN / REFUNDED with a DIRECT_INVITE reservation.

**Input:** Slots, Committed users, Reservation owner, Invitee, Refund time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Slots | Committed users | Reservation owner | Invitee | Refund time | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- |
| [2](recording.test.ts#L118) | ben, cara | alice | dana | 48 hours before start | CAPACITY_EXCEEDED | CAPACITY_EXCEEDED |

### Record replacement admission with refund proof

Open withdrawals have AWAITING_REPLACEMENT holds. The candidate is COMMITTED; any supplied refund settles at admission time.

**Input:** Open withdrawals, Withdrawal times (hours before start), Joining user, Replaced participation ID, Supplied refund, Admission time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **2 passed / 2 cases**.

| Open withdrawals | Withdrawal times (hours before start) | Joining user | Replaced participation ID | Supplied refund | Admission time | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [alice](recording.test.ts#L139) | 10 | replacement | p-alice | Absent | 9 hours before start | INVALID_STATE; state unchanged | INVALID_STATE; state unchanged |
| [alice, ben](recording.test.ts#L177) | 10, 9 | replacement | p-alice | ben REFUNDED | 8 hours before start | INVALID_STATE; state unchanged | INVALID_STATE; state unchanged |

### Record admission — duplicate hold and retry

**Input:** Committed users, Joining user, First hold ID, Retry hold ID, Admission time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **2 passed / 2 cases**.

| Committed users | Joining user | First hold ID | Retry hold ID | Admission time | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- |
| [alice](recording.test.ts#L229) | ben | h-alice | No retry | 48 hours before start | DUPLICATE_ID; same roster instance; state unchanged; alice ID/user lookups retain original instance; ben user absent and ID lookup NOT_FOUND; committed count 1; next queue sequence 1; no next waiter or open replacement | DUPLICATE_ID; same roster instance; state unchanged; alice ID/user lookups retain original instance; ben user absent and ID lookup NOT_FOUND; committed count 1; next queue sequence 1; no next waiter or open replacement |
| [alice](recording.test.ts#L270) | ben | h-alice | h-ben | 48 hours before start | First attempt DUPLICATE_ID; retry creates different roster instance; ben ID/user lookups are supplied valid instance; committed count 2; previous roster still only original alice, ben absent, committed count 1, next queue sequence 1 | First attempt DUPLICATE_ID; retry creates different roster instance; ben ID/user lookups are supplied valid instance; committed count 2; previous roster still only original alice, ben absent, committed count 1, next queue sequence 1 |

### Record seat admission — lifecycle, capacity and queue guards

**Input:** Committed users, Waiting user, Joining user, Admission time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **3 passed / 3 cases**.

| Committed users | Waiting user | Joining user | Admission time | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- |
| [None](recording.test.ts#L307) | None | alice | Start | SESSION_STARTED; state unchanged | SESSION_STARTED; state unchanged |
| [alice, ben](recording.test.ts#L327) | None | cara | 48 hours before start | CAPACITY_EXCEEDED; state unchanged | CAPACITY_EXCEEDED; state unchanged |
| [ben](recording.test.ts#L344) | waiting | newcomer | 48 hours before start | WAITLIST_NOT_HEAD; state unchanged; next waiter waiting | WAITLIST_NOT_HEAD; state unchanged; next waiter waiting |

### Record waitlist admission — reject departed user reuse

The prior entry is LEFT_WAITLIST. Admission and both waitlist dates are 48 hours before start; next queue sequence is 2.

**Input:** Committed users, Departed user, Historical participation ID, Historical queue sequence, New participation ID, New queue sequence · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Committed users | Departed user | Historical participation ID | Historical queue sequence | New participation ID | New queue sequence | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [alice, ben](recording.test.ts#L365) | waiting | p-waiting | 1 | p-new-waiting | 2 | DUPLICATE_ID; state unchanged | DUPLICATE_ID; state unchanged |

### Record participation transition — preserve withdrawal choice

The session contains only withdrawn alice; the proposed participation retains all other existing values.

**Input:** Existing mode, Existing invitee, Hold state, Withdrawal time, Requested mode, Requested invitee, Transition time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **2 passed / 2 cases**.

| Existing mode | Existing invitee | Hold state | Withdrawal time | Requested mode | Requested invitee | Transition time | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [DIRECT_INVITE](recording.test.ts#L403) | ben | REFUNDED | 40 hours before start | OPEN_SLOT | Absent | 39 hours before start | INVALID_STATE; same roster instance; state unchanged | INVALID_STATE; same roster instance; state unchanged |
| [OPEN_SLOT](recording.test.ts#L440) | Absent | AWAITING_REPLACEMENT | 10 hours before start | DIRECT_INVITE | ben | 9 hours before start | INVALID_STATE; same roster instance; state unchanged | INVALID_STATE; same roster instance; state unchanged |

### Record participation transition — source and identity guards

The stale-source case first records alice’s withdrawal, then attempts removal with the original committed instance. In the cancelled case the entry was waitlisted 48 hours before start and next queue sequence is 2.

**Input:** Session state, Current user/state, Supplied source state, Proposed user/state, Transition time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **3 passed / 3 cases**.

| Session state | Current user/state | Supplied source state | Proposed user/state | Transition time | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- |
| [OPEN](recording.test.ts#L476) | alice WITHDRAWN / REFUNDED | Earlier alice COMMITTED / HELD | alice REMOVED / REFUNDED | 48 hours before start | INVALID_STATE; state unchanged from after the preceding withdrawal | INVALID_STATE; state unchanged from after the preceding withdrawal |
| [OPEN](recording.test.ts#L506) | alice COMMITTED / HELD | Current alice COMMITTED / HELD | other REMOVED / REFUNDED | 48 hours before start | INVALID_INPUT; state unchanged | INVALID_INPUT; state unchanged |
| [CANCELLED](recording.test.ts#L526) | waiting CANCELLED | Earlier waiting WAITLISTED, queue 1 | waiting LEFT_WAITLIST, queue 1 | Omitted | SESSION_CLOSED; state unchanged | SESSION_CLOSED; state unchanged |

### Record session cancellation

Supplied cancelled participations contain refunds settled at cancellation time.

**Input:** Committed users, Supplied cancelled users, Cancellation time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **2 passed / 2 cases**.

| Committed users | Supplied cancelled users | Cancellation time | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [alice, ben](recording.test.ts#L560) | alice | 48 hours before start | INVALID_INPUT; state unchanged | INVALID_INPUT; state unchanged |
| [alice](recording.test.ts#L579) | alice | Start | SESSION_STARTED; state unchanged | SESSION_STARTED; state unchanged |

### Record attendance

All proposed marks are BOOKER-verified at the indicated time; alice’s existing mark was recorded at end.

**Input:** Existing roster attendance, Submitted marks in order, Verification time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **3 passed / 3 cases**.

| Existing roster attendance | Submitted marks in order | Verification time | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [alice UNVERIFIED](recording.test.ts#L595) | alice ATTENDED, alice ATTENDED | End | DUPLICATE_ID; state unchanged | DUPLICATE_ID; state unchanged |
| [alice UNVERIFIED](recording.test.ts#L613) | alice ATTENDED | 48 hours before start | SESSION_NOT_ENDED; state unchanged | SESSION_NOT_ENDED; state unchanged |
| [alice ATTENDED / BOOKER; ben UNVERIFIED](recording.test.ts#L628) | ben ATTENDED, existing alice ATTENDED | End | ATTENDANCE_CONFLICT; state unchanged; ben UNVERIFIED | ATTENDANCE_CONFLICT; state unchanged; ben UNVERIFIED |

### Record settlement preparation

Submitted roster is the current roster. The incomplete batch uses the pending payout defaults but omits ben’s line.

**Input:** Session state, Participants, Payout ID, Supplied batch lines, Request time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **3 passed / 3 cases**.

| Session state | Participants | Payout ID | Supplied batch lines | Request time | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- |
| [OPEN](recording.test.ts#L660) | None | out | No batch | 48 hours before start | SESSION_NOT_ENDED; state unchanged | SESSION_NOT_ENDED; state unchanged |
| [AWAITING_PAYOUT](recording.test.ts#L676) | alice ATTENDED | out | No batch | End | INVALID_STATE; state unchanged | INVALID_STATE; state unchanged |
| [AWAITING_PAYOUT](recording.test.ts#L697) | alice ATTENDED, ben ATTENDED | out | alice RELEASE only | End | INVALID_INPUT; state unchanged | INVALID_INPUT; state unchanged |

## Replacement history restoration

Source: [replacement-hydration.test.ts](replacement-hydration.test.ts).

Defaults for this section: alice withdrew and was refunded 40 hours before start, retaining a DIRECT_INVITE to ben. A committed replacement joined 39 hours before start with a 500-cent HELD share; its replaced participation ID is p-alice. Overrides below describe deliberate invalid history and subsequent departures.

### Restore replacement ownership and refund proof

For the unrefunded invitation, alice withdrew 10 hours before start. The cancelled original was refunded 40 hours before start. The departed waiter joined 48 hours before start with sequence 1 and next sequence 2.

**Input:** Original user/state, Original hold state, Named invitee, Replacement user/state, Replaced participation ID, Replacement commitment/hold · **Oracle:** Expected Result · **Log:** Test Result

Execution: **6 passed / 6 cases**.

| Original user/state | Original hold state | Named invitee | Replacement user/state | Replaced participation ID | Replacement commitment/hold | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [Missing](replacement-hydration.test.ts#L14) | None | None | ben COMMITTED | p-missing | 39 hours before start / HELD | INVALID_INPUT | INVALID_INPUT |
| [alice WITHDRAWN](replacement-hydration.test.ts#L23) | REFUNDED | ben | ben LEFT_WAITLIST | p-alice | None / none | INVALID_INPUT | INVALID_INPUT |
| [alice WITHDRAWN](replacement-hydration.test.ts#L44) | REFUNDED | ben | cara COMMITTED | p-alice | 39 hours before start / HELD | INVALID_INPUT | INVALID_INPUT |
| [alice WITHDRAWN](replacement-hydration.test.ts#L56) | AWAITING_REPLACEMENT | ben | ben COMMITTED | p-alice | 39 hours before start / HELD | INVALID_INPUT | INVALID_INPUT |
| [alice CANCELLED](replacement-hydration.test.ts#L78) | REFUNDED | Absent | ben COMMITTED | p-alice | 39 hours before start / HELD | INVALID_INPUT | INVALID_INPUT |
| [alice WITHDRAWN](replacement-hydration.test.ts#L99) | REFUNDED | ben | ben REMOVED | p-alice | None / none | INVALID_INPUT | INVALID_INPUT |

### Restore consumed invitation history

**Input:** Session state, Original participation state, Replacement state, Replacement hold, Later departure time, Availability check time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **4 passed / 4 cases**.

| Session state | Original participation state | Replacement state | Replacement hold | Later departure time | Availability check time | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [OPEN](replacement-hydration.test.ts#L119) | alice WITHDRAWN | ben COMMITTED | HELD | None | 38 hours before start | Reserved count 0; no invitation for ben; committed count 1; available slots 1 | Reserved count 0; no invitation for ben; committed count 1; available slots 1 |
| [OPEN](replacement-hydration.test.ts#L134) | alice WITHDRAWN | ben WITHDRAWN / OPEN_SLOT | AWAITING_REPLACEMENT | 10 hours before start | 9 hours before start | Reserved count 0; no invitation for ben; ben still replaces p-alice; available slots 2 | Reserved count 0; no invitation for ben; ben still replaces p-alice; available slots 2 |
| [OPEN](replacement-hydration.test.ts#L162) | alice WITHDRAWN | ben REMOVED | REFUNDED | 38 hours before start | 37 hours before start | Reserved count 0; no invitation for ben; ben still replaces p-alice; available slots 2 | Reserved count 0; no invitation for ben; ben still replaces p-alice; available slots 2 |
| [CANCELLED](replacement-hydration.test.ts#L189) | alice CANCELLED; invitation metadata absent | ben CANCELLED | REFUNDED | 38 hours before start | Not checked | CANCELLED; reserved count 0; no invitation for ben; ben still replaces p-alice; alice hold REFUNDED | CANCELLED; reserved count 0; no invitation for ben; ben still replaces p-alice; alice hold REFUNDED |

## Payout settlement

Source: [settlement.test.ts](settlement.test.ts).

### Complete payout — reject invalid callback or batch

**Input:** Pending participants, Batch lines, Callback payout ID, Completion time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **3 passed / 3 cases**.

| Pending participants | Batch lines | Callback payout ID | Completion time | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- |
| [alice, ben](settlement.test.ts#L21) | alice RELEASE only | out | End | INVALID_INPUT; state unchanged; same roster instance; PAYOUT_PENDING; attempts out; both holds HELD | INVALID_INPUT; state unchanged; same roster instance; PAYOUT_PENDING; attempts out; both holds HELD |
| [alice, ben](settlement.test.ts#L45) | alice RELEASE, ben RELEASE | stale | End | STALE_PAYOUT; state unchanged | STALE_PAYOUT; state unchanged |
| [alice, ben](settlement.test.ts#L55) | alice RELEASE, ben RELEASE | out | Invalid date | DomainError; state unchanged | DomainError; state unchanged |

### Complete payout — release and forfeiture

Alice withdrew two hours before start; ben was BOOKER-verified at end. Both shares are 500 cents.

**Input:** Participant states, Hold states, Batch line kinds, Callback payout ID, Completion time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Participant states | Hold states | Batch line kinds | Callback payout ID | Completion time | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- |
| [alice WITHDRAWN; ben COMMITTED / ATTENDED](settlement.test.ts#L65) | FORFEITURE_DUE, HELD | FORFEIT, RELEASE | out | End | Instructions FORFEIT, RELEASE, both payout out; SETTLED; holds FORFEITED, RELEASED | Instructions FORFEIT, RELEASE, both payout out; SETTLED; holds FORFEITED, RELEASED |

### Read settled reliability outcomes

Alice withdrew two hours before start; both holds settled at end with payout out. Payout history is out.

**Input:** Session state, Participant states, Hold states, Evaluation time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Session state | Participant states | Hold states | Evaluation time | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- |
| [SETTLED](settlement.test.ts#L102) | alice WITHDRAWN; ben COMMITTED / ATTENDED | alice FORFEITED; ben RELEASED | End | alice reliability value 0 | alice reliability value 0 |

### Complete payout — injected failure and retry

**Input:** Pending participants, Callback payout ID, Injected settlement failure, Retry, Completion time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **2 passed / 2 cases**.

| Pending participants | Callback payout ID | Injected settlement failure | Retry | Completion time | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- |
| [alice, ben](settlement.test.ts#L142) | out | ben: INVALID_STATE / Second line rejected | None | End | INVALID_STATE; message Second line rejected; state unchanged | INVALID_STATE; message Second line rejected; state unchanged |
| [alice, ben](settlement.test.ts#L173) | out | ben: INVALID_STATE / Second line rejected, once | Same payout after failure removed | End | First attempt INVALID_STATE / Second line rejected; retry returns two instructions; both holds RELEASED; pending batch absent | First attempt INVALID_STATE / Second line rejected; retry returns two instructions; both holds RELEASED; pending batch absent |

### Complete payout — use current retry identity

**Input:** Pending participant, Attempt history, Current payout, Callback payout ID, Completion time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Pending participant | Attempt history | Current payout | Callback payout ID | Completion time | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- |
| [alice](settlement.test.ts#L215) | out, retry | retry | retry | End | One instruction partially matching RELEASE / p-alice / payout retry; alice hold RELEASED with payout retry; SETTLED; no pending batch | One instruction partially matching RELEASE / p-alice / payout retry; alice hold RELEASED with payout retry; SETTLED; no pending batch |

### Record payout failure

**Input:** Pending participants, Failed payout ID, Failure time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Pending participants | Failed payout ID | Failure time | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [alice, ben](settlement.test.ts#L246) | out | End | AWAITING_PAYOUT; no pending batch; same roster instance; attempts out; both holds HELD | AWAITING_PAYOUT; no pending batch; same roster instance; attempts out; both holds HELD |

## Fixture contracts

Source: [session-fixtures.test.ts](session-fixtures.test.ts).

### Construct session with declared attendance and price

**Input:** Committed users, Slots, Chosen share (cents), Attendance marks · **Oracle:** Expected Result · **Log:** Test Result

Execution: **3 passed / 3 cases**.

| Committed users | Slots | Chosen share (cents) | Attendance marks | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- |
| [alice, ben](session-fixtures.test.ts#L16) | 2 | Omitted | alice ABSENT | OPEN; alice ABSENT, verified at end by BOOKER; ben UNVERIFIED with no verification time | OPEN; alice ABSENT, verified at end by BOOKER; ben UNVERIFIED with no verification time |
| [alice, ben](session-fixtures.test.ts#L33) | 3 | Omitted | ben ATTENDED | Share 333 cents; holds 333, 333 cents | Share 333 cents; holds 333, 333 cents |
| [alice, ben](session-fixtures.test.ts#L48) | 2 | 750 | ben ATTENDED | Share 750 cents; holds 750, 750 cents | Share 750 cents; holds 750, 750 cents |

### Construct session with roster override

**Input:** Committed users, Waitlisted users, Overridden user, Replacement participation · **Oracle:** Expected Result · **Log:** Test Result

Execution: **3 passed / 3 cases**.

| Committed users | Waitlisted users | Overridden user | Replacement participation | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- |
| [alice, ben](session-fixtures.test.ts#L63) | cara, dan | alice | alice WITHDRAWN / AWAITING_REPLACEMENT / OPEN_SLOT, 10 hours before start | Roster alice, ben, cara, dan; alice is supplied override instance; cara queue 1; dan queue 2; next queue sequence 3 | Roster alice, ben, cara, dan; alice is supplied override instance; cara queue 1; dan queue 2; next queue sequence 3 |
| [alice](session-fixtures.test.ts#L84) | None | outsider | outsider LEFT_WAITLIST, queue 1 | Error message contains: Participation override must match a roster user: outsider | Error message contains: Participation override must match a roster user: outsider |
| [None](session-fixtures.test.ts#L93) | alice | alice | ben LEFT_WAITLIST, queue 1 | Error message contains: Participation override must match a roster user: alice | Error message contains: Participation override must match a roster user: alice |

### Construct independent session fixtures

**Input:** Committed users in each fixture, Construction count · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Committed users in each fixture | Construction count | Expected Result | Test Result |
| --- | --- | --- | --- |
| [alice](session-fixtures.test.ts#L102) | 2 | Different session, alice participation and hold instances | Different session, alice participation and hold instances |

### Construct withdrawn participation fixture

**Input:** User, Hold state, Withdrawal time, Replaced participation ID, Replacement mode/invitee, Holding account, Share (cents) · **Oracle:** Expected Result · **Log:** Test Result

Execution: **2 passed / 2 cases**.

| User | Hold state | Withdrawal time | Replaced participation ID | Replacement mode/invitee | Holding account | Share (cents) | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [alice](session-fixtures.test.ts#L116) | REFUNDED | 40 hours before start | previous-participation | Absent | custom-platform | 750 | WITHDRAWN; replaces previous-participation; custom-platform hold 750 cents, REFUNDED at withdrawal time | WITHDRAWN; replaces previous-participation; custom-platform hold 750 cents, REFUNDED at withdrawal time |
| [alice](session-fixtures.test.ts#L133) | AWAITING_REPLACEMENT | 10 hours before start | Absent | DIRECT_INVITE / ben | platform | 500 | DIRECT_INVITE to ben; hold 500 cents, AWAITING_REPLACEMENT; no settlement date | DIRECT_INVITE to ben; hold 500 cents, AWAITING_REPLACEMENT; no settlement date |

### Construct removed participation fixture

**Input:** User, Replaced participation ID, Refund time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| User | Replaced participation ID | Refund time | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [ben](session-fixtures.test.ts#L148) | p-alice | 38 hours before start | REMOVED; replaces p-alice; REFUNDED 38 hours before start | REMOVED; replaces p-alice; REFUNDED 38 hours before start |

### Construct cancelled participation fixture

**Input:** User, Replaced participation ID, Refund time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| User | Replaced participation ID | Refund time | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [ben](session-fixtures.test.ts#L162) | p-alice | 38 hours before start | CANCELLED; replaces p-alice; REFUNDED 38 hours before start | CANCELLED; replaces p-alice; REFUNDED 38 hours before start |

### Construct departed waitlist fixture

**Input:** User, Queue sequence, Original waitlist time · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| User | Queue sequence | Original waitlist time | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [cara](session-fixtures.test.ts#L176) | 7 | 42 hours before start | LEFT_WAITLIST; queue 7; waited 42 hours before start; no hold | LEFT_WAITLIST; queue 7; waited 42 hours before start; no hold |

### Construct pending payout fixture

**Input:** Participants, Share (cents), Payout ID option · **Oracle:** Expected Result · **Log:** Test Result

Execution: **2 passed / 2 cases**.

| Participants | Share (cents) | Payout ID option | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [alice](session-fixtures.test.ts#L187) | Omitted (500) | Omitted (out) | Payout out; first line 500 cents; attempts out; pending batch has no request key; Session has no request-key history | Payout out; first line 500 cents; attempts out; pending batch has no request key; Session has no request-key history |
| [alice, ben](session-fixtures.test.ts#L199) | 750 | original-payout | PAYOUT_PENDING; payout original-payout; lines 750, 750 cents; holds 750, 750 cents; attempts original-payout; pending batch has no request key; Session has no request-key history | PAYOUT_PENDING; payout original-payout; lines 750, 750 cents; holds 750, 750 cents; attempts original-payout; pending batch has no request key; Session has no request-key history |
