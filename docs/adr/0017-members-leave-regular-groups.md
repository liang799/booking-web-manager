# ADR-0017: Members leave regular groups through RegularGroup

- Status: Accepted
- Date: 2026-10-21
- Amends: [ADR-0003](./0003-aggregate-roots-and-boundaries.md)'s group command
  authority, which named only invitation access and owner authority.

UC1-06 previously let a member leave a regular group only by asking its owner to
remove them. The project lead asked for members to be able to leave on their own.

`RegularGroup.leave` adds a third kind of authority: a member acting on their own
membership. The command carries only the leaving user's ID, which the application
takes from the authenticated session, so it cannot remove anyone else. The root
still enforces the group's rules:

- An archived group rejects the change (`INVALID_STATE`), as it does for removal.
- The owner cannot leave (`OWNER_REMOVAL`), because a group must retain its owner.
  An owner who no longer wants the group archives it instead. Ownership transfer
  remains out of scope.
- A user who is not a member is rejected (`NOT_FOUND`), so leaving reveals nothing
  about groups the user does not belong to.

Leaving has the same effect as an owner removal: the membership row is deleted, the
user can rejoin only through a current invitation link, and session participations
are unaffected. `ManageGroup.leave` loads, changes and saves the group like the
other commands, so the existing `save_regular_group` transaction, optimistic version
check and account guards from ADR-0014 apply unchanged. No migration is needed.
