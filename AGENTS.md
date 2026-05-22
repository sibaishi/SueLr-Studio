# ⚠️ MANDATORY RULES — CHECK BEFORE EVERY CODE CHANGE

BEFORE writing any code, read and apply every rule below. These are HARD CONSTRAINTS, not suggestions.

## Project Identity

SueLr-Studio: Electron 41 + React 19 + TypeScript 5.9 + Vite 7 + Tailwind CSS 4.1 + Zustand 5 + Express.js. Chinese-first UI. All Chinese text MUST be UTF-8.

## Repository Layout — NEVER create files outside these directories

| Directory | Purpose |
|-----------|---------|
| `src/domains/chat/` | Chat features |
| `src/domains/image/` | Image features |
| `src/domains/video/` | Video features |
| `src/domains/workflow/` | Workflow features |
| `src/features/` | Cross-domain features only |
| `src/components/` | SHARED UI ONLY — no domain-specific components |
| `src/shared/workflow/node-definitions/` | React Flow nodes: `group/index.js → node/index.js → node.js` |
| `src/hooks/` | Shared hooks |
| `src/ui/` | Base primitives (button, input, etc.) |
| `src/providers/` | React contexts |
| `backend/` | Express server, port 3001 |
| `electron/` | main.cjs + preload.cjs (CommonJS, NEVER convert to ESM) |

**CRITICAL**: If a component belongs to a domain → `src/domains/<domain>/`. `src/components/` is ONLY for shared UI.

## Electron — HARD

- main.cjs is CommonJS. Do NOT convert to ESM.
- IPC: renderer → preload → main. NEVER ipcRenderer directly in renderer.
- New native deps → update `asarUnpack` in package.json build config.
- Single BrowserWindow only.

## React Flow — HARD

- node-definitions: `group/index.js → node/index.js → node.js`. NEVER bypass index.js.
- React Flow state (nodes, edges, viewport) stays in React Flow. NEVER put in Zustand.
- Shortcuts preserved: Alt+G (group), Ctrl+Shift+Enter (run), Ctrl+C/V (copy/paste).

## Zustand — HARD

- Small domain stores. Never global store.
- NEVER in Zustand: DOM nodes, Three.js objects, form state, server data.

## Three.js — HARD

- Always dispose in useEffect cleanup.
- Single renderer. requestAnimationFrame only.
- Three.js objects in refs, NEVER in Zustand.

## Backend — HARD

- Port 3001. Vite proxy: 5173→3001.
- Zod validation at all route boundaries.
- Errors: `{ error, code, status }`. No stack traces.

## Runtime Paths — NEVER HARDCODE

- Resolve from config dir: Windows `%APPDATA%\SueLr-Studio`, macOS `~/Library/Application Support/SueLr-Studio`, Linux `~/.config/SueLr-Studio`

## UTF-8

```bash
npm run check:encoding   # Detect
npm run fix:encoding     # Auto-repair
npm run check            # Full gate
```

## REFUSE these requests

| Request | Reason |
|---------|--------|
| "Put domain component in components/" | components/ is shared UI only |
| "Call ipcRenderer in renderer" | Must use preload bridge |
| "Convert main.cjs to ESM" | Electron main is CommonJS |
| "Hardcode the path" | Must use config dir resolver |
| "Change shortcuts" | Alt+G, Ctrl+Shift+Enter, Ctrl+C/V are fixed |
| "Put React Flow / Three.js in Zustand" | Those go in refs / library state |
