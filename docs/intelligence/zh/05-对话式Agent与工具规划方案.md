# 对话式 Agent 与工具规划方案

## 目标

SueLr Studio 的 Agent 不是页面里的工作流助手，也不是固定的“设计团队模板”。它应该是一个全局对话式 Agent。

用户通过对话提出需求，Agent 判断任务目标、补充必要问题、选择可用工具、执行工具、整理结果。工具执行过程默认折叠，用户主要看到最终结果、产物和可追溯记录。

工作流页面只是 Agent 能操作的一个领域。Agent 可以搭建、编辑、运行和诊断工作流，也可以直接调用图像、视频、文本、文件、知识库和资产工具。

## 核心交互

```text
用户输入需求
  -> Agent 判断是否需要追问
  -> 选择 Planner 模型
  -> LLM planner 生成结构化计划
  -> Runtime 校验计划
  -> 按计划调用工具
  -> 工具结果进入 trace
  -> Agent 输出最终结果
  -> 工具记录默认折叠
```

## Planner 模型来源

Planner 模型不放到全局设置页里作为固定设置。它应该直接在 Agent 窗口里选择。

规则：

- 只允许选择用户已经显式启用的对话类模型。
- 不自动使用图像、视频或首次发现但未启用的模型。
- 如果没有可用对话模型，Agent 窗口提示用户先导入或启用对话模型。
- Agent 窗口需要显示当前 Planner 模型，并允许切换。
- Planner 模型选择可以本地记住，但不能绕过“模型必须由用户显式启用”的规则。

第一版只需要一个模型槽位：

```text
Planner 模型
```

后续可扩展为：

```text
Planner 模型：理解需求、决定工具
Reviewer 模型：检查计划和结果
Writer 模型：整理最终回复
```

## LLM Planner 输出

Planner 不能直接修改 React Flow 状态，也不能直接写最终工作流文件。它只能输出受控的结构化计划。

建议结构：

```ts
type AgentPlan = {
  goal: string;
  needsClarification: boolean;
  clarificationQuestions: string[];
  steps: AgentPlanStep[];
  finalResponseHint: string;
};

type AgentPlanStep = {
  id: string;
  tool: string;
  reason: string;
  input: Record<string, unknown>;
  requiresApproval: boolean;
};
```

## 工具分层

Agent 工具分为几类。

### 对话与规划工具

```text
chat.answer
brief.parse
knowledge.search
knowledge.write
```

### 工作流工具

```text
workflow.inspect
workflow.build
workflow.edit
workflow.validate
workflow.applyDraft
workflow.run
workflow.cancel
workflow.diagnose
workflow.summarizeRun
```

工作流工具必须遵守：

- React Flow 状态仍由 React Flow 管理。
- 应用草案、执行、覆盖、删除都需要用户确认。
- LLM 只能生成意图、草案或编辑计划，不能直接写入最终画布状态。

### 生产工具

```text
image.generate
image.edit
image.compare
video.generate
copy.write
prompt.optimize
asset.package
asset.index
```

高成本或会产生外部调用的工具默认需要确认。

### 结果与知识工具

```text
result.inspect
artifact.open
artifact.collect
knowledge.summarizeRun
knowledge.promoteToTemplate
```

知识写入必须有来源、证据和作用域。品牌规则、项目规则、模板沉淀需要用户确认。

## Skills、知识库、工具的关系

这里的 Skill 不再表示“角色技能”或“团队成员能力”，而是 Agent 可以调用的受控后端能力。

```text
Skill = 后端能力定义
Tool = Agent 可调用的动作接口
Knowledge = Planner 和工具选择时可检索的上下文
Trace = 每次工具调用和结果的记录
```

LLM planner 使用知识库理解节点、工具、历史案例和用户偏好；Runtime 使用 Skill/Tool 定义校验调用是否合法。

## 第一阶段接入顺序

第一版 LLM planner 不追求完整自动执行全部设计任务，而是先让用户能直观看到 Agent 的理解能力提升。

优先做：

1. Agent 窗口内 Planner 模型选择。
2. 后端 `agent.plan` 接口。
3. Planner 读取可用工具、节点知识和当前上下文。
4. Planner 生成结构化计划。
5. Runtime 先支持 `workflow.build` 一个真实工具。
6. 前端展示最终结果和折叠工具记录。

验收案例：

```text
用户：帮我做一个分镜图生成流程，用文本脚本生成 8 张连续分镜图。

期望：
- Planner 不应该直接选择视频生成节点。
- Planner 应该识别这是分镜图/图像序列任务。
- Planner 应该选择文本输入、图像生成、逐项/批量处理、保存/输出等合理节点。
- 如果缺少必要信息，应该先追问。
```

## 不再采用的方向

以下内容不再作为当前主线：

- 固定“AI 设计团队”入口。
- 用户先选择团队模板再开始工作。
- 把 Agent 局限在工作流页面。
- 工作流助手独立于全局 Agent 存在。
- 把工具执行过程完整展开给用户。

这些概念可以作为后续内部实现或高级模式，但不能再成为第一版产品主体验。
