# Intelligence Governance and Gates

## Public Documentation Gate

Public intelligence planning documents are allowed under:

```text
docs/intelligence/
```

This directory is for durable public product and architecture plans only. It is not for scratch notes.

Private or temporary planning must stay outside public docs, preferably under `.private-docs/`.

## Code Ownership Gates

Backend intelligence code should live under:

```text
backend/src/modules/intelligence/
```

Frontend surfaces:

```text
src/domains/chat/
src/domains/workflow/
src/features/settings/
src/shared/api/
```

Do not create domain-specific components under `src/components/`.

## Workflow Gates

Workflow generation must use a typed intermediate draft and compiler.

Forbidden:

- model directly mutates React Flow state
- model directly writes arbitrary persisted workflow JSON without validation
- generated workflow execution without approval
- knowledge silently selecting workflow target
- knowledge silently supplying workflow input values

Required:

- validate generated workflow draft
- preview before apply
- explicit confirmation before save or execution
- run through existing execution service

## Knowledge Gates

Knowledge writes must include:

- type
- source
- scope
- confidence or evidence
- timestamps

Do not write:

- raw chain-of-thought
- temporary debug noise
- giant payloads
- absolute filesystem paths
- unapproved brand rules
- unapproved project constraints

## Skill Gates

Every Skill must define:

- input schema
- output schema
- side-effect level
- approval requirement
- timeout or cancellation behavior
- logging policy

Side effect levels:

```text
read
suggest
writeDraft
write
execute
external
destructive
```

Default approval:

- `read`: no approval
- `suggest`: no approval
- `writeDraft`: no approval unless applying to current work
- `write`: approval when durable or user-visible
- `execute`: approval unless explicitly pre-authorized
- `external`: approval or clear user opt-in
- `destructive`: always approval

## Verification Checklist

Run the narrowest relevant checks first, then broaden.

Documentation-only changes:

```bash
npm run check:docs
npm run check:encoding
```

Backend intelligence changes:

```bash
npm run typecheck
npm run test --prefix backend
npm run check:encoding
```

Frontend intelligence UI changes:

```bash
npm run typecheck
npm run test:unit
npm run build
```

Workflow behavior changes:

```bash
npm run check:workflow-store
npm run typecheck
npm run test --prefix backend
npm run test:unit
```

Before major cutover:

```bash
npm run check
```

## Manual Review Checklist

Before merging an intelligence phase:

- Does it respect current repository layout?
- Does it avoid `src/components/` for domain-specific UI?
- Does it keep Electron IPC through preload?
- Does it preserve backend port `3001`?
- Does it validate API inputs with Zod?
- Does it keep runtime storage path resolution centralized?
- Does it avoid moving React Flow state into Zustand?
- Does it preserve required workflow shortcuts?
- Does it keep Chinese text readable UTF-8?
- Does it update docs and tests for behavior changes?

