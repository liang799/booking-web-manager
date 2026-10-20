# /components/ui

**Owner:** Joseph (Jolingoes)

Shared design system: Tailwind configuration, shadcn/ui components, the
application shell and sidebar. Read-only for everyone else — request a new
shared component from Joseph rather than adding one directly (see CLAUDE.md
"Directory ownership").

## Iconography: Lucide Icons

**Lucide Icons is the only UI icon family for this project.** Use matching
Lucide glyphs in design mockups and React components, importing named exports
from the existing `lucide-react` dependency. This rule applies to navigation,
buttons, form controls, status indicators and other interface icons.

Do not introduce other icon libraries, icon fonts, emoji substitutes or custom
SVG/image files for UI icons. Existing one-off icons and the SVG files in
`public/images/navigation/` are legacy assets, not templates for new work;
replace them with Lucide when revising those icons. Logos,
photography and decorative artwork are separate from UI icons; continue to use
`BookingLogo` for the wordmark.

### Shared navigation icons

Use [`NavigationIcon`](./navigation-icon.tsx) in desktop and mobile navigation,
including the mobile Search shortcut. It owns the consistent **20px size**,
**`strokeWidth={1.8}`**, outline appearance and inherited `currentColor`.
Keep the glyph mapping in that component rather than choosing another icon
for the same destination on a different screen.

| Destination | `name` | Lucide component |
| --- | --- | --- |
| Home | `home` | `House` |
| Discover / Search | `search` | `Search` |
| Sessions | `sessions` | `Calendar` |
| Wallet | `wallet` | `WalletMinimal` |
| Groups | `groups` | `UsersRound` |
| Settings | `settings` | `Settings` |

```tsx
import { NavigationIcon } from "@/components/ui/navigation-icon";

<NavigationIcon name="wallet" active={isWalletRoute} />
```

Derive `active` from the current route. The selected icon plays one 520ms
animation when it becomes active or mounts, then settles. The shared CSS
disables motion for `prefers-reduced-motion: reduce`. Preserve that behavior
when extending the mapping; keep motion in the shared component and stylesheet.

### Icons in other controls

- Import Lucide components directly for other UI roles. Reuse the owning
  shared component's size and stroke treatment, keeping peers within the
  same control group consistent.
- Choose size by role: navigation uses 20px; the shared `Button` defaults to
  16px icons. A 20px icon inside `Button` also needs `[&_svg]:size-5` on the
  button, since its default descendant style overrides SVG size attributes.
- Use `currentColor` and the existing colour tokens for light and dark themes.
  Preserve the outline style instead of adding local fills, filters or strokes.
- Hide decorative icons with `aria-hidden="true"` and `focusable="false"`.
  Give an icon-only button or link an accessible name on the control itself.
  `NavigationIcon` already hides its decorative SVG.

Before handing off an icon change, check rendered size and stroke consistency,
light/dark themes, keyboard access and reduced motion. Use Storybook's
**Design system / Navigation icons** for interactive selection previews and
**Design system / AppShell** for desktop/mobile placement.
