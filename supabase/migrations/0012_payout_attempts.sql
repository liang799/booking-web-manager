-- UC1-08: one row per payout attempt (the PayoutAttempt aggregate, ADR-0003).
-- A REQUESTED row is the durable payout intent. The application calls Stripe
-- outside any transaction, then completes or fails the attempt in a new one.
-- The ledger records the money: RELEASE/FORFEIT lines and the PAYOUT entry are
-- appended when an attempt completes, carrying this payout_id.
--
-- No foreign key to payout_accounts: the destination is a frozen snapshot, and
-- a new payout setup after FAILED replaces that row's payout_account_id.
-- Rollback (no attempt has completed): drop table payout_attempts.

begin;

create table payout_attempts (
  payout_id uuid primary key,
  session_id uuid not null references sessions(session_id) on delete restrict,
  payout_account_id uuid not null,
  amount_cents bigint not null check (amount_cents between 1 and 9007199254740991),
  status text not null check (status in ('REQUESTED', 'COMPLETED', 'FAILED')),
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  requested_at timestamptz not null,
  completed_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  provider_reference text,
  destination jsonb not null check (jsonb_typeof(destination) = 'object'),
  lines jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) > 0),

  constraint payout_attempts_outcome check (
    (status = 'REQUESTED' and completed_at is null and failed_at is null
      and failure_reason is null and provider_reference is null)
    or (status = 'COMPLETED' and completed_at is not null and failed_at is null
      and failure_reason is null and provider_reference is not null and btrim(provider_reference) <> '')
    or (status = 'FAILED' and failed_at is not null and completed_at is null
      and failure_reason is not null and btrim(failure_reason) <> '' and provider_reference is null)
  ),
  constraint payout_attempts_session_key_unique unique (session_id, idempotency_key)
);

comment on table payout_attempts is
  'UC1-08 payout attempts. A REQUESTED row is the durable intent to pay a session''s settlement to its booker; terminal rows are kept, and a retry is a new attempt.';

-- A session has at most one attempt in flight, matching Session.pendingSettlement.
create unique index payout_attempts_one_requested_per_session
  on payout_attempts (session_id) where status = 'REQUESTED';

alter table payout_attempts enable row level security;
revoke all on payout_attempts from anon, authenticated;

commit;
