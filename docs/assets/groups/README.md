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

## Final mobile correction

The existing Joined / Hosting / Groups navigation is reused, with Groups selected.
It leads directly into monogram rows: the visible page heading, creation button,
description and filter bar are omitted on mobile. Desktop retains its original
redesign. Resizing from a filtered desktop view restores all rows on mobile.
The mobile screenshots also verify the transparent page surface: the shell's
existing court artwork fades continuously behind the tabs and into the list.

Validation after the correction: 47 Groups/Sessions view stories pass in Chromium,
all 11 Groups stories pass in WebKit, all 3,156 unit tests pass, and typecheck,
lint and the production build pass. The independent follow-up review found no
actionable issues. A broader controller run hit a timing failure in **Joined
Session Details Dialog**; its isolated rerun passed.

The broader WebKit Sessions run still fails **Desktop Current Session Hierarchy**
(`aria-expanded` remains false) and **Keyboard And Session Summary** (28px instead
of 52px). Both failures were reproduced using the original Sessions view and CSS
from `4b9f919`, then the current source files were restored. These existing desktop
timeline failures are outside this mobile Groups correction.
