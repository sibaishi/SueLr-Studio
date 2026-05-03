# Documentation Hub

本目录已按 2026-05-03 的仓库审计与治理结果重建，旧阶段性文档已清理。

## 文档索引

- `D:\-12\SueLr-Studio\docs\roadmap\project-optimization-roadmap.md`
  - 面向负责人和维护者的总体优化路线图
  - 说明问题分级、目标状态、阶段划分、里程碑与验收口径
- `D:\-12\SueLr-Studio\docs\roadmap\week-1-baseline-governance.md`
  - Week 1 的基线治理落地说明
  - 记录仓库目录边界、纯净部署范围、运行时目录规则与当前复核结论
- `D:\-12\SueLr-Studio\docs\roadmap\repository-bootstrap-baseline.md`
  - 当前仓库初始化 / 首次提交基线说明
  - 用于说明 Week 1 为什么目前只算“部分完成”，以及如何完成 Git 基线收口
- `D:\-12\SueLr-Studio\docs\plans\2026-05-03-workflow-stabilization-plan.md`
  - 面向执行的详细实施文档
  - 将优化路线拆成周任务、交付物、验证方式、风险与依赖
- `D:\-12\SueLr-Studio\docs\testing\week-1-baseline-smoke-checklist.md`
  - Week 1 的最小验证清单
  - 用于确认基线治理没有破坏构建、测试与文档入口

## 使用建议

- 需要先判断“为什么做、先做什么”时，先看路线图
- 需要进入执行阶段、分派任务、安排每周目标时，直接看实施计划
- 需要确认 Week 1 是否真正收口时，先看基线治理文档，再看首次提交基线说明

## 当前默认执行顺序

1. 建立可追踪的 Git 与发布基线
2. 收敛后端真实执行链路
3. 统一前端 provider 与 API contract
4. 拆分工作流大 store
5. 补齐质量门禁、文档与长期集成准备
