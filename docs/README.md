# Documentation Hub

Current documentation baseline date: `2026-05-03`

## Recommended Reading Order

1. `docs/plans/2026-05-03-workflow-stabilization-plan.md`
2. `docs/roadmap/project-optimization-roadmap.md`
3. matching weekly roadmap files under `docs/roadmap/`
4. matching weekly testing files under `docs/testing/`
5. Week 9 operations documents:
   - `docs/ops/environment-baseline.md`
   - `docs/ops/deployment-and-rollback.md`

## Current Status

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
- Week 11: Not started
- Week 12: Not started

## Week 9 Delivered

- Remote CI is integrated in `.github/workflows/ci.yml`
- GitHub Actions dependencies were upgraded to `actions/checkout@v5` and `actions/setup-node@v5`
- Node baseline is aligned through `.nvmrc` and frontend/backend package configuration
- `docs/ops/environment-baseline.md` and `docs/ops/deployment-and-rollback.md` are in place
- Local quality gate command is `npm run check`

## Week 10 Delivered

- Playwright is integrated
- Unified E2E commands are available:
  - `npm run test:e2e`
  - `npm run test:e2e:ui`
  - `npm run test:e2e:install`
- The stable local E2E suite now covers:
  - settings persistence after reload
  - workflow node creation from the sidebar
  - navigation from workflow back to settings
  - undo after adding a workflow node
  - provider connection test syncing models into the import list
- Stable `data-testid` hooks were added to key settings and workflow surfaces
- CI now runs the stable frontend E2E subset through `frontend-e2e`

## Current Focus

1. Move into Week 11 store-level proof tests and boundary strengthening
2. Continue expanding frontend regression coverage on top of the Week 10 baseline
3. Prepare the Week 12 release hardening and regression matrix closure
