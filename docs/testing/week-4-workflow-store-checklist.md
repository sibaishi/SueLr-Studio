# Week 4 · Workflow Store 检查清单

## 目标

验证 Week 4 的第一批 Store 收口没有破坏现有工作流编辑与运行行为，并为后续真拆分保留回归基线。

## 代码结构检查

- [x] `src/features/workflow/lib/store/types.ts` 已承载公共 Store 类型
- [x] `src/features/workflow/lib/store/persistence.ts` 已承载本地持久化逻辑
- [x] `src/features/workflow/lib/store/selectors.ts` 已承载页面 / 画布 selector
- [x] `src/features/workflow/lib/store.ts` 仍保留稳定导出入口
- [x] `src/features/workflow/App.tsx` 不再直接整库订阅
- [x] `src/features/workflow/components/FlowCanvas.tsx` 不再直接整库订阅

## 构建与类型检查

- [x] `npm run build` 通过
- [x] `npx tsc --noEmit` 通过

## 设计收口检查

- [x] Week 4 设计文档已补齐
- [x] Week 7 拆分边界与顺序已明确
- [x] `ProviderConfig` 旧类型出口阻塞已清理

## 手工回归建议

以下项建议在进入 Week 7 前至少执行一次手工冒烟：

- [ ] 新建工作流正常
- [ ] 节点新增、拖拽、连线正常
- [ ] 节点分组 / 解组正常
- [ ] 本地草稿仍会持久化
- [ ] 重新打开页面后仍能恢复草稿或活跃运行状态
- [ ] 导入 / 导出 / 保存 / 加载工作流未出现行为回退
