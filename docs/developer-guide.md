# SueLr Studio Developer Guide

## Overview

SueLr Studio is a local-first multimodal workspace made of:

- a Vite + React + TypeScript frontend under `src/`
- an Express backend under `backend/`
- local storage, workflow execution, provider access, and runtime observability owned by the backend

The current architecture goal is clear ownership:

- `src/app/` owns shell bootstrapping and top-level navigation
- `src/features/` owns product surfaces such as chat, image, workflow, video, and settings
- `src/shared/` owns reusable UI, hooks, and API clients
- `backend/src/modules/` owns HTTP feature modules
- `backend/src/engine/` owns workflow runtime and node execution
- `backend/src/platform/` owns infrastructure such as AI adapters, storage, logging, and system helpers

This document is the first place a maintainer should look before searching the whole repo.

## Encoding Baseline

Repository text files should remain `UTF-8` without BOM.

When changing text transport or persistence paths:

- keep frontend and backend text flows explicitly UTF-8
- preserve Chinese text correctly in user-visible UI, logs, workflow output, and saved files
- avoid ad hoc encoding conversions unless they are isolated compatibility shims with a clear reason
- run `npm run check:encoding` before shipping encoding-related changes

If a new regression test covers text handling, prefer asserting against the actual Chinese string that should survive the round trip.

## Repository Layout

Top-level layout:

- `src/`: frontend source
- `backend/`: backend source, tests, and runtime entry
- `docs/`: public release documentation only
- `scripts/`: repo scripts, including release-doc checks
- `tests/`: frontend-focused tests

Important entry points:

- frontend bootstrap: `src/main.tsx`
- frontend shell: `src/app/App.tsx`
- backend entry: `backend/server.js`
- backend app factory: `backend/src/app/create-app.js`
- one-click local launcher: `scripts/start-dev.mjs`
- public docs gate: `scripts/check-release-docs.mjs`

Current cleanup and ownership notes:

- `src/lib/` is still active and contains shared runtime helpers; treat it as legacy shared code that should be decomposed gradually, not as dead code
- `src/components/`, `src/hooks/`, `src/domains/`, and `src/utils/` are no longer growth targets
- `src/components/ios/` has been drained into `src/shared/ui/ios/`; do not place new work back into the old path

## Frontend Structure

### App shell

- `src/app/App.tsx`
  - top-level application composition
  - mounts navigation, feature surfaces, and shared providers
- `src/app/bootstrap/useAppBootstrap.ts`
  - startup loading, capability bootstrap, and shell-ready state
- `src/app/bootstrap/ErrorBoundary.tsx`
  - top-level render error isolation
- `src/app/navigation/Navigation.tsx`
  - primary view switching and app-level page routing
- `src/app/navigation/useNavigationState.ts`
  - navigation state management

### Chat

- `src/features/chat/components/ChatPanel.tsx`
  - chat page surface
- `src/features/chat/hooks/useChat.ts`
  - chat request lifecycle, attachments, and transcript state

### Image

- `src/features/image/components/ImagePanel.tsx`
  - image generation page surface
- `src/features/image/hooks/useImageGen.ts`
  - image request lifecycle, prompt state, uploads, and result handling

### Video

- `src/features/video/components/VideoPanel.tsx`
  - retained video UI surface
- `src/features/video/hooks/useVideoGen.ts`
  - current video request orchestration helpers

### Settings

- `src/features/settings/components/SettingsPanel.tsx`
  - settings page shell and section assembly
- `src/features/settings/components/ConnectionSettingsSection.tsx`
  - upstream base URL, API key, auth mode, connection test, and model discovery
- `src/features/settings/components/ModelsSection.tsx`
  - discovered-model import, capability tagging, enablement
- `src/features/settings/components/DefaultsSection.tsx`
  - theme mode, external data path, restart backend action
- `src/features/settings/components/RolesSection.tsx`
  - role presets and assistant-role editing
- `src/features/settings/components/MemorySection.tsx`
  - memory browsing and management
- `src/features/settings/components/DiagnosticsSection.tsx`
  - diagnostics, logs, search, and capability inspection
- `src/features/settings/useSettingsPanelController.ts`
  - section orchestration and action wiring
- `src/features/settings/useStudioSettingsState.ts`
  - settings state loading, editing, persistence, and dirty tracking

### Workflow

- `src/features/workflow/App.tsx`
  - workflow workspace shell
- `src/features/workflow/components/Toolbar.tsx`
  - workflow switching, save state, import/export, execute, stop
- `src/features/workflow/components/Sidebar.tsx`
  - node catalog and canvas insertion entry
- `src/features/workflow/components/FlowCanvas.tsx`
  - canvas graph rendering, context menus, centered node-picker panel, keyboard shortcuts, grouping, connection, drag/drop, and editor interactions
- `src/features/workflow/components/flowCanvas*.ts*`
  - extracted canvas helpers for render-model building, clipboard behavior, geometry, connection rules, UI helpers, text handling, and catalog UI
- `src/features/workflow/components/nodes/FlowNode.tsx`
  - workflow node frame rendering, node chrome, group collapse controls, and node-level actions
- `src/features/workflow/components/nodes/NodePorts.tsx`
  - regular node handles and group boundary port handles, including split internal and external group-port affordances
- `src/features/workflow/components/ResultsPanel.tsx`
  - outputs, logs, and run diagnostics
- `src/features/workflow/components/StatusBar.tsx`
  - graph summary and execution state
- `src/features/workflow/components/nodes/NodeParamFields.tsx`
  - node parameter editors
- `src/features/workflow/lib/groupLayout.ts`
  - group sizing, collapsed group size, child constraints, and root-node placement around groups
- `src/features/workflow/lib/groupPorts.ts`
  - group input/output port normalization, boundary-handle ids, compatibility, and transit-port routing
- `src/features/workflow/lib/executionGraph.ts`
  - projection from editable grouped canvas graph to executable flat graph
- `src/features/workflow/lib/store.ts`
  - main workflow state store
- `src/features/workflow/lib/store/document.ts`
  - workflow document persistence state
- `src/features/workflow/lib/store/editor.ts`
  - composed canvas editing operations
- `src/features/workflow/lib/store/editorGraph.ts`
  - node and edge editing, connection changes, and graph mutation helpers
- `src/features/workflow/lib/store/editorGraphEdgeBuilders.ts`
  - bypass-edge and insertion-edge construction helpers
- `src/features/workflow/lib/store/editorGraphGroupEdges.ts`
  - group-edge and group-port cleanup helpers
- `src/features/workflow/lib/store/editorGraphNodeRemoval.ts`
  - shared node-removal graph rebuild helper
- `src/features/workflow/lib/store/editorGraphRuntimeState.ts`
  - runtime-state cleanup for removed nodes
- `src/features/workflow/lib/store/editorGroups.ts`
  - group creation, ungrouping, collapse state, and group membership operations
- `src/features/workflow/lib/store/editorSession.ts`
  - transient editor session state such as selection-oriented canvas state
- `src/features/workflow/lib/store/editorShared.ts`
  - shared editor helpers for layout, locking, disabling, group movement, and related graph updates
- `src/features/workflow/lib/store/execution.ts`
  - run lifecycle and execution status
- `src/features/workflow/lib/api.ts`
  - workflow API bridge to backend execution and persistence routes
- `src/features/workflow/lib/importExport.ts`
  - workflow import/export serialization helpers
- `src/features/workflow/lib/hotkeys.ts`
  - workflow workspace shortcut resolution for undo, redo, grouping, and execution

### Shared frontend infrastructure

- `src/shared/api/assistant.ts`
  - assistant and chat-facing API helpers
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
- `src/shared/ui/ios/index.ts`
  - shared iOS-style UI exports
- `src/shared/ui/workbench/MediaWorkbench.tsx`
  - reusable asset preview and reuse surface
- `src/shared/workflow/node-registry.js`
  - frontend node registry used by workflow editor
- `src/shared/workflow/node-registry-helpers.js`
  - helper composition for registry assembly and compatibility surfaces
- `src/shared/workflow/node-definitions/`
  - compatibility-first node-definition tree grouped by category, with one folder per node and `node.js` owning the actual definition

## Backend Structure

### Backend entry and HTTP app

- `backend/server.js`
  - process entry, server startup, and boot wiring
- `backend/src/app/create-app.js`
  - Express app composition, middleware registration, and route mounting

### Feature modules

- `backend/src/modules/assistant/`
  - assistant conversation routes, service, schema, and persistence
- `backend/src/modules/capabilities/`
  - feature capability reporting used by frontend bootstrap and diagnostics
- `backend/src/modules/agent/`
  - agent profiles, chat runtime, tool registry, sessions, and long-term memory governance
- `backend/src/modules/execution/execution.routes.js`
  - workflow execution endpoints
- `backend/src/modules/execution/execution.service.js`
  - run-state tracking, execution orchestration, and stop behavior
- `backend/src/modules/images/images.routes.js`
  - image generation endpoints
- `backend/src/modules/images/images.service.js`
  - image request handling and response normalization; raw generated image files are written under `files/generated/images/`
- `backend/src/modules/settings/settings.routes.js`
  - settings routes
- `backend/src/modules/settings/settings.controller.js`
  - HTTP controller for settings, restart, and path operations
- `backend/src/modules/settings/settings.service.js`
  - settings business rules and storage-root coordination
- `backend/src/modules/settings/settings.repository.js`
  - persisted settings reads and writes
- `backend/src/modules/files/files.routes.js`
  - file management routes
- `backend/src/modules/files/files.service.js`
  - path resolution, file listing, and storage-facing operations
- `backend/src/modules/workflows/`
  - workflow persistence, import/export, and migration chain

### Agent memory governance

Agent memory is allowed to improve conversational continuity, but it is not a source of truth. Current repository state, current settings, and explicit user input always win.

- `search_memory` returns a structured `memory_search_result` with governance metadata. Callers should treat results as hints that require verification.
- Malformed memories, object-like fragments, empty values, and duplicate semantic entries are filtered before list/search results are returned.
- Automatic memory writes are limited to stable long-term user preferences or facts. Temporary run data, debug output, errors, guesses, and workflow execution details should not be stored as memory.
- When `workflow_execute` is available, `AgentRuntime` does not inject memory context into the model prompt.
- Workflow execution must be grounded in the current user request. The workflow ID/name and any input override strings must come from the current request, not from memory, prior conversation context, or retrieved hints.
- Future `memory_write` tools must preserve the same policy: explicit, limited writes only, and no memory content may select workflow targets or supply workflow inputs.

### Workflow engine

- `backend/src/engine/executor.js`
  - workflow runtime coordinator
- `backend/src/engine/executor-helpers.js`
  - executor-side helper extraction for shared runtime behavior
- `backend/src/engine/contracts/node-registry.js`
  - backend node contract registry
- `backend/src/engine/nodes/index.js`
  - backend node module aggregation
- `backend/src/engine/nodes/iterateRun.js`
  - fallback executor contract for the `文本逐项` control node; the main repeated-downstream behavior lives in `executor.js`
- `backend/src/engine/nodes/iterateImageRun.js`
  - fallback executor contract for the `图像逐项` control node; repeated downstream execution also lives in `executor.js`
- `backend/src/engine/nodes/textClean.js`
  - deterministic removal of text ranges between user-configured start and end tokens
- `backend/src/engine/nodes/imageGen.js`
  - image generation node behavior
- `backend/src/engine/nodes/saveFile.js`
  - save-to-disk workflow node behavior
- `backend/src/engine/helpers/imageGeneration.js`
  - image-node request and output helpers; generated image URLs use `/api/outputs/images/...`
- `backend/src/engine/helpers/saveHelper.js`
  - save-file output handling; materialized workflow outputs are grouped by media type under `images/`, `videos/`, `audio/`, `text/`, and `data/`
- `backend/src/engine/helpers/workflowLogger.js`
  - workflow log shaping before persistence

### Platform layer

- `backend/src/platform/ai/image-service.js`
  - upstream image provider calling and response adaptation
- `backend/src/platform/ai/chat-service.js`
  - upstream chat request handling
- `backend/src/platform/ai/search-service.js`
  - upstream web-search request handling
- `backend/src/platform/ai/video-service.js`
  - upstream video request handling; synchronous or downloaded video results are materialized under `files/generated/videos/`
- `backend/src/platform/http/proxy-aware-fetch.js`
  - shared fetch wrapper with proxy awareness; supports app-level outbound proxy settings, environment proxy variables, and Windows system proxy fallback
- `backend/src/platform/providers/`
  - provider adapter contracts, registry wiring, compatible provider support, and shared provider HTTP behavior
- `backend/src/platform/security/network-guards.js`
  - outbound network allow/block checks used before provider requests
- `backend/src/platform/storage/index.js`
  - storage exports used by modules and engine
- `backend/src/platform/storage/storage-root.js`
  - active storage root resolution
- `backend/src/platform/storage/storage-bootstrap.js`
  - app-data root bootstrap, environment override handling, and custom root persistence
- `backend/src/platform/storage/storage-paths.js`
  - canonical directories and files under the active app data root
- `backend/src/platform/storage/file-store.js`
  - binary and generated-file storage helpers
- `backend/src/platform/storage/json-store.js`
  - JSON read/write helpers for persisted settings and records
- `backend/src/platform/storage/safe-path.js`
  - storage-root-relative path validation
- `backend/src/platform/storage/legacy-storage.js`
  - migration and compatibility helpers for older storage layouts

- `backend/src/platform/system/select-directory.js`
  - native directory picker integration
- `backend/src/platform/system/restart-backend.js`
  - backend restart entry
- `backend/src/platform/system/restart-runner.js`
  - restart process launcher
- `backend/src/platform/system/restart-trigger.js`
  - guarded restart orchestration
- `backend/src/platform/logging/logger.js`
  - shared logger
- `backend/src/platform/logging/runtime-observability.js`
  - runtime probes used to diagnose stuck or invalid transitions
- `backend/src/platform/logging/workflow-run-logger.js`
  - workflow run log persistence
- `backend/src/platform/logging/workflow-log-sanitizer.js`
  - trims oversized payloads such as inline base64 before they flood logs

### Generated media storage

The active app data root owns runtime files. Under that root, generated media uses these canonical directories:

- `files/generated/images/`: raw outputs from image generation, including Image page, Chat `generate_image`, and workflow `imageGen`
- `files/generated/videos/`: raw video outputs produced synchronously or downloaded by `executeVideoGeneration`
- `files/generated/assistant-images/`: assets explicitly saved into the Chat/assistant image gallery
- `files/generated/assistant-videos/`: assets explicitly saved into the Chat/assistant video gallery

The public URL contract remains rooted at `/api/outputs/...` for generated outputs and `/api/assistant/files/...` for assistant gallery files. New code should preserve relative subpaths when converting between URLs and `STORAGE_PATHS.generatedDir`.

### Request flow examples

#### Settings external path change

1. frontend `DefaultsSection` saves the new external data path
2. frontend calls backend settings route
3. backend settings service persists the value
4. user clicks `Restart Backend`
5. backend restart helpers relaunch the process
6. storage-root bootstrap reads the new path on startup

#### Workflow image generation

1. frontend workflow store submits an execution request
2. backend execution service starts a run
3. engine executor traverses nodes; with a control node such as `文本逐项` or `图像逐项`, it executes upstream once and then sequentially replays the downstream subgraph once per non-empty item
4. `imageGen.js` calls platform image service
5. result is normalized and written into node outputs
6. workflow run logger stores sanitized logs and artifacts
7. frontend results panel renders outputs and logs

## Testing Strategy

Current test layers:

- frontend unit coverage under `tests/`
- backend tests under `backend/tests/`
- release doc guard through `npm run check:docs`

When changing behavior:

- run the narrowest relevant tests first
- broaden to adjacent tests if the change touches shared workflow, settings, or storage code
- for public release work, re-run `npm run check:docs`

High-value regression areas:

- workflow document save/load/import/export
- workflow group creation, collapse, ungroup, locking, and disabling behavior
- group input/output port routing across group boundaries
- directional group-port connection behavior from `FlowCanvas.tsx` through `NodePorts.tsx`
- centered node-picker panel, blank-canvas double-click open, and blank-canvas right-click paste menu
- workflow keyboard shortcuts for copy, paste, grouping, execution, undo, and redo
- workflow node registry compatibility after node-definition moves
- per-node folder compatibility exports under `src/shared/workflow/node-definitions/`
- editable grouped graph to executable flat graph projection
- workflow execution state transitions
- image generation response normalization
- external data path persistence and restart behavior
- log sanitization for large inline payloads

## Public Documentation Policy

Only these public markdown docs belong under `docs/`:

- `docs/user-guide.md`
- `docs/developer-guide.md`
- `docs/release-sop.md`

Rules for future work:

- every structural or behavior change that affects user flows must update `docs/user-guide.md`
- every structural or ownership change that affects developer navigation must update `docs/developer-guide.md`
- every desktop release workflow change must update `docs/release-sop.md`
- do not add planning notes, weekly execution files, or private working docs under `docs/`
- keep this guide aligned with the actual file layout so maintainers can jump directly to the right module instead of re-scanning the repo

## Maintenance Workflow

Before opening or merging a maintenance change, run the repo quality gate:

- `npm run check`
- `npm run check:encoding` when the change touches user-visible text, persisted content, upload names, or file-path transport

For browser-facing changes, install and run the E2E smoke suite:

- `npm run test:e2e:install`
- `npm run test:e2e`

For desktop release packaging, build the portable Windows executable:

- `npm run electron:dist`

For an unpacked desktop inspection build:

- `npm run electron:pack`

Keep private planning, audit notes, and non-release working documents in `.private-docs/`. Do not move them into `docs/`, which is reserved for public user and developer documentation.

## Local Launching

Use `npm start`, `start.bat`, or `start.sh` for normal local startup. The launcher owns dependency bootstrapping, Node version validation, port selection, backend health gating, frontend proxy wiring, log files, browser opening, and shutdown coordination.

Use `npm run dev` when you explicitly want the raw concurrently-based command. Use `npm run dev:frontend` and `npm run dev:backend` only when debugging one side of the app in isolation.

When isolating the frontend, remember that workflow, settings, and other local app requests still use the Vite `/api` proxy. If the backend is running on a non-default port, set `VITE_DEV_PROXY_TARGET` so the frontend talks to the intended backend instance.
