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

- Agent Profile
- 聊天和工具循环
- Tool Registry
- Web Search
- 图片生成
- 视频生成
- 工作流执行
- Memory 搜索和写入
- Session Store
- 流式响应

主要问题：

- Agent Profile 太像“prompt + tools”，不足以表达设计团队角色
- Tool Registry 太集中，缺少 Skill 级别的治理、审批、日志和复用
- Memory 不是完整知识库
- 不能根据需求搭建工作流
- 没有多角色设计团队
- run trace 不够完整
- 部分中文文本存在乱码，需要治理

## 替换原则

- 不先删旧代码，先建立新体系
- 按能力迁移，不按文件硬切
- 新能力进入 `backend/src/modules/intelligence/`
- 旧 `/api/agent` 保持兼容到切换完成
- 旧 Agent 不再承接新的战略能力
- 每一步迁移都有测试和回退点

## 能力迁移映射

```text
旧 AgentRuntime
  -> intelligence/runtime/intelligence-runtime.ts

旧 ToolRegistry
  -> intelligence/skills/skill-registry.ts

旧 Agent Profile
  -> intelligence/agents/agent-role.service.ts
  -> intelligence/teams/team-template.service.ts

旧 Memory
  -> intelligence/knowledge/knowledge.service.ts

旧 Session
  -> intelligence/runtime/run-trace.ts

旧 workflow_execute
  -> intelligence Skill: workflow.execute
  -> 继续调用 ExecutionService

旧前端 API
  -> src/shared/api/intelligence.ts
```

## 替换阶段

### A：并行运行

状态：

- 新增 `/api/intelligence`
- 保留 `/api/agent`
- 前端仍默认走旧 Agent
- 新系统先做只读能力

### B：共享 Skill 后端

状态：

- 把图片、视频、搜索、工作流执行等能力抽成 Skill
- 旧 ToolRegistry 可以临时调用新 Skill adapter
- 避免双份业务逻辑

### C：Memory 到 Knowledge Bridge

状态：

- 旧 Memory 可导入新知识库
- 新知识库能检索旧 Memory
- Memory 继续保持“只作上下文提示”
- 不能自动选择工作流或输入

### D：前端可选切换

状态：

- Settings 提供新 Intelligence 模式或开发开关
- Chat 和 Workflow 可试用新 Runtime
- 旧 Runtime 仍可回退

### E：默认切换

状态：

- Chat 默认走新 Intelligence Runtime
- Workflow AI 助手默认走新 Runtime
- Settings 默认编辑新 Agent/Team/Skill/Knowledge
- 旧 Runtime 只作为兼容后备

### F：删除或兼容壳

状态：

- 无主流程依赖旧 Agent
- 旧 tests 已迁移
- 旧数据已迁移或归档
- 删除 `backend/src/modules/agent/`，或只保留兼容 wrapper

## 删除旧 Agent 的条件

必须全部满足：

- `npm run check` 通过
- 前端主流程不再调用 `src/shared/api/agent.ts`
- 旧 Agent Profile 有迁移方案
- 旧 Memory 有迁移方案
- 新 Runtime 覆盖旧图片、视频、搜索、工作流执行能力
- 新 Runtime 有 run trace
- 文档已更新
- 用户数据不会丢

## 回退策略

在 A 到 E 阶段：

- 保留旧 API
- 保留旧数据读取能力
- 用开关控制新旧 Runtime
- 出问题可以切回旧路径

进入 F 阶段前，必须有一个稳定提交点或标签。删除旧模块后，回退需要恢复删除前提交。

