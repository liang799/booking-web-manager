-- UC2-02 / UC2-04: capacity includes the booker; no minimum viable headcount.
-- Deploy together with the app that stops reading/writing minimum_headcount.
begin;
lock table sessions in share row exclusive mode;
lock table participations in share row exclusive mode;

alter table sessions drop column minimum_headcount;
alter table sessions drop constraint sessions_price_within_range;
alter table sessions drop constraint sessions_total_slots_check;

-- A booker formerly queued for their own room now already has a prepaid place.
-- Retain queue history, but never let that obsolete entry block guest promotion.
update participations p set status = 'LEFT_WAITLIST'
from sessions s
where p.session_id = s.session_id and p.user_id = s.booker_id
  and p.status = 'WAITLISTED';

-- An implicit booker cannot take a second, funded replacement place. Open any
-- unconsumed invitation addressed to them to the ordinary replacement queue.
-- No hold is refunded here: the existing successful-funded-replacement rule
-- still applies, and settled/consumed invitation history remains untouched.
update participations p
set replacement_mode = 'OPEN_SLOT', replacement_invitee_id = null
from sessions s
where p.session_id = s.session_id and p.status = 'WITHDRAWN'
  and p.replacement_mode = 'DIRECT_INVITE'
  and p.replacement_invitee_id = s.booker_id
  and exists (
    select 1 from fund_holds h where h.participation_id = p.participation_id
      and h.state in ('AWAITING_REPLACEMENT', 'REFUNDED')
  )
  and not exists (
    select 1 from participations r where r.replaces_participation_id = p.participation_id
  );

-- Existing capacity meant guest places. Keep every offered place and accepted
-- price. An already committed booker was counted in the old capacity already.
update sessions s set total_slots = total_slots + 1
where not exists (
  select 1 from participations p
  where p.session_id = s.session_id and p.user_id = s.booker_id
    and p.status = 'COMMITTED'
);

-- New sessions are limited to 30 by creation policy. A legacy session which
-- offered 30 guest places now has 31 total places, including its booker.
alter table sessions add constraint sessions_total_slots_check
  check (total_slots between 1 and 31);
-- Creation validates the price range. Stored quotes remain immutable across
-- this capacity migration; retain positive, safe total collection constraints.
alter table sessions add constraint sessions_accepted_share_check check (
  booking_share_cents > 0 and
  booking_share_cents <= 9007199254740991::bigint / greatest(1, total_slots - 1)
);
commit;
