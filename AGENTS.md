# MANDATORY RULES - CHECK BEFORE EVERY CODE CHANGE

> Current repository contract reviewed: 2026-06-24.

BEFORE writing any code, read and apply every rule below. These are hard constraints, not suggestions.

## Project Identity

SueLr-Studio: Electron 41 + React 19 + TypeScript 5.9 + Vite 8 + Tailwind CSS 4.3 + Zustand 5 + Express 5.

- Chinese-first UI
- All Chinese text must remain UTF-8
- Current trunk in this repository is `main`

## 提交前版本约束（2026-11-24 起强制执行）

- 本次版本统一为 `2.0.0`。此后每次提交前，无论功能、修复还是文档修改，均须递增一次补丁版本：`2.0.0 → 2.0.1 → 2.0.2`（“+0.0.01”按标准三段版本号的末位加一执行）。
- 提交前执行 `npm run version:bump`，同步根目录与 `backend/` 的 `package.json`、`package-lock.json`（含根包条目）；同一批待提交改动只递增一次，修正检查失败不重复递增。
- 界面、启动页、Electron 安装包和后端接口必须读取包版本，不再写死产品版本号。依赖版本、数据结构版本和历史记录不属于产品版本，不得批量替换。
- 执行 `npm run check`，将版本修改与业务修改一起提交；不得遗漏锁文件。`check:version` 会阻止包版本不一致。
- 大版本或次版本升级按用户明确指示执行；未经明确要求不自动创建版本标签或发布安装包。

## Repository Layout

| Directory | Purpose |
| --- | --- |
| `src/domains/chat/` | Chat features |
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
- `src/lib/` has been removed. Do not recreate it or add new `@/lib/*` imports

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

## Unified Workflow Node Catalog

- `src/shared/workflow/node-registry.js` is the base source of truth for workflow node definitions used by the editor, persistence normalization, and runtime contracts
- When adding a workflow node, update every applicable chain:
  - isolated node definition and category export under `src/shared/workflow/node-definitions/`
  - backend executor and `backend/src/engine/nodes/index.ts`
  - dedicated renderer only when generic rendering is insufficient
  - `backend/src/engine/executor.ts` only for special scheduling semantics
- Preserve existing node types, ports, defaults, shortcuts, saved workflow JSON, and runtime semantics during catalog refactors

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
- Backend runtime is TypeScript-first: `backend/server.ts`, `backend/src/**/*.ts`, and `backend/tests/**/*.test.ts` run through Node 22 `--experimental-strip-types`
- Do not recreate `backend/server.js`, `backend/src/**/*.js` facades, or `backend/tests/**/*.js`
- Backend runtime code should import backend modules through `.ts` paths; frontend shared workflow `.js` modules remain out of scope

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

## Documentation Synchronization

- User-visible behavior changes update `docs/user-guide.md`
- Ownership, module, runtime, or extension-contract changes update `docs/developer-guide.md`
- Packaging and release-flow changes update `docs/release-sop.md`
- Historical migration records stay historical and receive dated status notes instead of being rewritten as current architecture

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
