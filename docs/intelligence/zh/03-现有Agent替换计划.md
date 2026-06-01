# 现有 Agent 替换计划

## 当前旧 Agent 范围

当前旧 Agent 相关代码主要在：

```text
backend/src/modules/agent/
src/shared/api/agent.ts
src/shared/hooks/useMemory.ts
src/features/settings/components/AgentProfileEditor.tsx
src/features/settings/components/AgentPersonaSection.tsx
src/features/settings/components/MemorySection.tsx
```

当前能力包括：

- Agent Profile。
- 聊天和工具循环。
- Tool Registry。
- Web Search。
- 图像生成。
- 视频生成。
- 工作流执行。
- Memory 搜索和写入。
- Session Store。
- 流式响应。

主要问题：

- Agent Profile 太像 `prompt + tools`，不足以支撑稳定的工具规划。
- Tool Registry 太集中，缺少 Skill/Tool 级别的治理、审批、日志和复用。
- Memory 不是完整知识库。
- 不能可靠地根据需求搭建、编辑和运行工作流。
- 缺少 LLM planner 的结构化计划层。
- run trace 不够完整。

## 替换原则

- 不先删除旧代码，先建立新对话式 Agent 体系。
- 按能力迁移，不按文件硬切。
- 新能力进入 `backend/src/modules/intelligence/` 和 `src/features/agent/`。
- 旧 `/api/agent` 保持兼容到切换完成。
- 旧 Agent 不再承接新的战略能力。
- 每一步迁移都有测试和回退点。

## 新旧能力映射

```text
旧 AgentRuntime
  -> intelligence/agent/
  -> intelligence/runtime/

旧 ToolRegistry
  -> intelligence/skills/skill-registry.ts
  -> intelligence/tools/

旧 Agent Profile
  -> Agent 窗口内 Planner 模型选择
  -> planner prompt/context builder
  -> tool policy

旧 Memory
  -> intelligence/knowledge/knowledge.service.ts

旧 Session
  -> intelligence/runtime/run-trace.ts

旧 workflow_execute
  -> workflow.execute tool
  -> 继续调用 ExecutionService

旧工作流助手
  -> 全局 Agent 的 workflow.createDraft / workflow.edit / workflow.execute 工具
```

## 替换阶段

### A：并行运行

状态：

- 新增 `/api/intelligence`。
- 保留 `/api/agent`。
- 前端主流程暂时可继续走旧 Agent。
- 新系统先做只读能力和 run trace。

### B：共享 Skill/Tool 后端

状态：

- 把搜索、图像、视频、工作流执行等能力抽成受控 Skill/Tool。
- 旧 ToolRegistry 可以临时调用新 adapter。
- 避免双份业务逻辑。

### C：Memory 到 Knowledge Bridge

状态：

- 旧 Memory 可导入新知识库。
- 新知识库能检索旧 Memory。
- Memory 继续只作为上下文提示。
- 知识库不能静默选择工作流或输入。

### D：全局 Agent UI 接入

状态：

- 原 `AI 助手` 按钮打开全局 Agent。
- 工作流页面不再挂载独立工作流助手。
- Agent 展示对话、最终结果和折叠工具记录。
- 工作流能力作为工具接入。

### E：LLM Planner 接入

状态：

- Agent 窗口内选择 Planner 模型。
- Planner 使用已启用对话模型。
- Planner 输出结构化计划。
- Runtime 校验计划并调用工具。

### F：默认切换

状态：

- Chat、Workflow、Image、Video 主流程逐步复用新 Agent 工具系统。
- `/api/agent` 标记 deprecated。
- Settings 不再把旧 Agent Profile 当主入口。
- 旧 Runtime 只作为兼容后备。

### G：删除或兼容壳

状态：

- 无主流程依赖旧 Agent。
- 旧 tests 已迁移。
- 旧数据已迁移或归档。
- 删除 `backend/src/modules/agent/`，或只保留兼容 wrapper。

## 删除旧 Agent 的条件

必须全部满足：

- `npm run check` 通过。
- 前端主流程不再调用 `src/shared/api/agent.ts`。
- 旧 Agent Profile 有迁移方案。
- 旧 Memory 有迁移方案。
- 新 Agent 覆盖旧图像、视频、搜索、工作流执行能力。
- 新 Agent 有完整 run trace。
- 文档已更新。
- 用户数据不会丢失。

## 回退策略

在 A 到 F 阶段：

- 保留旧 API。
- 保留旧数据读取能力。
- 新旧路径可以通过明确开关或入口控制。
- 出问题可以切回旧路径。

进入 G 阶段前，必须有一个稳定提交点或标签。删除旧模块后，回退需要恢复删除前提交。
