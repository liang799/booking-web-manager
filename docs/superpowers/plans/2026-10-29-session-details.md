# Session Details Implementation Plan

> Execute inline using the existing session workflows. The user's supplied critique and mockup are the design specification.

**Goal:** Make the session's time, location, role, and available actions clear in a compact dialog; include desktop and mobile screenshots in the PR.

**Architecture:** Keep the feed and server-selected host actions authoritative. Share host control state between the existing list and the new dialog. Reuse withdrawal and waitlist confirmation flows for participants; keep their recoverable requests and refund previews.

**Design:** Follow the organising reference in a 760px host dialog with generous footer spacing and a 48px serif session title, Sessions / Organising context, venue subtitle, and Singapore date/time on one row above a divider. Use left vertical rules for participant and visibility sections, a large serif player count with its caption below, a server-confirmed Public/Private switch, and full-width invitation/cancellation buttons with centered icons. Cancellation uses a neutral outline and explains its effects in the confirmation dialog. Keep the original Joined 680px photo/details modal. Preserve dark navy tokens and readable secondary text. Cancellation closes the booking room and refunds held shares; venue cancellation remains separate.

**Review focus:** Overnight Singapore dates; long venue names on mobile; full/private sessions with unavailable actions; ended/cancelled sessions; loading, failure, and confirmation focus restoration.

- Add focused formatting and role/action regression coverage; record the failing results.
- Implement the compact summary and host controls, retaining invitation and visibility feedback.
- Add participant leave controls backed by the existing confirmation flows, and clarify cancellation copy.
- Run focused browser, accessibility, unit, and lint checks; compare typecheck against the baseline.
- Review the diff, capture actual rendered desktop/mobile/light/dark screenshots, commit with semantic messages, and open a PR containing the evidence.

**Baseline:** `origin/main` at `22ae12f`. Typecheck already fails with 12 errors in `app/groups/page.tsx` (missing imports and `displayNames` export). Original checkout's unrelated files are outside this worktree.

**Review outcomes:** Fixed withdrawal results disappearing on immediate feed refresh by refreshing after result dismissal; kept confirmation components mounted across eligibility changes. Restricted participant departures to pre-start active places using the server feed timestamp. Added regressions for both findings and keyboard focus restoration.

**Joined preservation follow-up:** Per the user's screenshot, retain the original participant dialog layout (680px desktop width, court image, original header, full Details/Participants content and calendar link). The 600px redesign applies to host management. Add desktop/mobile completed-session regressions and screenshots; verify native scrolling, panel persistence and closing focus in Chromium and WebKit.

**Coordinated responsive references:** Both host layouts use serif titles/counts. Desktop keeps the centered dialog with a regular-weight uppercase date beside the time, a blurred overlay, 48px clearance above the actions and 32px clearance below them. Mobile uses a bottom-anchored sheet, accessible dismissal handle, full-width management controls, safe-area padding, and reduced-motion support. Keep Joined and other dialogs on their original presentation; the shared overlay class is optional and defaults to existing behavior.

**Desktop reference detail pass:** Match the supplied modal proportions at 760 × 731px for the default fixture. Use a diagonal invitation-link icon, centered icon/text group, neutral light surface and controls, 53px/52px footer buttons with a 16px gap, the reference count typography, and the measured close-control and management-control positions. Retain the separately approved mobile sheet and original Joined dialog.
