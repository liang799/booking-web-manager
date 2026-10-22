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
