# ADR-0022: Booker-inclusive session capacity without minimum headcount

- Status: Accepted
- Date: 2026-10-30
- Refines capacity in ADR-0009/0010 and quote restoration in ADR-0012.

The product no longer has a minimum viable participant count. Remove
`minimumHeadcount` from creation, the domain, drafts, HTTP contracts and storage.
A session may have only its booker; there is no headcount-driven cancellation.

Capacity counts everyone playing, including the booker. The booker automatically
has one place because they paid the venue upfront. That place creates no wallet
hold, refund, attendance obligation or payout to themselves. Other participants
retain their funded participation records and all existing financial policies.
The booker cannot enroll a second time. Available places, reservations, waitlist
promotion, participant counts and creation's collection estimate use this rule.
The suggested price still divides the venue cost across the full capacity.

Migration 0019 adds one place to historical guest capacities, except where an
already committed booker was counted. It preserves all participations and
accepted prices, including maximum-price quotes. Historical funded booker
records remain available for attendance and settlement and count only once.
Obsolete booker waitlist entries become LEFT_WAITLIST while retaining queue history.
Unconsumed replacement invitations to the booker become ordinary OPEN_SLOT
withdrawals, freeing their reserved guest place for a funded replacement. Their
held funds remain unchanged until that replacement or existing forfeiture rules
resolve them; consumed invitations and terminal financial history remain intact.
Creation accepts 1–30 total places; hydration accepts the legacy maximum of 31.
Creation validates the current price range; hydration restores an accepted
positive quote with safe integer total collection instead of repricing it.

Apply the schema and application as a coordinated release: the old application
still reads and writes the removed column. This PR does not deploy migrations.
