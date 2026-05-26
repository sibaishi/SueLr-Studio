# Deployment Variants Execution Plan
# 部署变体执行计划

This document defines how SueLr Studio evolves from one shared codebase into the current `master` trunk plus three public release variants.
本文定义 SueLr Studio 如何从一套共享代码库演进为当前的 `master` 主干加三个公开发布变体。

- `local-web`: frontend + backend running locally and opened in a browser
- `local-web`：前后端都在本机运行，并通过浏览器打开
- `desktop`: a clean Electron desktop shell
- `desktop`：轻量、清晰的 Electron 桌面壳
- `server-web`: a deployable server version that starts single-user and later evolves to multi-user
- `server-web`：可部署的服务端版本，先支持单用户，后续演进到多用户

## Delivery Rule
## 交付规则

- Shared product logic belongs on `master`
- 共享产品逻辑归属 `master`
- Release branches carry shell, packaging, and deployment differences only
- 发布分支只承载壳层、打包和部署差异

## Release Surface Rule
## 发布面规则

- `master` keeps the full development surface, including tests, e2e assets, maintenance tooling, and documentation
- `master` 保留完整开发面，包括测试、e2e 资源、维护工具和文档
- Each release variant must publish only the minimum runtime surface it actually needs
- 每个发布变体只应发布其真实运行所需的最小运行面
- Release-surface trimming must be enforced by scripts, build-context filters, and packaging rules rather than by manual operator discipline
- 发布面裁剪必须通过脚本、构建上下文过滤和打包规则强制执行，而不是依赖人工自觉

## Repository Root Cleanup
## 仓库根目录治理

The repository root must stay easy to scan and must not accumulate ad hoc files over time.
仓库根目录必须保持易于扫描，不能随着时间推移堆积临时性杂项文件。

### First-class root directories
### 一级根目录

- `src/`: frontend product source
- `src/`：前端产品源码
- `backend/`: backend source and runtime entry
- `backend/`：后端源码与运行入口
- `electron/`: desktop shell only
- `electron/`：桌面壳专用
- `docs/`: public documentation only
- `docs/`：仅放公开文档
- `tests/`: frontend unit and end-to-end coverage
- `tests/`：前端单测与端到端测试
- `scripts/`: maintenance, validation, and launcher scripts
- `scripts/`：维护、校验与启动脚本
- `workflows/`: shared example workflows
- `workflows/`：共享示例工作流
- `build/`: build resources such as icons and packaging assets
- `build/`：图标、打包资产等构建资源

### Generated or runtime-only directories
### 生成物或运行期目录

- `dist/`: built frontend artifacts
- `dist/`：前端构建产物
- `release/`: packaged desktop outputs
- `release/`：桌面打包输出
- `.run-logs/`: launcher and runtime logs
- `.run-logs/`：启动器和运行日志
- `storage/`: repository-local runtime storage used only when explicitly configured for development
- `storage/`：仅在显式配置开发环境时使用的仓库内运行存储
- `playwright-report/`, `test-results/`, `node_modules/`: generated support surfaces
- `playwright-report/`、`test-results/`、`node_modules/`：生成型支撑目录

Rules:
规则：

- These directories must stay ignored by git
- 这些目录必须保持被 git 忽略
- Documentation must describe them as generated or runtime-only surfaces, not source structure
- 文档必须将其描述为生成物或运行期目录，而不是源码结构
- New code must not depend on these paths as permanent source locations
- 新代码不能将这些路径当作永久源码位置依赖

### Root files that remain visible entrypoints
### 保持可见的根目录入口文件

- `package.json`
- `package-lock.json`
- `README.md`
- `CONTRIBUTING.md`
- `AGENTS.md`
- `index.html`
- `vite.config.ts`
- `vitest.config.ts`
- `playwright.config.ts`
- `tsconfig.json`
- `start.bat`
- `start.sh`

Rules:
规则：

- User-facing launch entrypoints may remain at the root
- 面向用户的启动入口可以保留在根目录
- Repo-wide config files may remain at the root
- 仓库级配置文件可以保留在根目录
- New maintenance helpers should go into `scripts/` instead of the root
- 新的维护脚本应进入 `scripts/`，而不是直接堆在根目录

## Structure Inventory
## 结构盘点

### Frontend growth targets
### 前端增长目标目录

- `src/app/`: app shell, bootstrap, navigation
- `src/app/`：应用壳、启动逻辑、导航
- `src/domains/`: domain-owned product surfaces
- `src/domains/`：各领域自有产品面
- `src/features/`: cross-domain surfaces such as settings
- `src/features/`：跨领域功能面，例如设置页
- `src/providers/`: React context providers
- `src/providers/`：React 上下文提供者
- `src/shared/`: shared API, UI, hooks, runtime helpers, workflow infrastructure
- `src/shared/`：共享 API、UI、Hooks、运行时辅助、工作流基础设施

### Frontend compatibility surface
### 前端兼容层

- `src/lib/`: compatibility layer only
- `src/lib/`：仅保留为兼容层

Rules:
规则：

- Do not add new modules casually to `src/lib/`
- 不要随意向 `src/lib/` 新增模块
- Canonical ownership should move into `src/app/`, `src/shared/*`, or the owning domain tree
- 规范归属应转入 `src/app/`、`src/shared/*` 或所属领域目录

### Backend growth targets
### 后端增长目标目录

- `backend/src/app/`
- `backend/src/modules/`
- `backend/src/engine/`
- `backend/src/platform/`

Rules:
规则：

- Business HTTP logic stays in `modules/`
- 业务 HTTP 逻辑放在 `modules/`
- Workflow execution logic stays in `engine/`
- 工作流执行逻辑放在 `engine/`
- Infrastructure and deployment-specific behavior stays in `platform/`
- 基础设施与部署相关行为放在 `platform/`

## Branch Model
## 分支模型

- `master`: shared product trunk
- `master`：共享产品主干
- `release/local-web`: local browser distribution branch
- `release/local-web`：本地浏览器版发布分支
- `release/desktop`: desktop distribution branch
- `release/desktop`：桌面版发布分支
- `release/server-web`: deployable server distribution branch
- `release/server-web`：服务端部署版发布分支

Branch rules:
分支规则：

- Shared feature work starts on `master`
- 共享功能先落在 `master`
- Release branches receive only variant-specific work, release hardening, or hotfixes
- 发布分支只接收变体专属工作、发布加固或热修复
- If behavior is needed by more than one variant, it must land on `master` first
- 如果一个行为被多个变体需要，必须先落到 `master`

## Mainline First Changes
## 主干优先变更

The following work should always be resolved on `master` before branches diverge further.
以下工作应始终优先在 `master` 上完成，然后再允许分支进一步分化。

Completed on trunk:
主干已完成：

- frontend and backend runtime mode contracts
- 前后端运行模式契约
- backend runtime capability endpoint and privileged-route guards
- 后端运行时能力接口与高权限路由保护
- settings capability-aware UI for local-only actions
- 对本地专属操作具备能力感知的设置页 UI
- public trunk and release-branch structure documentation
- 公开的主干与发布分支结构文档

Still pending for long-term cleanup:
长期治理中仍待完成：

- broader audit of chat, image, video, and workflow surfaces for non-desktop assumptions
- 针对 chat、image、video、workflow 的更广泛非桌面假设审查

## Local-Web Variant
## Local-Web 变体

The `local-web` variant removes Electron but keeps the local-machine deployment assumption.
`local-web` 变体移除 Electron，但仍保留“部署在本机”的前提。

Completed on trunk:
主干已完成：

- `scripts/start-local-web.mjs`
- `scripts/build-local-web.mjs`
- root scripts `dev:local-web`, `build:local-web`, and `start:local-web`
- 根脚本 `dev:local-web`、`build:local-web`、`start:local-web`
- backend static hosting path through `APP_FRONTEND_DIST`
- 通过 `APP_FRONTEND_DIST` 提供后端静态托管

Runtime expectations:
运行预期：

- no Electron dependency
- 不依赖 Electron
- browser is the only shell
- 浏览器是唯一壳层
- local runtime data still uses the existing config-dir resolver
- 本地运行数据仍使用既有配置目录解析器

## Desktop Variant
## Desktop 变体

The desktop variant should remain a thin shell over shared logic.
桌面版应保持为共享逻辑之上的轻量壳层。

Completed on trunk:
主干已完成：

- desktop main-process logic split into dedicated helper modules
- 桌面主进程逻辑已拆分为专门的辅助模块
- single-instance protection with unit coverage
- 单实例保护及其单测覆盖
- embedded backend startup and window lifecycle validation
- 内嵌后端启动与窗口生命周期验证

Execution rule:
执行规则：

- Electron must not become the owner of shared business logic
- Electron 不能成为共享业务逻辑的归属层
- Any feature needed by more than desktop belongs back on `master`
- 任何超过桌面版独占需求的功能，都应回归 `master`

## Server Single-User Variant
## 服务端单用户变体

The first `server-web` milestone is a single-user deployment, not full SaaS or multi-tenant delivery.
`server-web` 的第一阶段是单用户部署，不是完整 SaaS 或多租户交付。

Completed on trunk:
主干已完成：

- host filesystem details are hidden in server runtime
- 服务端运行时已隐藏宿主机文件系统细节
- host-only actions such as backend restart are blocked
- 已阻止后端重启等宿主机专属操作
- storage settings responses redact host filesystem roots
- 存储设置接口会脱敏宿主机路径
- workflow outputs no longer expose host `savedPaths`
- 工作流输出不再暴露宿主机 `savedPaths`
- request context carries request metadata groundwork
- 请求上下文已具备基础请求元数据
- minimized `runtime/app` build-context sync is in place
- 最小化 `runtime/app` 构建上下文同步已落地
- server-web Docker build context and runtime layer are trimmed
- server-web 的 Docker 构建上下文和运行层已裁剪

Acceptance criteria:
验收标准：

- server can boot with production environment variables
- 服务端可在生产环境变量下启动
- frontend can run entirely through deployed backend and static assets
- 前端可完全通过部署后的后端与静态资源运行
- blocked host-only settings actions return standard API errors
- 被阻止的宿主机专属设置操作返回标准 API 错误
- generated files remain accessible only through supported API paths
- 生成文件仅可通过受支持的 API 路径访问
- storage settings and workflow save results never expose absolute host paths
- 存储设置和工作流保存结果绝不暴露宿主机绝对路径

## Server-Web Deployment Precheck And SOP
## Server-Web 部署预检与 SOP

Precheck:
预检：

- confirm the deployment candidate comes from `release/server-web`, or from a reviewed branch that will merge into it
- 确认部署候选来自 `release/server-web`，或来自将被合并进去的已审查分支
- confirm `npm run typecheck`
- 确认 `npm run typecheck`
- confirm `npm run test:backend`
- 确认 `npm run test:backend`
- confirm `npm run check:docs`
- 确认 `npm run check:docs`
- confirm `npm run check:encoding`
- 确认 `npm run check:encoding`
- confirm the frontend production build exists and backend can serve it through `APP_FRONTEND_DIST`
- 确认前端生产构建已存在，且后端能通过 `APP_FRONTEND_DIST` 提供服务
- confirm host filesystem paths are not exposed by settings, workflow outputs, or file APIs
- 确认设置、工作流输出和文件 API 不暴露宿主机路径

Recommended environment contract:
推荐环境约定：

- `APP_RUNTIME_MODE=server-single-user`
- `APP_HOST=127.0.0.1`
- `APP_PORT=3001`
- `APP_ALLOWED_ORIGINS=<comma-separated allowed browser origins>`
- `APP_FRONTEND_DIST=<absolute path to built frontend dist>`
- `APP_CONFIG_DIR=<absolute runtime data root>` when needed
- 需要时使用 `APP_CONFIG_DIR=<运行数据绝对根路径>`

Operational notes:
运维说明：

- the source checkout may remain on the host as update source
- 源码检出目录可继续保留在宿主机上作为更新源
- the live compose build context should be synchronized into a minimized `runtime/app` tree
- 在线 compose 构建上下文应同步到最小化的 `runtime/app` 目录
- server-web Docker builds should use a variant-specific `.dockerignore`
- server-web Docker 构建应使用变体专属 `.dockerignore`
- runtime data is kept by default on uninstall unless `SUE_LR_REMOVE_DATA=1`
- 默认卸载不删除运行数据，除非设置 `SUE_LR_REMOVE_DATA=1`

## Milestones
## 里程碑

### Milestone 1: Runtime Capability Layer
### 里程碑 1：运行时能力层

Scope:
范围：

- runtime mode definitions exist on frontend and backend
- 前后端具备运行模式定义
- capability-aware UI gates exist for host-only actions
- 对宿主机专属操作具备能力感知 UI 门控
- backend privileged routes are runtime-guarded
- 后端高权限路由受运行模式保护

Status:
状态：

- closed on trunk
- 主干已收口

### Milestone 2: Local-Web Release Readiness
### 里程碑 2：Local-Web 发布就绪

Scope:
范围：

- local-web launcher scripts exist
- local-web 启动脚本存在
- browser-only local runtime is fully usable
- 纯浏览器本地运行形态可用

Status:
状态：

- closed on trunk
- 主干已收口

### Milestone 3: Desktop Variant Cleanup
### 里程碑 3：桌面版清理收口

Scope:
范围：

- Electron shell remains thin
- Electron 壳层保持轻量
- desktop packaging keeps working after mainline runtime changes
- 主干运行时调整后，桌面打包仍可用

Status:
状态：

- closed on trunk
- 主干已收口

### Milestone 4: Server Single-User Release
### 里程碑 4：服务端单用户发布

Scope:
范围：

- server deployment works with static frontend hosting
- 服务端部署可结合静态前端托管运行
- host-path exposure is removed
- 宿主机路径暴露已移除
- server-safe storage and file access behavior is enforced
- 服务端安全的存储与文件访问行为已强制落实

Status:
状态：

- closed after rollout validation and release-surface hardening
- 已在上线验证与发布面收紧后收口

### Milestone 5A: Scope Foundation
### 里程碑 5A：Scope 基础骨架

Goal:
目标：

- introduce a unified request scope model without breaking single-user behavior
- 在不破坏单用户行为的前提下引入统一请求 scope 模型

Scope:
范围：

- request-scoped identity groundwork
- 请求级身份上下文基础
- standardized `scope` fields in request context
- 在请求上下文中标准化 `scope` 字段
- service-layer ability to accept scope parameters
- 服务层具备接收 scope 参数的能力
- logging and diagnostics carry scope metadata
- 日志与诊断携带 scope 元数据

Acceptance criteria:
验收标准：

- request context can carry `userId`, `workspaceId`, and runtime mode without breaking current server-single-user behavior
- 请求上下文可携带 `userId`、`workspaceId` 和运行模式，且不破坏当前 server-single-user 行为
- single-user mode maps safely to default scope values
- 单用户模式可安全映射到默认 scope 值
- key service interfaces can accept scope-aware parameters
- 关键服务接口可接收带 scope 的参数
- runtime diagnostics can show the active scope foundation state
- 运行时诊断可展示当前 scope 基础状态

Risk checklist:
风险清单：

- do not introduce a full auth system here
- 此阶段不引入完整认证系统
- do not force frontend workspace UI yet
- 此阶段不强行引入前端 workspace UI
- keep current local and desktop behavior unchanged
- 保持当前 local 和 desktop 行为不变

### Milestone 5B: Resource Ownership
### 里程碑 5B：资源归属模型

Goal:
目标：

- make persisted resources carry explicit ownership metadata
- 让持久化资源显式携带归属元数据

Scope:
范围：

- workflows
- 工作流
- workflow runs
- 工作流运行记录
- generated files
- 生成文件
- assistant and agent sessions
- assistant 与 agent 会话
- memory records
- memory 记录
- audit and diagnostics records
- 审计与诊断记录

Acceptance criteria:
验收标准：

- new persisted resources include ownership metadata such as `ownerUserId` and `workspaceId`
- 新写入的持久化资源包含 `ownerUserId`、`workspaceId` 等归属元数据
- existing single-user data remains readable through default ownership fallback
- 既有单用户数据可通过默认归属兜底继续读取
- workflow runs, output files, and session records can be traced to an owner scope
- 工作流运行、输出文件和会话记录可追溯到所属 scope

Risk checklist:
风险清单：

- do not break old data reads
- 不要破坏旧数据读取
- do not widen memory write behavior beyond current governance
- 不要突破当前 memory 写入治理边界
- keep ownership metadata additive before enforcing strict isolation
- 在严格隔离前，归属元数据应以增量兼容方式引入

### Milestone 5C: Scoped Storage Preparation
### 里程碑 5C：Scoped 存储准备

Goal:
目标：

- prepare storage and file access for future multi-user isolation without forcing a full data migration yet
- 为未来多用户隔离预留存储与文件访问能力，但暂不强制完整数据迁移

Scope:
范围：

- scope-aware storage path builders
- 带 scope 的存储路径构造器
- scope-aware file and output resolution
- 带 scope 的文件与输出解析
- workflow and output reads defaulting to scope filtering
- 工作流与输出读取默认按 scope 过滤
- migration strategy documentation for later physical namespace moves
- 为未来物理命名空间迁移准备迁移策略文档

Acceptance criteria:
验收标准：

- storage path logic can accept future workspace-aware namespace inputs
- 存储路径逻辑可接受未来基于 workspace 的命名空间输入
- current single-user runtime can still resolve to existing storage layout safely
- 当前单用户运行时仍可安全解析到现有存储布局
- file access and output listing services have explicit scope-aware extension points
- 文件访问与输出列表服务具备显式的 scope 扩展点
- no host-path leaks are reintroduced while preparing scoped storage
- 在 scoped 存储准备过程中不得重新引入宿主机路径泄漏

Risk checklist:
风险清单：

- do not force physical directory migration too early
- 不要过早强制进行物理目录迁移
- do not couple this stage to a mandatory database migration
- 此阶段不要绑定强制数据库迁移
- keep file URLs and API contracts stable while storage internals evolve
- 在存储内部演进时保持文件 URL 与 API 契约稳定

### Milestone 6: Multi-User Server Delivery
### 里程碑 6：多用户服务端交付

Scope:
范围：

- authentication
- 认证
- storage isolation
- 存储隔离
- workflow and file ownership enforcement
- 工作流与文件归属强制执行
- user-scoped execution and observability
- 用户级执行与可观测性

Acceptance criteria:
验收标准：

- one user cannot access another user's workflows, files, or logs
- 用户之间不能访问彼此的工作流、文件或日志
- generated outputs are isolated by user or workspace
- 生成输出按用户或工作区隔离
- execution logs and assistant artifacts follow ownership boundaries
- 执行日志与 assistant 产物遵守归属边界
- regression tests cover the primary isolation rules
- 回归测试覆盖核心隔离规则

## Validation Commands
## 校验命令

For documentation and plan updates:
文档与计划更新时：

```bash
npm run check:docs
npm run check:encoding
```

For code changes related to this plan:
与本计划相关的代码变更时：

```bash
npm run typecheck
npm run test:unit
npm run test:backend
npm run build
```
