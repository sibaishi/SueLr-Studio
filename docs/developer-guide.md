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
  - canvas graph rendering and editor interactions
- `src/features/workflow/components/ResultsPanel.tsx`
  - outputs, logs, and run diagnostics
- `src/features/workflow/components/StatusBar.tsx`
  - graph summary and execution state
- `src/features/workflow/components/nodes/NodeParamFields.tsx`
  - node parameter editors
- `src/features/workflow/lib/store.ts`
  - main workflow state store
- `src/features/workflow/lib/store/document.ts`
  - workflow document persistence state
- `src/features/workflow/lib/store/editor.ts`
  - canvas editing operations
- `src/features/workflow/lib/store/execution.ts`
  - run lifecycle and execution status
- `src/features/workflow/lib/api.ts`
  - workflow API bridge to backend execution and persistence routes
- `src/features/workflow/lib/importExport.ts`
  - workflow import/export serialization helpers

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
- `backend/src/modules/execution/execution.routes.js`
  - workflow execution endpoints
- `backend/src/modules/execution/execution.service.js`
  - run-state tracking, execution orchestration, and stop behavior
- `backend/src/modules/images/images.routes.js`
  - image generation endpoints
- `backend/src/modules/images/images.service.js`
  - image request handling and response normalization
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

### Workflow engine

- `backend/src/engine/executor.js`
  - workflow runtime coordinator
- `backend/src/engine/contracts/node-registry.js`
  - backend node contract registry
- `backend/src/engine/nodes/imageGen.js`
  - image generation node behavior
- `backend/src/engine/nodes/saveFile.js`
  - save-to-disk workflow node behavior
- `backend/src/engine/helpers/imageGeneration.js`
  - image-node request and output helpers
- `backend/src/engine/helpers/saveHelper.js`
  - save-file output handling
- `backend/src/engine/helpers/workflowLogger.js`
  - workflow log shaping before persistence

### Platform layer

- `backend/src/platform/ai/image-service.js`
  - upstream image provider calling and response adaptation
- `backend/src/platform/ai/chat-service.js`
  - upstream chat request handling
- `backend/src/platform/ai/video-service.js`
  - upstream video request handling
- `backend/src/platform/http/proxy-aware-fetch.js`
  - shared fetch wrapper with proxy awareness
- `backend/src/platform/storage/index.js`
  - storage exports used by modules and engine
- `backend/src/platform/storage/storage-root.js`
  - active storage root resolution
- `backend/src/platform/storage/storage-bootstrap.js`
  - app-data root initialization
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
3. engine executor traverses nodes
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
- workflow execution state transitions
- image generation response normalization
- external data path persistence and restart behavior
- log sanitization for large inline payloads

## Public Documentation Policy

Only these public markdown docs belong under `docs/`:

- `docs/user-guide.md`
- `docs/developer-guide.md`

Rules for future work:

- every structural or behavior change that affects user flows must update `docs/user-guide.md`
- every structural or ownership change that affects developer navigation must update `docs/developer-guide.md`
- do not add planning notes, weekly execution files, or private working docs under `docs/`
- keep this guide aligned with the actual file layout so maintainers can jump directly to the right module instead of re-scanning the repo

## Maintenance Workflow

Before opening or merging a maintenance change, run the repo quality gate:

- `npm run check`

For browser-facing changes, install and run the E2E smoke suite:

- `npm run test:e2e:install`
- `npm run test:e2e`

Keep private planning, audit notes, and non-release working documents in `.private-docs/`. Do not move them into `docs/`, which is reserved for public user and developer documentation.
