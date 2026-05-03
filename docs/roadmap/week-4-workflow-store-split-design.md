# Week 4 · Workflow Store 拆分设计

## 本周目标

把 `src/features/workflow/lib/store.ts` 从“单文件承载全部职责”的状态，推进到“职责边界清晰、可继续拆分”的状态，同时不改变当前工作流行为。

## 完成结论

Week 4 已完成预拆分阶段，当前成果足以作为后续 Week 7 真拆分的安全基线。

## 现状结论

当前 Store 同时承担以下职责：

1. 工作流文档状态：`workflowId`、`workflowName`、`nodes`、`edges`
2. 画布编辑行为：节点增删改、分组、选中、尺寸与拖拽修正
3. 执行状态：运行进度、节点状态、日志、输出、运行恢复
4. 持久化：本地草稿、活跃运行快照
5. 工作流 CRUD：保存、加载、复制、删除、导入、导出
6. 模型配置：可用模型、项目模型归一化

直接问题：

- `store.ts` 过大，修改成本和回归风险都偏高
- 页面入口和画布入口此前存在整库订阅，容易引发无关重渲染
- 类型、持久化、执行逻辑混在一起，不利于后续模块化拆分

## 本周已落地

### 1. 类型边界抽出

新增：

- `src/features/workflow/lib/store/types.ts`

已抽出内容：

- `WorkflowState`
- `WorkflowEditorSnapshot`
- `WorkflowImportResult`
- `NodeExecStatus`
- `ExecutionLogEntry`
- 本地草稿 / 活跃运行快照类型

收益：

- Store 公共契约从实现文件分离
- 后续 selector、子模块、测试都能复用统一类型源

### 2. 持久化边界抽出

新增：

- `src/features/workflow/lib/store/persistence.ts`

已抽出内容：

- `loadLocalDraft`
- `saveLocalDraft`
- `loadActiveRunSnapshot`
- `saveActiveRunSnapshot`
- `clearActiveRunSnapshot`

收益：

- 本地存储逻辑不再和节点编辑、执行状态混杂
- 为后续拆成独立 persistence slice / service 留出边界

### 3. 页面与画布订阅收口

新增：

- `src/features/workflow/lib/store/selectors.ts`

改造：

- `src/features/workflow/App.tsx`
- `src/features/workflow/components/FlowCanvas.tsx`

策略：

- `useWorkflowPageStore()` 只暴露页面层真正需要的字段和 action
- `useWorkflowCanvasStore()` 只暴露画布层真正需要的字段和 action

收益：

- 页面入口不再直接订阅整库
- 画布入口不再直接订阅整库
- 为后续 editor / execution / persistence / document 拆分提供兼容过渡层

### 4. 类型校验阻塞清理

修复：

- `src/lib/types.ts` 补充 `ProviderConfig` 类型导出

结果：

- `npx tsc --noEmit` 恢复通过
- Week 4 的收尾不再被历史类型出口问题阻塞

## 建议拆分边界

### A. editor slice

负责：

- `nodes` / `edges` / `selectedNodeId`
- 节点编辑、连线、分组、画布交互

### B. execution slice

负责：

- `isExecuting`
- `currentRunId`
- 节点执行状态、日志、输出、运行恢复 / 同步

### C. persistence slice

负责：

- 本地草稿
- active run snapshot
- 初始化恢复

### D. document slice

负责：

- `workflowId`
- `workflowName`
- `workflowList`
- 保存 / 加载 / 复制 / 删除 / 导入 / 导出

### E. model slice

负责：

- `availableModels`
- `projectModels`
- 模型列表拉取与归一化

## Week 7 拆分顺序建议

1. 先拆 `persistence`
2. 再拆 `document`
3. 然后拆 `execution`
4. 最后拆 `editor`

原因：

- `persistence` 与 `document` 对 UI 影响最小
- `execution` 风险中等，但边界已较明确
- `editor` 与 React Flow 耦合最深，适合最后处理

## 验收标准

- `store.ts` 行为保持不变，工作流可继续运行
- `App.tsx` 与 `FlowCanvas.tsx` 不再整库订阅
- Store 公共类型与持久化边界已独立成文件
- 已形成明确的 Week 7 拆分顺序与风险说明
