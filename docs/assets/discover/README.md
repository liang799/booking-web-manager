# Discover search previews

These screenshots render the real `DiscoveryFormController` and
`DiscoverySearchView` inside `AppShell` using the `Discover/Desktop search page`
and `Discover/Mobile search page` Storybook stories. The sessions, venues and
Marcus Lim are fictional fixtures, not production data.

- `before-light-1440.webp`: the desktop page on `main` at `7aacdc9`.
- `after-light-1440.webp` and `after-dark-1440.webp`: the revamped desktop page
  at 1440px, two cards per row.
- `after-light-1024.webp`: 1024px, where the results column still holds two cards.
- `mobile-390-unchanged.webp`: 390px. Below 768px the page is pixel-identical to
  `main` in the populated, dark, expanded-filter and empty stories.

The desktop design follows the SC2006 Figma "Desktop Home" frame: a dark court
banner with white copy, a filled filter control, a bold section heading and
photo-top cards. It reuses the existing court image (`public/images/mobile-hero.png`)
and sport photos (`public/images/sports`); no new artwork is added. The frame's
"View Booking" action is omitted because no session details page exists yet.

The production build was also checked signed out at 320, 390, 767, 768, 1024,
1440 and 1536px in light and dark appearance, with and without reduced motion:
no horizontal overflow, the heading is visible immediately, and only the
decorative photograph fades in when motion is allowed.
