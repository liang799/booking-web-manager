# Use case descriptions: UC2-04, UC2-05, UC2-06

Use case model for the commitment, withdrawal and attendance part of Booking Web Manager, as submitted in the SRS (Lab 1 and Lab 2 deliverables, last updated 19/10/2026). The use-case diagram for all of UC2 is [uc2-session-management.png](../../docs/diagrams/use-case/uc2-session-management.png).

Author: Yajie Wang (UC2-04, UC2-05, UC2-06).

## UC2-04 Commit to Session

| Field | Value |
| --- | --- |
| Use case ID | UC2-04 |
| Use case name | Commit to Session |
| Created by | Group 3 |
| Last updated by | Group 3 |
| Date created | 26/08/2026 |
| Date last updated | 19/10/2026 |
| Actor | Participant (Initiating Actor) |
| Priority | High |
| Frequency of use | High |
| Includes | None |

**Description:** A participant joins an open session by locking their booking share from their in-app wallet balance into the session holding account. If full, the user may join a FIFO waitlist

**Preconditions:** Participant is authenticated, session is "Open", participant meets Booker's reliability score threshold, and available wallet balance >= booking share

**Postconditions:** Booking share is atomically transferred from available balance to session holding account in the internal ledger (‘money_available’ -> ‘money_locked’), and slot is allocated

**Flow of events:**

1. Participant views the session room and selects "Commit to Session"
2. System validates participant's reliability score against the Booker's minimum threshold
3. System initiates an atomic database transaction with a row lock on the user's wallet (‘FOR UPDATE’)
4. System verifies participant has sufficient available wallet balance (‘available_balance >= booking_share’)
5. System appends a LOCK ledger entry debiting ‘money_available’ and crediting ‘money_locked’ in the session holding account
6. System creates a commitment record and decrements available slots by 1
7. System commits the database transaction and displays confirmation to Participant

**Alternative flows:**

- AF-1a: Session Full (Join Waitlist)
    1. System detects available slot count is 0
    2. System displays prompt: "Session full. Join waitlist?"
    3. Participant confirms joining the waitlist
    4. System checks that participant has sufficient available balance (no financial lock is placed yet)
    5. System adds Participant to the session's FIFO waitlist queue with an exact timestamp
    6. System displays waitlist queue position
- AF-6a: Waitlist FIFO Promotion (Triggered on Vacancy)
    - [Initiating Actor: NULL (Triggered by system event upon cancellation/withdrawal)]
    1. A slot is vacated. System retrieves the earliest waitlisted participant from FIFO queue
    2. System initiates atomic database transaction with row-level lock on the waitlisted user's wallet
    3. System verifies wallet balance and appends a LOCK ledger entry.
    4. System updates user status to "Committed" and assigns the slot
    5. System dispatches a push notification informing the user of successful promotion
- AF-1b: Leave Waitlist
    1. Waitlisted participant selects "Leave Waitlist" from dashboard
    2. System removes participant from waitlist queue without financial impact

**Exceptions:**

- EX-2a: Score Below Threshold
    1. System determines user reliability score < Booker's threshold
    2. System rejects commitment and displays minimum score requirement
- EX-4a: Insufficient Wallet Balance
    1. System detects ‘available_balance < booking_share’
    2. System displays insufficient balance modal and prompts user to top up via UC1-05
- EX-AF6a: Promoted Waitlist User Has Insufficient Balance
    1. During waitlist promotion, system discovers promoted user spent their balance elsewhere
    2. System removes user from waitlist, sends a "Promotion Skipped" alert, and immediately promotes the next user in queue

**Special requirements:** Commitment insertion and fund locking must execute in a single atomic database transaction

**Assumptions:** Users consent to automatic fund locking when joining the waitlist if promoted

**Notes and issues:** None

## UC2-05 Withdraw from Session

| Field | Value |
| --- | --- |
| Use case ID | UC2-05 |
| Use case name | Withdraw from Session |
| Created by | Group 3 |
| Last updated by | Group 3 |
| Date created | 26/08/2026 |
| Date last updated | 19/10/2026 |
| Actor | Participant (Initiating Actor) |
| Priority | Medium |
| Frequency of use | Low |
| Includes | None |

**Description:** A committed participant leaves an upcoming session. The system evaluates the 30-hour rule to determine whether the booking share is immediately refunded or held pending a replacement

**Preconditions:** Participant is currently committed to an upcoming session whose start time has not passed

**Postconditions:** Participant's commitment is removed. Funds are either immediately refunded to the in-app wallet (>= 30h) or held pending replacement (< 30h)

**Flow of events:**

1. Participant selects "Withdraw" from their active booking
2. System checks current time against session start time and determines start time is >= 30 hours away
3. System displays confirmation message indicating immediate 100% wallet refund
4. Participant confirms withdrawal
5. System executes an atomic transaction:
    - Marks participant status as "Withdrawn"
    - Appends a REFUND ledger entry moving booking share from holding account back to participant's available balance (‘money_locked’ -> ‘money_available’)
    - Increments available slot count
6. System checks for waitlist, if present, triggers FIFO waitlist promotion (UC2-04 AF-6a)
7. System displays confirmation to Participant

**Alternative flows:**

- AF-2a: Late Withdrawal (< 30 Hours - Awaiting Replacement)
    1. System determines session start time is < 30 hours away
    2. System displays notice: "Late withdrawal. Your share remains locked in the holding account until a replacement player joins."
    3. Participant confirms withdrawal
    4. System updates participant status to "Awaiting Replacement". Slot is opened for public discovery / replacement
    5. A replacement participant successfully commits with full booking share locked.
    6. System detects funded replacement, updates original participant status to "Refunded", and appends a REFUND ledger entry releasing the original held share to their available balance
    7. System notifies original participant
- AF-2b: Late Withdrawal Without Replacement (Forfeiture)
    1. Follows AF-2a through Step 4
    2. Session start time arrives without a replacement filling the slot
    3. System updates participant status to "Forfeited"
    4. Held share remains in holding account to be settled to the Booker upon attendance verification (UC2-06)

**Exceptions:**

- EX-1a: Withdrawal Attempt Past Session Start Time
    1. System detects current time is past session start time
    2. System rejects withdrawal request. Use case aborts

**Special requirements:** Financial state changes (early refund, replacement swap, forfeiture) must update the ledger atomically

**Assumptions:** Replacement refunds follow a strict first-withdrawn, first-refunded queue logic

**Notes and issues:** None

## UC2-06 Verify Attendance

| Field | Value |
| --- | --- |
| Use case ID | UC2-06 |
| Use case name | Verify Attendance |
| Created by | Group 3 |
| Last updated by | Group 3 |
| Date created | 26/08/2026 |
| Date last updated | 19/10/2026 |
| Actor | Booker (Initiating Actor), Stripe API (External) |
| Priority | High |
| Frequency of use | High |
| Includes | None |

**Description:** The Booker records participant attendance after the session concludes, triggering the platform payout of held funds to the Booker's external bank account via Stripe Connect

**Preconditions:** Scheduled session end time has elapsed. Booker has linked a verified Stripe payout account

**Postconditions:** Session state is set to "Settled", participant reliability scores are updated, and funds in the holding account are disbursed to the Booker's bank account via Stripe API

**Flow of events:**

1. Booker opens the completed session dashboard
2. Booker marks each participant as "Attended" or "Absent"
3. Booker submits the attendance verification
4. System updates participants' historical attendance records and recalculates reliability scores
5. System executes ledger settlement entries, releasing held funds from the holding account
6. System triggers a Stripe Transfer (‘/app/payouts’) transferring the verified and forfeited amounts from the platform account to the Booker's linked external bank account
7. System marks session status as "Settled" and displays payout summary to Booker

**Alternative flows:**

- AF-1a: 72-Hour Automated Verification (Cron Triggered)
    - [Initiating Actor: NULL (Triggered by system timer scheduler)]
    1. System automated job detects a session completed > 72 hours ago without Booker verification
    2. System automatically marks all committed participants as "Attended"
    3. System executes Steps 4, 5, 6, and 7 of the main flow automatically

**Exceptions:**

- EX-6a: Stripe Payout Transfer Failure
    1. Stripe API returns a transfer error (e.g. invalid external bank account or restricted payout status)
    2. System flags session settlement as "Payout Failed" for administrative review, funds remain secured in the holding account
    3. System alerts Booker to check their connected payout details

**Special requirements:** Payout requests must be idempotent to prevent duplicate bank transfers, funds move through the ledger interface prior to external API dispatch

**Assumptions:** None

**Notes and issues:** None
