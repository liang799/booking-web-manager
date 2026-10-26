# Groups overview previews

Screenshots captured from the `Groups/Overview` Storybook fixtures on 26 October
2026. Fixture names and membership counts are illustrative; production reads
the signed-in user's actual groups and profile names.

- [Desktop](./desktop.png)
- [Desktop, dark](./desktop-dark.png)
- [Mobile](./mobile.png)
- [Mobile, dark](./mobile-dark.png)

## Verification

`npm run typecheck`, `npm run lint`, `npm test` (3,156 passed), and
`npm run build` passed. The 11 overview stories passed in Chromium and WebKit,
including accessibility checks, filters, role/archive options and dialog focus.
For WebKit the existing Vitest configuration was reused with only the storybook
project's `browser.instances` set to `[{ browser: "webkit" }]` in a temporary
configuration. No shared test configuration changed.

Visual checks covered the mobile and desktop breakpoints, both themes and a long
group/owner name with 1,234 members. The measured content width did not exceed
the viewport. Dialog submission retains the existing production server action;
the synchronous story form does not perform live writes.

The server-page regression test failed on the old “My groups” layout before the
new view was implemented, then passed with the real organiser/preview mapping.
An independent code review found no actionable issues.
