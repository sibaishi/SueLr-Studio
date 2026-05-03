# Week 2 后端链路复核清单

## 目的

用于验证后端链路盘点与唯一入口定义已经形成可复核结果，而不只是口头分析。

## 文档检查

### 1. 唯一入口检查

- 打开 `docs/roadmap/week-2-backend-chain-consolidation.md`
- 确认其中明确写出：
  - 唯一服务入口
  - 唯一应用装配入口
  - 当前真实挂载的 API 列表

### 2. 活跃链路检查

- 确认文档已覆盖以下链路：
  - workflows
  - execution
  - images
  - capabilities
  - settings
  - assistant / files

### 3. 旧层角色检查

- 确认文档已明确区分：
  - `backend/routes/` 为兼容壳
  - `backend/services/` 为仍在生效的旧能力层
  - `backend/engine/` 为当前执行核心

## 自动检查

### 4. 后端测试

运行：

```bash
cmd /c npm test
```

预期：

- 后端测试通过
- 至少覆盖统一 envelope、设置路由、工作流 CRUD、能力接口和执行状态路由

### 5. 构建检查

运行：

```bash
cmd /c npm run build
```

预期：

- 前端构建通过
- Week 2 的文档与后端整理没有破坏现有构建

## 通过标准

只有在以下条件全部满足时，Week 2 才视为通过：

- 后端真实入口与真实落点已有仓库内文档
- 旧层角色与后续迁移顺序已明确
- 自动检查通过
