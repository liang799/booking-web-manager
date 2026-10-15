-- UC2-02: a session may offer up to 30 slots (previously 8).
-- Widening only: every existing row already satisfies the new check.
-- Pricing (0008) is already expressed per slot and needs no change.
begin;
alter table sessions drop constraint sessions_total_slots_check;
alter table sessions add constraint sessions_total_slots_check
  check (total_slots between 1 and 30);
commit;

-- Rollback (fails while any session has more than 8 slots):
--   alter table sessions drop constraint sessions_total_slots_check,
--     add constraint sessions_total_slots_check check (total_slots between 1 and 8);
