# Workflow Stabilization Plan

## 总体状态

- Week 1：完成
- Week 2：完成
- Week 3：完成
- Week 4：完成
- Week 5-8：待开始

## 阶段目标

用 8 周把项目从“功能可用但结构负担较重”推进到“入口清晰、契约统一、状态可拆、验证可复用”的状态。

## 执行原则

- 每周只收一个主问题
- 优先做可回滚、可验证的收口
- 先定义边界，再做迁移
- 每周都留下代码或文档交付物

## 周计划

### Week 1 · 基线治理

- 状态：完成
- 交付：`docs` 入口、部署纯净版边界、仓库初始化基线说明

### Week 2 · 后端链路收口

- 状态：完成
- 交付：真实调用链盘点、唯一入口说明、验证清单

### Week 3 · Provider Contract 收口

- 状态：完成
- 交付：Provider 边界、Capability Contract、兼容层收缩

### Week 4 · Workflow Store 预拆分

- 状态：完成
- 目标：把 Workflow Store 从“大一统实现”推进到“可拆分结构”

本周已完成：

1. 抽出 `src/features/workflow/lib/store/types.ts`
2. 抽出 `src/features/workflow/lib/store/persistence.ts`
3. 抽出 `src/features/workflow/lib/store/selectors.ts`
4. 将 `src/features/workflow/App.tsx` 改为页面侧选择性订阅
5. 将 `src/features/workflow/components/FlowCanvas.tsx` 改为画布侧选择性订阅
6. 补齐 `ProviderConfig` 类型导出口，恢复 `npx tsc --noEmit`
7. 补齐 Week 4 设计文档与检查清单

验收结果：

- `npm run build` 通过
- `npx tsc --noEmit` 通过
- Store 公共类型、持久化边界、页面/画布 selector 已拆出
- `store.ts` 仍作为稳定公开入口保留

后续承接：

1. Week 5 开始后端收口实施
2. Week 6 开始前端 Provider 收口实施
3. Week 7 再进行 Workflow Store 真正切片拆分

### Week 5 · 后端收口实施

- 状态：待开始
- 依赖：Week 2、Week 4 已完成

### Week 6 · 前端 Provider 收口实施

- 状态：待开始
- 依赖：Week 3 已完成

### Week 7 · Workflow Store 真拆分

- 状态：待开始
- 依赖：Week 4 设计与验证闭环完成

### Week 8 · 质量门禁与长期标准化

- 状态：待开始
- 目标：沉淀验证脚本、边界文档与长期维护规范

## 当前风险

1. `src/features/workflow/lib/store.ts` 仍然体量较大，当前只是预拆分
2. `executeWorkflow` 与文档/执行状态仍在同一文件中，Week 7 拆分时要控制回归风险
3. 手工冒烟回归尚未形成自动化能力，后续需要逐步补齐

## 当前建议

1. 以 Week 4 当前状态作为 Workflow 模块重构基线
2. Week 5、Week 6 不再回头扩展 Week 4 范围，避免并行重构互相干扰
3. Week 7 拆分时继续保留 `store.ts` 作为兼容入口，分阶段迁移调用方
