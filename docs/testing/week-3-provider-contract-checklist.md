# Week 3 Provider / Contract Checklist

## 目的

这份清单用于复核 Week 3 的 provider / contract 收口是否已经形成仓库内可验证的结果，而不是只停留在口头分析。

## 文档检查

- [x] `docs/roadmap/week-3-provider-contract-consolidation.md` 已明确区分共享 provider 层、workflow 兼容层、统一能力入口。
- [x] 文档已明确 `/api/capabilities/chat`、`/api/capabilities/chat?stream=true`、`/api/capabilities/search`、`/api/capabilities/image`、`/api/capabilities/video` 是统一能力入口。
- [x] 文档已明确 `/api/files/upload` 与 `/api/execute/*` 不属于 provider contract。
- [x] 文档已明确 `backend/engine/helpers/imageGeneration.js` 是 image contract 核心落点。

## 代码检查

- [x] `src/lib/provider-config.ts` 已成为共享 `ProviderConfig` 的单一来源。
- [x] `src/lib/providers/types.ts` 与 `src/lib/types.ts` 已复用共享 `ProviderConfig`。
- [x] `src/hooks/index.ts` 中 `useProvider()` 已移除 `providerConfig?: any`。
- [x] `src/features/workflow/lib/providers/types.ts` 已改为复用 shared `ProviderConfig` 与 `DEFAULT_PROVIDER_CONFIG`。
- [x] workflow provider 默认 endpoint 不再维护独立默认值体系。
- [x] workflow 兼容层只额外保留 `modelOverrides` 兼容字段。
- [x] `src/features/workflow/components/nodes/nodeConstants.ts` 中节点测试默认配置已改为 shared `ProviderConfig` 类型约束。
- [x] 节点测试默认配置中未使用的 `modelOverrides: {}` 已移除。
- [x] `src/domains/capabilities/api.ts` 已新增流式 chat 统一能力入口封装。
- [x] `src/lib/providers/generic.ts` 的 `chatCompletionStream()` 已改为走 capability layer。
- [x] `backend/src/modules/capabilities/*` 已支持流式 chat 能力转发。
- [x] 后端已兼容“上游忽略 stream 参数但直接返回 JSON”的 fallback 场景。

## 自动验证

- [x] 运行 `cmd /c npm test`
- [x] 运行 `cmd /c npm run build`
- [x] `backend/tests/http-contract.test.js` 已覆盖流式 chat SSE 透传
- [x] `backend/tests/http-contract.test.js` 已覆盖流式 chat JSON fallback 包装

## 当前判定

满足以下条件时，可以认定 Week 3 已完成当前范围内的收口：

- 共享 provider 配置来源已统一。
- workflow provider 已从并行实现收缩为兼容层。
- 主要模型能力入口与非 provider 接口边界已经写清楚。
- 流式与非流式 chat 均纳入统一 capability layer。
- 自动化验证通过。

## 当前结论

- [x] Week 3 已完成

## 后续观察项

- [ ] workflow provider 兼容层进一步退场
- [ ] `modelOverrides` 的长期替代方案
- [ ] workflow 节点直连探测默认 endpoint 是否继续保留
