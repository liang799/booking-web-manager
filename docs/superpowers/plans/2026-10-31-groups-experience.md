# Groups Experience Implementation Plan

> Execute inline with superpowers:executing-plans.

**Goal:** Implement the supplied Groups overview, detail, and creation references.
**Architecture:** Server-authenticated pages project display data into local
React views; existing domain operations own all membership and invitation rules.
**Tech Stack:** Next.js, React, CSS modules, Radix Tabs, Vitest and Storybook.
**Spec:** [Groups experience](../specs/2026-10-31-groups-experience-design.md).

## Global constraints

Reuse existing assets and theme tokens. Preserve group authorization, invitation
acceptance, archive restrictions, confirmations and mobile navigation. No schema
changes. Limit creation to 20 invitations and never recreate after partial success.

## Review focus

- Partial invitation failure must preserve the created group and identify failures.
- Restored drafts are untrusted and scoped to the current user.
- Archived groups expose history without active sharing or mutation controls.
- Deleted profiles and long handles must remain readable without overflow.
- Copy denial must show an error and retain a selectable link.

## Task 1: Creation flow

- [x] Add and run failing action tests for normalized/deduplicated handles,
  validation before writes, authentication, and partial success.
- [x] Implement `createGroupWithPlayers(previous, formData)` in
  `app/groups/create-group-action.ts`, using existing create/invite operations.
- [x] Add authenticated `app/groups/new/page.tsx`, a two-step wizard, user-scoped
  session draft storage and player selection. Preserve name/selection on errors.
- [x] Add browser stories for validation, back navigation, add/remove/duplicate
  players, saved drafts, mobile, both themes and partial invitation failure.

## Task 2: Overview and details

- [x] Replace the overview's create dialog with `/groups/new`; add court header,
  filter counts, underline tabs and Active/Archived status. Keep mobile navigation.
- [x] Create `group-detail-view.tsx` and local CSS. Server page supplies real
  organiser/member data and existing action controls as slots.
- [x] Add member/invitation tabs, a link/user-ID invite panel, owner settings,
  archived history, and clipboard error handling.
- [x] Verify page regressions and browser stories for roles, archive states,
  long names, keyboard operation and narrow screens.

## Task 3: Validation and PR

- [x] Run unit suite, typecheck, lint, focused browser stories and build.
- [x] Inspect desktop/mobile screenshots in both themes and retain PR evidence.
- [x] Review the complete diff, fix findings, document behavior and limitations.
- [x] Commit semantically, push the branch, and create a PR against main.
