# Week 5 图片链路检查清单

## 自动验证

- [x] `/api/capabilities/image` 仍返回 envelope-only 成功响应
- [x] `/api/capabilities/image` 非法请求仍返回统一校验错误
- [x] `/api/images/generate` 返回 envelope-only 成功响应
- [x] `/api/images/generate` 与 `/api/capabilities/image` 对同一非法请求返回一致结果
- [x] `CapabilitiesService.image()` 已委托到 `imagesService.generate()`

## 手工复核

- [ ] 前端图片生成功能继续走 `/api/capabilities/image`
- [ ] 没有新增前端直接依赖 `/api/images/generate`
- [ ] 图片成功、失败、超时三类场景的 UI 提示未出现回归

## 完成判定

满足以下条件即可认为 Week 5 第一批收口完成：

1. 主入口与兼容入口关系已经写入文档
2. 两条图片 HTTP 入口共享同一套请求校验
3. 两条图片 HTTP 入口落到同一份服务实现
4. 自动化测试已覆盖成功响应与非法请求一致性
