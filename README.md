# SueLr Studio

SueLr Studio 是一个本地优先的多模态工作台，当前包含聊天、图片、视频、工作流编排与本地设置能力。

当前文档入口与治理文档见：

- `docs/README.md`
- `docs/roadmap/project-optimization-roadmap.md`
- `docs/roadmap/week-1-baseline-governance.md`
- `docs/roadmap/repository-bootstrap-baseline.md`
- `docs/plans/2026-05-03-workflow-stabilization-plan.md`
- `docs/testing/week-1-baseline-smoke-checklist.md`

## 当前架构

- 前端：React 19 + Vite 7 + TypeScript + Zustand
- 后端：Express 4 + 本地文件存储 + 工作流执行引擎
- API 访问：前端默认通过 `/api/*` 访问本地后端

## 主要目录

```text
src/                  前端应用
backend/              后端服务、模块、执行引擎
docs/                 当前项目文档与路线图
workflows/            示例工作流文件
skills/               本地技能文件
dist/                 前端构建产物
storage/              旧版项目内数据目录（仅兼容迁移用途）
```

## 运行前说明

SueLr Studio 默认面向单机自托管场景，不自带完整账户系统。

- 默认后端监听 `127.0.0.1:3001`
- 默认前端开发地址为 `http://localhost:5173`
- 默认只建议本机访问
- 如果需要局域网或外网访问，请先自行补齐网络边界和访问控制

## 运行时数据目录

当前默认运行时数据**不再**优先写入仓库内的 `storage/`，而是写入系统用户配置目录：

```text
Windows: %APPDATA%\SueLr-Studio
macOS:   ~/Library/Application Support/SueLr-Studio
Linux:   ${XDG_CONFIG_HOME:-~/.config}/SueLr-Studio
```

你也可以显式指定：

```bash
APP_CONFIG_DIR=/absolute/path/to/SueLr-Studio
```

兼容说明：

- `APP_CONFIG_DIR` 优先级高于 `APP_STORAGE_DIR`
- `APP_STORAGE_DIR` 仅保留给旧部署兼容
- 仓库根目录下的 `storage/` 不应再视为默认权威数据目录

## 安装依赖

根目录安装前端依赖：

```bash
npm install
```

安装后端依赖：

```bash
npm install --prefix backend
```

也可以在根目录执行：

```bash
npm run install:all
```

## 开发启动

同时启动前后端：

```bash
npm run dev
```

仅启动前端：

```bash
npm run dev:frontend
```

仅启动后端：

```bash
npm run dev:backend
```

Windows 下如果 PowerShell 因执行策略拦截 `npm.ps1`，请改用：

```bash
cmd /c npm run dev
cmd /c npm run build
cmd /c npm test
```

## 构建与运行

前端构建：

```bash
npm run build
```

前端预览：

```bash
npm run preview
```

后端生产启动：

```bash
npm run start:backend
```

## 当前验证命令

类型检查：

```bash
cmd /c npx tsc --noEmit
```

前端构建：

```bash
cmd /c npm run build
```

后端测试：

```bash
cmd /c npm test
```

## 环境变量

项目内已提供示例文件：

- `.env.example`

推荐复制为本地 `.env` 后按需调整。

核心变量如下：

- `VITE_API_BASE`：前端 API 基础路径，默认 `/api`
- `APP_PORT`：后端端口，默认 `3001`
- `APP_HOST`：后端监听地址，默认 `127.0.0.1`
- `APP_ALLOWED_ORIGINS`：允许访问后端 API 的前端来源
- `APP_CONFIG_DIR`：运行时配置、上传、日志、工作流数据根目录
- `APP_STORAGE_DIR`：旧版兼容变量，优先级低于 `APP_CONFIG_DIR`
- `APP_ALLOW_PRIVATE_PROVIDER_URLS`：当后端暴露到非本机网络时，是否允许私网 Provider URL

## 默认开发联通关系

- Vite 开发服务器默认在 `5173`
- Vite 会将 `/api` 代理到 `http://localhost:3001`
- 后端默认允许以下来源：
  - `http://localhost:5173`
  - `http://127.0.0.1:5173`
  - `http://localhost:4173`
  - `http://127.0.0.1:4173`

## 主要功能入口

- `src/app/App.tsx`
- `src/components/ChatPanel.tsx`
- `src/components/ImagePanel.tsx`
- `src/components/VideoPanel.tsx`
- `src/features/workflow/App.tsx`
- `src/domains/settings/`

后端关键模块：

- `backend/server.js`
- `backend/src/app/create-app.js`
- `backend/src/modules/settings/`
- `backend/src/modules/assistant/`
- `backend/src/modules/workflows/`
- `backend/src/modules/execution/`
- `backend/src/modules/capabilities/`
- `backend/src/modules/files/`

## 当前数据边界

- `workflows/`：仓库内示例工作流，可纳入版本控制
- 真实运行时工作流：默认保存在 `APP_CONFIG_DIR/workflows/`
- 上传文件：默认保存在 `APP_CONFIG_DIR/files/uploads/`
- 生成产物：默认保存在 `APP_CONFIG_DIR/files/generated/`
- 日志：默认保存在 `APP_CONFIG_DIR/logs/`
- 部分 UI 状态仍可能使用浏览器 `localStorage`

## 建议的本地检查顺序

1. 安装根目录和 `backend/` 依赖
2. 执行 `cmd /c npx tsc --noEmit`
3. 执行 `cmd /c npm run build`
4. 执行 `cmd /c npm test`
5. 按 `docs/testing/week-1-baseline-smoke-checklist.md` 做手工 smoke

## 注意事项

- 不要提交真实 `.env`、上传文件、生成产物、日志或用户数据
- 默认仓库更适合本地单机、自托管、演示和持续开发
- 若继续迭代，优先沿用现有 `domains`、`shared`、`features/workflow`、`backend/src/modules` 结构
