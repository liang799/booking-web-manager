# Groups UI Implementation Plan

> Execute inline with superpowers:executing-plans. Track completion below.

**Goal:** Revamp the UC1-06 groups overview to match the supplied reference.
**Architecture:** Server-owned membership data feeds a feature-local client view;
existing server actions and shared components retain their responsibilities.
**Tech stack:** Next.js, React, CSS modules, Radix dialog/tabs, Storybook and Vitest.
**Spec:** [Groups design](../specs/2026-10-26-groups-ui-design.md).

## Constraints and review focus

Keep the sidebar, domain, database, group details and mutation policies unchanged.
Use existing images, theme tokens and Lucide. Show real data, preserve privacy,
and support 390px screens. Check empty filters, archived roles, unavailable names,
long content, keyboard dismissal and focus restoration.

## Task 1: Server projection and overview

- [x] Add `tests/app/groups/groups-page.test.ts`: verify the new title, real member
  names/counts, authentication redirect, and absence of invitation tokens.
- [x] Run it against the existing page and confirm the new overview assertion fails.
- [x] Create `_components/groups-view.tsx` and its CSS module; adapt `page.tsx`
  to project groupId, name, ownerName, isOwner, archived, memberCount and memberNames.
  Fetch only owners and the first four members through `displayNames` once.
- [x] Render the existing `CreateGroupForm` through a React-node slot in a dialog.
  Implement filters, truthful empty states, rows and role-appropriate options links.
- [x] Verify the page tests pass.

## Task 2: Interaction and visual verification

- [x] Add deterministic Storybook fixtures and stories for populated, empty,
  filter-empty, long-name, mobile and dark layouts. Exercise filters, options
  dismissal, detail anchors, dialog dismissal and focus restoration.
- [x] Run the targeted Storybook suite; inspect responsive browser screenshots in
  Chromium and WebKit. Repair any overflow, accessibility or interaction issues.
- [x] Update `app/groups/README.md` with overview behavior and asset provenance.
- [x] Run typecheck, lint and the unit suite; compare any failures with baseline.
- [ ] Review the diff, commit semantically, push the feature branch, and create
  and attach the PR with validation and relevant screenshots.
