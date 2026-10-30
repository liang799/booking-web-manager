# ADR-0022: Invite players to groups by user ID

- Status: Accepted
- Date: 2026-10-28
- Extends: [ADR-0003](./0003-aggregate-roots-and-boundaries.md)'s RegularGroup
  aggregate with a `GroupInvitation` child, and [ADR-0021](./0021-user-ids-for-finding-players.md)'s
  "Find a player" with an Invite action. Nothing is superseded.

Players can find each other by user ID (ADR-0021) but can only bring someone into
a group by sending them the group's invitation link outside the app. The team
asked for an Invite button beside a found player, with no button when the player
found is the searcher.

## Decision

**Vocabulary.** The *invitation link* is the group's shareable link (token and
on/off flag, as before). A *group invitation* (`GroupInvitation`) is an
invitation for one named player. The SRS data dictionary renames its existing
"Group Invitation" entry, which described the link, to "Group Invitation Link",
matching how the rest of the SRS and the UI already refer to it.

A member invites a found player to one of their groups. The player joins only by
accepting; nobody is added to a group without agreeing.

- **Who may invite:** any member of an ACTIVE group whose invitation link is on.
  Every member can already see and share that link, so an invitation by user ID
  gives one named person the same access, without sending the link around.
- **Accepting and declining:** only the invited player answers, from an
  "Invitations" list at the top of their Groups page. Accepting adds the
  membership in the same save that removes the invitation, through
  `RegularGroup.acceptInvitation`; accepting again is harmless (ALREADY_MEMBER).
  Declining removes the invitation; declining one that is already gone changes
  nothing.
- **Ending:** invitations end with the access they stand for. Turning the link
  off and archiving clear every pending invitation; making a new link keeps them,
  because they never contained the old link. Joining by link clears that
  player's invitation.
- **Rules in RegularGroup** (Rishi's domain): one pending invitation per player
  and group (inviting again returns ALREADY_INVITED), no invitation for a member
  (`ALREADY_MEMBER`, a new `DomainErrorCode`), no self-invitation, and none while
  the link is off or the group is archived. `GroupInvitation` records the invitee,
  the inviting member and the time, by user UUID: user IDs can change (ADR-0021).
- **Application:** `ManageGroup.inviteByHandle` finds the ACTIVE player by exact
  user ID through the existing `UserDirectory` port, then asks the group. Group
  pages read the player over the service-role client the group store already
  uses, so no database pool is opened per request. `listInvitations`,
  `acceptInvitation` and `declineInvitation` complete the workflow. The browser
  never receives user UUIDs: the found player carries only `isSelf`, which hides
  the Invite button for the searcher's own user ID.
- **Storage (migration 0017):** `group_invitations` (group, invitee, inviter,
  time), with no browser access. `save_regular_group` gains two defaulted
  parameters and saves invitations in the same version-checked transaction as
  memberships. It locks and checks both accounts of a new invitation, so an
  inactive account can't invite or be invited (GRP02). It also clears
  invitations that the domain rules end, so saves from the app version before
  this migration (joining, link off, archiving) keep the table consistent.

## Consequences

- An invitation tells the invitee the group's name and who invited them, and
  tells the inviter whether the player is already a member of that group. Both
  were already visible to members through the member list and the link.
- There is no notification yet: the invitee sees the invitation the next time
  they open Groups. A push or email notice can be added on top of this table.
- Inviters cannot see or cancel pending invitations; the owner can end all of
  them by turning the link off. Expiry is not implemented.
- Pending invitations to an account that is later deleted stay in the table but
  are never shown or accepted, because only the invitee reads them and deleted
  accounts cannot sign in.
- Deploy order: apply 0017 before the app that reads `group_invitations`.
