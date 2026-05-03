# Workflow Stabilization Plan

## 总体状态

- Week 1：完成
- Week 2：完成
- Week 3：完成
- Week 4：完成
- Week 5：完成
- Week 6：完成
- Week 7：完成
- Week 8：完成
- Week 9：进行中
- Week 10：待开始
- Week 11：待开始
- Week 12：待开始

## 阶段目标

用 12 周把项目从“功能可用但结构负担偏重”推进到“入口清晰、契约统一、状态可拆、验证可复用、发布与回归机制稳定可持续”的状态。

## 执行原则

- 每周只收一个主问题
- 优先做可回滚、可验证的收口
- 先定义边界，再做迁移
- 每周都留下代码或文档交付物
- Week 9 之后优先补自动化与发布工程化，不再轻易引入大规模结构漂移

## 周计划

### Week 1 - 基线治理

- 状态：完成
- 交付：`docs` 入口、部署纯净版边界、仓库初始化基线说明

### Week 2 - 后端链路收口

- 状态：完成
- 交付：真实调用链盘点、唯一入口说明、验证清单

### Week 3 - Provider Contract 收口

- 状态：完成
- 交付：Provider 边界、Capability Contract、兼容层收缩

### Week 4 - Workflow Store 预拆分

- 状态：完成
- 已完成：
  1. 抽出 `src/features/workflow/lib/store/types.ts`
  2. 抽出 `src/features/workflow/lib/store/persistence.ts`
  3. 抽出 `src/features/workflow/lib/store/selectors.ts`
  4. 将 `src/features/workflow/App.tsx` 调整为页面侧 selector 订阅
  5. 将 `src/features/workflow/components/FlowCanvas.tsx` 调整为画布侧 selector 订阅
  6. 补齐 `ProviderConfig` 类型导出，恢复 `npx tsc --noEmit`
  7. 补齐 Week 4 设计文档与检查清单
- 验收结果：
  - `npm run build` 通过
  - `npx tsc --noEmit` 通过

### Week 5 - 后端收口实施

- 状态：完成
- 第一批完成：
  1. 明确 `/api/capabilities/image` 为图片主入口
  2. 保留 `/api/images/generate` 作为兼容别名入口
  3. 将 `CapabilitiesService.image()` 收口到 `imagesService.generate()`
  4. 为 `/api/images/generate` 补齐 `validateImageBody()` 校验
  5. 补齐兼容图片入口 HTTP contract 测试
- 第二批完成：
  1. 新增 `backend/src/modules/settings/settings.shared.js` 作为 settings 模块内部共享 helper
  2. 将 `settings.repository.js` 改为从模块内 helper 读取 `sanitizeProviderConfig` 与 `normalizeModelOverrides`
  3. 保留 `backend/routes/settingsShared.js` 作为兼容性 re-export
  4. 补齐 providerConfig 清洗与 `modelOverrides` 归一化回归测试
- 验收结果：
  - `npm --prefix backend test` 通过
  - `npm run build` 通过

### Week 6 - 前端 Provider 收口实施

- 状态：完成
- 已完成：
  1. 新增 `src/domains/settings/useSettingsPanelController.ts` 作为 settings panel 控制器
  2. 将 provider 默认值补齐、连接字段写入、连接测试模型回写从 `SettingsPanel.tsx` 收口到 controller hook
  3. 将 `ConnectionSettingsSection.tsx` 改为调用语义化 action
  4. 补齐 Week 6 路线文档与检查清单

### Week 7 - Workflow Store 真拆分

- 状态：完成
- 已完成：
  1. 新增 `src/features/workflow/lib/store/helpers.ts` 承载共享 helper、导入导出归一化与 payload 构建逻辑
  2. 新增 `src/features/workflow/lib/store/document.ts` 承载工作流文档生命周期动作
  3. 新增 `src/features/workflow/lib/store/execution.ts` 承载工作流执行生命周期动作
  4. 保持 `src/features/workflow/lib/store.ts` 为稳定入口，并回接拆分后的 action 工厂
  5. 补齐 settings 面板可选字段类型兜底，恢复 `npx tsc --noEmit`
  6. 在工作流加载 / 导入切换时清空旧执行日志与 warning 残留
  7. 补齐 Week 7 路线文档与检查清单
- 验收结果：
  - `npx tsc --noEmit` 通过
  - `npm run build` 通过

### Week 8 - 质量门禁与长期标准化

- 状态：完成
- 第一批完成：
  1. 新增 `src/features/workflow/lib/store/editor.ts` 承载编辑态高频动作
  2. 将 `src/features/workflow/lib/store.ts` 收回为稳定入口与 action 组装层
  3. 在项目根 `package.json` 中补齐 `typecheck` 与 `check` 统一验证脚本
  4. 补齐 Week 8 路线文档与检查清单
- 第二批完成：
  1. 新增 `scripts/check-workflow-store-structure.mjs`，将 `store.ts` 入口边界固化为结构门禁
  2. 将结构门禁接入项目根 `npm run check`
  3. 同步补齐 Week 8 文档中的验收结果与后续建议
- 后半段完成：
  1. 新增 `editorGraph.ts`、`editorGroups.ts`、`editorSession.ts`、`editorShared.ts`
  2. 将 `editor.ts` 收回为 editor 组合层
  3. 将结构门禁升级为同时检查 `store.ts` 与 `editor.ts`
  4. 重新跑通 `npm run check`
- 验收结果：
  - `npm run check` 通过
  - `store.ts` 与 `editor.ts` 均维持薄层入口
  - 对外 store API 未发生破坏性变化

### Week 9 - CI 与发布回滚加固

- 状态：进行中
- 已完成：
  1. 新增 `.github/workflows/ci.yml`，将 `npm run check` 接入远程 CI
  2. 新增 `.nvmrc`，统一 Node 基线为 `22.17.0`
  3. 在根 `package.json` 与 `backend/package.json` 中补齐 `engines.node`
  4. 新增 `docs/ops/environment-baseline.md`
  5. 新增 `docs/ops/deployment-and-rollback.md`
- 目标：
  1. 将 `npm run check` 接入远程 CI
  2. 锁定 Node / env / 启动方式等运行基线
  3. 补齐部署、发布后验收与回滚文档
  4. 固定一组发布前最小人工冒烟项
- 交付：
  - CI 工作流
  - 环境基线文档
  - 部署 / 回滚说明
  - Week 9 检查清单

### Week 10 - 前端关键链路自动化回归网

- 状态：待开始
- 目标：
  1. 建立前端 E2E 基础设施
  2. 覆盖 workflow 编辑器核心交互路径
  3. 覆盖 settings 与 workflow 的关键联动
  4. 将历史高风险问题沉淀为回归用例
- 交付：
  - 前端 E2E 测试入口
  - 首批 workflow / settings 回归用例
  - Week 10 检查清单

### Week 11 - Store 证明性测试与边界护栏增强

- 状态：待开始
- 目标：
  1. 为 workflow store 高风险纯逻辑补第一批单元测试
  2. 继续压薄 `store.ts` 与 `editor.ts` 的组合层边界
  3. 强化结构检查脚本
  4. 为 editor / document / execution 补边界说明
- 交付：
  - store 纯逻辑测试
  - 增强后的结构门禁
  - 模块边界说明文档
  - Week 11 检查清单

### Week 12 - 发布纪律、回归矩阵与观测收口

- 状态：待开始
- 目标：
  1. 建立 release checklist
  2. 建立关键模块回归矩阵
  3. 收口最小观测与排查入口
  4. 建立后续迭代纪律
- 交付：
  - 发布清单
  - 回归矩阵文档
  - 观测 / 排查说明
  - Week 12 检查清单

## 当前风险

1. 当前门禁已经覆盖结构约束、类型、构建与后端契约，但前端交互回归仍主要依赖手工验证。
2. 远程 CI、环境基线、部署和回滚仍未完全收口到统一工程入口。
3. `editorGraph.ts` 仍有继续按“节点 / 连线”细拆的空间，但优先级已经低于补测试闭环。
4. 分组、复制、拖拽布局仍是 workflow 编辑区的高回归路径，后续更适合补纯逻辑测试与前端自动化回归闭环。

## 当前建议

1. Week 8 之后继续保留 `store.ts` 与 `editor.ts` 的稳定薄层入口，不轻易回流实现细节。
2. Week 9-12 的优先级顺序建议固定为：CI 与发布基线 -> 前端 E2E -> store 纯逻辑测试 -> 发布纪律与回归矩阵。
3. 后续每完成一周结构性调整，都同步更新 `docs/README.md`、对应 roadmap 文档与 testing 清单。
