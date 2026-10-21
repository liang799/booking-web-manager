# Discover search previews

These screenshots render the real `DiscoveryFormController` and
`DiscoverySearchView` inside `AppShell` using the `Discover/Desktop search page`,
`Discover/Mobile search page` and `Discover/Search view` Storybook stories. The
sessions, venues and Marcus Lim are fictional fixtures, not production data.

- `before-light-1440.webp` and `before-mobile-390.webp`: the page on `main` at `7aacdc9`.
- `after-light-1440.webp` and `after-dark-1440.webp`: the revamped desktop page
  at 1440px, two cards per row.
- `after-light-1024.webp`: 1024px, where the results column still holds two cards.
- `after-mobile-390.webp`: 390px.

At every width the sport chips come first and the search bar ("Search sessions
by sport or venue") sits directly above the "Upcoming sessions" results it
searches, as Rishi asked. From 768px the page follows the SC2006 Figma
"Desktop Home" frame: a dark court banner with white copy, a filled filter
control, a bold section heading and photo-top cards. Below 768px the page keeps
its mobile styling; only the order and the search label changed.

It reuses the existing court image (`public/images/mobile-hero.png`) and sport
photos (`public/images/sports`); no new artwork is added. The frame's
"View Booking" action is omitted because no session details page exists yet.

Desktop captures wait until the banner photograph has loaded and finished its
fade-in. The production build was also checked signed out at 320, 390, 767,
768, 1024, 1440 and 1536px in light and dark appearance, with and without
reduced motion: the chips, search bar and results appear in that order, there
is no horizontal overflow, pressing Enter in the search keeps an applied sport
filter, and choosing a sport chip keeps the typed search.
