# Public landing page

`LandingView` remains a synchronous server-renderable view, independent of
JavaScript, authentication, PostgreSQL and live session counts. The signed-in
home route continues to select `HomeController` in `app/page.tsx`.

The hero uses static, separately composed desktop and mobile WebP backgrounds.
Its responsive `picture` selects the mobile image below 701px and prioritizes
loading the hero. Both assets together are approximately 112 KiB. Text, links
and navigation remain HTML. The mobile menu uses native `details`/`summary`
and the skip link moves keyboard focus past navigation. Reduced-motion users
receive no decorative transitions.

Product proof is descriptive: supported sports, date/time filters, and the
price per player. No venue, player or location totals are invented. Sports
links use canonical discovery query values (UC2-01). Hosting links to the
existing protected creation flow (UC2-02); venues are booked separately.

The landing Playwright project covers responsive navigation, correct image
selection, short desktop layouts, keyboard navigation and JavaScript-disabled
use. The public resources project continues to check anonymous API docs and
Storybook access. `Landing/Page` provides desktop, mobile and dark-theme
stories; the public art direction intentionally retains its light palette.

Asset provenance and editing prompts: `public/images/landing-court.md`.

Production-rendered review captures: [desktop](../../docs/assets/landing-page-desktop.webp)
and [mobile](../../docs/assets/landing-page-mobile.webp).
