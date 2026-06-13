# SueLr Studio Developer Guide

## Overview

SueLr Studio is a local-first multimodal workspace made of:

- a Vite + React + TypeScript frontend under `src/`
- an Express backend under `backend/`
- local storage, workflow execution, provider access, and runtime observability owned by the backend

The current architecture goal is clear ownership:

- `src/app/` owns shell bootstrapping and top-level navigation
- `src/domains/` owns domain product surfaces such as chat and workflow
- `src/features/` owns cross-domain product surfaces, currently centered on settings
- `src/providers/` owns React context providers
- `src/shared/` owns reusable UI, hooks, API clients, provider adapters, runtime helpers, and workflow infrastructure
- `backend/src/modules/` owns HTTP feature modules
- `backend/src/engine/` owns workflow runtime and node execution
- `backend/src/platform/` owns infrastructure such as AI adapters, storage, logging, and system helpers

This document is the first place a maintainer should look before searching the whole repo.

Repository note:

- the active trunk in this repository is currently `main`
- release-planning docs may still describe a future or cross-repo `main` model, but maintenance work in this repo should follow the actual local branch layout

## Encoding Baseline

Repository text files should remain `UTF-8` without BOM.

When changing text transport or persistence paths:

- keep frontend and backend text flows explicitly UTF-8
- preserve Chinese text correctly in user-visible UI, logs, workflow output, and saved files
- avoid ad hoc encoding conversions unless they are isolated compatibility shims with a clear reason
- run `npm run check:encoding` before shipping encoding-related changes

If a new regression test covers text handling, prefer asserting against the actual Chinese string that should survive the round trip.

High-signal UI surfaces that deserve extra care during refactors:

- `src/shared/ui/ios/`
- `src/features/settings/components/`

These files are user-facing and Chinese-first. If text becomes mojibake during a move or mass edit, fix the source string directly and rerun `npm run check:encoding`.

## Repository Layout

Top-level layout:

- `src/`: frontend source
- `backend/`: backend source, tests, and runtime entry
- `docs/`: public release and execution documentation only
- `scripts/`: repo scripts, including release-doc checks
- `tests/`: frontend-focused tests

Root ownership rules:

- keep stable source roots, launcher entrypoints, and repo-wide config files at the repository root
- keep maintenance helpers in `scripts/` instead of creating new ad hoc root files
- treat `dist/`, `release/`, `.run-logs/`, `playwright-report/`, `test-results/`, and repository-local `storage/` as generated or runtime-only surfaces, not source structure
- keep `.private-docs/` as the home for private plans, local acceptance notes, and temporary implementation records; do not track those files unless a private artifact is explicitly promoted into public docs
- keep `development/` drained; if durable content appears there during a refactor, move it into `scripts/`, `docs/`, or `.private-docs/` in the same change

Important entry points:

- frontend bootstrap: `src/main.tsx`
- frontend shell: `src/app/App.tsx`
- backend entry: `backend/server.ts`
- backend app factory: `backend/src/app/create-app.ts`
- one-click local launcher: `scripts/start-dev.mjs`
- public docs gate: `scripts/check-release-docs.mjs`

Backend TypeScript cleanup note:

- backend runtime is TypeScript-first: `backend/server.ts`, `backend/src/**/*.ts`, and `backend/tests/**/*.test.ts` run through Node 22 `--experimental-strip-types`
- do not recreate `backend/server.js`, `backend/src/**/*.js` facades, or `backend/tests/**/*.js`
- backend runtime code should import backend modules through `.ts` paths; frontend shared workflow `.js` modules remain out of scope

Current cleanup and ownership notes:

- root `src/lib/` has been removed after the shared helper migration; do not recreate it
- new application code must not import from `@/lib/*`
- canonical homes are:
  - app shell constants in `src/app/`
  - shared icons and status helpers in `src/shared/ui/`
  - provider contracts and routing in `src/shared/providers/`
  - browser/runtime helpers in `src/shared/runtime/`
  - shared frontend contracts in `src/shared/types/`
  - domain-owned constants and helpers in `src/domains/*`
- `src/components/`, `src/hooks/`, and `src/utils/` are no longer growth targets
- `src/components/ios/` has been drained into `src/shared/ui/ios/`; do not place new work back into the old path

## Frontend Structure

### App shell

- `src/app/App.tsx`
  - top-level application composition
  - mounts the workflow-first surface, modal settings, Agent overlay, and shared providers
- `src/app/bootstrap/useAppBootstrap.ts`
  - startup loading, capability bootstrap, and shell-ready state
- `src/app/bootstrap/ErrorBoundary.tsx`
  - top-level render error isolation

### Agent

- `src/features/agent/components/AgentWorkspace.tsx`
  - workflow-launched Agent workspace, conversation state, and workflow/tool orchestration surface

### Settings

- `src/features/settings/components/SettingsPanel.tsx`
  - modal settings shell and section assembly
- `src/features/settings/components/ConnectionSettingsSection.tsx`
  - upstream base URL, API key, auth mode, connection test, and model discovery
- `src/features/settings/components/ModelsSection.tsx`
  - discovered-model import, capability tagging, enablement
- `src/features/settings/components/DefaultsSection.tsx`
  - theme mode, external data path, restart backend action, and runtime-aware gating for host-only controls
- `src/features/settings/components/RolesSection.tsx`
  - role presets and assistant-role editing
- `src/features/settings/components/MemorySection.tsx`
  - memory browsing and management
- `src/features/settings/components/DiagnosticsSection.tsx`
  - diagnostics, logs, search, runtime mode display, and capability inspection
- `src/features/settings/useSettingsPanelController.ts`
  - section orchestration and action wiring
- `src/features/settings/useStudioSettingsState.ts`
  - settings state loading, editing, persistence, and dirty tracking
- `src/features/settings/runtimePresentation.ts`
  - shared runtime-mode labels and user-facing hints for capability-gated settings actions

### Workflow

- `src/domains/workflow/App.tsx`
  - workflow workspace shell
- `src/domains/workflow/components/Toolbar.tsx`
  - workflow switching, save state, import/export, execute, stop
- `src/domains/workflow/components/FloatingToolbar.tsx`
  - workflow-edge floating actions for adding nodes, opening settings, opening Agent, and cycling theme
- `src/domains/workflow/components/FlowCanvas.tsx`
  - canvas graph rendering, context menus, centered node-picker panel, keyboard shortcuts, grouping, connection, drag/drop, and editor interactions
- `src/domains/workflow/components/flowCanvas*.ts*`
  - extracted canvas helpers for render-model building, clipboard behavior, geometry, connection rules, UI helpers, text handling, and catalog UI
- `src/domains/workflow/components/nodes/FlowNode.tsx`
  - workflow node frame rendering, node chrome, group collapse controls, and node-level actions
- `src/domains/workflow/components/nodes/NodePorts.tsx`
  - regular node handles and group boundary port handles, including split internal and external group-port affordances
- `src/domains/workflow/components/ResultsPanel.tsx`
  - outputs, logs, and run diagnostics
- `src/domains/workflow/components/StatusBar.tsx`
  - graph summary and execution state
- `src/domains/workflow/components/nodes/NodeParamFields.tsx`
  - node parameter editors
- `src/domains/workflow/lib/groupLayout.ts`
  - group sizing, collapsed group size, child constraints, and root-node placement around groups
- `src/domains/workflow/lib/groupPorts.ts`
  - group input/output port normalization, boundary-handle ids, compatibility, and transit-port routing
- `src/domains/workflow/lib/executionGraph.ts`
  - projection from editable grouped canvas graph to executable flat graph
- `src/domains/workflow/lib/store.ts`
  - main workflow state store
- `src/domains/workflow/lib/store/document.ts`
  - workflow document persistence state
- `src/domains/workflow/lib/store/editor.ts`
  - composed canvas editing operations
- `src/domains/workflow/lib/store/editorGraph.ts`
  - node and edge editing, connection changes, and graph mutation helpers
- `src/domains/workflow/lib/store/editorGraphEdgeBuilders.ts`
  - bypass-edge and insertion-edge construction helpers
- `src/domains/workflow/lib/store/editorGraphGroupEdges.ts`
  - group-edge and group-port cleanup helpers
- `src/domains/workflow/lib/store/editorGraphNodeRemoval.ts`
  - shared node-removal graph rebuild helper
- `src/domains/workflow/lib/store/editorGraphRuntimeState.ts`
  - runtime-state cleanup for removed nodes
- `src/domains/workflow/lib/store/editorGroups.ts`
  - group creation, ungrouping, collapse state, and group membership operations
- `src/domains/workflow/lib/store/editorSession.ts`
  - transient editor session state such as selection-oriented canvas state
- `src/domains/workflow/lib/store/editorShared.ts`
  - shared editor helpers for layout, locking, disabling, group movement, and related graph updates
- `src/domains/workflow/lib/store/execution.ts`
  - run lifecycle and execution status
- `src/domains/workflow/hooks/useWorkflowHistory.ts`
  - local undo/redo history orchestration backed by React refs, not Zustand
- `src/domains/workflow/hooks/useWorkflowImport.ts`
  - workflow import file parsing, conflict retry, and report modal state
- `src/domains/workflow/hooks/useWorkflowPageCommands.ts`
  - page-level workflow commands such as save, load, duplicate, delete, execute, cancel, export, and node backfill
- `src/domains/workflow/lib/api.ts`
  - compatibility re-export for workflow API helpers
- `src/domains/workflow/lib/api/workflows.ts`
  - workflow CRUD, duplicate, import, and export API helpers
- `src/domains/workflow/lib/api/execution.ts`
  - workflow execution SSE, cancellation, and run-status API helpers
- `src/domains/workflow/lib/api/files.ts`
  - generated output, upload, and uploaded-file metadata API helpers
- `src/domains/workflow/lib/api/settings.ts`
  - settings, provider connection, model discovery, and available-model API helpers
- `src/domains/workflow/lib/importExport.ts`
  - workflow import/export serialization helpers
- `src/domains/workflow/lib/hotkeys.ts`
  - workflow workspace shortcut resolution for undo, redo, grouping, and execution

### Shared frontend infrastructure

- `src/shared/api/capabilities.ts`
  - capability discovery client
- `src/shared/api/pathPicker.ts`
  - select-directory and save-path helpers
- `src/shared/api/serverState.ts`
  - backend status and restart helpers
- `src/shared/hooks/provider.ts`
  - provider-related shared selection helpers
- `src/shared/hooks/useMemory.ts`
  - reusable memory data hook
- `src/shared/providers/`
  - shared provider adapters, configuration contracts, and model-routing helpers
- `src/shared/runtime/`
  - shared browser/runtime helpers such as file/image conversion, task polling, and runtime mode contracts
- `src/shared/types/`
  - shared frontend contracts such as API config, models, chat messages, tabs, and theme types
- `src/shared/ui/ios/index.ts`
  - shared iOS-style UI exports
- `src/shared/ui/workbench/MediaWorkbench.tsx`
  - reusable asset preview and reuse surface
- `src/shared/workflow/node-registry.js`
  - base workflow node-definition source of truth used by the editor, persistence normalization, and backend runtime contracts
- `src/shared/workflow/node-registry-helpers.js`
  - helper composition for registry assembly and compatibility surfaces
- `src/shared/workflow/node-catalog.js`
  - intelligence-facing workflow node catalog derived from the base registry
  - derives the shared Architect allowlist, Architect default data, validator port view, and Agent input adapter list
  - keeps only intelligence-only compatibility overrides that cannot live in the base contract
- `src/shared/workflow/node-definitions/`
  - compatibility-first node-definition tree grouped by category, with one folder per node and `node.js` owning the actual definition

### Workflow node extension rules

Adding a workflow node is a cross-chain capability change, not only a canvas component change.

The shared ownership model is:

- `src/shared/workflow/node-registry.js` is the base source of truth for node definitions
- `src/shared/workflow/node-catalog.js` derives the intelligence-facing catalog consumed by the workflow validator and Workflow Architect
- each isolated node definition declares applicable Architect enablement, defaults, dynamic ports, runtime mode, and Agent input adapter metadata
- `backend/src/modules/intelligence/workflow-builder/node-capabilities.ts` derives category and ports from the shared registry, while keeping semantic Agent knowledge such as use cases, avoid cases, maturity, parameter notes, and operational notes explicit because that guidance cannot be generated safely from ports alone
- `backend/src/engine/nodes/index.ts` registers executable backend implementations

For a normal Agent-buildable node:

1. Add the isolated definition through `src/shared/workflow/node-definitions/<group>/index.js -> <node>/index.js -> <node>/node.js`.
2. Register the backend executor in `backend/src/engine/nodes/index.ts`.
3. Declare Architect defaults, dynamic ports, runtime mode, and any Agent input adapter on the isolated node definition. Add a `node-catalog.js` override only for an intelligence-only compatibility requirement.
4. Add the matching semantic capability seed in `backend/src/modules/intelligence/workflow-builder/node-capabilities.ts`.
5. Add a dedicated frontend renderer only when generic node rendering is insufficient.
6. Add scheduler handling in `backend/src/engine/executor.ts` only when the node changes execution semantics, such as iterative downstream replay.
7. Add Agent input override handling in `backend/src/modules/execution/execution.service.ts` only when the node introduces a new user-overridable input type.
8. Update catalog and runtime tests, then run `npm run check:encoding` and `npm run check`.

Do not add backend-local copies of the Architect allowlist, validator port map, or Architect default-data map. Catalog refactors must preserve node types, ports, defaults, persisted workflow JSON, required shortcuts, and runtime behavior.

## Frontend Build Shape

The main app shell in `src/app/App.tsx` lazy-loads workflow-first product surfaces:

- workflow, modal settings, and first-run onboarding are loaded through `React.lazy`
- Workflow stays mounted as the primary surface; Settings is opened as a modal child of the workflow workspace
- workflow CSS stays imported by the app shell because it is a shared canvas styling dependency

The normal Vite build uses explicit vendor chunks in `vite.config.ts`:

- `vendor-react`
- `vendor-react-flow`
- `vendor-three`
- `vendor-markdown`
- `vendor-icons`

`VITE_SINGLEFILE=1` disables manual chunking so the single-file build path remains compatible with `vite-plugin-singlefile`.
The chunk warning limit is set to 600 kB because the only expected near-threshold chunk is the isolated Three.js vendor payload used by the workflow prompt-helper scene.

## Backend Structure

### Backend entry and HTTP app

- `backend/server.ts`
  - process entry, server startup, and boot wiring
- `backend/src/app/create-app.ts`
  - Express app composition, middleware registration, and route mounting

### Feature modules

- `backend/src/modules/assistant/`
  - assistant conversation routes, service, schema, and persistence
- `backend/src/modules/capabilities/`
  - feature capability reporting used by frontend bootstrap and diagnostics
- `backend/src/modules/agent/`
  - legacy/transitional agent profiles, chat runtime, tool registry, sessions, and long-term memory governance
  - the long-term replacement direction is the Agent + Skills + Knowledge Base intelligence program documented under `docs/intelligence/`
- `backend/src/modules/execution/execution.routes.ts`
  - workflow execution endpoints with Zod route-boundary validation
- `backend/src/modules/execution/execution.service.ts`
  - run-state tracking, execution orchestration, and stop behavior
- `backend/src/modules/execution/execution.schema.ts`
  - Zod schemas for execution params and request bodies
- `backend/src/modules/images/images.routes.ts`
  - image generation endpoints
- `backend/src/modules/images/images.service.ts`
  - image request handling and response normalization; raw generated image files are written under `files/generated/images/`
- `backend/src/modules/settings/settings.routes.ts`
  - settings routes
- `backend/src/modules/settings/settings.controller.ts`
  - HTTP controller for settings, restart, and path operations
- `backend/src/modules/settings/settings.service.ts`
  - settings business rules and storage-root coordination
- `backend/src/modules/settings/settings.repository.ts`
  - persisted settings reads and writes
- `backend/src/modules/files/files.routes.ts`
  - file management routes
- `backend/src/modules/files/files.service.ts`
  - path resolution, file listing, and storage-facing operations
- `backend/src/modules/workflows/`
  - workflow persistence, import/export, migration chain, and Zod route-boundary schemas

### Agent memory governance

Agent memory is allowed to improve conversational continuity, but it is not a source of truth. Current repository state, current settings, and explicit user input always win.

- `search_memory` returns a structured `memory_search_result` with governance metadata. Callers should treat results as hints that require verification.
- Malformed memories, object-like fragments, empty values, and duplicate semantic entries are filtered before list/search results are returned.
- Automatic memory writes are limited to stable long-term user preferences or facts. Temporary run data, debug output, errors, guesses, and workflow execution details should not be stored as memory.
- When `workflow_execute` is available, `AgentRuntime` does not inject memory context into the model prompt.
- Workflow execution must be grounded in the current user request. The workflow ID/name and any input override strings must come from the current request, not from memory, prior conversation context, or retrieved hints.
- Future `memory_write` tools must preserve the same policy: explicit, limited writes only, and no memory content may select workflow targets or supply workflow inputs.

### Workflow engine

- `backend/src/engine/executor.ts`
  - workflow runtime coordinator
- `backend/src/engine/executor-helpers.ts`
  - executor-side helper extraction for shared runtime behavior
- `backend/src/engine/contracts/node-registry.ts`
  - backend node contract registry
- `backend/src/engine/nodes/index.ts`
  - backend node module aggregation
- `backend/src/engine/nodes/iterateRun.ts`
  - fallback executor contract for the `文本逐项` control node; the main repeated-downstream behavior lives in `executor.js`
- `backend/src/engine/nodes/iterateImageRun.ts`
  - fallback executor contract for the `图像逐项` control node; repeated downstream execution also lives in `executor.js`
- `backend/src/engine/nodes/textClean.ts`
  - deterministic removal of text ranges between user-configured start and end tokens
- `backend/src/engine/nodes/imageGen.ts`
  - image generation node behavior
- `backend/src/engine/nodes/saveFile.ts`
  - save-to-disk workflow node behavior
- `backend/src/engine/helpers/imageGeneration.ts`
  - image-node request and output helpers; generated image URLs use `/api/outputs/images/...`
- `backend/src/engine/helpers/saveHelper.ts`
  - save-file output handling; materialized workflow outputs are grouped by media type under `images/`, `videos/`, `audio/`, `text/`, and `data/`
- `backend/src/engine/helpers/workflowLogger.ts`
  - workflow log shaping before persistence

### Platform layer

- `backend/src/platform/ai/image-service.ts`
  - upstream image provider calling and response adaptation
- `backend/src/platform/ai/chat-service.ts`
  - upstream chat request handling
- `backend/src/platform/ai/search-service.ts`
  - upstream web-search request handling
- `backend/src/platform/ai/video-service.ts`
  - upstream video request handling; synchronous or downloaded video results are materialized under `files/generated/videos/`
- `backend/src/platform/http/proxy-aware-fetch.ts`
  - shared fetch wrapper with proxy awareness; supports app-level outbound proxy settings, environment proxy variables, and Windows system proxy fallback
- `backend/src/platform/providers/`
  - provider adapter contracts, registry wiring, compatible provider support, and shared provider HTTP behavior
- `backend/src/platform/security/network-guards.ts`
  - outbound network allow/block checks used before provider requests
- `backend/src/platform/storage/index.ts`
  - storage exports used by modules and engine
- `backend/src/platform/storage/storage-root.ts`
  - active storage root resolution
- `backend/src/platform/storage/storage-bootstrap.ts`
  - app-data root bootstrap, environment override handling, and custom root persistence
- `backend/src/platform/storage/storage-paths.ts`
  - canonical directories and files under the active app data root
- `backend/src/platform/storage/file-store.ts`
  - binary and generated-file storage helpers
- `backend/src/platform/storage/json-store.ts`
  - JSON read/write helpers for persisted settings and records
- `backend/src/platform/storage/safe-path.ts`
  - storage-root-relative path validation
- `backend/src/platform/storage/legacy-storage.ts`
  - migration and compatibility helpers for older storage layouts
- `backend/src/platform/system/select-directory.ts`
  - native directory picker integration
- `backend/src/platform/system/restart-backend.ts`
  - backend restart entry
- `backend/src/platform/system/restart-runner.ts`
  - restart process launcher
- `backend/src/platform/system/restart-trigger.ts`
  - guarded restart orchestration
- `backend/src/platform/logging/logger.ts`
  - shared logger
- `backend/src/platform/logging/runtime-observability.ts`
  - runtime probes used to diagnose stuck or invalid transitions
- `backend/src/platform/logging/request-context.ts`
  - request-scoped runtime metadata carrier for local HTTP handlers
- `backend/src/platform/runtime/request-scope.ts`
  - local single-user request scope model used by HTTP context and diagnostics
- `backend/src/platform/runtime/resource-ownership.ts`
  - local compatibility helpers for older records that may still contain ownership metadata
- `backend/src/platform/logging/workflow-run-logger.ts`
  - workflow run log persistence
- `backend/src/platform/logging/workflow-log-sanitizer.ts`
  - trims oversized payloads such as inline base64 before they flood logs

### Generated media storage

The active app data root owns runtime files. Under that root, generated media uses these canonical directories:

- `files/generated/images/`: raw outputs from image generation, including Agent and workflow `imageGen`
- `files/generated/videos/`: raw video outputs produced synchronously or downloaded by `executeVideoGeneration`
- `files/generated/assistant-images/`: legacy assistant image gallery compatibility assets
- `files/generated/assistant-videos/`: legacy assistant video gallery compatibility assets

The public URL contract remains rooted at `/api/outputs/...` for generated outputs and `/api/assistant/files/...` for assistant gallery files. New code should preserve relative subpaths when converting between URLs and `STORAGE_PATHS.generatedDir`.

## Runtime Guardrails

SueLr Studio is delivered as `desktop` and `local-web`. Shared code should keep the runtime boundary explicit so local behavior remains portable:

- storage settings APIs must not expose absolute host filesystem paths unless the runtime capability allows it
- settings UI must not imply control over paths the active runtime cannot edit
- workflow output results must prefer relative URLs and semantic state over absolute `savedPaths`
- request-scoped metadata should be attached through `request-context`, not inferred from globals
- local request scope always resolves to the single-user identity; browser-supplied scope headers are ignored
- persisted resources should not add user/workspace ownership fields; local governance fields such as knowledge `scope` remain domain-level metadata
- scoped storage always resolves to the active app data root used by desktop and `local-web`

If a new API needs to surface storage or generated outputs, prefer relative URLs or semantic state, never raw host paths.

For the product-facing external data path entry, `desktop` and `local-web` may use it as a local machine storage-root setting when the runtime exposes that capability.

### Request flow examples

#### Workflow image generation

1. frontend workflow store submits an execution request
2. backend execution service starts a run
3. engine executor traverses nodes; with a control node such as `文本逐项` or `图像逐项`, it executes upstream once and then sequentially replays the downstream subgraph once per non-empty item
4. `imageGen.js` calls platform image service
5. result is normalized and written into node outputs
6. workflow run logger stores sanitized logs and artifacts
7. frontend results panel renders outputs and logs

#### Workflow management and execution contracts

- React Flow owns canvas nodes, edges, and viewport. Workflow Zustand state may keep workflow metadata, editor UI state, execution status, and persistence status, but not React Flow viewport ownership.
- Workflow document operations return structured results for save, load, duplicate, delete, and import paths so the UI can show action-specific errors instead of generic boolean failures.
- Workflow and execution HTTP routes validate params, query strings, and request bodies with Zod at the route boundary. Deeper graph normalization remains in workflow migration and persistence services.
- Execution SSE transport errors should be normalized before reaching UI state. Non-JSON backend errors and fetch/read failures should produce a user-facing workflow error rather than leaking raw transport text.
- Closing an SSE connection is treated as a client disconnect, not as workflow cancellation. Explicit cancellation must go through the cancel endpoint, and polling `/api/execute/runs/:runId/status` is the recovery path after refresh or reconnect.
- Terminal execution status is cached briefly after a run leaves the active registry so refreshed clients can settle completed, failed, or cancelled state.

## Testing Strategy

Current test layers:

- frontend unit coverage under `tests/`
- backend tests under `backend/tests/`
- release doc guard through `npm run check:docs`

When changing behavior:

- run the narrowest relevant tests first
- broaden to adjacent tests if the change touches shared workflow, settings, or storage code
- for public release work, re-run `npm run check:docs`
- for request-scope changes, run `node --test --experimental-strip-types backend/tests/request-scope.test.ts`

High-value regression areas:

- workflow document save/load/import/export
- workflow group creation, collapse, ungroup, locking, and disabling behavior
- group input/output port routing across group boundaries
- directional group-port connection behavior from `FlowCanvas.tsx` through `NodePorts.tsx`
- centered node-picker panel, blank-canvas double-click open, and blank-canvas right-click paste menu
- workflow keyboard shortcuts for copy, paste, grouping, execution, undo, and redo
- workflow node registry compatibility after node-definition moves
- workflow intelligence catalog compatibility for Architect node types, defaults, dynamic ports, and Agent knowledge coverage
- per-node folder compatibility exports under `src/shared/workflow/node-definitions/`
- editable grouped graph to executable flat graph projection
- workflow execution state transitions
- image generation response normalization
- external data path persistence and restart behavior
- log sanitization for large inline payloads

## Public Documentation Policy

Only these public markdown docs and approved public documentation directories belong under `docs/`:

- `docs/user-guide.md`
- `docs/developer-guide.md`
- `docs/release-sop.md`
- `docs/intelligence/`

The `docs/intelligence/` directory is the public home for the Agent + Skills + Knowledge Base intelligence program. It contains the engineering execution version and a separate Chinese reading version under `docs/intelligence/zh/`.

Rules for future work:

- every structural or behavior change that affects user flows must update `docs/user-guide.md`
- every structural or ownership change that affects developer navigation must update `docs/developer-guide.md`
- every desktop release workflow change must update `docs/release-sop.md`
- every durable intelligence architecture, rollout, or acceptance-policy change must update the relevant file under `docs/intelligence/`
- do not add private working notes, weekly scratch files, or internal-only plans under `docs/`
- keep this guide aligned with the actual file layout so maintainers can jump directly to the right module instead of re-scanning the repo

## Variant Delivery Model

SueLr Studio now follows the current `main` trunk plus three release variants:

- `main`: shared product trunk in this repository
- `release/local-web`: local browser deployment branch
- `release/desktop`: Electron desktop branch

Working rules:

- implement shared behavior on `main` first in this repository
- keep release branches focused on packaging, deployment, and shell-specific differences
- keep release commands and deployment checks in `docs/release-sop.md`, `docs/user-guide.md`, and this guide

## Maintenance Workflow

Before opening or merging a maintenance change, run the repo quality gate:

- `npm run check`
- `npm run lint` for a quicker Biome lint pass while iterating
- `npm run format:check` before committing formatting-only or broad structure changes
- `npm run check:encoding` when the change touches user-visible text, persisted content, upload names, or file-path transport

For browser-facing changes, install and run the E2E smoke suite:

- `npm run test:e2e:install`
- `npm run test:e2e`

For desktop release packaging, run the Electron distribution build:

- `npm run electron:dist`

Configured desktop targets:

- Windows: portable x64
- macOS: dmg and zip for x64 and arm64; build these on macOS
- Linux: AppImage and deb for x64

For an unpacked desktop inspection build:

- `npm run electron:pack`

Desktop shell maintenance rules:

- keep `electron/main.cjs` as a thin CommonJS composition entrypoint
- move single-instance, window lifecycle, and embedded-backend orchestration into dedicated `electron/*.cjs` helper modules when they grow beyond trivial wiring
- preserve the single-window contract unless a later milestone explicitly expands desktop scope
- keep first-run onboarding behavior aligned with shared product rules: onboarding may discover models, but model enablement remains an explicit settings action

Current desktop shell module split:

- `electron/main.cjs`
  - assembly only; wires Electron app lifecycle, helper modules, and shared startup flow
- `electron/single-instance.cjs`
  - single-instance lock and second-launch focus behavior
- `electron/window-lifecycle.cjs`
  - BrowserWindow creation, show/focus helpers, and close lifecycle wiring
- `electron/embedded-backend.cjs`
  - embedded backend child-process spawn, readiness, and teardown orchestration

## Local Launching

Use `npm start`, `start.bat`, or `start.sh` for normal local startup. The launcher owns dependency bootstrapping, Node version validation, port selection, backend health gating, frontend proxy wiring, log files, browser opening, and shutdown coordination.

Use `npm run dev` when you explicitly want the raw concurrently-based command. Use `npm run dev:frontend` and `npm run dev:backend` only when debugging one side of the app in isolation.

When isolating the frontend, remember that workflow, settings, and other local app requests still use the Vite `/api` proxy. If the backend is running on a non-default port, set `VITE_DEV_PROXY_TARGET` so the frontend talks to the intended backend instance.
