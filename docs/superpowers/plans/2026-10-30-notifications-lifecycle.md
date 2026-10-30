# Durable notifications with Supabase Realtime

Approved implementation plan, 30 October 2026. Base: PR #159 at 62a8439.

## Requirements
Atomic business/group/ledger changes + canonical notification rows + temporary per-subscription push jobs. Keep 30 days of inbox history, browser-only read state. No general event bus/outbox. Application derives messages from existing domain outcomes.

Group invitations, accept/decline (inviter), membership joins/leaves (owner), removal, rename/archive and ended invitations. New group bookings, commitment/waitlist confirmation, promotion/skips, replacement invitation/acceptance/refund, cancellation/removal, existing forfeiture and attendance reminders. Important events push; routine events inbox only. Deduplicate overlapping recipients and actual refund outcomes. No standalone payment producers or queue-position chatter.

One private channel user:<uuid>:notifications receives empty notifications_changed hints. Publish only after commit using a server HTTP adapter and injected Next after scheduler; errors never alter committed outcomes. HTTP is authoritative, first page 30, category filters, no server read state, retentionCutoff. Shared signed-in provider: auth/token lifecycle, one channel, 250ms coalescing, 1s refresh floor, 120s recovery, visibility/offline cleanup. Catch up all pages until cached overlap; prune expired cached rows; browser local reads isolated by user.

Push worker: minute cron,100 jobs,2-minute leases,45-second budget, exponential retries capped1h,24h/action expiry, current relevance/account/subscription checks. Delete completed/stale/terminal jobs. Daily batched retention cleanup. Stable push tags; at-least-once provider delivery.

Focused group/replacement links; authenticated tokenless invited-group booking preview; explicit confirmation/access checks.

Tests: rollback/replay/re-entry, recipient overlap/refunds, concurrent push leases/partial errors/reassignment, real private Realtime isolation, failure fallback, >30 missed notifications, cached retention, auth/storage isolation, #159 invariants, unit/type/lint/build/Storybook/integration/browser.

New additive migrations after0019; legacy read column/index retained until later release. No historical backfill. Isolated worktree,semantic commits,stacked draft PR then159 merges first. No hosted migration/merge in this task.

## Progress
- Setup complete; parallel implementation in progress.

- Producers committed ba0f766; durable persistence committed63599b7; browser implementation committed2a4e92e.
- Root wiring and durable reminder tests16 passed; independent review found archive retries, push tags, category retention, watermark shape and worker deadline issues. Archive/tag regressions observed RED then GREEN; agent fixes cover other findings.
- Initial migrated integration suite132 passed; subsequent new integration found fixture joined_at omission and asynchronous REST acknowledgment semantics; fixed fixture and strengthened receive-side authorization assertions.
- Production build passed; first complete unit suite3448 passed, focused Chromium77 passed. Final combined disposable database+authenticated browser acceptance in progress.

- Review complete: all actionable findings fixed. Superseded jobs are cancelled atomically; disabled push still prunes jobs; worker DB/send budgets enforced; archive retry is a no-op; SW uses notificationId with legacy fallback; category caches share authoritative retention cutoff; watermarks contain IDs/timestamps only.
- Final unit3461 passed; typecheck/lint/build passed;77 focused Chromium checks passed. Fresh migration/database rehearsal138 passed; new live invitation browser scenario passed in1s, including no PATCH/no autojoin. Remaining authenticated suite is finishing.
