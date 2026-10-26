# Groups overview redesign

Implement the supplied reference for UC1-06: a spacious “Your groups” heading,
supporting copy, a Create group button, All/Owned/Joined/Archived filters, and
horizontal rows with court imagery, membership previews, role badges and links.
The existing shared sidebar stays as it is. Adapt the list to narrow screens
and both themes using existing tokens and Lucide icons.

## Approach

A feature-local synchronous view receives a small, serializable server projection.
The server still authenticates and calls `ManageGroup.listMine`. Resolve owner and
preview-member display names in one deduplicated query. Do not send invitation
tokens or domain objects to the client. Use real initials and “Organised by …”
because groups do not currently store descriptions or profile photos. Existing
court assets are decorative, not uploaded group covers.

A complete data-model expansion would add persistence and editing flows unrelated
to this visual request. Restyling the old two-column layout would leave creation
permanently competing with the list. Use the reference layout and move the existing
creation form into the shared accessible dialog instead.

## Behavior and limits

- All includes archived groups; Owned and Joined show active groups for each role;
  Archived shows archived groups of either role.
- Rows navigate to existing detail pages. Options link to members, invitations and
  owner settings where available; archived groups expose only their member history.
- Preserve the existing create action, validation, redirect, and leave confirmation.
- Show distinct overall-empty and filter-empty messages. Keep long names readable.
- No domain, schema, API, shared-navigation, or group-detail redesign.

## Verification

Server-page tests cover authentication, real summary data, and the client boundary.
Storybook interactions cover filters, empty results, navigation links, options,
creation dialog and dismissal. Inspect desktop/mobile, long names and dark mode
in Chromium and WebKit. Run repository typecheck, lint and unit tests before PR.
