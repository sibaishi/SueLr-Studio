# Workflow Stabilization Plan

## Overall Status

- Week 1: Completed
- Week 2: Completed
- Week 3: Completed
- Week 4: Completed
- Week 5: Completed
- Week 6: Completed
- Week 7: Completed
- Week 8: Completed
- Week 9: Completed
- Week 10: Completed
- Week 11: Completed
- Week 12: Completed

## Current Phase Summary

Weeks 1 through 8 completed the structural cleanup and workflow stabilization baseline. Week 9 closed the engineering delivery baseline around CI, environment consistency, and release documentation. Week 10 closes the first frontend E2E regression net.

The project now has:

- a unified quality gate
- aligned Node and runtime baselines
- release and rollback documentation
- a stable local frontend E2E entry point
- CI coverage for the stable frontend E2E subset

## Week 9 - Completed

Delivered:

1. remote CI workflow
2. Node / env / install / startup baseline documentation
3. deployment and rollback documentation
4. Week 9 verification checklist

Closure:

- CI is running successfully
- the GitHub Actions Node 20 deprecation warning was removed
- Week 9 is closed

## Week 10 - Completed

Delivered:

1. Playwright baseline integration
2. isolated E2E frontend/backend runtime setup
3. first batch of stable `data-testid` hooks
4. five passing local E2E smoke / regression cases
5. cleanup of test initialization state and artifact ignore rules
6. CI `frontend-e2e` job
7. regression coverage for:
   - workflow add-node undo
   - settings provider-to-model-import linkage

Closure:

- local `npm run check` passed
- local `npm run test:e2e` passed
- Week 10 goal is complete

## Week 11 - Completed

Delivered:

1. a frontend unit-test lane for workflow store proof tests through `vitest`
2. the first proof-oriented coverage batch for graph editing, grouping, merge sizing, document hydration/import, and execution restore/resync
3. stronger structural checks requiring both workflow store proof tests and boundary documentation
4. a dedicated workflow store boundary note for `editor`, `document`, and `execution`

Closure:

- `npm run check:workflow-store` passed
- `npm run test:unit` passed
- `npm run check` passed

## Week 12 - Completed

Delivered:

1. a release checklist for pre-release gates, manual smoke, rollback readiness,
   and release record capture
2. a regression matrix mapping high-risk change areas to automated and manual
   verification
3. a triage entrypoint note covering startup, workflow execution, provider and
   media failures, and frontend-only failures
4. a release-rhythm note describing the minimum discipline expected per change,
   per release, and per escaped regression
5. a lightweight `check:release-docs` gate folded into `npm run check`

Closure:

- `npm run check:release-docs` passed
- `npm run check` passed
- release, regression, and triage docs are now part of the maintained baseline
