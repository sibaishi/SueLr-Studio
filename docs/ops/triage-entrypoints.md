# Triage Entry Points

## Scope

This document is the minimum debugging map for SueLr Studio after Week 12.

The goal is not full observability. The goal is to give developers a stable
first place to look when something fails.

## Startup And Configuration

Check these first when the app does not boot or settings look wrong:

1. frontend browser console
2. backend startup output from `npm run dev:backend` or `npm run start:backend`
3. `docs/ops/environment-baseline.md` for expected Node, env, and runtime paths
4. runtime config root from `APP_CONFIG_DIR` or platform default config path

Useful files and paths:

- backend entry: `backend/server.js`
- default runtime root on Windows:
  `%APPDATA%\\SueLr-Studio`

## Workflow Execution

When a workflow run fails, inspect:

1. workflow run logs under `logs/workflow-runs/<date>/`
2. request id from backend response headers or backend log lines
3. backend execution module path:
   `backend/src/modules/execution/`

Important signals:

- run lifecycle events in JSONL logs
- node or workflow failure entries
- whether files or generated outputs were written alongside the run

## Provider And Media Requests

When chat, image, video, upload, or model-sync requests fail, inspect:

1. backend request logs with `requestId`
2. provider error normalization in:
   `backend/src/platform/providers/`
3. settings repository and provider config shaping in:
   `backend/src/modules/settings/`
4. media request modules in:
   `backend/src/modules/images/`
   `backend/src/modules/capabilities/`
   `backend/src/modules/files/`

Common triage split:

- `400` usually means request validation or unsafe URL rejection
- `502` usually means upstream/provider failure handling
- timeout or partial-result behavior usually needs both request log review and
  workflow/media path review

## Frontend Failures

When the browser UI fails but backend endpoints still work, inspect:

1. browser console errors
2. failing panel component under `src/components/` or `src/features/`
3. shared API parsing helpers under `src/shared/api/`
4. Playwright coverage in `tests/e2e/studio-smoke.spec.ts`
5. workflow store proof tests under `tests/unit/workflow-store/`

Use the cheapest reproducer first:

1. store-level proof test
2. backend contract test
3. Playwright regression
4. full manual workflow

## Release-Day Triage Order

If a release smoke fails, use this order:

1. confirm whether the failure is frontend-only, backend-only, or provider-only
2. collect the request id if the backend was involved
3. inspect the matching runtime log or workflow-run log
4. compare the failure against `docs/ops/regression-matrix.md`
5. decide rollback vs. fix-forward using
   `docs/ops/deployment-and-rollback.md`
