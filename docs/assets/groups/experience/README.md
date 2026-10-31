# Groups experience previews

Captured from deterministic Storybook fixtures on 31 October 2026. Names,
membership dates and counts in these previews are illustrative; production uses
the authenticated member's groups and profiles.

- [Overview, dark](./overview-dark.png)
- [Group details, light](./details-light.png) and [dark](./details-dark.png)
- [Create: details, light](./create-light.png) and [dark](./create-dark.png)
- [Create: invite players, dark](./invite-dark.png)
- [Mobile overview, dark](./overview-mobile-dark.png)
- [Mobile details, dark](./details-mobile-dark.png)
- [Mobile creation, light](./create-mobile-light.png)

Desktop captures use a 1600 × 900 viewport; mobile uses 390 × 844. Images reuse
the existing court photography and its existing provenance. Both themes and
long-name layouts were inspected; measured mobile content did not overflow.

## Verification

- `npm test`: **3,394 passed**, 73 skipped, one TODO.
- `npm run lint`: passed.
- Groups Storybook suite: **47 passed in Chromium and 47 in WebKit**, including
  accessibility checks. WebKit used a temporary configuration changing only the
  browser instance; the repository's test configuration is unchanged.
- Regression stories failed before fixes for creation during a pending player
  lookup and archiving while the Invitations tab was selected, then passed.
- Independent review identified those two issues; follow-up review verified the
  fixes and found no remaining actionable regressions.
- `npm run typecheck` reports only errors reproduced before implementation on
  `origin/main` (`3317160`): missing `onRestoreFocus` in
  `app/commit/_components/withdrawal-dialog.tsx:46` and incompatible
  `WithdrawalDialog` props in
  `app/sessions/_components/session-participant-controls.tsx:72`.
- `npm run build`: Storybook build and Next production compilation passed; the
  build stopped at type validation on that existing `onRestoreFocus` error.

No hosted writes, database migration or deployment were performed. Server action
tests replace persistence at the existing use-case boundary; no live invitation
emails, group memberships or production accounts were changed during validation.
