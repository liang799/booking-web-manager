# Notifications page evidence

Captured from the real notification client and AppShell in Storybook on
29 October 2026. The stories use deterministic existing-session event fixtures;
the shell badge read is intercepted with the corresponding fixture count.
These images show presentation, not a live user's inbox or hosted acceptance.

- `desktop-dark.png`: 1600px, dark theme, matching the issue #152 reference.
- `desktop-light.png`: 1440px, light theme.
- `mobile.png`: 390px, light theme; no horizontal page overflow.
- `mobile-home-dark.png`: 390px Home header in dark theme, showing the bell in
  the former account-button position. Captured with the updated `mobile.png`
  on 30 October 2026; superseded by the inline discovery captures below.
- `mobile-home-feed-light.png` and `mobile-home-feed-dark.png`: mobile Home with
  personal bookings followed by the infinite discovery feed, captured on
  30 October 2026 using deterministic public-session fixtures.
- `mobile-header-dark.png`: the updated transparent outline bell and unread dot,
  with the Search shortcut removed. `mobile.png` also uses this updated header.

Interaction and accessibility checks live in
`app/notifications/_components/notifications.stories.tsx`.
