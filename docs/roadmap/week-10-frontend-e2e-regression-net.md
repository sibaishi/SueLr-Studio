# Week 10 Frontend E2E Regression Net

## Weekly Goal

Week 10 focuses on moving the most regression-prone frontend paths from manual checking to a first repeatable automated regression net. The target is not broad coverage yet; the target is a stable baseline that can run locally and in CI.

## Delivered This Week

### 1. E2E Baseline

- Playwright has been integrated into the repo
- Unified commands are available:
  - `npm run test:e2e`
  - `npm run test:e2e:ui`
  - `npm run test:e2e:install`
- `playwright.config.ts` is in place
- The E2E run uses isolated frontend and backend runtime settings

### 2. Testability Hooks

Stable `data-testid` coverage has been added to key surfaces, including:

- top navigation
- settings page
- connection configuration area
- provider and models linkage area
- workflow page
- workflow sidebar
- workflow toolbar
- workflow status bar

In addition, shared iOS-style input/select/card wrappers now forward native props so test hooks land on real DOM nodes.

### 3. Stable Regression Coverage

The local E2E suite now includes five passing cases:

1. settings fields persist after reload
2. workflow can add a node from the sidebar
3. workflow toolbar can navigate back to settings
4. workflow editing can undo a newly added node
5. settings connection test syncs models into the import list

### 4. CI Integration

CI now includes a `frontend-e2e` job that runs after `quality-gate`, installs the required frontend/backend dependencies, installs Playwright browsers, and executes the stable E2E subset.

## Verification Result

Local verification passed with:

- `npm run check`
- `npm run test:e2e`

Current local E2E result: `5 passed`.

## Remaining Expansion Areas

These are follow-up coverage items, not Week 10 blockers:

1. workflow connect / duplicate / delete paths
2. workflow group / ungroup / release paths
3. merge node sizing interactions
4. draft save / restore
5. more fixed historical issues converted into automated regressions

## Conclusion

Week 10 is complete. The project now has a working frontend E2E baseline, two new high-value regression chains, and CI coverage for the stable subset.
