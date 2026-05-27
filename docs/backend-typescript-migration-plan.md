# Backend TypeScript Migration Plan / 后端 TypeScript 迁移计划

## Summary / 概述

The backend has already moved all implementation code to TypeScript. Every `.js` file under `backend/src/` is now a pure re-export barrel — no actual logic remains in JavaScript. The entrypoint `backend/server.js` still contains implementation code (37 lines), and tests are still `.js`. The next step is to make the backend fully TypeScript at runtime using Node 22 `--experimental-strip-types`, remove the JavaScript barrels, and rename tests.

后端已将所有实现代码迁移到 TypeScript。`backend/src/` 下的每个 `.js` 文件现在都是纯粹的 re-export barrel — JavaScript 中不再包含任何实际逻辑。入口 `backend/server.js` 仍包含实现代码（37 行），测试仍是 `.js`。下一步使用 Node 22 `--experimental-strip-types` 让后端在运行时完全 TypeScript 化，删除 JavaScript barrel，并重命名测试文件。

This is a broad migration affecting backend startup, tests, restart behavior, Electron embedding, server-web deployment, CI, and docs. Execute as one coordinated change.

这是一次广泛的迁移，涉及后端启动、测试、重启行为、Electron 嵌入、server-web 部署、CI 和文档。应作为一个协调变更整体执行。

## Current State Assessment (2026-05-27) / 当前状态评估

| Item / 项目 | Status / 状态 |
| --- | --- |
| `backend/src/**/*.ts` | 148 implementation files — complete / 148 个实现文件，已完成 |
| `backend/src/**/*.js` | 145 files, all pure re-export barrels — no real logic / 145 个文件，全部是纯 re-export barrel，无实际逻辑 |
| Thin wrappers (≤3 lines) / 薄封装（≤3 行） | 123 files / 123 个文件 |
| Multi-export barrels (>3 lines) / 多导出 barrel（>3 行） | 22 files, all re-exporting from `.ts` / 22 个文件，全部从 `.ts` re-export |
| `backend/server.js` | 37 lines of real code, imports from `.js` paths / 37 行实际代码，从 `.js` 路径导入 |
| `backend/tests/` | 37 `.test.js` files, zero `.ts`, ~50 import lines to `.js` / 37 个 `.test.js`，零 `.ts`，约 50 行 `.js` 导入 |
| Restart files / 重启文件 | `restart-backend.js` (1-line re-export), `restart-runner.js` (1-line import), `restart-trigger.js` (1-line stub) |
| `backend/package.json` scripts | All target `.js` files / 全部指向 `.js` 文件 |
| External callers / 外部调用者 | 8 files reference `server.js` / 8 个文件引用 `server.js` |

### External `server.js` References / 外部 `server.js` 引用

| File / 文件 | Current / 当前 |
| --- | --- |
| `playwright.config.ts` | `node server.js` |
| `electron/embedded-backend.cjs` | `backend/server.js` |
| `scripts/start-dev.mjs` | `server.js` |
| `scripts/start-local-web.mjs` | `server.js` |
| `.github/workflows/ci.yml` | backend smoke start |
| `scripts/check-runtime-baseline.mjs` | `backend/server.js` + content check |
| `scripts/deploy/server-web/Dockerfile` | COPY + CMD `backend/server.js` |
| `scripts/deploy/server-web/release-files.txt` | `backend/server.js` |

## Workload Estimate / 工作量评估

| Phase / 阶段 | Scope / 范围 | Est. / 预估 |
| --- | --- | --- |
| 1. Entrypoint switch / 入口切换 | Rename `server.js` → `server.ts`, update 3 internal imports, 4 package.json scripts, 8 external callers | 1–1.5h |
| 2. Remove JS barrels / 删除 JS barrel | Scan and update all `.js` → `.ts` imports in `backend/src/**/*.ts`, then delete `.js` barrels | 2–3h |
| 3. Restart system / 重启系统 | Update `restart-backend.ts` to target `.ts`, delete 3 restart `.js` files | 0.5–1h |
| 4. Test migration / 测试迁移 | Rename 37 `.test.js` → `.test.ts`, update ~50 imports, dynamic import query strings | 2–3h |
| 5. Scripts / CI / Deploy / 脚本与部署 | Update 8 external files, verify server-web Docker build | 1–2h |
| 6. Docs & guards / 文档与护栏 | Update docs, add hygiene check | 0.5–1h |
| Validation / 验证 | Full test suite + runtime smoke tests | 1.5–2h |
| **Total / 合计** | | **~9–13.5h (≈2 working days / 约 2 个工作日)** |

## Implementation Plan / 实施计划

### 1. Switch Backend Entrypoint to TypeScript / 切换后端入口为 TypeScript

- Create `backend/server.ts` from `backend/server.js`:
  - Rename the file
  - Change internal imports from `.js` to `.ts`:
    - `./src/platform/logging/logger.js` → `./src/platform/logging/logger.ts`
    - `./src/app/create-app.js` → `./src/app/create-app.ts`
    - `./src/platform/logging/runtime-observability.js` → `./src/platform/logging/runtime-observability.ts`
  - `restart-trigger.js` import → `restart-trigger.ts`
- Delete `backend/server.js`
- Update `backend/package.json`:
  ```json
  "start": "node --experimental-strip-types server.ts",
  "dev": "node --watch --experimental-strip-types server.ts",
  "test": "node --test --experimental-strip-types \"tests/**/*.test.ts\"",
  "typecheck": "tsc --noEmit"
  ```
- Update `backend/tsconfig.json`: remove `allowJs` and `checkJs`; include `server.ts`, `src/**/*.ts`, `tests/**/*.ts`

### 2. Remove Backend Source JS Barrels / 删除后端源码 JS Barrel

**Key constraint / 关键约束:** You cannot delete the `.js` barrel files first. The migration order is: scan all `.ts` source files for `.js` import paths, update every one to `.ts`, verify the backend still runs, then delete the barrels. Use `rg "from '\./.*\.js'" backend/src/ -g '*.ts'` to find every site that needs updating before touching any barrel file.

**不能直接删除 `.js` barrel。** 迁移顺序是：先扫描所有 `.ts` 源文件中的 `.js` 导入路径，全部改为 `.ts`，验证后端正常运行后，再删除 barrel。用 `rg "from '\./.*\.js'" backend/src/ -g '*.ts'` 找出所有需要更新的位置后再动手。

- Scan and update all backend source internal imports from `.js` to `.ts` module paths **first**:
  - Run `rg -l "from '\./.*\.js'" backend/src/ -g '*.ts'` to find affected files
  - Every `from './foo.js'` → `from './foo.ts'` in `backend/src/**/*.ts`
  - This is a mechanical, `sed`-friendly change across the source tree
- After all imports are updated and verified, delete all `backend/src/**/*.js` barrel files
  - At the time of this writing, there were ~145 such files; verify with `find backend/src -name '*.js' | wc -l` before deleting
- A small number of `.js` imports may live in other `.js` barrel files; those disappear when the barrel is deleted
- Keep frontend shared JavaScript imports outside `backend/` untouched (e.g., `src/shared/workflow/node-registry.js`)

### 3. Restart System: JS → TS / 重启系统迁移

- `restart-trigger.js`: delete the 1-line stub; keep `restart-trigger.ts` as the sentinel
- `restart-runner.js`: delete the 1-line import; `restart-runner.ts` already exists
- `restart-backend.js`: delete the 1-line re-export; `restart-backend.ts` already exists (102 lines)
- Update `restart-backend.ts`:
  - Watch mode writes `restart-trigger.ts` (currently writes `.js`)
  - Restart spawns `restart-runner.ts` and launches `server.ts` (currently `.js`)

### 4. Migrate Backend Tests / 迁移后端测试

- Rename all `backend/tests/*.test.js` → `*.test.ts`
- Update all test import lines from `../src/**/*.js` → `../src/**/*.ts`
  - Run `rg "from '\.\./src/.*\.js'" backend/tests/` to find every site
  - Common barrel targets include `storage/index.js`, `engine/nodes/index.js`, `executor.js`, `workflow-events.js`
- Update dynamic imports with query strings: `.js?test=...` → `.ts?test=...`
- Update `scripts/check-test-surface.mjs` to reference `backend/tests/http-contract.test.ts`
- Update `backend/package.json` test script (handled in Phase 1)

### 5. Update Scripts, CI, Electron, and Server-Web / 更新脚本、CI、Electron、Server-Web

| File / 文件 | Change / 变更 |
| --- | --- |
| `scripts/start-dev.mjs` | `server.js` → `server.ts`, add `--experimental-strip-types` |
| `scripts/start-local-web.mjs` | `server.js` → `server.ts`, add `--experimental-strip-types` |
| `playwright.config.ts` | `node server.js` → `node --experimental-strip-types server.ts` |
| `electron/embedded-backend.cjs` | `backend/server.js` → `backend/server.ts` |
| `.github/workflows/ci.yml` | Backend smoke command → `server.ts` + `--experimental-strip-types` |
| `scripts/check-runtime-baseline.mjs` | Check `backend/server.ts` + `backend/src/app/create-app.ts` |
| `scripts/deploy/server-web/Dockerfile` | COPY + CMD → `backend/server.ts` |
| `scripts/deploy/server-web/release-files.txt` | `backend/server.js` → `backend/server.ts` |

### 6. Update Documentation and Guards / 更新文档与护栏

- Update public docs: `docs/developer-guide.md`, `docs/deployment-variants-plan.md`
- Add a repo hygiene check (in `scripts/check-runtime-baseline.mjs` or a new guard) that fails if these exist:
  - `backend/server.js`
  - `backend/src/**/*.js`
  - `backend/tests/**/*.js`
- Do NOT apply this guard to Electron `.cjs` files or frontend shared workflow `.js` files

## Validation / 验证

Run after migration / 迁移后执行:

```bash
npm run lint
npm run typecheck
npm run test:backend
npm run test:unit
npm run check:encoding
npm run check:runtime-baseline
npm run check:test-surface
npm run check
```

Runtime smoke tests / 运行时冒烟测试:

- `npm run dev:backend`
- Electron embedded backend startup (unit tests)
- server-web release test

## Assumptions / 假设

- Node remains `>=22.12.0`; the migration depends on native `--experimental-strip-types` support
  - Node 保持 `>=22.12.0`；迁移依赖原生 `--experimental-strip-types` 支持
- No TypeScript build output is introduced — strip-types runs directly on `.ts` source
  - 不引入 TypeScript 构建产物 — strip-types 直接在 `.ts` 源码上运行
- Backend runtime code imports backend modules through `.ts` paths
  - 后端运行时代码通过 `.ts` 路径导入后端模块
- Frontend shared workflow `.js` modules are out of scope for this cleanup
  - 前端共享工作流 `.js` 模块不在本次清理范围内
- Electron main/preload files remain CommonJS and are not part of this migration
  - Electron main/preload 文件保持 CommonJS，不参与本次迁移
