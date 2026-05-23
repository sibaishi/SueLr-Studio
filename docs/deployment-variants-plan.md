# Deployment Variants Execution Plan

This document defines how SueLr Studio will evolve from one local-first codebase into the current `master` trunk with three public release variants:

- `local-web`: frontend + backend running locally and opened in a browser
- `desktop`: a clean Electron desktop shell
- `server`: a deployable server version that starts single-user and later evolves to multi-user

The delivery rule is simple:

- shared product logic belongs on `master` in this repository
- release branches carry shell, packaging, and deployment differences only

## Repository Root Cleanup

The repository root must become easier to scan before deeper variant work continues. Today the root mixes source trees, release outputs, runtime directories, public docs, launchers, and maintenance files.

The cleanup goal is:

- keep only stable entrypoints and top-level ownership directories at the root
- clearly distinguish source, tooling, docs, release outputs, and runtime data
- stop adding new ad hoc files or semi-permanent helper scripts directly to the root

### Root directories that remain first-class

- `src/`
  - frontend product source
- `backend/`
  - backend source and runtime entry
- `electron/`
  - desktop shell only
- `docs/`
  - public documentation only
- `tests/`
  - frontend unit and end-to-end coverage
- `scripts/`
  - maintenance, validation, and launcher scripts
- `workflows/`
  - shared example workflows
- `build/`
  - build resources such as icons and packaging assets

### Root directories that must stay classified as generated or runtime-only

- `dist/`
  - built frontend artifacts
- `release/`
  - packaged desktop outputs
- `.run-logs/`
  - launcher and runtime log output
- `storage/`
  - repository-local runtime storage used only when explicitly configured for development

Rules:

- these directories must stay ignored by git
- documentation must describe them as runtime or generated surfaces, not as source structure
- new code must not depend on these paths as permanent repository-owned source locations

### Root directories that were reviewed and drained

- `development/`
  - the directory has been drained as part of the structure refactor
  - do not recreate it; place durable content in `scripts/`, `docs/`, or `.private-docs/`

### Root files that should remain visible entrypoints

- `package.json`
- `package-lock.json`
- `README.md`
- `CONTRIBUTING.md`
- `AGENTS.md`
- `index.html`
- `vite.config.ts`
- `vitest.config.ts`
- `playwright.config.ts`
- `tsconfig.json`
- `start.bat`
- `start.sh`

Rules:

- user-facing launch entrypoints may remain at the root
- repo-wide config files may remain at the root
- new maintenance helpers should go into `scripts/` instead of the root
- temporary analysis files, one-off migration files, and scratch notes must not be added at the root

## Structure Inventory

This inventory classifies the current repository so cleanup can proceed without debating ownership from scratch on every change.

### Root directory inventory

Continue growing:

- `src/`
- `backend/`
- `electron/`
- `docs/`
- `tests/`
- `scripts/`
- `workflows/`
- `build/`
- `.github/`

Generated or runtime-only:

- `dist/`
- `release/`
- `.run-logs/`
- `playwright-report/`
- `test-results/`
- `storage/`
- `node_modules/`

Private or local-only:

- `.private-docs/`
- `.claude/`
- `.git/`

Reviewed and drained:

- `development/`
  - current state: should not exist in the working tree
  - any durable material found there must be moved in the same change

### Root file inventory

Stable root entrypoints and config files:

- `package.json`
- `package-lock.json`
- `README.md`
- `CONTRIBUTING.md`
- `AGENTS.md`
- `.gitignore`
- `.env.example`
- `index.html`
- `vite.config.ts`
- `vitest.config.ts`
- `playwright.config.ts`
- `tsconfig.json`
- `start.bat`
- `start.sh`

Rules:

- these files may stay at the root because they are user entrypoints or repo-wide config
- do not add new helper scripts beside them; add helpers in `scripts/`

### Frontend directory inventory

Continue growing:

- `src/app/`
  - app shell, bootstrap, navigation
- `src/domains/`
  - domain-owned product surfaces such as chat, image, video, and workflow
- `src/features/`
  - cross-domain surfaces such as settings
- `src/providers/`
  - React context providers
- `src/shared/`
  - shared API, shared UI, shared hooks, shared workflow infrastructure

Frozen for migration or explicit review:

- `src/lib/`
  - compatibility layer only
  - no new modules should be added here
  - canonical ownership now lives in `src/app/`, `src/shared/ui/`, `src/shared/providers/`, `src/shared/runtime/`, `src/shared/types/`, and `src/domains/*`

Missing but reserved by project rules:

- `src/components/`
- `src/hooks/`
- `src/ui/`

Rules:

- do not create new root-level frontend directories casually
- if one of the reserved directories becomes necessary, introduce it deliberately and update public docs in the same change
- do not continue broadening `src/lib/` as a catch-all

### Frontend substructure snapshots

Current `src/domains/` growth targets:

- `src/domains/chat/`
- `src/domains/image/`
- `src/domains/video/`
- `src/domains/workflow/`

Current `src/features/` growth targets:

- `src/features/settings/`

Current `src/shared/` growth targets:

- `src/shared/api/`
- `src/shared/hooks/`
- `src/shared/providers/`
- `src/shared/runtime/`
- `src/shared/types/`
- `src/shared/ui/`
- `src/shared/workflow/`

### Batch 1 execution focus

The first structure-refactor batch on `master` should stay narrow and land repository guardrails before broader source moves:

- root governance
  - enforce a root allowlist in repo hygiene checks
  - keep private plans in `.private-docs/`
  - drain `development/`
- `src/lib/` migration preparation
  - stop adding new modules to `src/lib/`
  - move canonical ownership into `src/app/`, `src/shared/ui/`, `src/shared/providers/`, `src/shared/runtime/`, `src/shared/types/`, or the owning domain tree
  - keep `src/lib/` as a compatibility layer only until remaining branch work is drained
- domain and provider alignment
  - move chat, image, video, and workflow surfaces into `src/domains/`
  - keep cross-domain settings in `src/features/settings/`
  - move React contexts into `src/providers/`
- runtime layering preparation
  - reserve shared frontend runtime types and exports on `master`
  - avoid mixing runtime helpers back into `src/lib/`

### Backend directory inventory

Continue growing:

- `backend/src/app/`
- `backend/src/modules/`
- `backend/src/engine/`
- `backend/src/platform/`

Current `backend/src/platform/` growth targets:

- `backend/src/platform/ai/`
- `backend/src/platform/http/`
- `backend/src/platform/logging/`
- `backend/src/platform/media/`
- `backend/src/platform/providers/`
- `backend/src/platform/security/`
- `backend/src/platform/storage/`
- `backend/src/platform/system/`

Recommended near-term addition:

- `backend/src/platform/runtime/`

Rules:

- keep business HTTP logic in `modules/`
- keep workflow execution logic in `engine/`
- keep infrastructure and deployment-specific behavior in `platform/`
- do not add new peer directories under `backend/src/` without a strong ownership reason

## Branch Model

Long-lived branches:

- `master`: shared product trunk in this repository
- `release/local-web`: local browser distribution branch
- `release/desktop`: Electron desktop distribution branch
- `release/server`: deployable server distribution branch

Branch rules:

- shared feature work starts on `master`
- release branches receive only variant-specific work, release hardening, or hotfixes
- if behavior is needed by more than one variant, it must land on `master` first

## Mainline First Changes

The following files should be changed first on `master` before the release branches are allowed to diverge further.

Status as of 2026-05-23:

- completed on `master` and already present in the shared trunk:
  - frontend and backend runtime mode contracts
  - backend runtime capability endpoint and privileged-route guards
  - settings capability-aware UI for local-only actions
  - public trunk and branch structure documentation
- still pending before `local-web` and `server` variant delivery:
  - dedicated `local-web` launcher and packaging scripts
  - production-style server static hosting and tighter deployment configuration
  - broader audit of chat, image, video, and workflow surfaces for non-desktop assumptions

### Frontend runtime and capability files

- Modify `src/app/bootstrap/useAppBootstrap.ts`
  - load runtime mode and deployment capability data during startup
- Modify `src/shared/api/capabilities.ts`
  - expose runtime-mode and deployment-capability queries
- Modify `src/shared/api/pathPicker.ts`
  - stop assuming local directory selection is always supported
- Modify `src/shared/api/serverState.ts`
  - gate restart actions behind runtime capabilities
- Create `src/shared/runtime/index.ts`
  - export runtime helpers
- Create `src/shared/runtime/types.ts`
  - define `desktop`, `local-web`, `server-single-user`, and `server-multi-user` modes
- Create `src/shared/runtime/useRuntimeCapabilities.ts`
  - provide a shared capability-aware hook for UI logic
  - current status: deferred; capability state is currently consumed through bootstrap plus cached server state

### Frontend feature files that must become capability-aware

- Modify `src/features/settings/components/DefaultsSection.tsx`
  - hide or disable restart and local-directory actions when unsupported
  - current status: completed on trunk
- Modify `src/features/settings/components/DiagnosticsSection.tsx`
  - expose runtime mode and capability state for debugging
  - current status: completed on trunk
- Modify `src/features/settings/useSettingsPanelController.ts`
  - consume runtime capabilities instead of assuming desktop-local behavior
  - current status: partially completed; capability state is wired through `SettingsPanel` view assembly, not a dedicated controller hook yet
- Review `src/domains/chat/`, `src/domains/image/`, `src/domains/video/`, and `src/domains/workflow/`
  - remove any hard dependency on Electron or unrestricted host filesystem behavior
  - current status: pending audit

### Backend runtime and capability files

- Modify `backend/src/app/create-app.js`
  - register runtime mode and deployment capability responses
  - enforce runtime restrictions for privileged routes
  - current status: completed on trunk
- Modify `backend/server.js`
  - read deployment mode from environment or startup configuration
  - current status: still needs explicit rollout work for `local-web` and `server` launch targets
- Modify `backend/src/modules/capabilities/capabilities.routes.js`
  - add a runtime-capability endpoint or extend the existing capability surface
  - current status: completed on trunk
- Modify `backend/src/modules/capabilities/capabilities.service.js`
  - include deployment mode, local filesystem privileges, and restart support flags
  - current status: completed on trunk
- Create `backend/src/platform/runtime/index.js`
  - export runtime helpers
  - current status: completed on trunk
- Create `backend/src/platform/runtime/mode.js`
  - resolve `desktop-embedded`, `local-web`, `server-single-user`, and `server-multi-user`
  - current status: completed on trunk
- Create `backend/src/platform/runtime/capabilities.js`
  - centralize environment-specific capability decisions
  - current status: completed on trunk

### Backend settings and privileged system routes

- Modify `backend/src/modules/settings/settings.routes.js`
  - route privileged actions through runtime capability checks
  - current status: completed through guarded settings actions and runtime-aware system helpers
- Modify `backend/src/modules/settings/settings.controller.js`
  - return consistent capability errors when a mode does not support an action
  - current status: completed through standard blocked-action responses
- Modify `backend/src/modules/settings/settings.service.js`
  - avoid server-mode behavior that depends on unrestricted local-system control
  - current status: completed for directory selection and backend restart
- Modify `backend/src/platform/system/select-directory.js`
  - treat directory selection as an optional environment capability
  - current status: completed on trunk
- Modify `backend/src/platform/system/restart-backend.js`
  - support safe disablement in non-desktop and non-local contexts
  - current status: completed on trunk
- Modify `backend/src/platform/system/restart-trigger.js`
  - guard restart orchestration by runtime mode
  - current status: pending deeper rollout review

### Storage and future multi-user preparation

- Modify `backend/src/platform/storage/storage-root.js`
  - preserve resolver-based storage selection without hardcoded paths
- Modify `backend/src/platform/storage/storage-paths.js`
  - prepare for future namespace layering by user or workspace
- Modify `backend/src/platform/storage/safe-path.js`
  - keep path validation compatible with future server isolation
- Review `backend/src/modules/files/`, `backend/src/modules/workflows/`, `backend/src/modules/assistant/`, and `backend/src/modules/agent/`
  - identify persisted objects that will later require user or workspace scope

### Root-structure governance files

- Modify `README.md`
  - describe the cleaned root-level ownership model
- Modify `CONTRIBUTING.md`
  - explain which root files and directories are allowed to grow
- Modify `docs/developer-guide.md`
  - keep the top-level layout and variant structure aligned with reality
- Modify `scripts/check-repo-hygiene.mjs`
  - enforce root-level ownership and documentation rules
- Review `.gitignore`
  - confirm generated and runtime-only root directories stay ignored

## Local-Web Variant

The `local-web` variant is the first release target because it removes the Electron shell without requiring multi-user server work.

### Scripts to add

- Create `scripts/start-local-web.mjs`
  - production-style local launcher
  - starts backend
  - points `APP_FRONTEND_DIST` at built frontend assets
  - opens the default browser
  - coordinates shutdown and log output
- Create `scripts/build-local-web.mjs`
  - builds frontend assets
  - validates backend readiness for local-web packaging
  - prepares any local-web release metadata if needed

### Existing scripts to modify

- Modify `scripts/start-dev.mjs`
  - label the current workflow explicitly as the `local-web` development launcher
  - emit runtime mode environment variables for downstream capability checks
- Modify root `package.json`
  - add scripts such as:
    - `dev:local-web`
    - `build:local-web`
    - `start:local-web`

### Local-web runtime expectations

- no Electron dependency
- browser is the only shell
- local runtime data still uses the existing config-dir resolver
- privileged actions are allowed only when they make sense on a local machine

## Desktop Variant

The `desktop` variant should remain a thin shell over shared logic.

### Desktop-specific files to keep focused

- Review `electron/main.cjs`
  - keep BrowserWindow creation, embedded backend startup, relaunch behavior, and external-link handling only
- Review `electron/relaunch.cjs`
  - keep relaunch-specific behavior isolated here
- Modify root `package.json`
  - keep Electron packaging scripts variant-specific

### Desktop execution rule

- Electron must not become the owner of shared business logic
- any feature needed by more than the desktop shell belongs back on `master`

## Server Single-User Variant

The first server milestone is a single-user deployment, not a full SaaS or multi-tenant system.

### Interfaces and routes to change first

- Modify `backend/src/app/create-app.js`
  - support production static hosting and tighter allowed-origin handling
- Modify `backend/src/modules/capabilities/capabilities.routes.js`
  - expose server runtime capabilities to the frontend
- Modify `backend/src/modules/settings/settings.routes.js`
  - disable or guard:
    - `POST /api/settings/select-directory`
    - `POST /api/settings/restart-backend`
- Modify `backend/src/modules/settings/settings.controller.js`
  - return the standard error envelope when server mode blocks a local-only action
- Modify `backend/src/modules/files/files.routes.js`
  - review file access for server-safe boundaries
- Modify `backend/src/modules/files/files.service.js`
  - ensure all file paths remain storage-root relative and never leak host paths
- Modify `backend/src/platform/storage/storage-bootstrap.js`
  - document and enforce server deployment root behavior through environment configuration
- Modify `backend/src/platform/logging/request-context.js`
  - prepare request metadata needed for later user-scoped observability

### Server single-user rules

- no desktop-only restart UX
- no local directory picker UX
- no host filesystem path exposure in API responses
- static frontend should be served by Express or an external reverse proxy
- deployment should be controlled by environment configuration, not hardcoded defaults

## Server Multi-User Preparation

Multi-user work begins only after the single-user server variant is stable.

The first preparation tasks should identify where to introduce:

- authentication
- request-scoped user context
- storage namespace isolation
- workflow ownership
- generated-file ownership
- agent and assistant record ownership

The shared trunk should prepare extension points without forcing multi-user logic into the first server release.

## Milestones

### Milestone 1: Runtime Capability Layer

Current status on 2026-05-23:

- completed and ready to close:
  - frontend runtime mode display
  - settings gating for directory selection and backend restart
  - backend runtime capability reporting
  - backend blocking of unsupported local-only actions
  - workflow save-file directory picker gating for server runtimes
  - unit and e2e coverage for capability-aware settings behavior
- explicitly deferred to later milestones:
  - `local-web` startup and packaging entrypoints belong to Milestone 2, not Milestone 1

Milestone 1 close-out decision:

- closed once shared runtime capability data exists on frontend and backend
- closed once all currently known local-only UI entrypoints are capability-aware
- closed without waiting for `local-web` launcher implementation, because that is variant delivery work rather than runtime-foundation work

Scope:

- runtime mode definitions exist on frontend and backend
- capability-aware UI gates exist for local-only actions
- backend privileged routes are runtime-guarded
- repository root cleanup rules are documented

Acceptance criteria:

- frontend can display the active runtime mode
- `select-directory` and `restart-backend` are no longer assumed to exist in every mode
- backend returns standard capability errors when a blocked action is requested
- existing local behavior still works in local development
- the public execution plan documents which root directories are source, generated, runtime, or under review

Risk checklist:

- confirm no workflow state is moved into Zustand during refactors
- confirm no Electron-specific imports leak into shared frontend logic
- confirm path resolution still uses the storage resolver
- confirm Chinese user-visible text remains UTF-8 clean
- confirm no new ad hoc helper files are added at the repository root

### Milestone 2: Local-Web Release Readiness

Scope:

- local-web launcher scripts exist
- local-web build flow is documented
- browser-only local runtime is fully usable

Acceptance criteria:

- a clean machine can run the local-web launcher and open the app in a browser
- core app surfaces work without Electron
- generated media and workflow outputs still resolve through backend APIs
- local-web startup and shutdown are stable

Risk checklist:

- verify logs still land in expected runtime locations
- verify no desktop-only UI affordances remain visible
- verify Vite proxy and production static hosting both work
- verify startup scripts handle occupied ports safely

### Milestone 3: Desktop Variant Cleanup

Scope:

- Electron shell remains thin
- desktop packaging keeps working after mainline runtime changes

Acceptance criteria:

- desktop app launches and opens one BrowserWindow only
- embedded backend still boots correctly
- desktop-only privileged actions still work where intended
- desktop packaging succeeds

Risk checklist:

- verify `electron/main.cjs` stays CommonJS
- verify no new multi-window behavior is introduced
- verify packaged backend assets still resolve correctly
- verify `asarUnpack` is updated if new native dependencies are added

### Milestone 4: Server Single-User Release

Scope:

- server deployment works with static frontend hosting
- local-only actions are disabled
- server-safe storage and file access behavior is enforced

Acceptance criteria:

- server can boot with production environment variables
- frontend can run entirely through the deployed backend and static assets
- blocked local-only settings actions return standard API errors
- generated files remain accessible only through supported API paths

Risk checklist:

- verify `APP_ALLOWED_ORIGINS` is locked down correctly
- verify stack traces are not leaked in API responses
- verify server mode does not expose host paths
- verify upload and output routes remain storage-root relative

### Milestone 5: Multi-User Foundations

Scope:

- request-scoped user identity groundwork
- storage namespacing design points
- ownership model decisions for workflows, files, and logs

Acceptance criteria:

- request context can carry user identity without breaking single-user mode
- storage interfaces can accept future user or workspace scope
- at least one end-to-end design spike exists for user-scoped workflow access

Risk checklist:

- verify single-user server behavior remains stable
- verify no premature global store or filesystem shortcuts are introduced
- verify migration paths are documented before persistence shape changes
- verify agent and assistant histories are not mixed across scopes

### Milestone 6: Multi-User Server Delivery

Scope:

- authentication
- storage isolation
- workflow and file ownership enforcement
- user-scoped execution and observability

Acceptance criteria:

- one user cannot access another user's workflows, files, or logs
- generated outputs are isolated by user or workspace
- execution logs and assistant artifacts follow ownership boundaries
- regression tests cover the primary isolation rules

Risk checklist:

- verify every persistence-backed module enforces ownership
- verify file URLs cannot be guessed across scopes
- verify audit and observability data do not leak user content
- verify rollout and migration instructions are documented

## Validation Commands

For documentation and plan updates:

```bash
npm run check:docs
npm run check:encoding
```

For code changes related to this plan:

```bash
npm run typecheck
npm run test:unit
npm run test:backend
npm run build
```
