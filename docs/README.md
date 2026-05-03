# Documentation Hub

本目录已按 2026-05-03 的项目审计与治理结果重建，旧阶段性文档已清理。

## 文档索引

- `D:\-12\SueLr-Studio\docs\roadmap\project-optimization-roadmap.md`
  - 面向负责人和维护者的总体优化路线图
  - 说明问题分级、目标状态、阶段划分、里程碑与验收口径

- `D:\-12\SueLr-Studio\docs\roadmap\week-1-baseline-governance.md`
  - Week 1 的基线治理落地说明
  - 记录仓库目录边界、纯净部署范围、运行时目录规则与当前复核结论

- `D:\-12\SueLr-Studio\docs\roadmap\repository-bootstrap-baseline.md`
  - 当前仓库初始化 / 首次提交基线说明
  - 用于说明 Week 1 如何正式收口，以及基线提交的作用

- `D:\-12\SueLr-Studio\docs\roadmap\week-2-backend-chain-consolidation.md`
  - Week 2 后端真实调用链与唯一入口收口说明
  - 记录 `route -> module -> service -> engine` 的当前生效链路，以及旧层的保留策略

- `D:\-12\SueLr-Studio\docs\roadmap\week-3-provider-contract-consolidation.md`
  - Week 3 前端 provider 与能力契约收口说明
  - 记录共享 provider、workflow provider、能力入口、图像 contract 核心链路与当前迁移边界

- `D:\-12\SueLr-Studio\docs\plans\2026-05-03-workflow-stabilization-plan.md`
  - 面向执行的详细实施文档
  - 将优化路线拆成周任务、交付物、验证方式、风险与依赖

- `D:\-12\SueLr-Studio\docs\testing\week-1-baseline-smoke-checklist.md`
  - Week 1 的最小验证清单
  - 用于确认基线治理没有破坏构建、测试与文档入口

- `D:\-12\SueLr-Studio\docs\testing\week-2-backend-chain-checklist.md`
  - Week 2 的最小验证清单
  - 用于确认后端真实入口、链路归属和旧层角色已有仓库内证据

- `D:\-12\SueLr-Studio\docs\testing\week-3-provider-contract-checklist.md`
  - Week 3 的最小验证清单
  - 用于确认 provider 并行层、能力合同边界与共享配置类型已有仓库内证据

## 使用建议

- 需要先判断“为什么做、先做什么”时，先看路线图
- 需要进入执行阶段、拆分任务、安排周目标时，直接看实施计划
- 需要复核 Week 1 是否真正收口时，先看基线治理文档，再看仓库初始化基线说明
- 需要复核 Week 2 是否真正收口时，先看后端链路收口说明，再看 Week 2 验证清单
- 需要复核 Week 3 是否已经正式收口时，先看 provider 契约收口说明，再看 Week 3 验证清单

## 当前默认执行顺序

1. 建立可追踪的 Git 与发布基线
2. 收口后端真实执行链路
3. 统一前端 provider 与 API contract
4. 拆分工作流大 store
5. 补齐质量门禁、文档与长期集成准备
