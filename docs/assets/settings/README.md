# Settings UI previews

These screenshots render the real `SettingsView` inside `AppShell` using the
`Settings/Account` Storybook stories. Marcus Lim and the preferences are
fictional fixtures; the notification row is a static browser-unavailable
fixture. The application supplies the authenticated profile and live browser
notification control.

- `desktop.png` and `desktop-dark.png`: 1440px viewport.
- `mobile.png` and `mobile-dark.png`: 390px viewport.

The responsive check also covered 320px, 768px and 1024px widths, long names
and preferences, keyboard focus, and image loading. Storybook accessibility
checks run with the interaction tests.
