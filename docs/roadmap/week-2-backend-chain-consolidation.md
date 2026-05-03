# Week 2 后端链路收口说明

## 1. 目标

Week 2 的重点不是继续叠加功能，而是把后端当前真正生效的调用链梳理清楚，明确唯一入口、核心落点、跨层依赖和旧层保留策略。

这一阶段完成后，团队至少要能回答四个问题：

1. 当前 Express 实际挂载了哪些 API 路由
2. 每条路由最终落到了哪个 controller / service / repository / engine
3. 哪些旧目录还在被新模块直接依赖
4. 哪些旧层是兼容壳，哪些旧层仍然是关键实现

## 2. 当前真实启动入口

### 服务入口

- 唯一服务启动文件：`backend/server.js`
- 唯一应用装配入口：`backend/src/app/create-app.js`

当前后端不是由 `backend/routes/` 或 `backend/services/` 直接启动，而是由 `createApp()` 统一装配后再由 `server.js` 启动。

### 当前实际挂载的 API

`backend/src/app/create-app.js` 当前挂载了以下入口：

- `/api/workflows`
- `/api/execute`
- `/api/assistant`
- `/api/images`
- `/api/capabilities`
- `/api/settings`
- `/api`（文件上传/删除）
- `/api/outputs`（静态输出目录）
- `/api/files`（静态上传目录）
- `/api/health`
- `/api/status`

结论：`backend/src/modules/*` 已经是当前后端 HTTP 层的真实生效入口。

## 3. 当前活跃调用链

### 3.1 工作流链路

路由链：

- `/api/workflows/*`
- `src/modules/workflows/workflows.routes.js`
- `src/modules/workflows/workflows.controller.js`
- `src/modules/workflows/workflows.service.js`
- `src/modules/workflows/workflows.repository.js`
- `src/platform/storage/*`

特点：

- 这条链已经基本完成模块化
- 持久化直接走 `src/platform/storage`
- 不再依赖旧 `backend/routes/workflows.js` 里的业务逻辑

### 3.2 执行链路

路由链：

- `/api/execute/*`
- `src/modules/execution/execution.routes.js`
- `src/modules/execution/execution.controller.js`
- `src/modules/execution/execution.service.js`
- `engine/executor.js`
- `engine/nodes/*`
- `engine/helpers/*`

特点：

- HTTP 层已经迁到 `src/modules/execution`
- 核心执行引擎仍然完全位于旧 `engine/`
- 这是“新入口 + 旧执行核心”的典型混合链路

### 3.3 图片生成链路

路由链：

- `/api/images/generate`
- `src/modules/images/images.routes.js`
- `src/modules/images/images.controller.js`
- `src/modules/images/images.service.js`
- `backend/services/imageService.js`
- `engine/helpers/imageGeneration.js`

特点：

- 新模块只负责包一层服务
- 真实图片请求构造与上游交互仍在旧 `services/` + `engine/helpers/`
- 图片链路仍是 Week 5 最优先收口对象

### 3.4 能力接口链路

路由链：

- `/api/capabilities/chat`
- `/api/capabilities/search`
- `/api/capabilities/image`
- `/api/capabilities/video`
- `/api/capabilities/video/:taskId`
- `src/modules/capabilities/capabilities.routes.js`
- `src/modules/capabilities/capabilities.controller.js`
- `src/modules/capabilities/capabilities.service.js`
- `backend/services/chatService.js`
- `backend/services/imageService.js`
- `backend/services/searchService.js`
- `backend/services/videoService.js`

特点：

- 这条链的 HTTP 入口已统一
- 但核心能力实现仍然依赖旧 `services/`
- 与 `/api/images` 存在图片能力重复入口

### 3.5 设置链路

路由链：

- `/api/settings/*`
- `src/modules/settings/settings.routes.js`
- `src/modules/settings/settings.controller.js`
- `src/modules/settings/settings.service.js`
- `src/modules/settings/settings.repository.js`
- `src/platform/storage/*`
- `src/platform/providers/*`

特点：

- 设置模块已经基本进入新架构
- 但为了兼容历史配置，仍直接调用：
  - `engine/helpers/projectModels.js`
  - `routes/settingsShared.js`
- 这说明“设置”虽然模块化了，但还有历史辅助逻辑残留

### 3.6 助手与文件链路

助手链：

- `/api/assistant/*`
- `src/modules/assistant/*`
- `src/platform/storage/*`

文件链：

- `/api/files/upload`
- `/api/files/:filename`
- `src/modules/files/*`
- `src/platform/storage/*`

特点：

- 这两条链已经相对清晰
- 其中 `assistant` 仍承担一部分“生成内容落盘”的职责

## 4. 旧目录现状判断

### `backend/routes/`

当前状态：

- `assistant.js`
- `capabilities.js`
- `execute.js`
- `images.js`
- `settings.js`
- `storage.js`
- `workflows.js`

这些文件目前基本都只是：

- `export { default } from '../src/modules/.../*.routes.js';`

结论：

- `backend/routes/` 已不再是业务入口
- 当前角色是兼容壳 / 过渡层
- 可以继续保留一段时间，但需要在后续阶段明确封存或删除

### `backend/services/`

当前状态：

- `chatService.js`
- `imageService.js`
- `searchService.js`
- `videoService.js`

这些文件仍被新模块直接依赖，属于仍在生效的旧能力层。

结论：

- `services/` 不是兼容壳
- `services/` 目前仍是能力实现核心
- 在 Week 5 之前不适合直接删除

### `backend/engine/`

当前状态：

- 工作流执行核心
- 图片生成辅助
- 模型/配置辅助
- 节点执行实现

结论：

- `engine/` 仍是后端核心实现层
- 当前不能把它视为历史垃圾目录
- 但它的职责范围过大，需要后续按执行核心 / provider 辅助 / 历史辅助进一步拆清

## 5. 当前重复职责与设计问题

### 问题 1：图片能力存在双入口

当前同时存在：

- `/api/images/generate`
- `/api/capabilities/image`

两条链最终都可能落到 `backend/services/imageService.js`。

影响：

- 前端和工作流容易分叉接入
- 上游兼容与错误处理容易重复修补
- 后续统一 contract 的成本会持续升高

### 问题 2：新模块层与旧能力层交错

`src/modules/*` 已经承担 HTTP 入口，但真正业务还散落在：

- `services/`
- `engine/helpers/`
- `engine/`
- `routes/settingsShared.js`

影响：

- 开发者很难判断哪里才是唯一修改点
- 新旧层边界不清，后续重构容易误删

### 问题 3：设置模块仍依赖历史共享工具

`src/modules/settings/settings.repository.js` 仍使用：

- `engine/helpers/projectModels.js`
- `routes/settingsShared.js`

影响：

- 设置模块在目录结构上看似完成迁移
- 实际上仍与历史层深度耦合

### 问题 4：执行模块是“新入口 + 旧内核”混合体

这不是 bug，但属于明确的结构债。

影响：

- 短期稳定性尚可
- 中长期如果继续围绕 `engine/` 无边界扩展，会让节点执行、能力调用、SSE 事件和 provider 映射继续缠在一起

## 6. Week 2 收口结论

本周应正式确认以下边界：

1. `backend/server.js` + `backend/src/app/create-app.js` 是唯一 HTTP 装配入口
2. `backend/src/modules/*` 是唯一对外 API 模块入口
3. `backend/routes/*` 视为兼容壳，不再新增业务逻辑
4. `backend/services/*` 视为旧能力层，暂不删除，但后续只允许“被迁移”，不允许继续膨胀
5. `backend/engine/*` 视为当前执行核心，后续按职责拆分，而不是整体推翻

## 7. 建议的后续迁移顺序

### Week 5 优先做

1. 先收口图片链路
2. 明确 `/api/images` 与 `/api/capabilities/image` 的主次关系
3. 把图片请求构造、返回解析、错误归一集中到单一能力层

### Week 6 再做

1. 统一 chat / image / video / search 的 provider contract
2. 让 `services/` 的旧能力实现逐步退出

### Week 7 以后

1. 再拆执行引擎与 workflow store
2. 避免同时动“执行引擎”和“前端状态层”

## 8. Week 2 完成判定

Week 2 达到“完成”需要满足：

- 已有文档能回答当前后端真实入口与真实落点
- 已明确旧 `routes/`、旧 `services/`、旧 `engine/` 的当前角色
- 已指出图片、能力、执行三条核心链路的跨层依赖
- 已形成后续收口顺序，而不是继续凭感觉改动

如果这些条件满足，即使本周还没有进行大规模代码迁移，也可以认定 Week 2 已完成。
