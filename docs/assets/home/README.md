# Signed-in Home visual evidence

The baseline uses `HomeView` and `AppShell` from `origin/main` at `7aacdc9`.
The current captures use this branch. Both render the same deterministic empty
bookings and Singapore weather fixture in local Storybook; the forecast is sample
data, not a live weather reading. No authenticated backend is used.

| Layout | Before | After | After, dark |
| --- | --- | --- | --- |
| Desktop, 1440 × 900 | [Before](before-light-1440.webp) | [After](after-light-1440.webp) | [Dark](after-dark-1440.webp) |
| Mobile, 390 × 844 viewport | [Before](before-light-390.webp) | [After](after-light-390.webp) | [Dark](after-dark-390.webp) |

Images are full-page Chromium captures encoded as WebP at quality 86. The mobile
after image is 993px tall. Captures wait for the exact theme class, fonts, hero
image decoding and CSS transitions to settle. Baseline captures use freshly
compiled Tailwind CSS, with the desktop introduction verified as `display: flex`
and 224px tall; its mobile equivalent is hidden. Temporary baseline sources were
removed after capture.

[Validation results](validation.json) record **24 passing responsive cases**:
320, 390, 768, 1024, 1440 and 1750px, in light and dark themes, for empty and
long-venue booking states. Each case checks horizontal overflow, visible control
bounds, hero/weather overlap, image decoding and reduced-motion action
transitions. All 12 empty-state cases also open Forecast details and verify the
disclosure fits within the viewport. No browser page errors were observed.

This evidence covers deterministic UI rendering. It does not establish
production deployment, authentication, database access or live forecast service
behavior.
