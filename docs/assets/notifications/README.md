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
  on 30 October 2026.

Interaction and accessibility checks live in
`app/notifications/_components/notifications.stories.tsx`.
