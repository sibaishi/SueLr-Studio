# Workflow Store Boundaries

This document is the Week 11 boundary note for the workflow store split. It exists to answer a simple maintenance question quickly: when a workflow bug shows up, which module should we touch first, and what kind of proof should we add with it?

## Editor

The editor layer owns in-memory graph editing behavior:

- node creation, duplication, deletion, selection, and resizing
- edge creation and replacement
- grouping, ungrouping, and release flows
- local editor-session state such as draft persistence, execution log buffering, and model list shaping

It does not own network persistence, workflow import/export I/O, or remote execution lifecycle orchestration.

External entry points:

- `editorGraph.ts`
- `editorGroups.ts`
- `editorSession.ts`
- composed through `editor.ts`

Preferred proof when editing this layer:

- unit tests around direct action behavior
- helper-level tests for merge sizing, grouping math, and descendant expansion

## Document

The document layer owns workflow document lifecycle transitions:

- save
- load
- list fetch
- duplicate
- delete
- import/export
- startup hydration decisions

It does not own canvas editing behavior, execution streaming, or provider/model shaping.

External entry points:

- `document.ts`

Preferred proof when editing this layer:

- unit tests that assert workflow state is normalized and stale runtime state is cleared
- verification that hydration/import paths keep local draft behavior coherent

## Execution

The execution layer owns runtime orchestration around workflow runs:

- execution preflight validation
- start/cancel flow
- SSE callback handling
- run restore after reload
- run status resync with the backend

It does not own document persistence policy or low-level graph editing actions.

External entry points:

- `execution.ts`

Preferred proof when editing this layer:

- unit tests for preflight guardrails
- unit tests for restore/resync state transitions
- E2E only for thin confirmation of visible UI behavior, not as the primary proof of runtime rules
