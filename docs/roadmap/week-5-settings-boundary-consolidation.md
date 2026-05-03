# Week 5 Settings 边界收口

## 1. 本批目标

Week 5 下半段只处理一个明确问题：`settings` 模块虽然已经迁入 `src/modules`，但仍反向依赖旧的 `backend/routes/settingsShared.js`，这会让模块边界继续混杂。

本批目标：

- 把 providerConfig 相关清洗逻辑收回 `settings` 模块内部
- 去掉 `settings.repository.js` 对旧 `routes` helper 的直接依赖
- 保留旧路径的兼容壳，避免外部潜在引用被瞬时打断
- 补齐对应回归测试，确认配置清洗行为不变

## 2. 现状判断

本次排查确认：

1. `backend/src/modules/settings/settings.repository.js` 仍在直接引用 `backend/routes/settingsShared.js`
2. `settingsShared.js` 中只有纯 helper，没有路由上下文依赖
3. 当前 helper 使用点集中，适合低风险迁移

因此这次收口不做大重构，只做“所有权归位”：

- helper 迁回 `settings` 模块
- 旧路径保留兼容导出
- 行为保持一致

## 3. 已落地内容

### 3.1 收回 settings 模块内部共享 helper

新增文件：

- `backend/src/modules/settings/settings.shared.js`

现在 `normalizeModelOverrides()` 与 `sanitizeProviderConfig()` 由 `settings` 模块自己维护，模块内部职责更清晰。

### 3.2 去掉 repository 对旧 routes helper 的反向依赖

调整文件：

- `backend/src/modules/settings/settings.repository.js`

现在 repository 直接引用模块内 helper，不再反向依赖 `backend/routes/*`。

这意味着 `settings` 模块的读取、迁移、配置清洗、运行时配置构建，已经能够在模块边界内自洽完成。

### 3.3 保留旧路径兼容壳

调整文件：

- `backend/routes/settingsShared.js`

旧文件现在只做 re-export，不再持有真实实现。这样可以做到：

- 不打断可能存在的历史引用
- 同时把真实实现位置收回 `src/modules/settings`

## 4. 回归验证

新增验证点：

- `backend/tests/settings.service.test.js`

覆盖内容：

1. `providerConfig.imageTimeoutMs` 会被正确归一化为整数
2. 非法或空的 `modelOverrides` 会被剔除
3. 合法的 `modelOverrides` 会被清洗后保留
4. 默认 `imageEndpoint` 仍然补齐为 `/v1/images/generations`

## 5. 本批结论

Week 5 下半段完成后，后端链路又去掉了一处“模块层反向依赖旧路由层 helper”的历史包袱。

当前收益：

1. `settings` 模块边界更清晰
2. 后续若继续拆 `settings` 的 service / repository / config 逻辑，迁移阻力更小
3. 旧 helper 路径仍兼容，回滚成本低

## 6. 后续建议

Week 6-8 可以按下面顺序继续推进：

1. 盘点前端设置页是否仍直接依赖历史字段结构
2. 为 settings / providerConfig 建立更明确的前后端契约文档
3. 把 Week 5 的 contract / sanitization 检查沉淀为更稳定的 CI 门禁
