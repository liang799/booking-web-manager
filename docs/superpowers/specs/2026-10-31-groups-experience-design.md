# Groups experience refresh

Use the three supplied screenshots as the visual specification: a court-backed
overview with counted underline filters and clear Active/Archived states, a
member detail page with avatars and an invitation sidebar, and a two-step
creation page with a large court photograph. Keep the existing shell, light and
dark tokens, and mobile Sessions/Groups navigation.

## Approach

Extend the existing feature-local views and server actions. A separate
`/groups/new` route gives creation the space in the references. Reuse licensed
court assets and existing group policies rather than add uploaded covers or a
new persistence model. A dialog-only refresh would not accommodate the supplied
two-column creation design; replacing the shared shell would exceed this task.

Creation validates a name, lets the owner find and queue up to 20 players by
exact user ID, and sends invitations only after creating the group. Invitations
require acceptance. A failed invitation must never encourage duplicate group
creation: return the created group's link and explain each failed invitation.
Saved drafts are scoped to the signed-in user in sessionStorage and restored
only on that user's creation page. Storage failure must not prevent creation.

Details retain owner-only rename/archive/link controls and removal confirmation,
member-only leave confirmation, read-only archived history, and hidden handles
for deleted users. Members and Invitations tabs organize member history and
sharing tools; sharing supports a link and exact user ID. No outgoing invitation
history is invented because the current domain exposes only incoming invitations.

Support narrow screens, keyboard navigation, long names, empty states, pending
and error states, clipboard failure, and reduced motion. No database migration
or shared navigation redesign is required.
