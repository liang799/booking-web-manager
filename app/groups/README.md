# /app/groups

**Owner:** Joseph (Jolingoes)

UC1-06 Manage Group: creation, invitation links, membership management.

| Action | Who | Rule |
| --- | --- | --- |
| Create, rename, archive, link on/off | Owner | Only the owner; an archived group can't change. |
| Join | Anyone with a current link | Joining twice is harmless. |
| Remove a member | Owner | The owner can't be removed. |
| Leave | Any member except the owner | The owner archives the group instead. Leaving works like a removal: rejoin only with a current link; joined sessions are unaffected. See [ADR-0017](../../docs/adr/0017-members-leave-regular-groups.md). |

Leaving asks for confirmation on the group page, then opens `/groups?left=1`,
which confirms "You left the group."

## Groups overview

The overview follows the supplied list reference, with a Create group dialog and
All, Owned, Joined and Archived filters. All includes archived groups; Owned and
Joined include active groups only. Archived groups retain their role badge and
member history. Row options link to the existing detail page sections and expose
settings appropriate to the current member's role. Mutations still run through
the existing server actions and domain rules.

`page.tsx` authenticates, reads memberships and resolves organiser/preview-member
names in one deduplicated query. `GroupsView` receives only display data, with no
invitation tokens or domain instances. Member initials and counts reflect stored
memberships; absent profiles use “Unnamed player”, while the existing profile
reader labels inactive accounts “Deleted user”.

Groups have no stored description or cover image. “Organised by …” uses the real
owner name, and decorative thumbnails reuse `/images/sessions/court.webp`,
`/images/session-court.webp`, `/images/sessions/bench.webp` and
`/images/sports/tennis.jpg`. Their existing provenance lives with the source assets.
The shared shell and group detail pages are unchanged.

Storybook's **Groups / Overview** includes filters, role-specific options, dialog
keyboard behavior, empty states, long names, mobile layouts and both themes.
