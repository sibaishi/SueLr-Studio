# Phase 5 节点语义验收案例预期规范

本文件定义 Phase 5 四个验收案例的预期工作流结构和关键检查点，供手动测试时对照使用。

## 通用检查项

- Planner 返回 `source: 'llm'`（不是 `local-fallback`）
- toolName 应为 `workflow.createDraft`
- 生成的 workflow 通过 `validateCompiledWorkflow` 校验，`valid === true`
- 打开画布后节点和连线可读、可编辑
- 工具记录默认折叠

---

## 案例 A：分镜图 Storyboard

**输入：**
> 帮我做一个分镜图生成流程，用文本脚本生成 8 张连续分镜图。

### 预期结构

```
textInput (脚本输入)
  → aiChat (分镜拆解: systemPrompt 要求每行一个镜头)
    → textSplit (separator="\\n", outputCount=8)
      → iterateRun (item1..item8)
        → imageGen (ratio 16:9 或根据需求, n=1)
          → saveFile (filenamePrefix="storyboard-shot")
            → output
```

### 错误模式

| 错误 | 原因 |
|------|------|
| 直接使用 videoGen | 分镜图是图片序列，不是视频成片 |
| 单条 imageGen 输出 8 张 | 没有逐项控制，每张图独立提示词 |
| 没有 textSplit + iterateRun | 无法逐镜头传递不同文本到 imageGen |
| 使用 promptHelper 作为唯一提示词构造 | promptHelper 只拼接固定参数，不会拆镜头 |
| `intent.domain` 为 `generic-image` | 应该为 `storyboard-image` |

### 通过条件

- [ ] domain 为 `storyboard-image`
- [ ] 包含 aiChat（分镜拆解角色）
- [ ] 包含 textSplit（separator 显式设置）
- [ ] 包含 iterateRun（连接 textSplit 和 imageGen）
- [ ] 包含 imageGen（每个镜头独立生成）
- [ ] 不包含 videoGen
- [ ] saveFile 连接到 output

---

## 案例 B：简单文本直出

**输入：**
> 做一个文本输入后直接输出展示的最小流程。

### 预期结构

```
textInput
  → saveFile (或直接 output)
    → output
```

最小路径允许没有 aiChat——这是"直接输出展示"，不需要 AI 处理。

### 错误模式

| 错误 | 原因 |
|------|------|
| 强行插入 aiChat | 用户明确要求直出，不需要 AI 处理 |
| 强行插入 promptHelper | 这是文本任务，不是视觉控制 |
| 使用 imageGen | 需求没有涉及图片生成 |

### 通过条件

- [ ] domain 为 `chat-text` 或 `generic-image`（但节点应是文本链路）
- [ ] 不超过 3 个节点（textInput → 输出）
- [ ] 不包含 aiChat（除非用户需求隐含 AI 处理）
- [ ] 不包含 imageGen / videoGen / promptHelper

---

## 案例 C：合并语义 Merge

**输入：**
> 做一个流程，把标题、卖点、CTA 三个文本输入合并后输出展示。

### 预期结构

```
textInput (标题)
  → textMerge.item1
textInput2 (卖点)
  → textMerge.item2
textInput3 (CTA)
  → textMerge.item3
textMerge.merged
  → output
```

关键理解：**merge 是聚合（将多个文本值收集为数组）**，不是只取一个非空输入，也不是把三段文字拼接成一段话。

### 错误模式

| 错误 | 原因 |
|------|------|
| 只用一个 textInput 加一个 aiChat | 没有体现三个独立输入源 |
| 使用 aiChat 做"语义合成" | user 要求的是"合并后输出展示"，不是"润色/改写" |
| 只保留一个非空输入 | merge 应该收集所有输入，不是取第一个非空值 |

### 通过条件

- [ ] 包含 textMerge 节点
- [ ] 至少 3 个 textInput 分别连接到 textMerge 的不同端口
- [ ] 不包含 aiChat（除非需求明确需要语义处理）
- [ ] textMerge 的输出连接到 output

---

## 案例 D：迭代语义 Iterate

**输入：**
> 把 8 条分镜文案逐条执行并分别输出结果。

### 预期结构

```
textInput (8 条分镜文案)
  → textSplit (separator="\\n", outputCount=8)
    → iterateRun (item1..item8)
      → aiChat (逐条处理每条文案)
        → saveFile
          → output
```

或如果是生成图片：

```
textInput → textSplit → iterateRun → imageGen → saveFile → output
```

关键理解：**iterate 是按项逐次执行**，不是"取第一个非空输入只跑一次"。

### 错误模式

| 错误 | 原因 |
|------|------|
| 只用一个 aiChat 处理全部 | 没有逐项展开，失去了逐条控制的精度 |
| 没有 textSplit | iterateRun 需要拆分后的独立项作为输入 |
| 没有 iterateRun | textSplit 拆完没有逐项执行的调度节点 |

### 通过条件

- [ ] 包含 textSplit（separator 显式设置）
- [ ] 包含 iterateRun 或 iterateImageRun
- [ ] iterateRun 下游连接处理节点（aiChat 或 imageGen）
- [ ] 不把全部文案塞进单个 aiChat 的一条 prompt 里处理
