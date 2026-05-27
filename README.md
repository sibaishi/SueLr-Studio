# SueLr Studio

SueLr Studio 是一个本地优先的多模态 AI 工作台，用于对话、图像、视频和基于工作流的自动化任务。

它当前围绕一套共享代码主干加三个交付版本演进：

- `local-web`：本地前后端 + 浏览器访问
- `desktop`：Electron 桌面壳
- `server-web`：服务器部署版本，当前先以单用户阶段收口

当前主干分支是 `main`。

## 仓库内容

- `src/`：前端应用代码
- `backend/`：Express 后端、工作流执行与运行时能力
- `electron/`：桌面壳入口
- `tests/`：前端单测与 E2E
- `docs/`：公开文档
- `.private-docs/`：本地私有计划、验收和临时记录

## 快速开始

### 环境要求

- Node.js `>=22.12.0`
- npm

### 安装

```bash
npm install
npm run install:all
```

### 常规启动

```bash
npm start
```

默认本地地址：

- 前端：`http://localhost:5173`
- 后端：`http://127.0.0.1:3001`

运行时数据默认存放在系统配置目录，并且必须通过运行时配置解析器访问，不能在代码里硬编码应用数据路径。

如果 Windows PowerShell 拦截 `npm.ps1`，可以改用：

```bash
cmd /c npm start
```

也可以直接使用根目录启动器：

- `start.bat`
- `start.sh`

## 版本相关命令

### local-web

```bash
npm.cmd run dev:local-web
npm.cmd run build:local-web
npm.cmd run start:local-web
```

### desktop

```bash
npm.cmd run electron:pack
npm.cmd run electron:dist
```

### server-web 本地模拟

后端：

```powershell
$env:APP_RUNTIME_MODE='server-single-user'
$env:APP_HOST='127.0.0.1'
$env:APP_PORT='3001'
$env:APP_ALLOWED_ORIGINS='http://127.0.0.1:5173,http://localhost:5173'
Set-Location .\backend
npm.cmd run start
```

前端：

```powershell
$env:VITE_DEV_PROXY_TARGET='http://127.0.0.1:3001'
Set-Location .
npm.cmd run dev:frontend
```

## 当前 server-web 语义

- `外部数据路径` 在 `server-web` 下表示浏览器客户端自动下载目录语义，不表示服务器宿主机路径
- 生成结果会临时保留在服务器侧，通过 `/api/outputs/...` 提供访问
- 结果面板中的 `清空服务器结果` 会实际删除服务器当前保留的临时输出历史

## 常用校验命令

```bash
npm run dev
npm run check
npm run test:e2e
npm run test:e2e:install
npm.cmd run typecheck
npm.cmd run test:backend
npm.cmd run test:unit -- runtime-capabilities
npm.cmd run test:e2e
npm.cmd run check:docs
npm.cmd run check:encoding
```

## 文档入口

- [User Guide](docs/user-guide.md)
- [Developer Guide](docs/developer-guide.md)
- [Release SOP](docs/release-sop.md)
- [Deployment Variants Plan](docs/deployment-variants-plan.md)
- [Backend TypeScript Migration Plan](docs/backend-typescript-migration-plan.md)

## 本地生成物

以下目录是构建、测试或运行时产物，不属于受控项目结构，可随时删除并由命令重新生成：

- `.run-logs/`
- `.server-web-release/`
- `dist/`
- `release/`
- `playwright-report/`
- `test-results/`

`build/` 下的图标、`storage/.gitkeep` 和 `workflows/` 示例文件是受控文件，不按生成物清理。

## 贡献说明

提交前建议先阅读：

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [AGENTS.md](AGENTS.md)
