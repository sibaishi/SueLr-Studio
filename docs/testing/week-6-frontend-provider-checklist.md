# Week 6 前端 Provider 收口检查清单

## 自动验证

- [x] `src/domains/settings/useSettingsPanelController.ts` 成为 settings 页 provider/config 写入的集中控制入口
- [x] `src/domains/settings/components/SettingsPanel.tsx` 不再直接负责连接测试主流程与 provider 默认值拼装
- [x] `src/domains/settings/components/ConnectionSettingsSection.tsx` 不再手动双写 `base` / `apiKey` 到局部状态与配置列表
- [x] provider 相关输入改为通过语义化 action 写入，而不是 section 组件内联拼 patch
- [ ] `npm run build` 通过

## 人工复核

- [ ] 在设置页修改接口地址与 API Key 后，切换模块再回来，确认展示值与当前激活配置一致
- [ ] 在设置页切换 Bearer / API Key / Custom Header 后，确认自定义 Header 区块显示与隐藏正确
- [ ] 在设置页修改图片请求超时后，重新进入设置页，确认数值仍能回显
- [ ] 执行一次“测试连接”，确认发现模型仍会回写到当前配置与模型导入区

## 通过标准

满足以下条件即可认为 Week 6 完成：

1. 前端 provider/config 写入责任从大组件中进一步收回到 domain hook
2. 设置页连接区不再自行拼装和双写核心配置字段
3. 文档、检查清单、构建验证同步完成
