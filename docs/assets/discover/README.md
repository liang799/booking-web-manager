# Discover search previews

These screenshots render the real `DiscoveryFormController` and
`DiscoverySearchView` inside `AppShell` using the `Discover/Desktop search page`
and `Discover/Mobile search page` Storybook stories. The sessions, venues and
Marcus Lim are fictional fixtures, not production data.

- `before-light-1440.webp` and `before-mobile-390.webp`: the page on `main` at `7aacdc9`.
- `after-light-1440.webp` and `after-dark-1440.webp`: the desktop page at 1440px.
- `after-light-1024.webp`: 1024px, where the results column still holds two cards.
- `after-mobile-390.webp`: 390px.

Desktop follows the layout reviewed on PR #108: "Upcoming sessions" as the page
heading, the search bar ("Search sessions by sport or venue") directly beneath
it, the sport chips, then photo-top cards two per row. Mobile keeps the court
hero, back arrow and order from `main`; compared with
`before-mobile-390.webp`, only the search placeholder and the sport chip icons differ.

The page reuses the existing sport photos (`public/images/sports`). The sport
chip icons for tennis, badminton, basketball, football and futsal are simple
line icons drawn in code for this project (`app/discover/_components/sport-icons.tsx`),
in the same style as the Lucide icons; no image files are added. The search
matches sport or venue name, as before, and each card keeps the shared Join
button and confirmation.

The production build was also checked signed out at 320, 390, 767, 768, 1024,
1440 and 1536px in light and dark appearance, with and without reduced motion:
the order is heading, search, chips on desktop and search, chips, heading on
mobile; there is no horizontal overflow; pressing Enter in the search keeps an
applied sport filter; and choosing a sport chip keeps the typed search.
