# Wallet UI evidence

Captured from the Wallet/Overview Storybook stories on 20 October 2026.
The desktop preview is 1536 × 1024; the mobile preview is 350 × 760.
All amounts and activity shown are deterministic preview fixtures.

- `desktop.png` and `desktop-dark.png`: paginated table, holds panel and balance card.
- `mobile.png` and `mobile-dark.png`: static black card and compact activity list.
- `desktop-motion.gif`: decorative ribbon motion; text and controls stay fixed.

References: desktop and mobile screenshots supplied in the wallet design task.
The rendered application uses inline SVG for the ribbons and existing bundled
court imagery for hold thumbnails. The reference screenshots are not embedded.
Mobile disables decorative animation; reduced-motion preferences also disable
it on desktop. Browser checks covered 320–1536px and light/dark themes.
