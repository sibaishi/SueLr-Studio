# Week 8 Quality Gate And Editor Split

## 1. 本周目标

Week 8 的目标是把 Week 7 之后剩余的两块风险真正往下压：

1. `src/features/workflow/lib/store.ts` 中仍然过重的编辑态逻辑。
2. 当前仍然主要依赖“口头约定”的校验流程。

这周不改 `useWorkflowStore` 的对外消费 API，也不再引入新的业务能力，而是继续坚持“稳定入口、内部收口”的路线，把编辑态动作从主 store 中拆出，并把最基本的质量门禁固化为项目脚本。

## 2. 本周落地

### 2.1 编辑态动作继续拆分

新增：

- `src/features/workflow/lib/store/editor.ts`

该模块承载以下内容：

- 节点增删改
- 连线增删改
- 分组、解组、释放分组
- 节点禁用切换
- 画布变更回写
- 执行态 UI 辅助字段清理
- 本地草稿持久化
- 模型列表装载与 project model 写入

这样之后，`store.ts` 进一步收回成“Zustand 入口 + 初始状态 + action 组装器”。

### 2.2 固定质量门禁

项目根 `package.json` 新增：

- `check`

当前定义为：

- `npx tsc --noEmit`
- `npm run build`
- `npm run test:backend`

这让 Week 1-7 一直在手动执行的最小验证集合，第一次变成了项目自带入口。

### 2.3 固化 Store 结构门禁

新增：

- `scripts/check-workflow-store-structure.mjs`

该脚本会在 `npm run check` 的最前面执行，当前负责保证三件事：

- `src/features/workflow/lib/store.ts` 继续保持为薄入口
- `store.ts` 仍然通过 editor / execution / document 三个 action 工厂组装
- 典型编辑态实现标记不会重新回流到 `store.ts`

这一步的意义不在于“用脚本替代代码评审”，而在于把本周已经形成的结构约束转成一个可重复执行、可在回归时直接拦截的问题入口。

### 2.4 继续下钻 editor 主题拆分

新增：

- `src/features/workflow/lib/store/editorGraph.ts`
- `src/features/workflow/lib/store/editorGroups.ts`
- `src/features/workflow/lib/store/editorSession.ts`
- `src/features/workflow/lib/store/editorShared.ts`

调整后：

- `editor.ts` 只保留组合层职责
- 节点/连线编辑动作收口到 `editorGraph.ts`
- 复制/分组/禁用等成组动作收口到 `editorGroups.ts`
- 执行态 UI 辅助、模型列表、本地草稿等会话动作收口到 `editorSession.ts`
- 共享 helper 与 editor action 类型收口到 `editorShared.ts`

配套地，结构门禁已从只检查 `store.ts`，升级为同时检查 `editor.ts` 是否继续保持薄组合层。

## 3. 当前效果

完成这批后，Week 8 至少达成了四件实事：

1. Workflow Store 的内部职责再次收窄，编辑态动作不再和入口文件混在一起。
2. 后续每次结构性调整，都可以先跑 `npm run check` 作为统一回归入口。
3. `store.ts` 的薄入口边界已经不再只是文档描述，而是项目门禁的一部分。
4. `editor.ts` 也不再演变成“大文件搬家后的新入口”，而是继续收回成 editor 组合层。

## 4. 验收结果

本批改造完成后，已确认：

- `npm run check` 通过
- `src/features/workflow/lib/store.ts` 当前维持在薄入口体量
- `src/features/workflow/lib/store/editor.ts` 当前维持在薄组合层体量
- `store.ts` 对外公开 API 未发生变化
- Week 8 后半段主题拆分完成后，前端类型检查、生产构建、后端测试仍全部通过
- Week 8 手工冒烟项已由用户于 2026-05-03 在本地开发环境完成，结果为通过

## 5. 后续建议

Week 8 完成后，后续建议继续做三件事：

1. 为 editor/document/execution 三块补更细粒度的手工回归清单。
2. 视情况补第一批 store 纯逻辑测试入口，优先覆盖分组、复制、删除这类容易回归的路径。
3. 视后续改动密度，继续评估是否把 `editorGraph.ts` 再往“节点/连线”两个文件拆细。
