# Notifications

Signed-in users receive group and booking activity through a 30-day inbox. The application saves messages and optional browser-push jobs in the same transaction as the originating business change. Domain outcomes supply the facts; notification types and delivery infrastructure remain outside the domain.

## Delivery

`NotificationWriter.append` writes one canonical message and jobs for currently registered push subscriptions. Group saves include these writes in `save_regular_group`; session workflows use their existing atomic transactions. Existing action keys and committed group versions distinguish occurrences and prevent replay duplicates. Verification reminder claims and canonical messages also commit together.

After commit, a deferred HTTP publisher sends an empty `notifications_changed` Broadcast to `user:<userId>:notifications`. Private-channel policies restrict receiving to the active recipient and deny client publishing. The shared browser provider treats messages as hints and reads authoritative data from `GET /api/notifications`. Direct browser access to the inbox stays revoked. Existing public discovery channels retain their behavior.

A missed Broadcast cannot lose a saved message. The client reconciles after subscription establishment, reconnection, focus and visible/online resume; a two-minute foreground HTTP poll also repairs missed events. Events coalesce over 250 ms with a one-second refresh floor. Catch-up follows pages until cached results overlap, preserving every intervening message after long disconnects. Every response supplies `retentionCutoff` to prune older cached messages.

The push worker leases up to 100 jobs for two minutes, runs for at most 45 seconds and sends outside transactions. Delivery is at-least-once; stable notification IDs provide browser tags. Retries stop at 24 hours or an earlier action deadline. Relevance, account and subscription generation are rechecked. Completed, expired and terminal jobs are deleted. Permission/configuration is optional and never prevents inbox persistence.

## Read state and HTTP

Read styling, mark-all and last-visit watermarks are stored per account in browser local storage. They synchronize across tabs, not devices. Clearing or disabling storage does not block reading or navigating. The header dot means new messages since the last inbox visit. Broadcast receipt does not mark a message read.

GET accepts category filters and an optional complete `(createdAt,id)` cursor; pages contain at most 30 messages. Responses contain `items`, `nextCursor` and `retentionCutoff`, with no server read state or unread count. PATCH is removed. All reads authenticate the current active account, scope recipients and return no-store responses. Legacy database read columns/indexes remain unused until a separate migration after application cutover.

Messages expire after 30 days regardless of local read state. Daily batched cleanup deletes old messages; booking records, financial history and action replay receipts remain authoritative. There is no historical backfill.

## Operations

Apply migrations 0020/0021 before the new application. Configure `notification_dispatch_url` in Supabase Vault to the deployed `/api/cron/notifications` URL, using the existing `cron_secret` matching `CRON_SECRET`. A minute pg_cron job invokes the authenticated worker; daily SQL cleanup removes expired history. Without pg_cron/pg_net, invoke the endpoint externally and schedule the cleanup capability. Realtime publishing uses existing server-only Supabase URL/service-role settings; missing settings leave HTTP recovery available.

Track inbox/index bytes, pending push jobs and oldest pending time, delivery failures and Broadcast failures. Publishing creates no extra persistent application payload. Do not apply hosted migrations as part of local verification. See ADR-0023 for the architectural decision.

## Coverage

Group invitations, replies, membership changes, removal, rename/archive and ended invitations; group booking announcements, commitment/waitlist confirmations, promotion/skips, replacement invitations/acceptance/refunds, cancellation/removal, forfeiture and attendance reminders. Important changes also use push; routine activity stays in the inbox. Refund text describes committed outcomes, never recalculated prices or a second refund for an already-refunded departure.
