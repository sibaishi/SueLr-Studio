# 本地 MVP 人工验收手册

这份手册用于准备当前本地 MVP 收尾阶段的人工验收。

范围：

- 覆盖 `local-web` 和 `desktop`
- 聚焦阶段 5 的规划质量，以及阶段 6 的工作流编辑、运行、诊断闭环
- 只验收当前支持的本地运行形态

## 现成验收样例

- [workflows/sample-agent-local-text-output.json](/Users/sueliuran/Documents/Codex/2026-05-26/new-chat-3/SueLr-Studio/workflows/sample-agent-local-text-output.json)
  - 稳定成功路径
  - 不需要模型，也不需要 API Key
  - 用于验证执行前确认、输入覆盖、最终输出和运行汇总
- [workflows/sample-agent-local-ai-failure.json](/Users/sueliuran/Documents/Codex/2026-05-26/new-chat-3/SueLr-Studio/workflows/sample-agent-local-ai-failure.json)
  - 在未配置 API Key 时可稳定触发失败
  - 用于验证执行前确认、失败诊断和运行汇总
- [workflows/sample-basic-chat.json](/Users/sueliuran/Documents/Codex/2026-05-26/new-chat-3/SueLr-Studio/workflows/sample-basic-chat.json)
  - 可选参考样例
  - 只有在已配置聊天模型和 Provider Key 后，才适合作为 AI 成功路径

## 启动矩阵

### `local-web`

```bash
npm run dev:local-web
```

预期：

- 后端以 `local-web` 模式运行
- 浏览器应用打开在 `http://localhost:5173/`
- Agent 和工作流页共用同一个本地后端

### `desktop`

```bash
npm run build
npm run electron:dev
```

预期：

- Electron 打开单个 `SueLr Studio` 主窗口
- 内嵌后端自动启动
- 应用数据和输出路径走桌面端运行时路径

## 人工验收 Prompt 包

启用至少一个聊天模型，并在全局 Agent 中选择 Planner 模型后，使用下面这些提示词。

### 用例 A：分镜图规划质量

提示词：

```text
帮我做一个分镜图生成流程，用文本脚本生成 8 张连续分镜图。
```

通过条件：

- planner 把任务理解为分镜图像序列，而不是直接走视频生成
- 主路径里不应把 `videoGen` 当成默认首选
- 草案里可以合理出现文本输入、拆分或逐项、图像生成、保存或输出
- 信息不足时，Agent 会先追问，而不是硬执行

### 用例 B：简单直连输出

提示词：

```text
做一个文本输入后直接输出展示的最小流程。
```

通过条件：

- planner 选择最小化的文本输入到输出结构
- 不会强行插入辅助提示词一类节点

### 用例 C：合并语义

提示词：

```text
做一个流程，把标题、卖点、CTA 三个文本输入合并后输出展示。
```

通过条件：

- planner 理解合并节点是聚合多个输入
- 结果不会退化成只取一个非空输入

### 用例 D：逐项运行语义

提示词：

```text
把 8 条分镜文案逐条执行并分别输出结果。
```

通过条件：

- planner 理解这是按项传递和执行
- 不会被规划成“只取第一个非空输入执行一次”

## 闭环人工验收流程

### 1. 草案生成与打开画布

步骤：

1. 打开 `AI Assistant`。
2. 在 `AI Agent` 内选择 Planner 模型。
3. 使用用例 A 或用例 B。
4. 让 Agent 生成工作流草案。
5. 点击 `新建画布`。

通过条件：

- 草案成功生成
- 工具记录默认折叠
- 点击后能新建或切换到工作流画布

### 2. 当前画布检查与编辑预览

步骤：

1. 保持刚打开的画布为当前活动画布。
2. 回到 Agent。
3. 让 Agent 检查当前工作流。
4. 再让 Agent 做一个安全的小修改，例如：

```text
把当前工作流里的文本输入标签改成“本次执行输入”。
```

5. 查看修改预览。
6. 申请应用，再确认应用 patch。

通过条件：

- Agent 能总结当前画布
- Agent 返回的是 patch 预览，而不是直接改画布
- `workflow.applyDraft` 在改动画布前必须确认
- 只有确认后画布才实际变化

### 3. 无外部模型成功运行

准备：

1. 在工作流页导入 [workflows/sample-agent-local-text-output.json](/Users/sueliuran/Documents/Codex/2026-05-26/new-chat-3/SueLr-Studio/workflows/sample-agent-local-text-output.json)。
2. 保持该画布为当前活动画布。

步骤：

1. 在 Agent 中输入 `运行当前工作流`。
2. 确认执行卡片列出了输入节点和当前值。
3. 把本次输入覆盖为一个容易识别的值，例如：

```text
第 5 步本地验收成功路径已连通。
```

4. 点击确认运行。
5. 运行完成后，再输入：

```text
请总结刚才的运行
```

通过条件：

- `workflow.execute` 必须先确认
- 输入确认卡片能展示当前值，并允许填写本次覆盖值
- 最终运行成功完成
- 输出内容体现本次确认时填写的覆盖值
- Agent 能给出清晰的运行汇总结果

### 4. 失败运行与诊断

准备：

1. 在工作流页导入 [workflows/sample-agent-local-ai-failure.json](/Users/sueliuran/Documents/Codex/2026-05-26/new-chat-3/SueLr-Studio/workflows/sample-agent-local-ai-failure.json)。
2. 这个用例不要配置 API Key。

步骤：

1. 在 Agent 中输入 `运行当前工作流`。
2. 确认运行。
3. 失败后输入：

```text
请诊断刚才的运行
```

4. 再输入：

```text
请总结刚才的运行
```

通过条件：

- 运行前仍然必须确认
- 失败原因是清晰的运行时问题，而不是 Agent 闭环断掉
- 诊断能尽量落到节点级或 Provider 级
- 汇总仍然能返回失败状态和报告结构

## 变体逐项退出清单

`local-web` 和 `desktop` 都应通过下面这些检查：

- 可以从 `AI Assistant` 打开全局 Agent
- 可以在 Agent 内选择 Planner 模型
- 分镜图提示词不会默认变成直接视频生成
- 草案可以打开到画布
- 能检查当前画布
- 编辑预览可用，并且应用前必须确认
- 文本直出样例可以成功运行
- 无 Key AI 样例可以走失败诊断
- 工具记录默认折叠，但可展开查看

## 命令门禁

宣布本地 MVP 通过前，仍要执行：

```bash
npm run check
```

如果当前机器在迭代阶段无法直接使用仓库根的 `typecheck` 脚本，因为它通过 `npm.cmd` 调 backend，那只能视为当前环境差异下的临时绕行，不能替代最终发布前的正式门禁。
