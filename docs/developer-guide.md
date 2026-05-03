# Developer Guide

## Overview

This repository is organized as a local-first desktop-style web application with a Vite + React frontend and an Express backend.
The main maintenance goal is to keep product behavior understandable through clear frontend feature boundaries, backend module boundaries, and a small public documentation surface.

## Repository Layout

Top-level directories:

```text
src/            frontend application code
backend/        backend server and module implementations
tests/          frontend unit and end-to-end verification
docs/           public project documentation only
scripts/        repository quality-gate scripts
workflows/      example workflow files
```

Public documentation policy for this repo is intentionally narrow:

- `docs/user-guide.md` is the user-facing usage document
- `docs/developer-guide.md` is the developer-facing structure document

Execution plans, weekly roadmaps, private checklists, and similar process artifacts should not be treated as project documentation in this repository.

## Frontend Structure

The frontend is built with React, TypeScript, Vite, and Zustand.
The main frontend areas are:

- `src/app/`: app bootstrapping and top-level composition
- `src/components/`: shared product panels such as chat, image, and video
- `src/contexts/`: React context providers
- `src/domains/`: cross-feature domain modules such as settings
- `src/features/workflow/`: workflow editor, canvas, runtime, and store logic
- `src/shared/`: reusable utilities and UI helpers

The workflow feature has its own internal boundary inside `src/features/workflow/lib/store/`.

### Workflow Editor

The editor layer owns canvas editing behavior and local editing session state.
Its composition entry is `src/features/workflow/lib/store/editor.ts`, which delegates to:

- `editorGraph.ts`
- `editorGroups.ts`
- `editorSession.ts`

This layer should own node and edge editing, grouping behavior, selection, and draft-oriented editor state.

### Workflow Document

The document layer owns workflow persistence and lifecycle transitions.
Its entry is `src/features/workflow/lib/store/document.ts`.

This layer should own save, load, import, export, duplicate, delete, and hydration behavior, while staying out of low-level canvas editing rules.

### Workflow Execution

The execution layer owns runtime orchestration for workflow runs.
Its entry is `src/features/workflow/lib/store/execution.ts`.

This layer should own preflight validation, run lifecycle, restore, resync, and execution status handling without taking over document persistence or graph editing behavior.

## Backend Structure

The backend entry points are:

- `backend/server.js`
- `backend/src/app/create-app.js`

Backend feature modules live under `backend/src/modules/`:

- `assistant/`
- `capabilities/`
- `execution/`
- `files/`
- `images/`
- `settings/`
- `workflows/`

Shared backend infrastructure lives under platform-oriented areas such as logging, providers, security, and storage.
When adding backend behavior, prefer extending the owning module instead of routing feature logic through unrelated endpoints.

### Backend Request Validation

Route-level request validation should go through `backend/src/app/middleware/validate-request.js`.
Keep validation responsibilities split in two parts:

- route files attach `validateBody(...)` or `validateParam(...)`
- feature schema files normalize and validate payloads, then throw `ValidationError` when needed

Error copy exposed from backend validators should stay in readable Chinese and be reused consistently across sibling routes that share the same contract surface, such as `capabilities/image` and `images/generate`.

## Testing Strategy

The current verification stack is layered:

- `npm run typecheck` for TypeScript compilation safety
- `npm run test:unit` for frontend store and logic tests
- `npm run build` for frontend production build validation
- `npm run test:backend` for backend test coverage
- `npm run test:e2e` for Playwright smoke coverage
- `npm run check` for the full repository quality gate

Workflow store proof tests live under `tests/unit/workflow-store/` and act as the first regression net for editor, document, and execution boundary changes.

## Public Documentation Policy

The `docs/` directory is reserved for stable public-facing documentation that should ship with the project.
At this stage that means exactly two maintained documents:

- `docs/user-guide.md`
- `docs/developer-guide.md`

Roadmaps, week-by-week execution plans, scratch notes, and temporary rollout checklists should live outside the public project documentation surface and should not be required by repository quality gates.
