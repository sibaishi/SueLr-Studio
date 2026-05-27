# Backend TypeScript Migration Plan

## Summary

The backend has already moved most implementation code to TypeScript, but it still runs through JavaScript entrypoints and `backend/src/**/*.js` compatibility facades. The next cleanup should make the backend fully TypeScript at runtime by using Node 22 `--experimental-strip-types`, then remove the JavaScript facades instead of maintaining parallel `.js` and `.ts` surfaces.

This is a broad migration. It affects backend startup, tests, restart behavior, Electron embedding, server-web deployment, CI, and docs. Do it as one coordinated change so the repo does not get stuck between JS and TS runtime conventions.

## Current State

- `backend/src/` contains many `.ts` implementations plus `.js` compatibility wrappers.
- `backend/server.js` is still the runtime backend entry.
- `backend/package.json` still starts and tests JavaScript files.
- `backend/tests/` still uses `.test.js` files and imports backend modules through `.js` paths.
- `restart-backend.ts` still writes `restart-trigger.js`, spawns `restart-runner.js`, and relaunches `server.js`.
- `backend/src/platform/providers/index.ts` exists, but the active runtime import path still goes through `index.js`.

## Implementation Plan

### 1. Switch Backend Entrypoints to TypeScript

- Create `backend/server.ts` from the current `backend/server.js`.
- Change backend internal imports in the entrypoint from `.js` to `.ts`.
- Delete `backend/server.js` after all callers are updated.
- Update `backend/package.json`:
  - `start`: `node --experimental-strip-types server.ts`
  - `dev`: `node --watch --experimental-strip-types server.ts`
  - `test`: `node --test --experimental-strip-types "tests/**/*.test.ts"`
- Update `backend/tsconfig.json`:
  - remove `allowJs` and `checkJs`
  - include `server.ts`, `src/**/*.ts`, and `tests/**/*.ts`

### 2. Remove Backend Source Compatibility Facades

- Change backend source imports from local `.js` module paths to `.ts` module paths.
- Delete all `backend/src/**/*.js` compatibility wrapper files.
- Keep frontend shared JavaScript imports when they intentionally point outside backend, such as `src/shared/workflow/node-registry.js` and `src/shared/workflow/prompt-helper.js`.
- Fix provider barrel ownership:
  - update `backend/src/platform/providers/index.ts` to export from `./provider-registry.ts`
  - delete `backend/src/platform/providers/index.js`

### 3. Keep Restart Watch Behavior, but Make It TS

- Keep `restart-trigger.ts` as the watch-mode sentinel module.
- Update `restart-backend.ts` so watch mode writes `restart-trigger.ts`.
- Update `restart-backend.ts` so replacement restart spawns `restart-runner.ts` and launches `server.ts`.
- Delete `restart-trigger.js` and `restart-runner.js`.

### 4. Migrate Backend Tests

- Rename all `backend/tests/*.test.js` files to `.test.ts`.
- Update test imports from `../src/**/*.js` to `../src/**/*.ts`.
- Update dynamic imports with query strings, for example `.js?test=...`, to `.ts?test=...`.
- Update `scripts/check-test-surface.mjs` to look for `backend/tests/http-contract.test.ts`.

### 5. Update Scripts, CI, Electron, and Server-Web Deployment

- Update `scripts/start-dev.mjs` and `scripts/start-local-web.mjs` to start `server.ts` with `--experimental-strip-types`.
- Update `playwright.config.ts` backend web server command to run `server.ts` with `--experimental-strip-types`.
- Update `.github/workflows/ci.yml` backend smoke start command.
- Update `electron/embedded-backend.cjs` to import `backend/server.ts`.
- Update `scripts/deploy/server-web/Dockerfile` and `scripts/deploy/server-web/release-files.txt` to copy and run `backend/server.ts`.
- Update `scripts/check-runtime-baseline.mjs` to inspect `backend/server.ts` and `backend/src/app/create-app.ts`.

### 6. Update Documentation and Guards

- Update public docs that list backend files from `.js` to `.ts`, especially `docs/developer-guide.md` and `docs/deployment-variants-plan.md`.
- Update private optimization notes if they still say the backend keeps `.js` compatibility wrappers as the end state.
- Add or update a repo hygiene check that fails if these paths return:
  - `backend/server.js`
  - `backend/src/**/*.js`
  - `backend/tests/**/*.js`
- Do not apply this guard to Electron `.cjs` files or frontend shared workflow `.js` files.

## Validation

Run the following after the migration:

```bash
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:backend
npm.cmd run test:unit
npm.cmd run check:encoding
npm.cmd run check:runtime-baseline
npm.cmd run check:test-surface
npm.cmd run check
```

For runtime sanity, also verify:

- `npm.cmd run dev:backend`
- `npm.cmd run dev -- --self-test` if a self-test path is available
- Electron embedded backend startup through the existing unit tests
- server-web release test

## Assumptions

- Node remains `>=22.12.0`; the migration depends on native strip-types support.
- No TypeScript build output is introduced.
- Backend runtime code should import backend modules through `.ts` paths.
- Existing frontend shared workflow JavaScript modules are out of scope for this backend cleanup.
- Electron main/preload files remain CommonJS and are not part of this migration.
