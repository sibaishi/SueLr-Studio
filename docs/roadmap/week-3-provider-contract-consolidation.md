# Week 3 Provider / Contract Consolidation

## 目标

Week 3 的目标不是重写整套 provider，而是先把当前真实生效的能力入口、配置来源、兼容层边界收清楚，并完成一轮低风险收口，避免后续继续出现并行实现、默认值漂移和返回契约分叉。

本周结束后，需要能明确回答这几件事：

1. 前端当前到底有哪几层 provider，谁是主实现，谁是兼容层。
2. `chat / image / video / search` 这些能力现在通过什么入口进入后端。
3. 图片请求体构造和结果解析的核心实现在哪一层。
4. `ProviderConfig` 相关类型和默认值还有哪些重复定义，哪些已经完成收口。
5. 流式 chat 是否也进入统一 capability layer，而不是继续保留前端直连上游的特殊路径。

## 当前结构结论

### 共享 provider 层

当前主实现位于：

- `src/lib/providers/generic.ts`
- `src/lib/providers/openai.ts`
- `src/lib/providers/types.ts`
- `src/lib/provider-config.ts`

其中真实承接能力调用的是：

- `chatCompletion()` -> `capabilityChatCompletion()` -> `/api/capabilities/chat`
- `chatCompletionStream()` -> `capabilityChatCompletionStream()` -> `/api/capabilities/chat?stream=true`
- `generateImage()` -> `capabilityGenerateImage()` -> `/api/capabilities/image`
- `submitVideoGeneration()` -> `capabilitySubmitVideoGeneration()` -> `/api/capabilities/video`

结论：共享 provider 层已经是当前前端模型能力的唯一主入口。

### workflow 本地 provider 层

兼容层仍位于：

- `src/features/workflow/lib/providers/generic.ts`
- `src/features/workflow/lib/providers/openai.ts`
- `src/features/workflow/lib/providers/types.ts`

它现在更像历史兼容壳，保留了 workflow 节点局部调用和少量兼容类型，不应继续承载新的主逻辑。

结论：workflow provider 已被降级为兼容层，而不是与共享 provider 并行的第二实现。

## 统一能力入口

统一前端能力入口位于：

- `src/domains/capabilities/api.ts`

当前统一的 HTTP 能力入口为：

- `POST /api/capabilities/chat`
- `POST /api/capabilities/chat?stream=true`
- `POST /api/capabilities/search`
- `POST /api/capabilities/image`
- `POST /api/capabilities/video`
- `GET /api/capabilities/video/:taskId`

结论：`chat / image / video / search` 现在都已纳入共享 capability layer，流式与非流式 chat 不再分属两条完全不同的前端链路。

## 不属于 provider contract 的接口

以下接口不属于 provider contract 本身：

- `/api/files/upload`
- `/api/execute/*`

它们分别属于文件上传和工作流执行基础设施，后续文档和代码清理都应与 provider contract 分开对待。

## image contract 当前核心落点

图片链路的核心后端实现位于：

- `backend/engine/helpers/imageGeneration.js`

这里已经集中处理了：

- 文生图请求标准化
- chat 接口生图请求体映射
- 编辑图 / 参考图 multipart 组装
- 多种上游响应格式的图片结果解析
- 远程图片下载与转换

结论：image contract 的真实核心已在后端 helper 层，不应再回到前端 provider 层分散修补。

## 本周已完成的收口

### 第一阶段

- 新增 `src/lib/provider-config.ts`
- 让共享 `ProviderConfig` 成为主配置单一来源
- `src/lib/providers/types.ts` 与 `src/lib/types.ts` 改为复用该定义
- `src/hooks/index.ts` 中 `providerConfig` 不再使用 `any`

### 第二阶段

- `src/features/workflow/lib/providers/types.ts` 不再维护一套独立的 provider 默认 endpoint
- workflow provider 改为复用 shared `ProviderConfig` 与 `DEFAULT_PROVIDER_CONFIG`
- workflow 层仅额外保留 `modelOverrides` 兼容字段，供节点级 endpoint 覆盖链路继续使用
- `src/features/workflow/components/nodes/nodeConstants.ts` 中节点测试用 `providerConfig` 改为使用 shared `ProviderConfig` 类型约束
- 移除了节点测试默认配置里前端未消费的 `modelOverrides: {}`

### 第三阶段

- 后端 `capabilities` 模块新增流式 chat 分支
- `/api/capabilities/chat?stream=true` 统一承接流式 chat
- 前端共享 provider 的 `chatCompletionStream()` 不再直连上游，而是改走 capability layer
- 后端增加 JSON fallback -> SSE 透传逻辑，用于兼容上游忽略 `stream: true` 但直接返回完整 JSON 的情况
- 前端流式 provider 修复了“上游返回普通 JSON 时被当成空 SSE 处理”的风险

## 代码落点

本轮流式收口的核心文件：

- `backend/src/modules/capabilities/capabilities.schema.js`
- `backend/src/modules/capabilities/capabilities.controller.js`
- `backend/src/modules/capabilities/capabilities.service.js`
- `src/domains/capabilities/api.ts`
- `src/lib/providers/generic.ts`

## 当前仍保留的设计现实

### 1. workflow provider 兼容层仍存在

虽然已经明确降级，但实体文件仍在。后续应继续压薄，避免开发时误把它当成主入口继续扩展。

### 2. `modelOverrides` 仍是兼容字段，不是死代码

它仍被后端节点级 endpoint 覆盖链路使用，暂时不能直接删除。后续需要在更明确的 provider 配置迁移阶段再处理。

### 3. 节点测试默认 endpoint 仍保留 workflow 语义

`NODE_API_PROVIDER_CONFIG` 仍保留 workflow 节点直连探测默认值。这是当前有意保留的兼容行为，是否继续存在应放到 Week 4+ 决策。

## 验证结果

已通过：

- `cmd /c npm test`
- `cmd /c npm run build`

其中后端 HTTP contract 已新增流式 chat 用例，覆盖：

- SSE 透传
- JSON fallback 自动包装成 SSE 事件

## 当前状态评估

- 状态：完成
- 结论：Week 3 的 provider / contract consolidation 已完成当前范围内的收口

当前已经满足：

- 共享 `ProviderConfig` 单一来源建立完成
- workflow provider 从并行实现收缩为兼容层
- `chat / image / video / search` 全部纳入统一 capability layer
- 流式 chat 不再保留前端直连上游的特殊主链路
- 自动化验证闭环完成

## 下一步建议

1. 冻结 workflow provider 兼容层，不再为其新增主能力。
2. 在 Week 4 开始转入 store / 状态层拆分，不再继续扩散 provider 范围。
3. 在后续阶段单独评估 `modelOverrides` 与节点默认 endpoint 的长期去留。
