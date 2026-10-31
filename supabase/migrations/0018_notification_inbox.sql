-- Existing commitment alerts, independent of browser push opt-in.
create table public.notification_inbox (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(user_id) on delete cascade,
  source_key text not null,
  category text not null check (category in ('bookings', 'groups', 'payments', 'system')),
  title text not null,
  body text not null,
  destination text not null check (destination like '/%' and destination not like '//%'),
  created_at timestamptz(3) not null default clock_timestamp(),
  read_at timestamptz(3),
  unique (recipient_id, source_key)
);

create index notification_inbox_recipient_date on public.notification_inbox
  (recipient_id, created_at desc, id desc);
create index notification_inbox_unread on public.notification_inbox
  (recipient_id) where read_at is null;

alter table public.notification_inbox enable row level security;
-- Only the authenticated application boundary can access this table. Privileged
-- queries still scope every operation to the verified recipient and active profile.
revoke all on public.notification_inbox from anon, authenticated;
grant all on public.notification_inbox to service_role;
