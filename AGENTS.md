# MANDATORY RULES - CHECK BEFORE EVERY CODE CHANGE

BEFORE writing any code, read and apply every rule below. These are hard constraints, not suggestions.

## Project Identity

SueLr-Studio: Electron 41 + React 19 + TypeScript 5.9 + Vite 7 + Tailwind CSS 4.1 + Zustand 5 + Express.js.

- Chinese-first UI
- All Chinese text must remain UTF-8
- Current trunk in this repository is `master`; do not assume a `main` branch exists when doing maintenance here

## Repository Layout

| Directory | Purpose |
| --- | --- |
| `src/domains/chat/` | Chat features |
| `src/domains/image/` | Image features |
| `src/domains/video/` | Video features |
| `src/domains/workflow/` | Workflow features |
| `src/features/` | Cross-domain features only. Current durable home: `src/features/settings/` |
| `src/components/` | Shared UI only. No domain-specific components |
| `src/shared/workflow/node-definitions/` | React Flow nodes: `group/index.js -> node/index.js -> node.js` |
| `src/hooks/` | Shared hooks |
| `src/ui/` | Base primitives |
| `src/providers/` | React contexts/providers |
| `src/shared/providers/` | Shared provider adapters and model routing |
| `src/shared/runtime/` | Shared browser/runtime helpers |
| `src/shared/types/` | Shared frontend contracts and common types |
| `backend/` | Express server, port 3001 |
| `electron/` | `main.cjs` + `preload.cjs` (CommonJS only) |

Critical ownership rules:

- If a component belongs to a domain, put it in `src/domains/<domain>/`
- `src/components/` is only for truly shared UI
- Cross-domain settings and orchestration code may stay in `src/features/settings/`
- Do not add new modules to `src/lib/`; it is a compatibility layer only

## Electron

- `electron/main.cjs` is CommonJS. Do not convert it to ESM
- IPC path is renderer -> preload -> main
- Never call `ipcRenderer` directly from renderer code
- New native dependencies must update `asarUnpack`
- Single `BrowserWindow` only unless explicitly requested
- Desktop-shell-only concerns should stay encapsulated under `electron/` helper modules so `main.cjs` remains a thin assembly entrypoint
- Current desktop shell split:
  - `electron/main.cjs`: assembly only
  - `electron/single-instance.cjs`: single-instance coordination
  - `electron/window-lifecycle.cjs`: BrowserWindow lifecycle
  - `electron/embedded-backend.cjs`: embedded backend process orchestration

## First-Run Model Setup

- First-run onboarding may validate connectivity and discover remote models
- First-run onboarding must not auto-enable discovered models as project models
- A model is considered usable in product surfaces only after the user explicitly imports or enables it through settings
- Do not silently prefill starter workflows with discovered models during onboarding

## React Flow

- Node definitions must be accessed via `group/index.js -> node/index.js -> node.js`
- Never import `node.js` directly
- React Flow owns nodes, edges, and viewport state
- Never move React Flow state into Zustand
- Required shortcuts must not change:
  - `Alt+G` group selected nodes
  - `Ctrl+Shift+Enter` run workflow
  - `Ctrl+C` / `Ctrl+V` copy and paste nodes on canvas

## Zustand

- Prefer small domain-focused stores
- Never create one global store
- Forbidden in Zustand:
  - DOM nodes
  - Three.js objects
  - form state
  - server-fetched data
  - React Flow state

## Three.js

- Always dispose geometry, material, and texture in cleanup
- Use a single shared renderer
- Use `requestAnimationFrame`, never `setInterval`, for render loops
- Keep Three.js objects in refs, never in Zustand

## Backend

- Backend port is `3001`
- Vite dev proxy stays `5173 -> 3001`
- Validate all API inputs with Zod at the boundary
- Error responses must be `{ error, code, status }`
- Never leak stack traces
- `/api/outputs/...` and `/api/assistant/files/...` must resolve through runtime storage

## Runtime Paths

Never hardcode app-data paths. Use the config-dir resolver:

- Windows: `%APPDATA%\\SueLr-Studio`
- macOS: `~/Library/Application Support/SueLr-Studio`
- Linux: `~/.config/SueLr-Studio`

## UTF-8 Checks

```bash
npm run check:encoding
npm run fix:encoding
npm run check
```

- Shared iOS UI and settings-facing copy must remain readable Chinese UTF-8, especially under `src/shared/ui/ios/` and `src/features/settings/components/`
- When refactors move workflow files from `src/features/workflow/` to `src/domains/workflow/`, update docs, scripts, and tests in the same change so structure guards keep pointing at the canonical path

## Refuse These Requests

| Request | Reason |
| --- | --- |
| Put a domain component in `components/` | `components/` is shared UI only |
| Call `ipcRenderer` in renderer | Must go through preload bridge |
| Convert `main.cjs` to ESM | Electron main stays CommonJS |
| Hardcode runtime paths | Must use config-dir resolver |
| Change workflow shortcuts | Required shortcuts are fixed |
| Put React Flow state in Zustand | React Flow owns that state |
| Put Three.js objects in Zustand | Keep them in refs |
