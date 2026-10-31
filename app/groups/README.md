# /app/groups

**Owner:** Joseph (Jolingoes)

UC1-06 Manage Group: creation, invitation links, membership management.

| Action | Who | Rule |
| --- | --- | --- |
| Create, rename, archive, link on/off | Owner | Only the owner; an archived group can't change. |
| Join | Anyone with a current link | Joining twice is harmless. |
| Invite by user ID | Any member, while the link is on | The player joins only by accepting. See [ADR-0022](../../docs/adr/0022-invite-players-to-groups-by-user-id.md). |
| Accept or decline an invitation | The invited player | Accepting twice is harmless; turning the link off or archiving ends invitations. |
| Remove a member | Owner | The owner can't be removed. |
| Leave | Any member except the owner | The owner archives the group instead. Leaving works like a removal: rejoin only with a current link; joined sessions are unaffected. See [ADR-0017](../../docs/adr/0017-members-leave-regular-groups.md). |

Leaving asks for confirmation on the group page, then opens `/groups?left=1`,
which confirms "You left the group."

Each group's member list shows every active member's `@id` beside their join
date, so members can find each other later (deleted members show none).

**Find a player** at the top of the page searches by exact user ID and shows the
player's name, `@id` and reliability score. It lives in [`app/users`](../users/README.md);
see [ADR-0021](../../docs/adr/0021-user-ids-for-finding-players.md). The overview
passes it to `GroupsView` as a slot. On desktop it sits
between the header and the filters; on mobile only its search row shows, under
the Joined / Hosting / Groups navigation, with the heading kept for screen readers.

**Invite** appears beside a found player who isn't you (`GroupFindPlayer` wraps
the search with `InvitePlayer`). Its dialog lists your ACTIVE groups whose link
is on and sends `invitePlayer` with the player's user ID and the chosen group.
Invitations to you appear first on the page (`GroupInvitations`), with who sent
them; **Join** runs `acceptGroupInvitation` and opens the group, **Decline** runs
`declineGroupInvitation`. Invitations are stored by migration 0017; see
[ADR-0022](../../docs/adr/0022-invite-players-to-groups-by-user-id.md). Storybook:
**Groups / InvitePlayer**, **Groups / Invitations** and **Groups / Overview**
(`WithInvitations`).

## Groups overview

The overview follows the supplied list reference, with a court-backed header, a
Create group link to `/groups/new`, and counted All, Owned, Joined and Archived
underline filters. Rows show Active/Archived status alongside the member role. All includes archived groups; Owned and
Joined include active groups only. Archived groups retain their role badge and
member history. Row options link to the existing detail page sections and expose
settings appropriate to the current member's role. Mutations still run through
the existing server actions and domain rules.

`page.tsx` authenticates, reads memberships and resolves organiser/preview-member
names in one deduplicated `memberProfiles` query. `GroupsView` receives only display data, with no
invitation tokens or domain instances. Member initials and counts reflect stored
memberships; absent profiles use “Unnamed player”, while the existing profile
reader labels inactive accounts “Deleted user”.

Groups have no stored description or cover image. “Organised by …” uses the real
owner name, and decorative thumbnails reuse `/images/sessions/court.webp`,
`/images/session-court.webp`, `/images/sessions/bench.webp` and
`/images/sports/tennis.jpg`. Their existing provenance lives with the source assets.
The shared shell is unchanged. Group details use the same court artwork.

On mobile, Groups continues the existing Joined / Hosting / Groups navigation
used by Sessions, with Groups marked as current and links back to both session
views. The navigation component and its original styles are reused by both pages.
The latest mobile reference is inspiration for simple monogram rows, member
counts, inline roles/archive status and dividers. Photographs, avatar stacks and
row options remain on desktop; mobile opens the existing detail page for group
actions. Per the mobile correction, the navigation leads straight into the
player search row and all group rows, without a visible page heading, create
button, description or filter bar.
Resizing from a filtered desktop view still shows all groups on mobile.
The mobile page background stays transparent so the shared shell's court artwork
and existing gradient fade through the tab area without a hard horizontal edge.

Storybook's **Groups / Overview** includes filters, role-specific options, creation navigation, empty states, long names, mobile
layouts and both themes.


## Two-step group creation

`/groups/new` authenticates before rendering `CreateGroupWizard`. Details collects
and validates a group name. Invite players resolves exact user IDs and queues up
to 20 players, with add/remove, duplicate and self checks. Players join only after
accepting an invitation. Lookup blocks creation and navigation until it settles.

Save draft stores the name and selected players in sessionStorage, scoped to the
signed-in account. Restored data is validated; unavailable storage never blocks
creation. Successful creation clears the draft. No draft is saved on the server.

`createGroupWithPlayers` validates all submitted fields, creates through the
existing use case, then sends deduplicated invitations through `inviteByHandle`.
If an invitation fails, the response retains the created group ID and identifies
the failed player, so the UI opens that group instead of offering to create it
again. A transport error asks the user to check their group list before retrying.

## Group details

The detail page follows the shared editorial court-header design with three distinct tabs:
**Members**, **Invitations**, and (for active groups) **Settings**. Members lists the
actual roster, join dates, role badges, and owner-only removal controls; it no longer
forces invitation controls into a sidebar. Non-owners see membership/leave controls
in Settings, while owners can rename or archive there. Archived groups remain read-only.

**Invite players** opens a single dialog from either list. Its two internal tabs
are **Share a link** (copy/rotate/disable) and **Invite by user ID** (existing
server action). A disabled link blocks user-ID invites as before. Link copying
keeps a selectable input for clipboard-denied browsers.

**Invitations** lists the group's *outgoing* unanswered invitations, including
name, handle, sent date and pending status. An empty state replaces the list
when there are none. Owners may revoke individual pending invitations with
confirmation; the domain removes only the selected invitation and keeps the
group's link active. Invitation data comes from the existing group aggregate,
so no new database migration is needed. Incoming invitations remain on /groups.
Server mutations revalidate the detail page so freshly sent/cancelled invitations
update the list.

Storybook **Groups / Details** covers both themes, mobile widths, long/deleted
profiles, settings, dialog methods, clipboard refusal, pending/empty invitations,
and archive tab recovery.

