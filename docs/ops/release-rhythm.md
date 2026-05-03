# Release Rhythm

## Scope

This note defines the minimum engineering rhythm that keeps Week 9 through Week
12 gains from sliding back.

## Per Change

Every change should follow these rules:

1. update the nearest proof layer first when fixing a bug
2. keep code and docs in the same commit when boundaries, release steps, or
   triage paths change
3. choose the cheapest regression layer that proves the risk:
   backend test, store proof test, E2E, or manual smoke
4. do not merge a structural refactor without the boundary note staying current

## Per Release

Every release should leave behind:

1. one completed release record
2. one explicit statement of which gates were run
3. one manual smoke result
4. one rollback target

If a gate was skipped, the release record must say why.

## Per Regression

When a real bug escapes:

1. capture where it was first seen
2. identify the missing proof layer
3. add or extend that proof before closing the fix
4. update `docs/ops/regression-matrix.md` if the existing mapping was unclear

Rule: a regression is not fully closed until it leaves the project harder to
break the same way again.

## Ownership Cues

When touching these areas, also check the matching long-lived document:

- workflow store changes: `docs/architecture/workflow-store-boundaries.md`
- release flow changes: `docs/ops/release-checklist.md`
- debug-entry changes: `docs/ops/triage-entrypoints.md`
- verification-scope changes: `docs/ops/regression-matrix.md`

## Review Habit

At the end of each week or release slice:

1. run the required gates
2. update the matching weekly roadmap note
3. update the matching testing checklist
4. confirm `docs/README.md` still points to the right current focus
