# Public landing page

`LandingView` remains a synchronous server-renderable view, independent of
JavaScript, authentication, PostgreSQL and live session counts. The signed-in
home route continues to select `HomeController` in `app/page.tsx`.

The hero uses static, separately composed desktop and mobile WebP backgrounds.
Its responsive `picture` selects the mobile image below 701px and prioritizes
loading the hero. Both assets together are approximately 112 KiB. Text, links
and navigation remain HTML. The mobile menu uses native `details`/`summary`
with a small client enhancement in `landing-navigation.tsx`. Its trigger morphs
between hamburger and close icons, the panel and links animate in, and closing
finishes before the disclosure is hidden. Closing links become inert immediately.
Escape returns focus to the trigger; outside taps, focus leaving the menu,
link selection, and the desktop breakpoint also dismiss it. The nonmodal panel
scrolls independently on short screens and does not trap keyboard focus.

Landing section links preserve their hash URLs and history while smoothly
scrolling and moving focus to the destination. Modified clicks retain native
browser behavior. The skip link remains immediate, and reduced-motion users
receive instant scrolling with no decorative transitions. Without JavaScript,
the disclosure and anchor links retain their native behavior.

Landing typography uses a locally bundled Outfit variable font, scoped to this
view. The geometric letter shapes, headline weight and hero eyebrow tracking
are visually matched to the supplied references. The eyebrow is 10px with
5.4px tracking on desktop and 7px with 3.5px tracking on mobile. Its lighter
color applies only to the decorative hero label; functional text and the
remaining app retain their existing contrast and typography. Font provenance
and license: `public/fonts/README.md`.

Header and footer wordmarks use the shared `BookingLogo`: locally bundled
Inter Black (900), normal line height and zero tracking, matching the supplied
brand references and the rest of the application. They inherit the landing
page's dark ink even when the app theme is dark, keeping contrast on its light
background. Header and footer use the shared 20px wordmark at every viewport,
matching the discovery header and keeping the hero headline and primary action
dominant. The home links retain a 44px hit target and the existing header spacing.
The mobile menu pairs an 18px icon with the wordmark inside a 44px hit target.
Its trigger, panel and actions share the primary link's 3px corners, warm paper,
dark ink and muted olive accents, keeping the navigation in the landing theme.
Use `<BookingLogo tone="inherit" />` on this fixed light surface. The shared
module owns wordmark styling; other pages use its default navigation treatment
or explicitly select `size="display"` for a main brand heading.

Wordmark review captures: [desktop](../../docs/assets/landing-wordmark-desktop.png)
and [mobile](../../docs/assets/landing-wordmark-mobile.png).

The desktop wall caption follows the artwork's crop through a static SVG text
overlay with the same aspect ratio and cover alignment. Its four lines and
short rule remain anchored to the wall at different viewport sizes. Numbered
section navigation appears only on mobile, with its caption separate from
the navigation landmark.

Product proof is descriptive: supported sports, date/time filters, and the
price per player. No venue, player or location totals are invented. Sports
links use canonical discovery query values (UC2-01). Hosting links to the
existing protected creation flow (UC2-02); venues are booked separately.

The hosting section progressively enhances its server-rendered content with
`LandingHostSection`. Court lines draw on first entry, followed by a floating
SVG court and a four-shot ball rally with shadows, trails and contact ripples.
The hosting link has a directional hover/focus treatment. No animation library
or additional image assets are needed. Motion pauses outside the viewport or
in a hidden tab; the visible pause control retains the visitor's choice when
they scroll away and return. Reduced-motion preferences (including live
changes) show a static court, and JavaScript-disabled visits retain all copy,
the hosting link and the static illustration without an inert pause control.

Hosting motion review captures: [rally animation](../../docs/assets/host-court-motion.gif),
[desktop](../../docs/assets/host-court-desktop.png) and
[mobile](../../docs/assets/host-court-mobile.png).

The landing Playwright projects run in Chromium and WebKit and cover responsive
navigation, host court motion and pause controls, correct image
selection, short desktop layouts, menu dismissal and focus, rapid toggling,
short mobile viewports, smooth scrolling, reduced motion and JavaScript-disabled
use, including Safari pointer focus during link activation. The public resources
project continues to check anonymous API docs and
Storybook access. `Landing/Page` provides desktop, mobile and dark-theme
stories; the public art direction intentionally retains its light palette.

Asset provenance and editing prompts: `public/images/landing-court.md`.

Production-rendered review captures: [desktop](../../docs/assets/landing-page-desktop.webp)
and [mobile](../../docs/assets/landing-page-mobile.webp). The enhanced mobile
navigation has [closed](../../docs/assets/landing-mobile-menu-closed.webp) and
[open-menu](../../docs/assets/landing-mobile-menu.webp) captures with the shared wordmark.
