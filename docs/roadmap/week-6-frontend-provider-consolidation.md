# Week 6 前端 Provider 收口实施

## 1. 本批目标

Week 6 只处理一个明确问题：前端设置页虽然已经有 `domains/settings` 目录，但 `SettingsPanel` 仍然直接承担 provider 配置拼装、连接字段同步、模型发现回写等控制职责，导致 UI 层知道太多底层结构。

本批目标：

- 把前端 provider/config 写入逻辑从 `SettingsPanel` 中抽离
- 让连接参数与 provider 参数改为通过语义化动作写入
- 保持现有设置页布局与用户操作路径不变
- 为后续 Week 7-8 的状态拆分和验证门禁打好前端边界

## 2. 现状判断

本次排查确认：

1. `src/domains/settings/components/SettingsPanel.tsx` 同时承担视图组装与配置控制职责
2. `ConnectionSettingsSection.tsx` 直接拼 `providerConfig` patch，并且手动双写 `base` / `apiKey` 与 `apiConfigs`
3. `useStudioSettingsState.ts` 已经具备 settings 域状态基础，适合继续往“控制器 + 视图”方向收口

因此这次不做大范围重写，只做低风险收口：

- 新增 settings panel controller hook
- 保留现有 section 组件结构
- 让 section 改为调用语义化 action，而不是直接了解配置拼装细节

## 3. 已落地内容

### 3.1 新增 settings panel controller

新增文件：

- `src/domains/settings/useSettingsPanelController.ts`

该 hook 现在集中处理：

- 当前激活配置读取
- `providerConfig` 默认值补齐
- 配置名、接口地址、API Key 写入
- Provider 鉴权、模型接口、Header、图片超时写入
- 项目模型库写回
- 连接测试后的模型同步

这样 `SettingsPanel` 不再自己维护完整的 provider 合并细节。

### 3.2 SettingsPanel 收回为组装层

调整文件：

- `src/domains/settings/components/SettingsPanel.tsx`

现在 `SettingsPanel` 的职责更接近页面组装：

- 组装 view model
- 组合 settings actions
- 管理本页局部 UI 状态

而 provider/config 的核心写入责任已经下移到 domain hook。

### 3.3 ConnectionSettingsSection 改为语义化动作驱动

调整文件：

- `src/domains/settings/components/ConnectionSettingsSection.tsx`
- `src/domains/settings/components/shared.ts`

现在连接设置区不再：

- 手动同时调用 `setBase()` 与 `updateConfig()`
- 手动拼 `providerConfig` 局部对象

而是改为调用：

- `setConnectionBase()`
- `setConnectionApiKey()`
- `setProviderAuthType()`
- `setProviderModelsEndpoint()`
- `setProviderCustomHeaderName()`
- `setProviderCustomPrefix()`
- `setProviderImageTimeoutMs()`

这一步把 UI 对 provider 字段结构的直接耦合收窄到了更明确的 action 边界。

## 4. 本批结论

Week 6 完成后，前端 settings 域的 provider/config 写入边界比之前清晰了一层：

1. `SettingsPanel` 不再是“边渲染边改配置”的大组件
2. provider 默认值与合并逻辑收口到 domain hook
3. section 组件更接近展示层，后续更容易继续拆测或迁移

## 5. 后续建议

Week 7-8 可以按下面顺序继续推进：

1. 让 `useStudioSettingsState` 继续吸收更多 settings runtime 写入动作
2. 评估 `SettingsPanelProps` 是否可以收缩为更稳定的 domain-facing props
3. 把 settings 前端冒烟动作逐步沉淀为可复用的自动校验
