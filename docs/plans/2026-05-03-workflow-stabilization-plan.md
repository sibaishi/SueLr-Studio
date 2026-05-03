# Workflow Stabilization Plan

## 总体状态

- Week 1：完成
- Week 2：完成
- Week 3：完成
- Week 4：完成
- Week 5：完成
- Week 6：完成
- Week 7-8：待开始

## 阶段目标

用 8 周把项目从“功能可用但结构负担偏重”推进到“入口清晰、契约统一、状态可拆、验证可复用”的状态。

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
- 已完成：
  1. 抽出 `src/features/workflow/lib/store/types.ts`
  2. 抽出 `src/features/workflow/lib/store/persistence.ts`
  3. 抽出 `src/features/workflow/lib/store/selectors.ts`
  4. 将 `src/features/workflow/App.tsx` 调整为页面侧选择性订阅
  5. 将 `src/features/workflow/components/FlowCanvas.tsx` 调整为画布侧选择性订阅
  6. 补齐 `ProviderConfig` 类型导出，恢复 `npx tsc --noEmit`
  7. 补齐 Week 4 设计文档与检查清单
- 验收结果：
  - `npm run build` 通过
  - `npx tsc --noEmit` 通过
  - Store 公共类型、持久化边界、页面/画布 selector 已拆出
  - `store.ts` 继续作为稳定公开入口保留

### Week 5 · 后端收口实施

- 状态：完成
- 依赖：Week 2、Week 4 已完成
- 第一批完成：
  1. 明确 `/api/capabilities/image` 为图片主入口
  2. 保留 `/api/images/generate` 作为兼容别名入口
  3. 将 `CapabilitiesService.image()` 收口到 `imagesService.generate()`
  4. 为 `/api/images/generate` 补齐 `validateImageBody()` 校验
  5. 补齐兼容图片入口的 HTTP contract 测试
- 第二批完成：
  1. 新增 `backend/src/modules/settings/settings.shared.js` 作为 settings 模块内部共享 helper
  2. 将 `settings.repository.js` 改为从模块内 helper 读取 `sanitizeProviderConfig` 与 `normalizeModelOverrides`
  3. 保留 `backend/routes/settingsShared.js` 为兼容性 re-export，避免旧路径瞬时断裂
  4. 补齐 providerConfig 清洗与 `modelOverrides` 归一化回归测试
- 当前交付：
  - `docs/roadmap/week-5-image-chain-consolidation.md`
  - `docs/roadmap/week-5-settings-boundary-consolidation.md`
  - `docs/testing/week-5-image-contract-checklist.md`
  - `docs/testing/week-5-settings-boundary-checklist.md`
- 验收结果：
  - `npm --prefix backend test` 通过
  - `npm run build` 通过

### Week 6 · 前端 Provider 收口实施

- 状态：完成
- 依赖：Week 3 已完成
- 已完成：
  1. 新增 `src/domains/settings/useSettingsPanelController.ts` 作为 settings panel 的前端控制器
  2. 将 provider 默认值补齐、连接字段写入、连接测试模型回写从 `SettingsPanel.tsx` 收口到 controller hook
  3. 将 `ConnectionSettingsSection.tsx` 改为调用语义化 action，而不是直接双写配置与拼 provider patch
  4. 补齐 Week 6 路线文档与检查清单
- 当前交付：
  - `docs/roadmap/week-6-frontend-provider-consolidation.md`
  - `docs/testing/week-6-frontend-provider-checklist.md`

### Week 7 · Workflow Store 真拆分

- 状态：待开始
- 依赖：Week 4 设计与预拆分完成

### Week 8 · 质量门禁与长期标准化

- 状态：待开始
- 目标：沉淀验证脚本、边界文档与长期维护规范

## 当前风险

1. `src/features/workflow/lib/store.ts` 体量仍偏大，目前只是预拆分
2. `executeWorkflow` 与执行状态逻辑仍在高耦合区域，Week 7 拆分时要控制回归风险
3. settings 前端仍保留较宽的 props 面，后续可以继续向 domain controller / selector 收口
4. 手工冒烟回归尚未形成自动化能力，后续需要逐步补齐

## 当前建议

1. Week 7 继续保留 `store.ts` 作为兼容入口，按调用热区逐步搬迁
2. Week 7 同步评估 settings 页 props 面是否还能进一步缩窄
3. Week 8 再把 Week 1-6 的检查清单抽成可重复执行的脚本与发布门禁
