# ADR-0023: Durable notifications and browser-local read state

- Status: Accepted
- Date: 2026-10-30

Business changes, canonical notification messages and optional per-subscription push jobs commit in the same transaction. Group saves use the existing version-checked RPC. Application workflows derive notification intents from domain outcomes; infrastructure renders and persists each message once. No general event bus or duplicate persistent outbox is needed.

Keep messages for 30 days regardless of whether a browser opened them. Read IDs and visit watermarks belong to browser storage, scoped by account. Financial history and booking state remain authoritative after messages expire. Legacy read columns stay temporarily for deployment compatibility, then a separately merged migration can remove them.

Private Supabase Broadcast sends empty invalidation hints after commit through an HTTP publisher scheduled by Next `after()`. Publishing failure cannot change a committed business outcome. A shared signed-in browser subscription reconciles through the recipient-scoped HTTP reader; reconnect/focus and a two-minute foreground poll recover missed hints. The HTTP response supplies a retention cutoff and catch-up follows cursors until cached results overlap, preventing gaps after more than one page of new messages. Direct browser inbox access stays revoked.

A minute worker leases temporary push jobs, rechecks recipient/subscription/action relevance and sends outside transactions. Successful and expired jobs are deleted. Provider acceptance is at-least-once and does not prove the person saw the message. The canonical inbox remains available without push permission or configuration.
