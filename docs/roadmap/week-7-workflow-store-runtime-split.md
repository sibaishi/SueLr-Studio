# Week 7 Workflow Store Runtime Split

## 1. 本周目标

Week 7 的目标不是继续扩张 `store.ts`，而是在不改动外部消费方式的前提下，把运行时热点逻辑真正拆开。这里的“热点”指两类内容：

1. 工作流文档生命周期：保存、加载、导入、导出、复制、删除、初始化持久化。
2. 工作流执行生命周期：执行、取消、恢复运行、同步运行状态。

本周明确保持一条硬约束：`useWorkflowStore` 对外 API 不变，`App.tsx`、`FlowCanvas.tsx`、结果面板与各类 selector 不需要跟着改调用方式。也就是说，这次是“内部收口”，不是“外部迁移”。

## 2. 落地内容

### 2.1 新增拆分模块

新增文件：

- `src/features/workflow/lib/store/helpers.ts`
- `src/features/workflow/lib/store/document.ts`
- `src/features/workflow/lib/store/execution.ts`

其中职责如下：

- `helpers.ts`
  - 承载 `gid`、`snapValue`、默认节点数据、导入导出归一化、执行日志格式化、工作流 payload 构建等共享 helper。
- `document.ts`
  - 承载 `saveWorkflow`、`loadWorkflow`、`fetchWorkflowList`、`initializeWorkflowPersistence`、`duplicateCurrentWorkflow`、`deleteCurrentWorkflow`、`exportCurrentWorkflow`、`importWorkflowDataWithMode`、`importWorkflowData`。
- `execution.ts`
  - 承载 `executeWorkflow`、`cancelWorkflowExecution`、`restoreExecutionRun`、`syncExecutionRunStatus`。

### 2.2 `store.ts` 的角色变化

`src/features/workflow/lib/store.ts` 现在继续作为稳定入口存在，但职责从“全量实现”收回到：

- 编辑态动作与节点/连线/分组相关逻辑
- Zustand store 初始化与状态拼装
- 将 document / execution action 工厂重新注入到公共 store

这样处理后，外部使用方无需调整，内部结构已经开始从单文件大核心转向模块化拼装。

## 3. 这次顺手补稳的点

除拆分本身外，本周还补了两处和稳定性直接相关的小修正：

1. `ConnectionSettingsSection.tsx`
   - 将 `modelsEndpoint`、`customHeaderName`、`customPrefix` 这些可选字段统一兜底为空字符串，避免受 `ProviderConfig` 类型收紧影响而卡住 `tsc`。
2. `document.ts`
   - 在 `loadWorkflow()` 与 `importWorkflowDataWithMode()` 完成切换时，同步清空旧执行日志、旧 warning 和运行态残留，避免切换工作流后带着上一份状态继续显示。

这两处不改变业务行为，但能让 Week 7 的结构调整更干净，回归风险更低。

## 4. 验收结果

本周代码级验收结果如下：

- `npx tsc --noEmit`：通过
- `npm run build`：通过

同时满足以下结构性验收点：

- `useWorkflowStore` 外部调用方式未变化
- `App.tsx` 和 `FlowCanvas.tsx` 仍通过既有 selector / store API 工作
- 文档动作与执行动作已从 `store.ts` 拆出
- 共享归一化与 payload helper 已独立承载

## 5. 当前结论

Week 7 可以视为完成，且完成的是“真拆分的第一批核心动作”，不是只做了设计文档。到这一周为止，Workflow Store 已经形成下面这个状态：

- 公共入口稳定
- 运行时动作开始模块化
- 文档动作与执行动作已脱离单文件实现
- 后续可以继续把编辑态复杂逻辑拆出，而不会再从零开始

## 6. 对 Week 8 的直接输入

Week 8 建议接着处理两类事情：

1. 把剩余编辑态重逻辑继续按主题拆分
   - 例如节点分组、节点复制、拖拽布局、上下文菜单相关动作。
2. 把当前周的结构收口转成长期门禁
   - 固定执行 `tsc + build`
   - 为 store 热点路径补更明确的手工回归与后续自动化清单

换句话说，Week 7 解决的是“能不能拆”，Week 8 该解决的是“拆完以后怎么长期稳住”。
