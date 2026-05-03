# Week 11 Store Proof Tests And Boundary Hardening

## Weekly Goal

Week 11 moves the workflow store from "split into cleaner files" to "backed by proof and harder to regress by accident".

The focus this week is not the UI surface. The focus is the high-risk logic inside the workflow store boundary:

1. graph editing actions
2. grouping and merge-sizing behavior
3. document lifecycle transitions
4. execution restore and resync state

## Delivered This Week

### 1. Store Proof Test Baseline

A dedicated frontend unit-test lane now exists for workflow store logic:

- `vitest` is integrated
- `npm run test:unit` runs the store proof suite
- `npm run check` now includes the unit-test lane

The first Week 11 proof suite covers:

1. edge replacement on the same target handle
2. descendant-aware node removal and execution residue cleanup
3. group creation and ungroup recovery
4. merge node input-count and minimum-size normalization
5. workflow load / hydration / import lifecycle reset behavior
6. execution preflight validation, restore, and status resync

### 2. Boundary Hardening

The workflow store structure check now also guards two Week 11 expectations:

- workflow store proof tests must exist under `tests/unit/workflow-store`
- workflow store boundary documentation must exist and include editor / document / execution sections

This keeps the Week 11 outcome from being only a one-time cleanup.

### 3. Boundary Documentation

`docs/architecture/workflow-store-boundaries.md` now records:

- what `editor` owns
- what `document` owns
- what `execution` owns
- what each module explicitly does not own
- what kind of proof should be added when that module changes

## Verification Result

Week 11 closes when the following pass together:

- `npm run check:workflow-store`
- `npm run test:unit`
- `npm run check`

## Why This Matters

Week 10 gave the project a stable UI regression net. Week 11 adds a cheaper and faster proof layer under it.

That changes the maintenance posture in two useful ways:

1. store regressions can now be proven close to the logic instead of only through browser behavior
2. future refactors have a clearer boundary map, so logic is less likely to drift back into composition files

## Conclusion

Week 11 is complete once the unit-test baseline, boundary documentation, and structural checks all pass together. After that, Week 12 can focus on release discipline and observability instead of still shoring up core workflow logic.
