# groups test cases

Snapshot: **2026-10-24, payout refactor** · **35 cases, 35 passed**. See the [domain testing guide](../README.md) and [execution evidence](../results/README.md).

Each row is one independently executable test; its first input value links to the test definition. **Oracle** is the expected result. **Log** contains assertion-verified observations from the recorded run, not captured runtime payloads. A result states only what that case's assertions establish; partial matches, approximate values, and identity checks retain their narrower meaning. Refresh this snapshot after relevant source changes.

All timestamps are UTC. Unless overridden in a table, group `group` is ACTIVE, owned by `owner`, and contains only `owner`; memberships and commands use 2026-09-15 00:00:00 UTC. Construction cases use name `Badminton` and active token `invite`; command cases use name `Sunday badminton` and active token `first-token`. “State unchanged” covers name, invitation token/active flag, ordered membership IDs and join dates, and group status.

## Group membership

### Construct a membership

**Input:** User ID, Joined at (UTC) · **Oracle:** Expected Result · **Log:** Test Result

Execution: **2 passed / 2 cases**.

| User ID | Joined at (UTC) | Expected Result | Test Result |
|---|---|---|---|
| [owner](group-membership.test.ts#L5) | Invalid date | DomainError | DomainError |
| [One space](group-membership.test.ts#L11) | 2026-09-15 00:00:00 | DomainError | DomainError |

### Read the join date after attempted date mutation

**Input:** User ID, Original join date (UTC), Attempted year on supplied and returned dates · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| User ID | Original join date (UTC) | Attempted year on supplied and returned dates | Expected Result | Test Result |
|---|---|---|---|---|
| [owner](group-membership.test.ts#L17) | 2026-09-15 00:00:00 | 2000 | Joined at: 2026-09-15 00:00:00 UTC | Joined at: 2026-09-15 00:00:00 UTC |

## Regular group construction and membership copies

### Restore a group

**Input:** Owner ID, Member IDs, Group status, Invitation active · **Oracle:** Expected Result · **Log:** Test Result

Execution: **4 passed / 4 cases**.

| Owner ID | Member IDs | Group status | Invitation active | Expected Result | Test Result |
|---|---|---|---|---|---|
| [owner](regular-group.test.ts#L11) | None | ACTIVE | true | DomainError | DomainError |
| [owner](regular-group.test.ts#L17) | owner, owner (same membership instance) | ACTIVE | true | DomainError | DomainError |
| [missing](regular-group.test.ts#L24) | owner | ACTIVE | true | DomainError | DomainError |
| [owner](regular-group.test.ts#L30) | owner | ARCHIVED | true | DomainError | DomainError |

### Read memberships after attempted collection and date mutation

**Input:** Original member IDs, Mutation target, Attempted changes · **Oracle:** Expected Result · **Log:** Test Result

Execution: **2 passed / 2 cases**.

| Original member IDs | Mutation target | Attempted changes | Expected Result | Test Result |
|---|---|---|---|---|
| [owner](regular-group.test.ts#L36) | Supplied memberships | Set first join year to 2000; remove last membership | Members: owner; joined at: 2026-09-15 00:00:00 UTC | Members: owner; joined at: 2026-09-15 00:00:00 UTC |
| [owner](regular-group.test.ts#L52) | Returned memberships | Set first join year to 2000; remove last membership | Members: owner; joined at: 2026-09-15 00:00:00 UTC | Members: owner; joined at: 2026-09-15 00:00:00 UTC |

## Invitation access

### Join using an invitation

**Input:** User ID, Group status, Current token, Invitation active, Supplied token, Join attempts · **Oracle:** Expected Result · **Log:** Test Result

Execution: **4 passed / 4 cases**.

| User ID | Group status | Current token | Invitation active | Supplied token | Join attempts | Expected Result | Test Result |
|---|---|---|---|---|---|---|---|
| [player](regular-group.test.ts#L67) | ACTIVE | first-token | true | first-token | 2 | First: JOINED; repeat: ALREADY_MEMBER; ACTIVE; members: owner, player (2) | First: JOINED; repeat: ALREADY_MEMBER; ACTIVE; members: owner, player (2) |
| [owner](regular-group.test.ts#L92) | ACTIVE | first-token | false | first-token | 1 | INVALID_INVITATION; state unchanged | INVALID_INVITATION; state unchanged |
| [player](regular-group.test.ts#L106) | ACTIVE | next-token | true | first-token | 1 | INVALID_INVITATION; state unchanged | INVALID_INVITATION; state unchanged |
| [player](regular-group.test.ts#L136) | ARCHIVED | first-token | false | first-token | 1 | INVALID_STATE; state unchanged | INVALID_STATE; state unchanged |

### Rotate a revoked invitation, then join

**Input:** Actor ID, Invitation initially active, New token, Joining user ID, Supplied token · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Actor ID | Invitation initially active | New token | Joining user ID | Supplied token | Expected Result | Test Result |
|---|---|---|---|---|---|---|
| [owner](regular-group.test.ts#L120) | false | next-token | player | next-token | JOINED | JOINED |

### Rotate an invitation

**Input:** Actor ID, Group status, Invitation active, New token · **Oracle:** Expected Result · **Log:** Test Result

Execution: **2 passed / 2 cases**.

| Actor ID | Group status | Invitation active | New token | Expected Result | Test Result |
|---|---|---|---|---|---|
| [other](regular-group.test.ts#L150) | ACTIVE | true | new | UNAUTHORIZED; state unchanged | UNAUTHORIZED; state unchanged |
| [owner](regular-group.test.ts#L160) | ARCHIVED | false | new | INVALID_STATE; state unchanged | INVALID_STATE; state unchanged |

### Revoke an invitation

**Input:** Actor ID, Current token, Invitation active · **Oracle:** Expected Result · **Log:** Test Result

Execution: **2 passed / 2 cases**.

| Actor ID | Current token | Invitation active | Expected Result | Test Result |
|---|---|---|---|---|
| [owner](regular-group.test.ts#L170) | first-token | true | Invitation inactive; token: first-token | Invitation inactive; token: first-token |
| [other](regular-group.test.ts#L179) | first-token | true | UNAUTHORIZED; state unchanged | UNAUTHORIZED; state unchanged |

## Group naming

### Rename a group

Archived groups have an inactive invitation.

**Input:** Actor ID, Group status, New name · **Oracle:** Expected Result · **Log:** Test Result

Execution: **4 passed / 4 cases**.

| Actor ID | Group status | New name | Expected Result | Test Result |
|---|---|---|---|---|
| [other](regular-group.test.ts#L191) | ACTIVE | New name | UNAUTHORIZED; state unchanged | UNAUTHORIZED; state unchanged |
| [owner](regular-group.test.ts#L201) | ACTIVE | Saturday tennis | Name: Saturday tennis | Name: Saturday tennis |
| [owner](regular-group.test.ts#L209) | ACTIVE | One space | INVALID_INPUT; state unchanged | INVALID_INPUT; state unchanged |
| [owner](regular-group.test.ts#L219) | ARCHIVED | New | INVALID_STATE; state unchanged | INVALID_STATE; state unchanged |

## Membership removal

### Remove a member

**Input:** Actor ID, Existing member IDs, Target user ID · **Oracle:** Expected Result · **Log:** Test Result

Execution: **4 passed / 4 cases**.

| Actor ID | Existing member IDs | Target user ID | Expected Result | Test Result |
|---|---|---|---|---|
| [other](regular-group.test.ts#L231) | owner | owner | UNAUTHORIZED; state unchanged | UNAUTHORIZED; state unchanged |
| [owner](regular-group.test.ts#L241) | owner, player | player | Members: owner | Members: owner |
| [owner](regular-group.test.ts#L249) | owner | owner | OWNER_REMOVAL; state unchanged | OWNER_REMOVAL; state unchanged |
| [owner](regular-group.test.ts#L259) | owner | missing | NOT_FOUND; state unchanged | NOT_FOUND; state unchanged |

## Archiving

### Archive a group

**Input:** Actor ID, Unsettled linked sessions, Archive attempts · **Oracle:** Expected Result · **Log:** Test Result

Execution: **4 passed / 4 cases**.

| Actor ID | Unsettled linked sessions | Archive attempts | Expected Result | Test Result |
|---|---|---|---|---|
| [other](regular-group.test.ts#L271) | 0 | 1 | UNAUTHORIZED; state unchanged | UNAUTHORIZED; state unchanged |
| [owner](regular-group.test.ts#L281) | 1 | 1 | ACTIVE_OBLIGATIONS; state unchanged | ACTIVE_OBLIGATIONS; state unchanged |
| [owner](regular-group.test.ts#L291) | -1 | 1 | INVALID_INPUT; state unchanged | INVALID_INPUT; state unchanged |
| [owner](regular-group.test.ts#L301) | 0 | 2 | ARCHIVED; invitation inactive; members: owner | ARCHIVED; invitation inactive; members: owner |

## Leaving and rejoining

### Leave a group

The archived case uses the construction defaults and an inactive invitation.

**Input:** Leaving user ID, Group status, Existing member IDs · **Oracle:** Expected Result · **Log:** Test Result

Execution: **4 passed / 4 cases**.

| Leaving user ID | Group status | Existing member IDs | Expected Result | Test Result |
|---|---|---|---|---|
| [aisha](regular-group.test.ts#L314) | ACTIVE | owner, aisha, ben | Members: owner, ben | Members: owner, ben |
| [owner](regular-group.test.ts#L327) | ACTIVE | owner, aisha | OWNER_REMOVAL; state unchanged | OWNER_REMOVAL; state unchanged |
| [stranger](regular-group.test.ts#L337) | ACTIVE | owner | NOT_FOUND; state unchanged | NOT_FOUND; state unchanged |
| [aisha](regular-group.test.ts#L347) | ARCHIVED | owner, aisha | INVALID_STATE; state unchanged | INVALID_STATE; state unchanged |

### Leave, then rejoin using the current invitation

**Input:** User ID, Initial member IDs, Supplied token · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| User ID | Initial member IDs | Supplied token | Expected Result | Test Result |
|---|---|---|---|---|
| [aisha](regular-group.test.ts#L366) | owner, aisha | first-token | JOINED; members: owner, aisha | JOINED; members: owner, aisha |

## Invitations by user ID

Added after the 2026-10-24 snapshot with [ADR-0022](../../../docs/adr/0022-invite-players-to-groups-by-user-id.md); the counts below are from this change's run on 2026-10-28 (**24 cases, 24 passed**), not the snapshot. Unless overridden, group `group` is ACTIVE, named `Sunday badminton`, with active token `first-token`, owned by `owner` and containing only `owner`; invitations are sent by `owner` and dates are 2026-09-15 00:00:00 UTC. “State unchanged” also covers the ordered pending invitations (invitee, inviter, time) and group status.

### Restore pending invitations

**Input:** Member IDs, Invitation active, Pending invitee IDs · **Oracle:** Expected Result · **Log:** Test Result

Execution: **4 passed / 4 cases**.

| Member IDs | Invitation active | Pending invitee IDs | Expected Result | Test Result |
|---|---|---|---|---|
| [owner](regular-group-invitations.test.ts#L11) | true | Omitted | Invitations: none | Invitations: none |
| [owner](regular-group-invitations.test.ts#L17) | true | aisha, aisha | DUPLICATE_ID | DUPLICATE_ID |
| [owner, aisha](regular-group-invitations.test.ts#L27) | true | aisha | INVALID_INPUT | INVALID_INPUT |
| [owner](regular-group-invitations.test.ts#L38) | false | aisha | INVALID_INPUT | INVALID_INPUT |

### Construct an invitation

**Input:** Invitee ID, Invited by, Invited at (UTC) · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Invitee ID | Invited by | Invited at (UTC) | Expected Result | Test Result |
|---|---|---|---|---|
| [owner](regular-group-invitations.test.ts#L49) | owner | 2026-09-15 00:00:00 | INVALID_INPUT | INVALID_INPUT |

### Read invitations after attempted collection and date mutation

**Input:** Original invitee IDs, Mutation target, Attempted changes · **Oracle:** Expected Result · **Log:** Test Result

Execution: **1 passed / 1 cases**.

| Original invitee IDs | Mutation target | Attempted changes | Expected Result | Test Result |
|---|---|---|---|---|
| [aisha](regular-group-invitations.test.ts#L60) | Returned invitations | Set first invitation year to 2000; remove last invitation | Invitees: aisha; invited at: 2026-09-15 00:00:00 UTC | Invitees: aisha; invited at: 2026-09-15 00:00:00 UTC |

### Send an invitation

**Input:** Actor ID, Group status, Invitation active, Existing member IDs, Existing invitee IDs, Invitee ID · **Oracle:** Expected Result · **Log:** Test Result

Execution: **8 passed / 8 cases**.

| Actor ID | Group status | Invitation active | Existing member IDs | Existing invitee IDs | Invitee ID | Expected Result | Test Result |
|---|---|---|---|---|---|---|---|
| [owner](regular-group-invitations.test.ts#L77) | ACTIVE | true | owner | None | aisha | INVITED; invitations: aisha by owner at 2026-09-16 08:00:00 UTC; members: owner | INVITED; invitations: aisha by owner at 2026-09-16 08:00:00 UTC; members: owner |
| [ben](regular-group-invitations.test.ts#L90) | ACTIVE | true | owner, ben | None | aisha | INVITED; invitations: aisha by ben | INVITED; invitations: aisha by ben |
| [ben](regular-group-invitations.test.ts#L103) | ACTIVE | true | owner, ben | aisha (by owner) | aisha | ALREADY_INVITED; invitations: aisha by owner at 2026-09-15 00:00:00 UTC | ALREADY_INVITED; invitations: aisha by owner at 2026-09-15 00:00:00 UTC |
| [stranger](regular-group-invitations.test.ts#L123) | ACTIVE | true | owner | None | aisha | UNAUTHORIZED; state unchanged | UNAUTHORIZED; state unchanged |
| [owner](regular-group-invitations.test.ts#L133) | ACTIVE | false | owner | None | aisha | INVALID_INVITATION; state unchanged | INVALID_INVITATION; state unchanged |
| [owner](regular-group-invitations.test.ts#L143) | ARCHIVED | false | owner | None | aisha | INVALID_STATE; state unchanged | INVALID_STATE; state unchanged |
| [owner](regular-group-invitations.test.ts#L155) | ACTIVE | true | owner | None | owner | INVALID_INPUT; state unchanged | INVALID_INPUT; state unchanged |
| [owner](regular-group-invitations.test.ts#L165) | ACTIVE | true | owner, aisha | None | aisha | ALREADY_MEMBER; state unchanged | ALREADY_MEMBER; state unchanged |

### Answer an invitation

The archived case has an inactive invitation link.

**Input:** Command, User ID, Group status, Existing member IDs, Pending invitee IDs · **Oracle:** Expected Result · **Log:** Test Result

Execution: **6 passed / 6 cases**.

| Command | User ID | Group status | Existing member IDs | Pending invitee IDs | Expected Result | Test Result |
|---|---|---|---|---|---|---|
| [acceptInvitation](regular-group-invitations.test.ts#L179) | aisha | ACTIVE | owner | aisha | JOINED; members: owner, aisha (joined 2026-09-16 09:30:00 UTC); invitations: none | JOINED; members: owner, aisha (joined 2026-09-16 09:30:00 UTC); invitations: none |
| [acceptInvitation](regular-group-invitations.test.ts#L195) | aisha | ACTIVE | owner, aisha | None | ALREADY_MEMBER; state unchanged | ALREADY_MEMBER; state unchanged |
| [acceptInvitation](regular-group-invitations.test.ts#L207) | ben | ACTIVE | owner | aisha | INVALID_INVITATION; state unchanged | INVALID_INVITATION; state unchanged |
| [acceptInvitation](regular-group-invitations.test.ts#L219) | aisha | ARCHIVED | owner | None | INVALID_STATE; state unchanged | INVALID_STATE; state unchanged |
| [declineInvitation](regular-group-invitations.test.ts#L231) | aisha | ACTIVE | owner | aisha, ben | Invitations: ben; members: owner | Invitations: ben; members: owner |
| [declineInvitation](regular-group-invitations.test.ts#L242) | ben | ACTIVE | owner | aisha | State unchanged | State unchanged |

### End invitations with the link

**Input:** Command, Pending invitee IDs · **Oracle:** Expected Result · **Log:** Test Result

Execution: **4 passed / 4 cases**.

| Command | Pending invitee IDs | Expected Result | Test Result |
|---|---|---|---|
| [join (aisha, token first-token)](regular-group-invitations.test.ts#L255) | aisha, ben | JOINED; invitations: ben | JOINED; invitations: ben |
| [revokeInvitation (owner)](regular-group-invitations.test.ts#L266) | aisha | Invitation inactive; invitations: none | Invitation inactive; invitations: none |
| [rotateInvitation (owner, next-token)](regular-group-invitations.test.ts#L277) | aisha | Invitations: aisha | Invitations: aisha |
| [archive (owner, 0 unsettled)](regular-group-invitations.test.ts#L287) | aisha | ARCHIVED; invitations: none | ARCHIVED; invitations: none |
