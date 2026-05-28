# Deployment Variants Execution Plan / 部署变体执行计划

This document defines how SueLr Studio keeps one shared product trunk while supporting three release variants: `local-web`, `desktop`, and `server-web`.

本文定义 SueLr Studio 如何在一个共享产品主干上支持三条发布变体：`local-web`、`desktop` 和 `server-web`。

## Delivery Rule / 交付规则

- Shared product logic belongs on `main`.
- Release branches carry shell, packaging, deployment, and release-hardening differences only.
- If behavior is needed by more than one variant, land it on `main` first.
- Each release variant must ship only the minimum runtime surface it needs.

- 共享产品逻辑归属 `main`。
- 发布分支只承载壳层、打包、部署和发布加固差异。
- 如果某个行为被多个变体需要，必须先落到 `main`。
- 每个发布变体只应交付自己真正需要的最小运行时表面。

## Branch Model / 分支模型

- `main`: shared product trunk with the full development surface.
- `release/local-web`: local browser distribution branch.
- `release/desktop`: Electron desktop distribution branch.
- `release/server-web`: deployable server distribution branch.

- `main`：共享产品主干，保留完整开发表面。
- `release/local-web`：本地浏览器版发布分支。
- `release/desktop`：Electron 桌面版发布分支。
- `release/server-web`：服务端部署版发布分支。

Release branches should stay focused. Do not move shared business logic into release branches unless the same change will be merged back to `main`.

发布分支应保持聚焦。不要把共享业务逻辑只放在发布分支里，除非同一变更也会合并回 `main`。

## Mainline First Changes / 主干优先变更

Completed on trunk:

主干已完成：

- Runtime mode contracts across frontend and backend.
- Backend runtime capability endpoint and privileged-route guards.
- Settings UI that understands local-only capabilities.
- Public documentation for trunk and release branch structure.
- Biome lint and format baseline for frontend and backend source.
- Root `src/lib/` removal and migration to `src/shared/*`, `src/app/`, and domain-owned helpers.
- Frontend top-level lazy loading and stable vendor chunk splitting for normal Vite builds.
- Backend TypeScript runtime migration to `backend/server.ts`, `backend/src/**/*.ts`, and `backend/tests/**/*.test.ts`.
- Source ownership is documented across `src/domains/`, `src/providers/`, `src/shared/runtime/`, `src/shared/providers/`, and `src/shared/types/`.

- 前后端运行模式契约。
- 后端运行时能力接口与高权限路由保护。
- 能感知本地专属能力的设置界面。
- 主干和发布分支结构的公开文档。
- 前后端源码的 Biome lint 与 format 基线。
- 移除根级 `src/lib/`，迁移到 `src/shared/*`、`src/app/` 和领域自有 helper。
- 前端顶层懒加载与常规 Vite 构建的稳定 vendor chunk 拆分。
- 后端 TypeScript 运行时迁移到 `backend/server.ts`、`backend/src/**/*.ts` 和 `backend/tests/**/*.test.ts`。
- 源码归属已覆盖 `src/domains/`、`src/providers/`、`src/shared/runtime/`、`src/shared/providers/` 和 `src/shared/types/`。

Still pending for long-term cleanup:

长期治理仍待完成：

- Broader audit of chat, image, video, and workflow surfaces for non-desktop assumptions.
- Multi-user server rollout readiness beyond the core isolation foundation, including production account operations, deployment smoke, and operator runbooks.

- 更广泛审计 chat、image、video 和 workflow 表面中的非桌面假设。
- 未来多用户服务端交付，包括认证、存储隔离、归属强制执行和用户级可观测性。

## Local-Web Variant / Local-Web 变体

The `local-web` variant removes Electron but keeps the local-machine deployment assumption.

`local-web` 变体移除 Electron，但仍保留“部署在本机”的前提。

Completed on trunk:

主干已完成：

- `scripts/start-local-web.mjs`
- `scripts/build-local-web.mjs`
- root scripts `dev:local-web`, `build:local-web`, and `start:local-web`
- backend static hosting through `APP_FRONTEND_DIST`
- backend startup through `node --experimental-strip-types server.ts`

- `scripts/start-local-web.mjs`
- `scripts/build-local-web.mjs`
- 根脚本 `dev:local-web`、`build:local-web` 和 `start:local-web`
- 通过 `APP_FRONTEND_DIST` 提供后端静态托管
- 通过 `node --experimental-strip-types server.ts` 启动后端

Runtime expectations:

运行预期：

- No Electron dependency.
- Browser is the only shell.
- Runtime data still uses the config-dir resolver.
- Backend port remains `3001`; Vite dev proxy remains `5173 -> 3001`.

- 不依赖 Electron。
- 浏览器是唯一壳层。
- 运行时数据仍使用配置目录解析器。
- 后端端口保持 `3001`；Vite dev proxy 保持 `5173 -> 3001`。

Manual release smoke still required:

发布前仍需人工冒烟：

- Boot local-web.
- Create, edit, and run a workflow.
- Upload files.
- List outputs and open output URLs.

- 启动 local-web。
- 创建、编辑并运行工作流。
- 上传文件。
- 列出输出并打开输出 URL。

## Desktop Variant / Desktop 变体

The desktop variant remains a thin Electron shell over shared product logic.

桌面版保持为共享产品逻辑之上的轻量 Electron 壳层。

Completed on trunk:

主干已完成：

- `electron/main.cjs` stays CommonJS and remains a thin assembly entrypoint.
- Desktop helper modules own single-instance coordination, window lifecycle, and embedded backend orchestration.
- Embedded backend startup points to `backend/server.ts`.
- Unit coverage exists for relaunch, single-instance, window lifecycle, menu, and embedded backend behavior.

- `electron/main.cjs` 保持 CommonJS，并继续作为轻量装配入口。
- 桌面 helper 模块负责单实例协调、窗口生命周期和嵌入式后端编排。
- 嵌入式后端启动入口指向 `backend/server.ts`。
- relaunch、单实例、窗口生命周期、菜单和嵌入式后端行为已有单元测试覆盖。

Execution rules:

执行规则：

- Electron must not own shared business logic.
- Renderer code must use preload bridges for IPC.
- Keep a single `BrowserWindow` unless a future request explicitly changes that requirement.

- Electron 不能拥有共享业务逻辑。
- Renderer 代码必须通过 preload bridge 使用 IPC。
- 除非未来明确要求，否则保持单 `BrowserWindow`。

Manual release smoke still required:

发布前仍需人工冒烟：

- Boot the packaged or development desktop app.
- Confirm the embedded backend starts.
- Confirm single-window behavior.
- Exercise local-only settings actions.

- 启动打包版或开发版桌面应用。
- 确认嵌入式后端启动。
- 确认单窗口行为。
- 验证本地专属设置操作。

## Server Single-User Variant / 服务端单用户变体

The first `server-web` milestone is a single-user deployment, not full SaaS or multi-tenant delivery.

`server-web` 第一阶段是单用户部署，不是完整 SaaS 或多租户交付。

Completed on trunk:

主干已完成：

- Host filesystem details are hidden in server runtime.
- Host-only actions such as backend restart are blocked from browser UI.
- Storage settings responses redact host filesystem roots.
- Workflow outputs do not expose host `savedPaths`.
- Request context carries request metadata groundwork.
- Minimized `runtime/app` build-context sync is in place.
- Server-web Docker build context and runtime layer are trimmed.
- Docker runtime starts `backend/server.ts` with `--experimental-strip-types`.

- 服务端运行时隐藏宿主机文件系统细节。
- 浏览器 UI 中阻止后端重启等宿主机专属操作。
- 存储设置响应会脱敏宿主机文件系统根路径。
- 工作流输出不暴露宿主机 `savedPaths`。
- 请求上下文已具备请求元数据基础。
- 最小化 `runtime/app` 构建上下文同步已落地。
- server-web Docker 构建上下文和运行层已裁剪。
- Docker 运行时使用 `--experimental-strip-types` 启动 `backend/server.ts`。

Acceptance criteria:

验收标准：

- Server can boot with production environment variables.
- Frontend can run entirely through deployed backend and static assets.
- Blocked host-only settings actions return standard API errors.
- Generated files remain accessible only through supported API paths.
- Storage settings and workflow save results never expose absolute host paths.

- 服务端可使用生产环境变量启动。
- 前端可完全通过部署后的后端和静态资源运行。
- 被阻止的宿主机专属设置操作返回标准 API 错误。
- 生成文件仅可通过受支持的 API 路径访问。
- 存储设置和工作流保存结果绝不暴露宿主机绝对路径。

Manual release smoke still required:

发布前仍需人工冒烟：

- Build and run the server-web image or repository deployment.
- Confirm `/api/health`.
- Open the served frontend.
- Confirm host-only actions are blocked.
- Confirm host paths are not leaked in settings, workflow outputs, or file APIs.

- 构建并运行 server-web 镜像或仓库部署。
- 确认 `/api/health`。
- 打开被托管的前端。
- 确认宿主机专属操作被阻止。
- 确认设置、工作流输出和文件 API 不泄漏宿主机路径。

## Server-Web Deployment Precheck And SOP / Server-Web 部署预检与 SOP

## Server Multi-User Readiness Gate

The trusted `server-multi-user` foundation is implemented on `main`, but the default server-web deployment remains `server-single-user`.

Before enabling `APP_RUNTIME_MODE=server-multi-user` for a release candidate, confirm all of these gates:

- Milestone 5 manual server-web smoke passed on a real deployment.
- `server-multi-user` authentication is configured with `APP_AUTH_BOOTSTRAP_USERNAME` and `APP_AUTH_BOOTSTRAP_PASSWORD`.
- Request scope is derived from the authenticated server session.
- Browser-supplied scope headers cannot impersonate users.
- Workflow, file/generated output, execution, assistant, agent, and settings surfaces have cross-user negative tests.
- Legacy records without ownership metadata are not globally visible in `server-multi-user`.
- `npm.cmd run check` passes on the candidate branch.
- `npm.cmd run test:e2e -- --grep "server multi user"` passes when the browser auth gate changes.
- `scripts/deploy/server-web/compose.yaml`, `scripts/deploy/server-web/compose.image.yaml`, and `scripts/deploy/server-web/Dockerfile` still default to `APP_RUNTIME_MODE=server-single-user`.
- Multi-user mode is enabled only through explicit deployment environment configuration.
- `APP_ADMIN_ACCESS_KEY` remains admin-console protection only; it is not regular user authentication.

Do not switch the default compose or Dockerfile runtime mode to `server-multi-user` without a separate release decision.

Precheck:

预检：

- Confirm the deployment candidate comes from `release/server-web`, or from a reviewed branch that will merge into it.
- Run `npm.cmd run check`.
- Confirm `scripts/deploy/server-web/release-files.txt` includes every runtime file needed by Docker.
- Confirm the frontend production build exists and backend can serve it through `APP_FRONTEND_DIST`.
- Confirm host filesystem paths are not exposed by settings, workflow outputs, or file APIs.

- 确认部署候选来自 `release/server-web`，或来自将合并进去的已审查分支。
- 运行 `npm.cmd run check`。
- 确认 `scripts/deploy/server-web/release-files.txt` 包含 Docker 所需的全部运行时文件。
- 确认前端生产构建存在，且后端可通过 `APP_FRONTEND_DIST` 提供服务。
- 确认设置、工作流输出和文件 API 不暴露宿主机文件系统路径。

Recommended environment contract:

推荐环境契约：

- `APP_RUNTIME_MODE=server-single-user`
- `APP_HOST=127.0.0.1` behind reverse proxy, or `0.0.0.0` inside the container runtime
- `APP_PORT=3001`
- `APP_ALLOWED_ORIGINS=<comma-separated allowed browser origins>`
- `APP_FRONTEND_DIST=<absolute path to built frontend dist>`
- `APP_CONFIG_DIR=<absolute runtime data root>` when needed

- `APP_RUNTIME_MODE=server-single-user`
- 反向代理后使用 `APP_HOST=127.0.0.1`，容器运行时可使用 `0.0.0.0`
- `APP_PORT=3001`
- `APP_ALLOWED_ORIGINS=<逗号分隔的允许浏览器来源>`
- `APP_FRONTEND_DIST=<构建后前端 dist 的绝对路径>`
- 需要时设置 `APP_CONFIG_DIR=<运行时数据绝对根路径>`

Operational notes:

运维说明：

- Repository-checkout deployments may use `install.sh`, `update.sh`, and `uninstall.sh`.
- Prebuilt image deployments may use `build-image.sh` and `update-image.sh`.
- The live compose build context should be synchronized into a minimized `runtime/app` tree.
- Server-web Docker builds should use `scripts/deploy/server-web/app.dockerignore`.
- Runtime data is kept by default on uninstall unless `SUE_LR_REMOVE_DATA=1`.

- 仓库检出式部署可使用 `install.sh`、`update.sh` 和 `uninstall.sh`。
- 预构建镜像部署可使用 `build-image.sh` 和 `update-image.sh`。
- 在线 compose 构建上下文应同步到最小化的 `runtime/app` 目录。
- server-web Docker 构建应使用 `scripts/deploy/server-web/app.dockerignore`。
- 卸载默认保留运行时数据，除非设置 `SUE_LR_REMOVE_DATA=1`。

## Milestones / 里程碑

| Milestone / 里程碑 | Status / 状态 |
| --- | --- |
| 1. Runtime Capability Layer / 运行时能力层 | Closed on trunk / 主干已关闭 |
| 2. Local-Web Release Readiness / Local-Web 发布就绪 | Closed on trunk; manual release smoke still required / 主干已关闭；发布前仍需人工冒烟 |
| 3. Desktop Variant Cleanup / 桌面变体清理 | Closed on trunk; manual release smoke still required / 主干已关闭；发布前仍需人工冒烟 |
| 4. Server Single-User Release / 服务端单用户发布 | Code and release-surface hardening complete; real deployment smoke still required / 代码和发布面加固已完成；仍需真实部署冒烟 |
| 5. Scope, Ownership, And Scoped Storage / Scope、归属与 scoped 存储 | Implemented and covered by `npm.cmd run check`; manual cross-variant smoke still required / 已实现并由 `npm.cmd run check` 覆盖；仍需跨变体人工冒烟 |
| 6. Multi-User Server Delivery / 多用户服务端交付 | Core isolation foundation implemented and covered by regression tests; explicit deployment enablement still gated / 核心隔离基础已实现并有回归测试覆盖；部署启用仍需显式门槛 |

Milestone 6 scope:

里程碑 6 范围：

- Authentication.
- Storage isolation.
- Workflow and file ownership enforcement.
- User-scoped execution and observability.
- Regression tests for primary isolation rules.

- 认证。
- 存储隔离。
- 工作流和文件归属强制执行。
- 用户级执行和可观测性。
- 核心隔离规则的回归测试。

## Validation Commands / 验证命令

For documentation and plan updates:

文档和计划更新：

```bash
npm.cmd run check:docs
npm.cmd run check:encoding
```

For code changes related to this plan:

与本计划相关的代码变更：

```bash
npm.cmd run check
```

Additional manual release smoke is required for `local-web`, `desktop`, and `server-web` before release sign-off.

发布签核前，还需要对 `local-web`、`desktop` 和 `server-web` 做额外人工冒烟。
