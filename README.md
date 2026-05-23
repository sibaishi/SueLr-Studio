# SueLr Studio

SueLr Studio 是一个本地优先的多模态 AI 工作台，用于对话、图像、视频和基于工作流的自动化任务。

它面向希望在自己的机器上运行桌面式 AI 工作空间的用户：配置模型服务、运行多模态任务、在画布上搭建工作流，并让运行时数据保持本地可控。

## 仓库内容

- 基于 Vite + React 的前端，用于对话、图像、视频和工作流编排
- 基于 Express 的本地后端，用于模型服务接入、工作流执行、文件处理和设置管理
- 本地优先的运行时模型，默认将应用数据存放在仓库外部
- 覆盖文档、运行时边界、工作流状态结构、测试与构建的仓库质量门禁

## 项目状态

这个仓库当前作为本地应用项目持续维护，并不是一个托管式多用户 SaaS。

当前公开文档保持精简：

- [User Guide](docs/user-guide.md)
- [Developer Guide](docs/developer-guide.md)
- [Release SOP](docs/release-sop.md)

## 快速开始

### 环境要求

- Node.js `>=22.12.0`
- npm

### 安装

```bash
npm install
npm run install:all
```

### 启动

```bash
npm start
```

Windows PowerShell 可能会因为本地执行策略拦截 `npm.ps1`。如果遇到这个问题，请使用：

```bash
start.bat
```

默认本地地址：

- 前端：`http://localhost:5173`
- 后端：`http://127.0.0.1:3001`

## 典型使用方式

SueLr Studio 主要围绕四类日常使用流程组织：

1. 在设置中配置模型服务和模型访问方式。
2. 直接运行对话、图像和视频任务。
3. 在画布上搭建并执行工作流，包括居中节点选择、节点分组和键盘复制粘贴。
4. 在本地查看输出、日志、生成文件和工作流运行详情。

工作流快捷键包括：

- `Alt+G`：将当前选中的画布节点创建为节点组
- `Ctrl+Shift+Enter`：在工作流页面直接启动一次工作流运行
- `Ctrl+C` 和 `Ctrl+V`：在画布中复制和粘贴节点

## 运行时数据

运行时数据默认存放在系统配置目录，而不是仓库内的 `storage/` 目录：

```text
Windows: %APPDATA%\SueLr-Studio
macOS:   ~/Library/Application Support/SueLr-Studio
Linux:   ${XDG_CONFIG_HOME:-~/.config}/SueLr-Studio
```

如果你希望把运行时数据固定到自定义绝对路径，可以设置 `APP_CONFIG_DIR`。

生成媒体会按类型放在运行时数据目录下：

```text
files/generated/images/              图片生成原始输出
files/generated/videos/              视频生成原始输出
files/generated/assistant-images/    Chat/assistant 图库图片
files/generated/assistant-videos/    Chat/assistant 视频库视频
```

应用内仍通过 `/api/outputs/...` 和 `/api/assistant/files/...` 访问这些文件。

## 常用命令

```bash
npm start
npm run dev
npm run dev:frontend
npm run dev:backend
npm run build
npm run check
npm run electron:dist
npm run test:e2e
npm run test:e2e:install
```

`start.bat` 和 `start.sh` 是 `npm start` 的便捷启动器。一键启动器会检查 Node.js 版本、安装缺失的根目录与后端依赖、寻找可用的前后端端口、把带时间戳的日志写到 `.run-logs/`、自动打开浏览器，并在 `Ctrl+C` 时同时停止前后端进程。

对于希望使用更直接的组合开发命令、而不依赖启动器编排的维护者，`npm run dev` 仍然可用。

当你只运行前端 `npm run dev:frontend` 时，工作流和设置等 API 请求仍然依赖 Vite 的 `/api` 代理。如果你的后端并没有运行在默认的 `http://localhost:3001`，请确保 `VITE_DEV_PROXY_TARGET` 指向实际后端地址。

## 仓库结构

```text
src/            前端应用代码
backend/        后端服务与功能模块
tests/          前端单元测试与端到端验证
docs/           公开项目文档
scripts/        仓库质量门禁脚本
workflows/      示例工作流文件
```

工作流节点定义现在采用 `src/shared/workflow/node-definitions/` 下的隔离目录结构：

```text
node-definitions/
  <group>/
    index.js
    <node>/
      index.js
      node.js
```

这种方式可以让每个节点的公开入口保持稳定，同时把真实定义隔离开，方便后续更安全地修改。

## 参与贡献

欢迎外部协作。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，了解本地环境搭建、校验命令和仓库约定。

如果你是第一次参与，建议先在本地把应用跑起来一次，然后执行 `npm run check`，并在第一次本地运行 `npm run test:e2e` 之前先通过 `npm run test:e2e:install` 安装 Playwright。

当你修改中文用户可见文案、文件名或持久化内容时，请保持 UTF-8 编码，并把 `npm run check:encoding` 纳入你的检查流程。

## 许可状态

这个仓库当前还没有声明开源许可证文件。

如果你计划将它公开发布并供更广泛复用，在将其视为开源分发之前，应该先明确许可证选择。
