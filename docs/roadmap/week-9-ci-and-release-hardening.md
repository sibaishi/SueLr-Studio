# Week 9 CI And Release Hardening

## 本周目标

Week 9 的目标不是继续拆业务结构，而是把 Week 1-8 已经完成的治理结果固化成稳定、可复用、可交接的工程基线。

本周要解决的问题：

1. 质量门禁仍然主要依赖本地执行
2. Node、env、安装与启动方式缺少单一可信入口
3. 发布与回滚步骤还不够工程化

## 已落地内容

### 1. 远程 CI

- 新增 `.github/workflows/ci.yml`
- 在 push / pull request 时自动执行
- 远程执行内容为：
  - `npm ci`
  - `npm ci --prefix backend`
  - `npm run check`

### 2. 环境基线

- 新增 `.nvmrc`
- 根 `package.json` 与 `backend/package.json` 已声明 Node 版本范围
- 已补齐 `.env.example`
- 已形成统一环境说明文档：
  - `docs/ops/environment-baseline.md`

### 3. 发布与回滚文档

- 已补齐：
  - `docs/ops/deployment-and-rollback.md`
- 已明确：
  - 构建入口
  - 启动入口
  - 发布前检查项
  - 回滚步骤

### 4. Week 9 收尾验证

- GitHub Actions 已完成一轮真实执行
- Node 20 action deprecation warning 已处理
- 手工冒烟项已完成

## 本周结论

Week 9 可以视为完成。

当前仓库已经具备：

1. 远程自动质量门禁
2. 可复用的本地与 CI 环境基线
3. 可执行的部署与回滚说明
4. 固定化的最小人工冒烟入口

## 对后续周次的直接输入

Week 9 的成果将直接服务于：

1. Week 10 前端 E2E 接入 CI
2. Week 11 store 纯逻辑测试门禁
3. Week 12 发布纪律、回归矩阵与观测收口
