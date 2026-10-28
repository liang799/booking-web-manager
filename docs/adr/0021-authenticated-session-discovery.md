# ADR-0021: Authenticated session discovery

- Status: Accepted
- Date: 2026-10-25
- Partially supersedes:
  - [ADR-0014](./0014-account-policies-and-transaction-guards.md), **only** its statement that public discovery requires no authentication.
  - [ADR-0015](./0015-declarative-session-http-actions.md), **only** its unauthenticated public-discovery action exception.

## Context

UC2-01 originally allowed anonymous reads of public-visibility session summaries.
Discovery now requires a signed-in, active account. The old ADR exceptions no
longer describe the page and HTTP API contract. Their other policies and
dependency-boundary decisions remain in effect.

## Decision

- `/discover` is protected by middleware and rechecks the current user's
  `ACTIVE` status before loading listings. A signed-out visitor is redirected
  to login with the original discovery path and filters as the return destination.
  Failed account checks also preserve that destination, without changing
  non-discovery redirect behavior.
- `GET /api/sessions` verifies either a Supabase bearer token or a same-origin
  login cookie. `discoveryAction` uses `requireUserId` **before parsing query
  filters or reading sessions**. Authentication rejects absent/invalid login
  (401), inactive accounts (403), and missing profiles (404); provider failures
  fail closed. Email confirmation and wallet setup are not browsing prerequisites.
- The application and HTTP boundaries enforce access; the
  `DiscoverSessions.searchPublic` use case remains an identity-independent
  search of public-visibility summaries, without participant, wallet or
  invitation details in the listing response.
- The authenticated discovery action keeps distinct diagnostics for
  initialization, authentication, validation, query and serialization.
  Failed and successful discovery responses remain non-cacheable.
- Registration, login, and validated private invitation previews remain
  available without a signed-in discovery session.

## Consequences

Consumers must authenticate before calling `GET /api/sessions`; no anonymous
listing fallback remains. Browser discovery keeps existing filtering,
pagination and Realtime refresh behavior. This decision does not supersede
ADR-0014's account and transaction guards or ADR-0015's declarative-action
pattern and dependency direction.
