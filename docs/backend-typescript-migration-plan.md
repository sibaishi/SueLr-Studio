# Backend TypeScript Migration Plan / 后端 TypeScript 迁移计划

## Summary / 概要

Completed on 2026-05-27.

已于 2026-05-27 完成。

The backend now runs directly from TypeScript source with Node 22 `--experimental-strip-types`. Backend JavaScript facades have been removed from runtime code, tests have been renamed to `.test.ts`, and startup paths across development, Electron embedding, CI, and server-web deployment now target `backend/server.ts`.

后端现在使用 Node 22 `--experimental-strip-types` 直接运行 TypeScript 源码。后端运行时代码中的 JavaScript facade 已删除，测试已重命名为 `.test.ts`，开发启动、Electron 嵌入、CI 与 server-web 部署都已指向 `backend/server.ts`。

## Current State / 当前状态

| Area / 范围 | State / 状态 |
| --- | --- |
| Entrypoint / 入口 | `backend/server.ts` |
| Backend source / 后端源码 | `backend/src/**/*.ts`; no `backend/src/**/*.js` facades |
| Backend tests / 后端测试 | `backend/tests/**/*.test.ts`; no `backend/tests/**/*.js` |
| Runtime execution / 运行方式 | `node --experimental-strip-types server.ts` |
| Type checking / 类型检查 | `backend/tsconfig.json` includes `server.ts`, `src/**/*.ts`, and `tests/**/*.ts` |
| Restart system / 重启系统 | `restart-backend.ts`, `restart-runner.ts`, and `restart-trigger.ts` |
| Guard / 护栏 | `scripts/check-runtime-baseline.mjs` fails if backend JS facades return |

## Implementation Plan / 实施计划

This plan has been executed. Future changes should preserve the completed shape rather than reintroducing compatibility facades.

本计划已执行完成。后续变更应保持当前完成后的结构，不要重新引入兼容 facade。

Completed steps:

已完成步骤：

- Renamed `backend/server.js` to `backend/server.ts`.
- Updated backend runtime imports from backend `.js` paths to `.ts` paths.
- Removed `backend/src/**/*.js` barrel facades.
- Renamed backend tests from `.test.js` to `.test.ts`.
- Updated restart tooling to write and execute `.ts` files.
- Updated development scripts, Playwright, Electron embedded backend startup, CI, and server-web deployment to use `--experimental-strip-types`.
- Added runtime baseline hygiene checks for removed backend JS facades.

- 已将 `backend/server.js` 重命名为 `backend/server.ts`。
- 已将后端运行时代码中的后端 `.js` 导入路径改为 `.ts`。
- 已删除 `backend/src/**/*.js` barrel facade。
- 已将后端测试从 `.test.js` 重命名为 `.test.ts`。
- 已更新重启工具，使其写入并执行 `.ts` 文件。
- 已更新开发脚本、Playwright、Electron 嵌入式后端启动、CI 与 server-web 部署，统一使用 `--experimental-strip-types`。
- 已添加 runtime baseline 护栏，防止已删除的后端 JS facade 回归。

## Runtime Entry Points / 运行入口

The following callers are expected to use TypeScript runtime entry points:

以下调用方应使用 TypeScript 运行入口：

| File / 文件 | Expected target / 预期目标 |
| --- | --- |
| `backend/package.json` | `node --experimental-strip-types server.ts` |
| `playwright.config.ts` | `node --experimental-strip-types server.ts` |
| `electron/embedded-backend.cjs` | `backend/server.ts` |
| `.github/workflows/ci.yml` | `node --experimental-strip-types backend/server.ts` |
| `scripts/start-dev.mjs` | `--watch --experimental-strip-types server.ts` |
| `scripts/start-local-web.mjs` | `--experimental-strip-types server.ts` |
| `scripts/deploy/server-web/Dockerfile` | `node --experimental-strip-types /app/backend/server.ts` |
| `scripts/deploy/server-web/release-files.txt` | `backend/server.ts` |

## Hard Constraints / 硬约束

- Do not recreate `backend/server.js`.
- Do not add new `backend/src/**/*.js` implementation or facade files.
- Do not add new `backend/tests/**/*.js` files.
- Backend runtime imports should use `.ts` extensions for backend modules.
- Frontend shared workflow JavaScript modules remain out of scope. Imports such as `src/shared/workflow/node-registry.js` and `src/shared/workflow/prompt-helper.js` are valid.
- Electron `main.cjs` and `preload.cjs` remain CommonJS.

- 不要重新创建 `backend/server.js`。
- 不要新增 `backend/src/**/*.js` 实现文件或 facade 文件。
- 不要新增 `backend/tests/**/*.js` 文件。
- 后端运行时代码导入后端模块时应使用 `.ts` 后缀。
- 前端共享 workflow JavaScript 模块不属于本次清理范围。`src/shared/workflow/node-registry.js` 与 `src/shared/workflow/prompt-helper.js` 等导入仍然有效。
- Electron `main.cjs` 与 `preload.cjs` 继续保持 CommonJS。

## Validation / 验证

Run these checks after touching backend runtime, tests, CI, or deployment entry points:

修改后端运行时、测试、CI 或部署入口后，运行以下检查：

```bash
npm run check:runtime-baseline
npm run check:test-surface
npm run check:encoding
npm run typecheck --prefix backend
npm run test --prefix backend
```

For a full release-quality gate, run:

完整发布质量门禁：

```bash
npm run check
```

## Assumptions / 假设

- Node remains `>=22.12.0`; direct TypeScript execution depends on native `--experimental-strip-types` support.
- No TypeScript build output is introduced for the backend runtime.
- Backend runtime code imports backend modules through `.ts` paths.
- Frontend shared workflow `.js` modules remain outside this backend cleanup.
- Electron main and preload files remain CommonJS.

- Node 继续保持 `>=22.12.0`；直接执行 TypeScript 依赖原生 `--experimental-strip-types` 支持。
- 后端运行时不引入 TypeScript 构建产物。
- 后端运行时代码通过 `.ts` 路径导入后端模块。
- 前端共享 workflow `.js` 模块不属于后端清理范围。
- Electron main 与 preload 文件继续保持 CommonJS。
