# Sessions revamp visual evidence

Evidence uses the actual `Sessions/Overview` Storybook stories in Chromium, with fictional fixtures fixed at 21 October 2026 in Singapore time, bundled fonts and decorative artwork. The production `AppShell` sidebar, six desktop links, account controls and mobile navigation are unchanged by this editorial update.

## Editorial agenda revision

The main area remains directly on the grey page canvas, without an outer bordered card. The sidebar and canvas color are unchanged by this reference refinement. Wide-desktop page padding scales from 28px to 64px and is 48px at a 1536px viewport. Joined uses a full-width, shallow photograph for the selected session, with its title, supporting subtitle and horizontal time/player metadata overlaid at the lower left and **View details** at the lower right. Its session status badge, including Joined, sits at the upper right. Narrow desktop retains horizontal time/player metadata and lets the details action occupy its own line. The photograph height scales with the viewport between 280px and 334px on wide desktop and is 300px below 1200px. Compact sessions retain the text hierarchy beside a thumbnail, with generous spacing, subtle bottom separators and a chevron at the right. Wide desktop uses a 32px feature title, 20px compact titles and 16px metadata. Thumbnails range from 112px to 210px wide and are 80px tall, reducing to 96 × 76px below 951px.

Upcoming begins at the timeline's left edge; later group labels, including Later this week before the following rows, indent by 28px. Dates and markers sit in a 126px column alongside each session, reducing to 80px below 1200px and 64px below 951px. The active day is 44px at weight 500 and inactive days are 28px at weight 500; below 1200px their sizes reduce to 36px and 24px. The active date sits near the photograph's upper quarter, with a 30px top offset and a 108px minimum control height. Other dates are centered beside their rows. Active and inactive markers are 10px and 7px respectively, and the active marker follows the measured center of the selected numeral after selection and resizing. Historical dates remain grey when selected, and historical artwork is desaturated. Both mobile tabs use simple dated rows with horizontal separators. Joined skeletons mirror the shallow photo, status and text-overlay placeholders, group labels and thumbnail rows; mobile skeletons mirror the dated rows.

## Chronological timeline correction

The API returns upcoming sessions first and history newest-first. Rendering that
order made downward scrolling jump from 25 October back to 20 October. The desktop
Joined timeline now sorts a copy by start timestamp, then session ID, so upward
navigation reaches earlier dates and downward navigation reaches later dates.
Future-dated cancellations are placed by their date, regardless of feed section.
The initial selection remains the next upcoming booking, or the most recent
booking when there are no upcoming records; the page positions that booking below
the pinned breadcrumb and tabs. The sidebar is unchanged.

Older pages are added above their chronological neighbors without moving the
selected booking's viewport position or changing its decorative artwork. Desktop
pagination sits above history once all upcoming records have loaded; the API,
mobile list, Hosting, URL restoration and entrance-animation contracts remain.
The server cursor still traverses upcoming pages before history.

Validation for this correction:

- The two-session chronology regression failed on the original ordering and now passes; it also covers a future-dated cancelled session in the history section.
- All five focused sessions Storybook suites passed: 75 interaction/accessibility checks, including backward/forward traversal across history and upcoming sessions, default upcoming positioning, older-page anchoring and artwork stability, and the existing entrance/reduced-motion/URL-restoration checks.
- Chromium and WebKit passed actual wheel-navigation checks at 768, 1024 and 1536px: up traversed 21 → 20 → 17 October, and down returned through 20 → 21 → 23 October. Chronology, entry visibility and overflow were checked in each run.
- Typecheck, lint, production Storybook and Next.js builds passed. Unit tests: 2,498 passed, 33 skipped and 2 todo.

Reference-layout validation before the chronology correction:

- Typecheck and lint passed.
- All five focused sessions Storybook suites passed: 73 interaction/accessibility checks, including the full-width shallow photograph, overlay placement, status badge, thumbnail rows, responsive date hierarchy, marker alignment, transparent panel, scroll boundaries, dialog focus and URL restoration.
- Unit tests passed: 2,498, with 33 skipped and 2 todo.
- Chromium and WebKit passed 42 layout scenarios across 320–1536px, light/dark appearance, reduced motion and populated/empty/loading states, with no overflow, loaded artwork, a transparent outer layout and aligned markers. Forward/reverse keyboard selection and focus transfer passed in both engines.
- Production Storybook and Next.js builds passed. Final light/dark Joined loading geometry was also checked in both Chromium and WebKit against the production Storybook build.
- The shared AppShell source is unchanged from the prior PR head. Screenshots were refreshed for the current layout and its page margins; mobile captures remain unchanged. Earlier authenticated-flow results below were not rerun for this presentation update.

## Screenshot manifest

Captured on 21 October 2026 for the current reference layout. Browser validation is recorded above.

| Screenshot | Viewport | Story / state |
| --- | --- | --- |
| `hosting-desktop.webp` | 1536 × 1024 | `desktop-hosting`: upcoming cards and divider-separated past rows on the page canvas; no timeline |
| `joined-desktop.webp` | 1536 × 1024 | `desktop-joined`: first session active as a shallow photo with lower text overlay, followed by compact thumbnail rows |
| `joined-scroll-current.webp` | 1536 × 1024 | `desktop-joined`, with the 24 October session selected |
| `joined-history.webp` | 1536 × 1024 | `desktop-joined`, after scrolling upward into history |
| `joined-dark.webp` | 1536 × 1024 | `desktop-joined`, dark theme |
| `joined-narrow.webp` | 768 × 1024 | `desktop-joined`, narrow photo feature with text overlay |
| `joined-mobile.webp` | 390 × 844 | `mobile-reference`: two dated rows in the original mobile shell |
| `empty-joined-desktop.webp` | 1536 × 1024 | `empty-joined`: court banner, discovery/creation actions and three starter links |
| `empty-hosting-desktop.webp` | 1536 × 1024 | `empty-hosting`: bench banner, creation/discovery actions and three hosting tips |
| `empty-joined-mobile.webp` | 390 × 844, full page | `empty-joined`: stacked actions and starter links |
| `empty-hosting-mobile.webp` | 390 × 844, full page | `empty-hosting`: responsive hosting empty state |
| `empty-joined-dark.webp` | 1536 × 1024 | `empty-joined`, dark theme |
| `empty-hosting-dark.webp` | 1536 × 1024 | `empty-hosting`, dark theme |
| `loading-joined-desktop.webp` | 1536 × 1024, full page | `loading`: Joined date rail, shallow photo/overlay feature and thumbnail-row placeholders |
| `loading-hosting-desktop.webp` | 1536 × 1024, full page | `loading-hosting`: upcoming cards and history-row placeholders |
| `loading-mobile.webp` | 390 × 844, full page | `mobile-loading`: simple dated-row placeholders |
| `loading-dark.webp` | 1536 × 1024, full page | `loading-dark`: dark Joined skeleton |

Captured at device scale 1 after fonts and images settled, with reduced motion and incidental pointer focus cleared. Encoded to WebP at quality 88 without changing the rendered content. Populated screenshots show the viewport; mobile empty-state and loading screenshots show the full page. Loading captures use reduced motion to freeze the decorative pulse.

`joined-entrance.gif` is a historical capture of the preceding layout. It is retained for the original motion work and is not evidence of the editorial presentation.

## Behavior retained

Joined alone has the scroll-driven chronological timeline, with earlier dates above later dates. Date buttons and compact rows support keyboard selection; keyboard focus inside the active session prevents scrolling from removing the focused control. **View details** opens Details/Participants, map and calendar actions in a transient session dialog. Closing it restores keyboard focus to its trigger. Scroll anchoring, forward/reverse scrolling and reduced motion remain supported.

The entrance runs once per overview/account visit after URL selection has been restored. The visible rail draws for 560ms, the marker travels to the current date for 380ms, then dates and content reveal independently over 420ms with bounded 70ms staggered starts. Layout space stays reserved throughout; dates only fade to preserve marker alignment. Visible content is prioritized so long feeds and restored selections do not extend the wait. Returning from Hosting and loading more pages do not replay it. Wheel, touch, keyboard/focus/pointer input, scrolling, resizing, tab visibility and motion-preference changes finish it immediately. Mobile and reduced motion skip the sequence. This presentation state lives outside the persisted Zustand store.

Hosting keeps equal-width upcoming cards with dates above the artwork, venue titles, sport/region subtitles and time/player metadata. Previous/Next controls move the carousel. Past sessions use divider-separated rows. Empty views place their banners and actions directly on the page canvas. Three starter links are separated by vertical rules on desktop and stack on mobile. Joined leads with Join a session; Hosting leads with Create a session and offers Join a session as its secondary action, retains its bench artwork and uses “No hosted sessions yet”.

Zustand keeps account-scoped guarded `browsing`/`viewingSession` modes, selected view, timeline session and remembered detail panels. Validated URL storage restores the tab, Joined session and panel, for example `/sessions?tab=joined&session=<uuid>&panel=participants`. Restoring a URL expands the feature without opening a dialog; the remembered panel appears when View details is opened. Account changes create fresh state and clear the session/panel URL selection. React Query retains ownership of data, loading, failures and pagination. Restoration loads further pages as needed, preserves the URL after failed requests for retry, and clears unavailable selections only after exhausting the feed.

The feed supplies real sport, venue, region, dates, attendance counts and session status. The UI does not invent court numbers, notes, names or portraits from mockups. Creation links respect the account's available actions, including email/account setup requirements. Existing hosting management and cancellation recovery remain connected.

Initial feed loading mirrors the chosen layout with skeletons. The hosting dialog uses a controls skeleton while preserving the title and Close action. Placeholders contain no links or buttons and are hidden from assistive technology; one live status announces loading. The pulse is disabled under reduced motion, including inside the portalled dialog. Refetches and pagination retain loaded content.

## Reproduce the evidence

Run Storybook with `npm run storybook -- --ci`, then open `/iframe.html?id=sessions-overview--<story>&viewMode=story` at the viewport above. `desktop-joined` and `desktop-hosting` have four upcoming and six past sessions; `mobile-reference` uses two upcoming sessions. `desktop-current-session-hierarchy` starts the third session selection through its interaction check.

These fixtures and screenshots demonstrate local behavior, not production data.

## Earlier validation

The results below were recorded for the preceding compact layout, original-shell restoration and subsequent empty-state, entrance and skeleton refinements. They document earlier behavior checks and do not establish browser validation for the editorial revision.

- Typecheck, lint and 2,498 unit tests passed for the compact-layout and entrance revisions. The compact-layout run also recorded 33 skipped tests and 2 todo.
- Focused sessions Storybook coverage grew from 62 to 74 passing interaction/accessibility checks across five suites. It covered summary/dialog actions, keyboard tabs, calendar links, focus restoration, account resets, URL panel memory, unavailable-session refreshes, pagination, marker alignment, loading controls and entrance interruption. Hosting assertions verified that no timeline or marker was rendered. The shared-shell suite passed 21 checks, including desktop navigation/account controls and mobile Settings navigation.
- Chromium and WebKit passed 26 populated-view checks across desktop widths 768–1536px and mobile widths 320–767px. Coverage included selection after resizing, forward/native reverse scrolling, keyboard selection, historical colors, dark appearance, reduced motion and overflow. Both empty views passed 28 scenarios across 320–1536px, including dark appearance, reduced motion and keyboard focus.
- The earlier panel/sidebar alignment refinement passed 32 desktop and 24 mobile browser scenarios. Its bordered-panel alignment is superseded by the editorial page canvas.
- Skeleton verification passed 24 Chromium/WebKit scenarios across 320–1536px, light/dark appearances and reduced motion, with usable loading navigation, nonfocusable placeholders and no horizontal overflow.
- Staggered entrance verification passed 26 native browser scenarios covering desktop, mobile, dark appearance, reduced motion, live preference changes and wheel/keyboard/pointer/scroll/resize interruption. Additional Chromium/WebKit checks covered restored selections from later pages after scroll anchoring settled.
- All 43 authenticated browser tests passed for the earlier compact-layout and first-visit entrance updates, covering pagination and URL restoration, cookie authentication, account/tab cursor isolation and hosting workflows. Their disposable integration runs also built production Storybook and Next.js. Separate Chromium/WebKit dialog checks retained selection, panel, scroll position and trigger focus after closing a restored session near the end of the feed.
