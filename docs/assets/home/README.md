# Signed-in Home visual evidence

The baseline uses `HomeView` and `AppShell` from `origin/main` at `7aacdc9`.
The current captures use this branch, with the shared AppShell restored exactly
from `main`. Both render the same deterministic empty
bookings and Singapore weather fixture in local Storybook; the forecast is sample
data, not a live weather reading. No authenticated backend is used.

| Layout | Before | After | After, dark |
| --- | --- | --- | --- |
| Desktop, 1440 × 900 | [Before](before-light-1440.webp) | [After](after-light-1440.webp) | [Dark](after-dark-1440.webp) |
| Reference size, 1750 × 900 | — | [After](after-light-1750.webp) | [Dark](after-dark-1750.webp) |
| Mobile, 390 × 844 viewport | [Before](before-light-390.webp) | [After](after-light-390.webp) | [Dark](after-dark-390.webp) |

Current images are full-page Chromium captures encoded as WebP at quality 90.
Captures wait for the exact theme class, fonts, hero image decoding and entrance
animations to settle. Baseline captures use freshly
compiled Tailwind CSS, with the desktop introduction verified as `display: flex`
and 224px tall; its mobile equivalent is hidden. Temporary baseline sources were
removed after capture.

[Validation results](validation.json) record **32 passing responsive cases**:
320, 390, 767, 768, 1024, 1200, 1440 and 1750px, in light and dark themes, for empty and
long-venue booking states. Each case checks horizontal overflow, visible control
bounds, desktop hero/weather overlap, image decoding and reduced-motion entrance
animations. Desktop empty-state cases use the keyboard to open the forecast and
verify its disclosure fits within the viewport. Mobile cases verify the full
forecast details, a single Find action, and that the desktop court image is not
downloaded. A resize check switches 767 → 768 → 767px without reloading.
No browser page errors were observed.

At the reference width, the hero ends at 519px and the empty panel is 260px
tall. Typography, button sizes, the white image fade, unboxed forecast and shaded
ball follow the supplied desktop composition. Below 768px, Home retains the
original `main` layout: Upcoming Bookings first, followed by booking cards or
the empty message and full weather card with its Find a session footer. The
mobile hero and empty-state ball are hidden. The sidebar deliberately retains
`main`'s size, typography, spacing and navigation; forecast values remain
server-owned.

This evidence covers deterministic UI rendering. It does not establish
production deployment, authentication, database access or live forecast service
behavior.
