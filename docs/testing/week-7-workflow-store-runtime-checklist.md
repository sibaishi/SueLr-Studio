# Week 7 Workflow Store Runtime Checklist

## 目标

验证 Week 7 的运行时拆分没有破坏现有工作流编辑、保存、导入导出与执行链路，并确认 `useWorkflowStore` 对外 API 仍保持稳定。

## 自动验证

- [x] `src/features/workflow/lib/store/helpers.ts` 已承载共享 helper 与导入导出归一化逻辑
- [x] `src/features/workflow/lib/store/document.ts` 已承载工作流文档生命周期动作
- [x] `src/features/workflow/lib/store/execution.ts` 已承载工作流执行生命周期动作
- [x] `src/features/workflow/lib/store.ts` 继续作为稳定对外入口
- [x] `src/features/workflow/lib/store/types.ts` 仍作为公共 store 类型来源
- [x] `npx tsc --noEmit` 通过
- [x] `npm run build` 通过

## 手工回归建议

- [ ] 新建工作流后新增节点、连线、分组、解组行为正常
- [ ] 保存工作流后刷新页面，仍能从本地草稿或已保存状态恢复
- [ ] 切换到另一份工作流后，旧执行日志、旧 warning 和旧运行态不会残留
- [ ] 导出工作流再重新导入，节点、连线和基础元数据保持可用
- [ ] 触发一次工作流执行，确认执行日志、节点状态、运行恢复与取消能力正常
- [ ] 关闭页面后重新打开，若存在活跃运行，可正常恢复运行状态

## 通过标准

满足以下条件即可认为 Week 7 完成：

1. `store.ts` 不再独自承载文档动作与执行动作实现。
2. 外部消费方不需要因为本周拆分而修改调用代码。
3. 基础类型检查与生产构建均通过。
4. 工作流编辑、持久化、导入导出、执行四条主链路没有出现明显回归。
