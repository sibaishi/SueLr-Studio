# SueLr Studio User Guide

> Current product baseline: 2026-11-11.

## Overview

SueLr Studio is a local-first multimodal studio centered on the workflow workspace:

- `Workflow`: build node-based automation flows on a canvas and run them locally
- `Settings`: configure provider connections, project models, appearance, network behavior, diagnostics, and storage

The app is split into:

- Frontend: `http://localhost:5173`
- Backend API: `http://127.0.0.1:3001`

Current product status:

- Image, video, chat, and Midjourney generation are routed through enabled project models
- The workflow canvas and workflow library are the primary product surfaces

## Install

### Environment

- Node.js `>= 22.12.0`

### Dependencies

Run these commands in the repository root:

```bash
npm install
npm run install:all
```

What they do:

- `npm install`: installs frontend and repo-level tooling
- `npm run install:all`: installs backend dependencies under `backend/`

If PowerShell blocks `npm.ps1`, use:

```bash
cmd /c npm install
cmd /c npm run install:all
```

## Start The App

Start the app with the one-click launcher:

```bash
npm start
```

On Windows, double-click `start.bat` or run it from Command Prompt. On macOS or Linux, run `./start.sh`.

What the launcher does:

- checks Node.js `>= 22.12.0`
- installs missing root and backend dependencies
- starts backend first, then frontend
- picks the next available port if the default port is already occupied
- writes logs to `.run-logs/`
- opens the frontend in your default browser

For manual development, start both frontend and backend together:

```bash
npm run dev
```

Start only the frontend:

```bash
npm run dev:frontend
```

If you start only the frontend, make sure the Vite `/api` proxy still points to the backend you actually have running. When the backend is not on the default `http://localhost:3001`, set `VITE_DEV_PROXY_TARGET` before starting the frontend.

Start only the backend:

```bash
npm run dev:backend
```

Local-web variant:

```bash
npm.cmd run dev:local-web
```

- starts backend in `local-web` runtime mode
- starts Vite for browser-based local development
- opens the app in your default browser

Build local-web assets:

```bash
npm.cmd run build:local-web
```

Run the production-style local-web launcher:

```bash
npm.cmd run start:local-web
```

- builds frontend assets if needed
- serves `dist/` through the backend using `APP_FRONTEND_DIST`
- opens the browser against the backend-hosted app
- uses the same config-dir storage resolver as the desktop variant

Desktop variant:

```bash
npm run electron:dist
```

- builds the portable desktop package
- the desktop app is single-window by design
- launching the packaged app a second time should focus the existing window instead of opening a second main window

Default local addresses:

- Frontend: `http://localhost:5173`
- Backend health check: `http://127.0.0.1:3001/api/health`

## Main User Flows

### 1. First-time setup

On first launch, the onboarding page only saves connection info and discovers remote models. It does not auto-enable those models for Workflow use.

After onboarding, open `Settings` and complete this order:

1. `Connection`
   - Fill in `Base URL`
   - Fill in `API Key`
   - Adjust provider auth mode only if your upstream requires it
   - Run connection test and model discovery
   - Multiple connection configurations may be enabled at the same time
2. `Models`
   - Open `待导入` to browse discoveries by channel and type, select models across types, and import them into the project model library
   - Browse by channel and type, then select a model to open its type and endpoint settings
   - Mark each model with the right capability type: `chat`, `image`, `video`, or `midjourney`
   - Use batch management to select models across types and enable, disable, remove, or configure the selection
   - In batch configuration, choose which model type and endpoint fields to update. Fields set to keep their current value retain each model’s configuration where applicable.
   - Use the connection selector to switch which connection you are managing
3. `Defaults`
   - Choose theme mode
   - Optionally set an external data path
   - If you changed the external data path, click `Restart Backend` after saving

Important rule:

- discovered models are not the same as enabled project models
- product model pickers only show models that you explicitly imported and enabled in `Settings -> Models`

### 2. Use Workflow

`Workflow` is the canvas-based automation studio.

Main areas:

- top toolbar: workflow identity and document actions
- floating toolbar: add nodes, open settings, adjust theme
- center canvas: nodes and edges
- right results panel: outputs, logs, preflight issues
- bottom status bar: graph and execution summary
- workflow library: card grid with workflow covers and management actions

Typical flow:

1. Open `Workflow`
2. Add nodes from the floating toolbar, or double-click blank canvas space to open the centered node picker
3. Connect them on the canvas
4. Edit node parameters
5. Save the workflow
6. Click `Execute`
7. Read outputs and logs in the results panel

To use a hand-drawn reference, click **绘制草图** on an empty IO node with no incoming connection. Choose a canvas ratio preset or enter a custom width and height (64–2048 px per side), then click **应用尺寸**. Resizing keeps the drawing centered and scales it down proportionally if needed. You can undo or redo a size change. Pressure-sensitive pens vary the brush width as you draw when the device supplies pressure to the app. Draw on the white canvas and click **保存到 IO 节点** to upload the PNG at the applied size. Connect that IO node and a prompt to an image generation node with a model that accepts reference images.

打开 IO 节点图片预览中的 **画板**，右侧 **画布属性** 的 **画布大小** 可设置宽高、比例和九宫格锚点。扩大画布会露出透明区域，缩小画布只裁掉显示范围，图层原像素可通过重新调整画布找回。图片画板的尺寸设置范围为每边 64–8192 px，总像素上限为 3200 万。草图为白底，默认使用居中锚点。

图片尺寸在画板中调整。**图像大小** 会重采样整份图像，并按新尺寸缩放所有图层的位置和像素。**图层大小** 按实际像素范围缩放当前图层，保留该范围的左上位置和整张画布尺寸。两项都默认保持宽高比例，可以解除比例锁定，也都可以撤销。

右侧 **图层** 面板从上到下显示合成顺序。点击名称或缩略图选中图层，双击名称或按 `F2` 重命名；拖动图层行可以排序。眼睛和锁图标分别控制显隐和锁定。面板底部可新建、导入和删除图层，右上角菜单提供复制、清空、排序和自由变换。可为每层设置不透明度和混合模式。

选中可见且未锁定的图层后，按 **Ctrl / ⌘ + T** 或点击左侧 **自由变换**。拖框内移动，拖边或角点缩放，拖框上方的圆点旋转；按住 Shift 拖角点保持比例，旋转时按住 Shift 按 15° 吸附。顶部也可输入位置、宽高和角度。按 Enter 应用，Esc 取消；应用后可撤销。

用 **矩形选区**（M）或 **椭圆选区**（Shift + M）拖出范围。按住 Shift 拖出正方形或正圆，拖动选区内部可移动边界。画笔、橡皮和清除像素都受选区限制；也可把选区复制为新图层，或按选区外框裁切画布。Ctrl / ⌘ + A 全选，Ctrl / ⌘ + D 或 Esc 取消选区。按住空格拖动可临时平移，滚轮可缩放。笔刷、橡皮、选区和平移都可以从画布周围的工作区起手。

用 **套索选区**（L）沿任意轮廓拖画，松开鼠标后自动闭合。套索可以限制画笔、橡皮和清除像素的范围，也可以复制为新图层或按外框裁切画布。

矩形、椭圆和套索共用顶部的 **选区模式**。选择「添加」「减去」或「相交」，再拖出一个选区，就能与现有选区合并。**羽化** 以像素为单位，应用到下一次绘制的选区。绘制、擦除、填充、清除和复制都会保留羽化边缘的透明过渡。

用 **纯色填充**（Shift + G）选择颜色，再点击工作区或顶部的填充按钮。用 **渐变填充**（G）设置起始、结束颜色，拖出一条线来控制线性渐变的方向和长度，松开应用。填充写入当前可见且未锁定的图层，有选区时只填充选区内的画布部分，否则填充整个画布。两种操作都可撤销。

选中图层后，在图层菜单中点 **导出图层到当前 IO 节点**。它会把该层作为透明 PNG 追加到当前节点，保留画布尺寸、图层位置和不透明度。选择 **导出图层到当前 IO 节点（裁紧）** 可去掉图层四周完全透明的留白，包含画布边界外的图层像素。两种方式都只导出当前图层，画板会继续打开。

打开画板、大图或文本弹窗时，键盘、点击和滚动都由最上层弹窗处理，背景画布的发光效果也不会跟随鼠标。按 Tab 在弹窗内切换焦点，关闭后可继续使用工作流快捷键。

保存输出合成 PNG，图层保留在本次编辑中。提示词通过工作流中的 **AI 能力 V3** 节点填写。

Workflow management:

- `New` starts a local draft. Save it before relying on it as a reusable workflow.
- `Save` writes the current workflow to the backend workflow store. The toolbar shows whether the canvas is still a local draft, has unsaved changes, is saving, or was saved recently.
- `Duplicate` creates a copy of the current workflow and opens the copy.
- `Delete` asks for confirmation and explains whether the current item is a saved workflow or only a local draft.
- `Import` reports migrations, warnings, ignored fields, and ID conflicts. Conflict handling can generate a new ID, preserve the imported ID, or overwrite the existing workflow when that mode is selected.

Execution behavior:

- `Execute` starts a backend workflow run and streams progress to the canvas.
- `Stop` is the explicit way to cancel a running workflow.
- Closing the browser tab, refreshing the page, or losing the streaming connection does not by itself cancel the backend run. The app can recover run status by polling after reconnecting.
- If a run finishes while the stream is disconnected, the latest terminal status is still available from the run-status endpoint for recovery.

Common node groups:

- `IO`: accepts text, images, files, or upstream values and exposes a general-purpose output. Image cards render only the actual images and do not append synthetic `+N` items.
- `AI 能力 V3`: switches execution mode from the selected project model capability
- `提示词助手`: structures and optimizes prompt content
- `素材处理`: handles text or image material through one `input -> result` contract. It can split only, iterate only, or split and then execute downstream once per item.
- `分组`: organizes canvas nodes without changing the saved child-node semantics

`素材处理` directly reuses the same V2 card dimensions, resizable bottom-panel shell, compact input preview, and popover controls as the current IO and AiV3 nodes. Its card follows the IO material-preview style without extra counters, adoption labels, leading text icons, image-count limits, or `+N` placeholders. Text keeps its original line breaks, and every image is rendered as a real thumbnail. The card previews the input items that will be processed or the latest result. Choosing `文本` or `图像` filters a mixed upstream array and processes only matching items; unsupported and non-selected items are ignored. `自动识别` accepts a single recognizable material type and asks you to choose a type when text and images are mixed. Text splitting uses a separator and output limit; image splitting uses a rows-by-columns grid. Enable at least one of `拆分` or `逐项`. A single directed execution path may contain only one `素材处理` node with `逐项` enabled, while separate parallel branches may each use one.

Image parts created by `素材处理` are temporary workflow assets. They can pass through multiple downstream nodes during the same run, but they are not added to uploads or generated results. After the workflow completes, fails, or is cancelled, the latest temporary images remain available for node preview. The app releases that retained set when the same workflow starts its next run; backend startup also removes abandoned temporary assets.

The former `文本拆分`, `图像拆分`, `文本逐项`, and `图像逐项` node types are no longer supported. Workflows containing those historical node types are reported as incompatible instead of being silently converted.

`AI 能力 V3` behavior:

- chat models return text
- image models return normalized local image outputs. The compact toolbar at the lower right of the image prompt shows the current model, aspect ratio, dimensions, and format. Choose an API channel, then a model type in the next column to see its enabled models. Search filters the same menu. Click an aspect ratio or file format to apply it, or leave either dimension blank for automatic sizing.
- video models may submit and poll asynchronous generation tasks
- Midjourney models use the dedicated asynchronous service path
- remote image URLs are downloaded and materialized before final workflow output where required

Workflow node organization notes:

- image generation and video generation are both standard AI nodes in the workflow canvas
- each workflow node is maintained as an isolated definition internally, which helps future fixes land without changing the canvas behavior you already see
- this internal organization does not change existing workflow JSON shape, node types, or normal editor usage

Workflow groups:

- group selected nodes when a canvas area becomes too crowded
- collapse a group to keep the canvas readable while preserving the internal nodes
- use group input and output ports to route connections across the group boundary
- drag from a group port toward the inside of the group to create an internal connection
- drag from a group port toward the outside of the group to create an external connection
- connect external nodes to group ports instead of wiring every internal node directly
- ungroup when you need to return the child nodes to the main canvas

Canvas interaction notes:

- double-click blank canvas space to open the centered `New Node` panel
- right-click blank canvas space to open the lightweight action menu, including `Paste Node`
- right-click selected nodes to open node or multi-node actions
- use `Alt+G` to create a group from the current node selection
- use `Ctrl+Shift+Enter` to start workflow execution from the keyboard
- use `Ctrl+C` to copy selected nodes or groups
- use `Ctrl+V` to paste near the current mouse position on the canvas
- use `Ctrl+S` to save
- use `Ctrl+W` to close the active workflow tab
- use `Ctrl+Shift+T` to reopen the most recently closed tab
- use `Ctrl+Tab` / `Ctrl+Shift+Tab` to cycle workflow tabs
- use `Ctrl+B` to toggle the results panel
- use `Ctrl+P` to toggle the node panel

Connection appearance can be switched between Bézier and smooth-step styles in `Settings -> Defaults`; the preference is persisted locally.

### 3. Use Save File in Workflow

The `Save File` node writes output content to disk.

Important behavior:

- if no output directory is configured, the node skips the write but still passes content downstream
- if an output directory is configured, it writes files to that target path

This is useful for:

- text results
- generated images
- other serialized outputs

### 4. External data path

By default, runtime data does not need to live inside the repo itself.

Default app data root:

- Windows: `%APPDATA%\\SueLr-Studio`
- macOS: `~/Library/Application Support/SueLr-Studio`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/SueLr-Studio`

You can override that from `Settings -> Defaults`.

Runtime-specific behavior:

- in `desktop` and `local-web`, the settings modal can offer local path selection and backend restart when the runtime exposes those capabilities

What gets stored there:

- workflows
- uploaded files
- generated files
- logs
- memories
- runtime settings

Generated media is organized under the app data root:

- `files/generated/images/`: raw image-generation outputs from workflow image generation
- `files/generated/videos/`: raw synchronous or downloaded video-generation outputs from tool/workflow execution
- `files/generated/assistant-images/`: legacy assistant gallery compatibility assets
- `files/generated/assistant-videos/`: legacy assistant video gallery compatibility assets

All generated files are still served through `/api/outputs/...` or `/api/assistant/files/...`, so display and reuse flows keep using local URLs rather than absolute filesystem paths.



If `APP_CONFIG_DIR` is set in the environment, it overrides the in-app storage path setting.

### 5. Restart backend from Settings

`Settings -> Defaults` includes a `Restart Backend` button.

This is mainly used after changing storage-root-related settings.

In `local-web`, this button is still valid because the backend is running on the same local machine as the browser UI.


Safety rule:

- if the project is currently busy with chat, image generation, workflow execution, or other running tasks, restart is blocked and the UI asks you to try again later

## Troubleshooting

### Frontend does not load

Check:

- the terminal running `npm start`, `start.bat`, or `start.sh` is still open
- the frontend URL printed by the launcher
- the backend health URL printed by the launcher
- the latest `.run-logs/frontend-dev-*.log` and `.run-logs/backend-dev-*.log`

### Settings saved but external path did not take effect

That is expected until backend restart.

Do this:

1. save the path in `Settings -> Defaults`
2. click `Restart Backend`
3. wait for backend to come back

### API connects but models do not show up where you need them

Discovery alone is not enough.

You must:

1. discover models in `Settings -> Connection`
2. import them in `Settings -> Models`
3. mark capability type correctly

### Chinese text or file names look garbled

The project now includes an explicit encoding check for common regressions.

If you are validating a local build or reviewing a text-handling change, run:

```bash
npm run check:encoding
```

## 本地访问与工作流恢复

Local-Web 的 API 仅在本机回环地址监听。工作流库遇到损坏的 JSON 文件时仍会列出其他工作流，原文件会保留在工作流目录，可从备份恢复。

AI 能力节点的文本、图像、视频和 Midjourney 模式使用统一的参数菜单。视频菜单提供模型、时长和画面比例，分辨率由供应商决定。图像输出档位在图像模式的「格式」菜单设置，旧工作流保存的有效图像档位仍可读取。

视频节点会区分任务提交、查询和结果下载。供应商返回相对文件地址时，工作流会下载视频后再交给 IO 节点播放和保存。文件链接失效或响应内容无效时，节点会报告结果阶段的错误。

### 文字转语音

在「设置 → 项目模型」中导入或添加支持语音合成的模型，类型选「音频」，接口选「语音合成」或填写兼容接口的自定义路径，再启用模型。在 AI 能力节点打开「模型 → 渠道 → 音频」选择该模型。有可用音频模型的渠道才会显示「音频」分类。从上游传入文本或在面板输入合成文本。音色留空时使用 `alloy`，也可填写供应商支持的音色标识。连接下游 IO 节点可播放并保存 MP3。

## 资产库

点击画布工具栏的文件夹按钮，打开资产库。上传素材和历史生成结果会自动汇总，生成结果不受当前会话限制。支持：

- 批量导入现有上传接口支持的图片、视频和音频。
- 搜索名称、原始名称、分类、标签，按类型、来源、分类或收藏筛选。
- 选择卡片后预览图片、视频和音频；修改显示名称、自定义分类和逗号分隔的标签（最多 20 个，每个最多 40 字符）。
- 点击星标收藏；点击“保存整理信息”保存名称、分类和标签。整理信息保存在本机数据目录，重启后保留。
- “回填画布”在当前视口创建 IO 节点，直接引用已有媒体文件，不重复上传。文本和 JSON 生成结果可读入文本输入（最大 2 MB）；其他文件可下载。
- 资产按文件修改时间倒序排列，每页 48 个。运行完成后自动刷新，也可手动刷新。

修改显示名称不会重命名原文件或改变现有工作流引用。资产库展示的是本机现存文件；从数据目录手动删除文件后，对应资产及工作流引用将不可用。

资产库沿用设置弹窗的固定尺寸毛玻璃外壳，内部以独立面板区分顶部信息、搜索筛选、资产浏览和详情整理。尺寸仅随窗口适配，不随资产数量、搜索结果或选择状态变化；未选择资产时详情区显示引导，选择后在同一区域显示预览与整理表单。点击详情区的图片可打开大图预览。选中文本或 JSON 数据资产后，可在详情区滚动查看原文。超过 2 MB 的文件可下载查看。详情区的表单独立滚动，底部“资产操作”卡片提供回填、下载和删除入口。选中资产后点击“删除资产”，再点击“确认删除”，该条目会从资产库移除。原文件和已有画布引用会保留。浅色和深色主题的内部面板均使用不透明背景。

在资产列表点击“多选”，可逐项选择或“全选本页”。右侧支持批量删除，也可修改分类、替换标签，勾选字段后留空会清除该字段。切换分页或筛选条件会清除当前选择。

工作流库与设置弹窗共用遮罩、固定尺寸外壳和面板材质，标题、搜索和工作流浏览区分别显示为独立面板。搜索结果和空状态不会改变弹窗尺寸；卡片仍支持打开、重命名、复制和删除。

设置、资产库和工作流库的标题区采用“小标识、主标题、说明”的统一层级。设置标题旁的装饰图标已移除；侧栏模块图标保留。设置说明在桌面宽度下完整显示为一行，空间不足时自然换行，当前配置及状态位于右侧。

## 模型原生联网

在「设置 → 模型库 → 已入库」中打开对话模型的配置，开启「原生联网」。聊天可使用配置渠道的 Responses API 搜索能力，并在回答中显示 API 返回的来源。工作流还需要在对话节点开启「联网搜索」。节点关闭时会执行普通对话；节点开启但模型关闭时，运行会报错并提示到模型库开启。开启前请确认渠道和模型支持 `web_search`。现有模型默认关闭，可逐个开启。

## 首次运行、运行历史和迁移

- 点击「执行」后，画布会先检查 AI 节点的连接和模型配置。「基础图生图」还会提示添加参考图。展开结果栏中的校验提示，可选择对应节点，或直接打开「连接」「模型」设置。发现的模型仍需手动导入并启用。设置的「已填写连接信息」表示连接字段已填写，可在「连接」中测试供应商。
- 「结果与经过 → 历史」按当前工作流显示最近 30 次运行。新记录会保存到本地数据目录，包含状态、耗时、节点错误、起始 IO 的文本摘要和文件链接，以及已保存的产物。后端重启后，正在运行的记录会标记为中断。临时素材随原有清理规则过期。
- 视频结果下载遇到可重试错误时，应用会重试取回。对于可查询的异步任务，如果自动取回仍失败，可在运行历史中点击「取回视频」，使用原连接查询原任务，视频成功保存后可从该记录下载。供应商必须仍保留任务结果。原工作流的下游节点不会自动重新运行。
- 导出含本地素材的工作流时，会列出依赖文件，可选择带媒体的 ZIP 或仅导出 JSON。导入 ZIP 会复制媒体到当前数据目录并更新引用。工作流包支持上传接口可接受的图片、视频和音频，总大小上限为 100 MB。普通 JSON 仍可导入，缺失的本地引用会列在导入提示中。
- 资产库多选后可将本页选中的文件下载为 ZIP。先在画布选中一个未锁定、没有上游输入的 IO，资产详情会提供「替换选中 IO 的内容」。
