# Session Details revamp

`before.png` is the current-design screenshot supplied with the request. The remaining images are browser screenshots of the implemented components using deterministic Storybook fixtures, not a live account or production booking.

| Image | Viewport | State |
| --- | --- | --- |
| desktop-light.png | 1440 × 1000 | Hosting, public, light |
| desktop-dark.png | 1440 × 1000 | Hosting, public, dark |
| mobile-light.png | 390 × 844 | Hosting, public, light |
| mobile-dark.png | 390 × 844 | Hosting, public, dark |
| participant.png | 1440 × 1000 | Joined, with refund-preview entry point |

Render `Sessions/Session details/Hosting` and `Joined` after running `npm run build-storybook` and serving `storybook-static`. The host screenshots change the viewport and toggle the same `html.dark` class used by the application's theme tokens. All four host screenshots have zero horizontal overflow; the desktop dialog is 600px wide and mobile is 358px wide, with vertical scrolling where needed.

Browser tests cover the real summary and controls, light/dark accessibility, history and in-progress restrictions, current-place checks, refund confirmation, waitlist departure, and keyboard focus restoration. Refund results remain visible until dismissed. Cancellation explicitly returns outstanding held shares to wallets and leaves venue reservation cancellation to the booker.
