# Finance test cases

Snapshot: **2026-10-24** · **55 cases, 55 passed**. See the [domain testing guide](../README.md) and [execution evidence](../results/README.md).

Each row is one test case. The first input value links to its test definition. Input columns precede **Expected Result** (Oracle) and **Test Result** (Log). Test Result records only assertion-verified outcomes from the passing snapshot, not captured runtime payloads. Matching result cells are expected for passing cases; partial matches, identity checks and approximate comparisons retain their stated limits.

## HoldingAccount constructor — identity


**Input:** Holding account ID · **Oracle:** Expected Result · **Log:** Test Result

Execution: **2 passed / 2 cases**.

| Holding account ID | Expected Result | Test Result |
| --- | --- | --- |
| [`platform`](holding-account.test.ts#L5) | Holding account ID: platform | Holding account ID: platform |
| [`" "`](holding-account.test.ts#L13) | Throws DomainError | Throws DomainError |

## LedgerTransaction constructor — identity and references

Unless overridden, the transaction is `transaction`, wallet `wallet`, kind TOP_UP, amount 500 cents, idempotency key `key`, dated 2026-10-01 00:00 UTC. Optional hold, payout and external references are absent.

**Input:** Transaction ID, Idempotency key, Wallet ID, Hold ID, Payout ID, External reference · **Oracle:** Expected Result · **Log:** Test Result

Execution: **6 passed / 6 cases**.

| Transaction ID | Idempotency key | Wallet ID | Hold ID | Payout ID | External reference | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [`" "`](ledger-transaction.test.ts#L11) | key | wallet | Absent | Absent | Absent | Throws DomainError | Throws DomainError |
| [transaction](ledger-transaction.test.ts#L17) | `" "` | wallet | Absent | Absent | Absent | Throws DomainError | Throws DomainError |
| [transaction](ledger-transaction.test.ts#L23) | key | `" "` | Absent | Absent | Absent | Throws DomainError | Throws DomainError |
| [transaction](ledger-transaction.test.ts#L29) | key | wallet | `" "` | Absent | Absent | Throws DomainError | Throws DomainError |
| [transaction](ledger-transaction.test.ts#L35) | key | wallet | Absent | `" "` | Absent | Throws DomainError | Throws DomainError |
| [transaction](ledger-transaction.test.ts#L41) | key | wallet | Absent | Absent | `" "` | Throws DomainError | Throws DomainError |

## LedgerTransaction constructor — financial facts

Identity and reference defaults are the same as above.

**Input:** Amount (cents), Kind, Occurred at · **Oracle:** Expected Result · **Log:** Test Result

Execution: **4 passed / 4 cases**.

| Amount (cents) | Kind | Occurred at | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [0](ledger-transaction.test.ts#L65) | TOP_UP | 2026-10-01 | Throws DomainError | Throws DomainError |
| [−1](ledger-transaction.test.ts#L71) | TOP_UP | 2026-10-01 | Throws DomainError | Throws DomainError |
| [500](ledger-transaction.test.ts#L77) | UNKNOWN | 2026-10-01 | Throws DomainError | Throws DomainError |
| [500](ledger-transaction.test.ts#L85) | TOP_UP | Invalid Date | Throws RangeError | Throws RangeError |

## LedgerTransaction.occurredAt — date isolation

Construct the default transaction above, then set both its supplied date and returned date to epoch 0.

**Input:** Original occurred-at date, Replacement timestamp (ms) · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Original occurred-at date | Replacement timestamp (ms) | Expected Result | Test Result |
| --- | --- | --- | --- |
| [2026-10-01](ledger-transaction.test.ts#L49) | 0 | Transaction transaction; wallet wallet; kind TOP_UP; key key; amount 500 cents; occurred-at date 2026-10-01 | Transaction transaction; wallet wallet; kind TOP_UP; key key; amount 500 cents; occurred-at date 2026-10-01 |

## PayoutAttempt constructor — provider outcome metadata

The common batch is payout `payout`, session `session`, key `key`, requested at **2026-10-10 12:00 UTC**. It totals 100 cents and has one RELEASE line: hold `hold`, participation `participation`, holding account `platform`, wallet `wallet`, 100 cents. Destination: payout account `account`, user `booker`, provider account `provider`, bank `bank`. Unless specified, state is REQUESTED and completion/failure metadata is absent. Dates labelled request time mean the timestamp above.

**Input:** Payout status, Completed at, Provider reference, Failed at, Failure reason · **Oracle:** Expected Result · **Log:** Test Result

Execution: **6 passed / 6 cases**.

| Payout status | Completed at | Provider reference | Failed at | Failure reason | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- |
| [COMPLETED](payout-attempt.test.ts#L14) | Absent | Absent | Absent | Absent | Throws DomainError | Throws DomainError |
| [COMPLETED](payout-attempt.test.ts#L20) | Request time | `" "` | Absent | Absent | Throws DomainError | Throws DomainError |
| [FAILED](payout-attempt.test.ts#L30) | Absent | Absent | Request time | Absent | Throws DomainError | Throws DomainError |
| [FAILED](payout-attempt.test.ts#L36) | Request time | Absent | Request time | failure | Throws DomainError | Throws DomainError |
| [REQUESTED](payout-attempt.test.ts#L47) | Request time | Absent | Absent | Absent | Throws DomainError | Throws DomainError |
| [REQUESTED](payout-attempt.test.ts#L53) | Absent | provider | Absent | Absent | Throws DomainError | Throws DomainError |

## PayoutAttempt constructor — settlement batch integrity

Use the common requested batch above, changing only the listed fields.

**Input:** Total amount (cents), Payout account ID, Release lines (hold: cents) · **Oracle:** Expected Result · **Log:** Test Result

Execution: **4 passed / 4 cases**.

| Total amount (cents) | Payout account ID | Release lines (hold: cents) | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [99](payout-attempt.test.ts#L61) | account | hold: 100 | Throws DomainError | Throws DomainError |
| [100](payout-attempt.test.ts#L67) | foreign | hold: 100 | Throws DomainError | Throws DomainError |
| [100](payout-attempt.test.ts#L73) | account | None | Throws DomainError | Throws DomainError |
| [100](payout-attempt.test.ts#L79) | account | hold: 100; hold: 100 (duplicated) | Throws DomainError | Throws DomainError |

## PayoutAttempt constructor — settlement data isolation

Start with the common batch in COMPLETED state, completed at request time with provider reference `provider`. Mutate both supplied and returned completion dates to epoch 0, both bank references to `changed`, and remove the release line from both supplied and returned arrays.

**Input:** Completed at, Bank reference, Release amount (cents) · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Completed at | Bank reference | Release amount (cents) | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [2026-10-10 12:00 UTC](payout-attempt.test.ts#L88) | bank | 100 | Completed at 2026-10-10 12:00 UTC; bank bank; exactly one line, amount 100 cents | Completed at 2026-10-10 12:00 UTC; bank bank; exactly one line, amount 100 cents |

## PayoutAttempt.create — request date isolation

Create the common batch, then set both supplied and returned request dates to epoch 0.

**Input:** Requested at, Release amount (cents), Replacement timestamp (ms) · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Requested at | Release amount (cents) | Replacement timestamp (ms) | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [2026-10-10 12:00 UTC](payout-attempt.test.ts#L119) | 100 | 0 | Amount 100 cents; requested at 2026-10-10 12:00 UTC | Amount 100 cents; requested at 2026-10-10 12:00 UTC |

## PayoutAttempt.requestedIntent — durable request

Read the intent of the common REQUESTED batch.

**Input:** Payout ID, Total amount (cents), Payout status · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Payout ID | Total amount (cents) | Payout status | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [payout](payout-attempt.test.ts#L131) | 100 | REQUESTED | Contains kind PAYOUT_REQUESTED and payout ID payout (partial match); amount 100 cents | Contains kind PAYOUT_REQUESTED and payout ID payout (partial match); amount 100 cents |

## PayoutAttempt.complete — provider callbacks

All callbacks occur at request time. Restored completed/failed states use that same completion/failure timestamp and the common 100-cent batch.

**Input:** Initial status, Stored provider reference, Stored failure reason, Callback provider reference, Callback count · **Oracle:** Expected Result · **Log:** Test Result

Execution: **5 passed / 5 cases**.

| Initial status | Stored provider reference | Stored failure reason | Callback provider reference | Callback count | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- |
| [FAILED](payout-attempt.test.ts#L145) | Absent | failure | provider | 1 | Throws error with code STALE_PAYOUT | Throws error with code STALE_PAYOUT |
| [REQUESTED](payout-attempt.test.ts#L158) | Absent | Absent | provider-result | 2 | Returns true, then false; status COMPLETED; provider reference provider-result | Returns true, then false; status COMPLETED; provider reference provider-result |
| [COMPLETED](payout-attempt.test.ts#L173) | provider-result | Absent | other-result | 1 | Throws error with code PAYOUT_CONFLICT | Throws error with code PAYOUT_CONFLICT |
| [COMPLETED](payout-attempt.test.ts#L185) | provider-result | Absent | provider-result | 1 | Returns false; status COMPLETED; amount 100 cents; provider reference provider-result | Returns false; status COMPLETED; amount 100 cents; provider reference provider-result |
| [FAILED](payout-attempt.test.ts#L206) | Absent | timeout | late | 1 | Throws error with code STALE_PAYOUT | Throws error with code STALE_PAYOUT |

## PayoutAttempt.fail — failure callbacks

All callbacks and restored failure dates are at request time, using the common batch.

**Input:** Initial status, Stored failure reason, Callback failure reason, Callback count · **Oracle:** Expected Result · **Log:** Test Result

Execution: **2 passed / 2 cases**.

| Initial status | Stored failure reason | Callback failure reason | Callback count | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- |
| [FAILED](payout-attempt.test.ts#L220) | failure | failure | 1 | Returns false; status FAILED; failure reason failure | Returns false; status FAILED; failure reason failure |
| [REQUESTED](payout-attempt.test.ts#L235) | Absent | timeout | 2 | Returns true, then false; status FAILED; failure reason timeout | Returns true, then false; status FAILED; failure reason timeout |

## Wallet constructor — identity

Each wallet starts with empty transaction history. The mutation case changes both supplied identity fields to `changed` and attempts to set the wallet ID on the constructed instance.

**Input:** Wallet ID, User ID, Attempted replacement identity · **Oracle:** Expected Result · **Log:** Test Result

Execution: **3 passed / 3 cases**.

| Wallet ID | User ID | Attempted replacement identity | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [wallet](wallet.test.ts#L13) | owner | changed | Wallet ID wallet; user ID owner; instance wallet-ID reassignment returns false | Wallet ID wallet; user ID owner; instance wallet-ID reassignment returns false |
| [`" "`](wallet.test.ts#L27) | owner | None | Throws DomainError | Throws DomainError |
| [wallet](wallet.test.ts#L33) | `" "` | None | Throws DomainError | Throws DomainError |

## Wallet.transactions — history isolation

Wallet `wallet` belongs to `owner`. The history initially contains transaction/key `credit`, TOP_UP 700 cents at 2026-10-01 10:00 UTC. Clear the supplied array, append TOP_UP `extra` for 100 cents to the returned array, mutate the credit date to epoch 0, and attempt to replace its amount with 0 cents.

**Input:** Original top-up (cents), Returned-array extra top-up (cents), Replacement credit amount (cents), Replacement timestamp (ms) · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Original top-up (cents) | Returned-array extra top-up (cents) | Replacement credit amount (cents) | Replacement timestamp (ms) | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- |
| [700](wallet.test.ts#L39) | 100 | 0 | 0 | Amount reassignment returns false; stored history equals the single original credit; date 2026-10-01T10:00:00.000Z; available funds 700 cents | Amount reassignment returns false; stored history equals the single original credit; date 2026-10-01T10:00:00.000Z; available funds 700 cents |

## Wallet constructor — history structure and ownership

All wallets have ID `wallet`, user `owner`. Transaction dates are 2026-10-01 10:00 UTC and idempotency keys equal transaction IDs.

**Input:** Transaction collection, Transaction IDs, Kinds, Amounts (cents), Transaction wallet IDs · **Oracle:** Expected Result · **Log:** Test Result

Execution: **6 passed / 6 cases**.

| Transaction collection | Transaction IDs | Kinds | Amounts (cents) | Transaction wallet IDs | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- |
| [undefined](wallet.test.ts#L63) | — | — | — | — | Throws error with code INVALID_INPUT | Throws error with code INVALID_INPUT |
| [null](wallet.test.ts#L75) | — | — | — | — | Throws error with code INVALID_INPUT | Throws error with code INVALID_INPUT |
| [Empty Set (not an array)](wallet.test.ts#L87) | — | — | — | — | Throws error with code INVALID_INPUT | Throws error with code INVALID_INPUT |
| [Array](wallet.test.ts#L99) | foreign | TOP_UP | 100 | other | Throws error with code INVALID_INPUT | Throws error with code INVALID_INPUT |
| [Array](wallet.test.ts#L111) | unassigned | TOP_UP | 100 | Absent | Throws error with code INVALID_INPUT | Throws error with code INVALID_INPUT |
| [Array](wallet.test.ts#L125) | same, same | TOP_UP, REFUND | 100, 100 | wallet, wallet | Throws error with code INVALID_INPUT | Throws error with code INVALID_INPUT |

## Wallet constructor — balance bounds

Use wallet `wallet`, owner `owner`, and the transaction timestamp/key convention above. Transactions run in the listed order.

**Input:** Initial top-up (cents), Second transaction kind, Second amount (cents) · **Oracle:** Expected Result · **Log:** Test Result

Execution: **2 passed / 2 cases**.

| Initial top-up (cents) | Second transaction kind | Second amount (cents) | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [500](wallet.test.ts#L142) | LOCK | 501 | Throws error with code INVALID_INPUT | Throws error with code INVALID_INPUT |
| [9007199254740991](wallet.test.ts#L153) | TOP_UP | 1 | Throws RangeError | Throws RangeError |

## Wallet.getAvailableBalance — transaction effects

Use wallet `wallet`, owner `owner`, and the timestamp/key convention above. The first transaction, when present, is a top-up; the second is the listed movement.

**Input:** Initial top-up (cents), Next transaction kind, Next amount (cents) · **Oracle:** Expected Result · **Log:** Test Result

Execution: **8 passed / 8 cases**.

| Initial top-up (cents) | Next transaction kind | Next amount (cents) | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [None (empty history)](wallet.test.ts#L162) | None | — | 0 cents | 0 cents |
| [1000](wallet.test.ts#L170) | TOP_UP | 200 | 1200 cents | 1200 cents |
| [1000](wallet.test.ts#L181) | REFUND | 200 | 1200 cents | 1200 cents |
| [1000](wallet.test.ts#L192) | LOCK | 200 | 800 cents | 800 cents |
| [1000](wallet.test.ts#L203) | PAYOUT | 200 | 800 cents | 800 cents |
| [1000](wallet.test.ts#L214) | RELEASE | 200 | 1000 cents | 1000 cents |
| [1000](wallet.test.ts#L225) | FORFEIT | 200 | 1000 cents | 1000 cents |
| [500](wallet.test.ts#L253) | LOCK | 500 | 0 cents | 0 cents |

## Wallet.getAvailableBalance — settled holds

Transactions occur in this order: top-up, refunded lock/refund, released lock/release, forfeited lock/forfeit, payout. Each lock and its settlement use the same amount.

**Input:** Top-up (cents), Refunded hold (cents), Released hold (cents), Forfeited hold (cents), Payout (cents) · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Top-up (cents) | Refunded hold (cents) | Released hold (cents) | Forfeited hold (cents) | Payout (cents) | Expected Result | Test Result |
| --- | --- | --- | --- | --- | --- | --- |
| [1000](wallet.test.ts#L236) | 200 | 300 | 100 | 150 | 450 cents | 450 cents |

## Wallet.getAvailableBalance — order independence

Compare the listed history with a separate wallet containing the same transactions in reverse order.

**Input:** First top-up (cents), Second top-up (cents), Payout (cents) · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| First top-up (cents) | Second top-up (cents) | Payout (cents) | Expected Result | Test Result |
| --- | --- | --- | --- | --- |
| [9007199254740991](wallet.test.ts#L264) | 1 | 9007199254740991 | 1 cent in both forward and reverse order | 1 cent in both forward and reverse order |
