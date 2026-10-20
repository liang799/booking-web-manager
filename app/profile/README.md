# /app/profile

**Owner:** Joseph (Jolingoes)

UC1-03 Manage Profile, UC1-04 Delete Account (soft delete —
`User.anonymise()`, not `delete()`). Reliability score computation and
display.

Profile edits invoke `UpdateProfile` through `use-case-config/profiles.ts`.
The domain profile policy validates the editable fields using only account
status and the proposed changes; it does not construct an incomplete User or
load financial history. The server action handles the form, verified identity
and response; the Supabase adapter owns storage translation.

Apply `0011_profile_policy_guards.sql` with this version. It replaces direct
authenticated profile updates with `update_profile`, which checks identity,
validates the edit and locks the profile while checking active status. This
prevents an edit from restoring personal details after concurrent deactivation.
Registration still permits empty preferences; the signup trigger filters
unsupported metadata choices. Existing profile rows are not rewritten.

Run `npm test -- tests/use-cases/UC1-03-manage-profile.test.ts tests/app/profile/actions.test.ts`
for application coverage and `npm run test:integration` for the real RPC,
privilege, signup and deactivation-race scenarios on the disposable stack.
See [ADR-0014](../../docs/adr/0014-account-policies-and-transaction-guards.md).

## Reliability score

Settings and the signed-in sidebar show the score calculated from the user's
full participation history (REQ-10). `loadReliabilityScore` in
[`reliability.ts`](./reliability.ts) takes the verified current user's ID and
runs `GetReliabilityScore` through `use-case-config/profiles.ts`.
`PostgresReliabilityHistoryReader` reads the same participation, session-end and
fund-hold rows as the session user reader, without the wallet ledger or row
locks. The domain decides which outcomes count and how they are weighted.

When the database is not configured or the read fails, the loader returns null
and the pages say the score is unavailable. They never show the starting score
in its place. `CurrentUser.reliabilityScore` is deprecated: it is always the
starting score.

Run `npm test -- tests/use-cases/UC1-03-manage-profile.test.ts tests/lib/supabase/postgres-reliability-history-reader.test.ts tests/app/profile tests/app/auth/signed-in-shell.test.ts`.

## Help, terms and privacy

Settings links to [`/profile/help`](./help/page.tsx), a static list of common
questions, and to the public [`/terms`](../(auth)/terms/page.tsx) and
[`/privacy`](../(auth)/privacy/page.tsx) pages. Terms and privacy live in
`app/(auth)` because registration asks people to agree to them before they have
an account. All three only describe rules enforced elsewhere (the 30-hour
refund rule, 72-hour auto-verification, anonymised deletion); update them when
those rules change. `tests/app/auth/policy-pages.test.ts` and
`tests/app/profile/settings-links.test.ts` check the links and key statements.
