# Week 5 Settings 边界检查清单

## 自动验证

- [x] `backend/src/modules/settings/settings.repository.js` 不再直接引用 `backend/routes/settingsShared.js`
- [x] `backend/src/modules/settings/settings.shared.js` 成为 providerConfig 清洗逻辑的真实实现位置
- [x] `backend/routes/settingsShared.js` 仅保留兼容性 re-export
- [x] `backend/tests/settings.service.test.js` 覆盖 providerConfig 清洗与 `modelOverrides` 归一化
- [x] `npm --prefix backend test` 通过
- [x] `npm run build` 通过

## 人工复核

- [ ] 在设置页更新图片/视频 provider 配置后，确认保存与再次读取结果一致
- [ ] 在设置页切换当前激活配置后，确认能力调用仍读取最新 providerConfig
- [ ] 手工导入一份历史 settings 数据，确认迁移后不会丢失 `modelOverrides`

## 通过标准

满足以下条件即可认为 Week 5 后半段完成：

1. settings 模块不再反向依赖旧 `routes` helper
2. providerConfig 清洗行为与迁移前保持一致
3. 文档、测试、兼容层三者同步更新
