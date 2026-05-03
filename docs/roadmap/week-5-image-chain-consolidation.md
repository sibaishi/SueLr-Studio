# Week 5 图片链路收口

## 1. 本周目标

Week 5 的第一批落地只做一件事：先把图片能力入口和服务来源收成一条线，避免后续继续在两套入口上重复修补。

本批次目标：

- 明确 `/api/capabilities/image` 是统一图片能力入口
- 保留 `/api/images/generate` 作为兼容别名
- 让两条入口复用同一份请求校验
- 让两条入口落到同一份图片服务实现
- 补齐别名入口的 HTTP contract 验证

## 2. 当前结论

当前前端实际使用的是：

- `/api/capabilities/image`

当前仍然保留的兼容入口是：

- `/api/images/generate`

因此 Week 5 的边界不是删除旧入口，而是先明确主次关系：

1. `/api/capabilities/image` 继续作为主入口
2. `/api/images/generate` 仅承担兼容用途
3. 图片请求构造、运行时配置拼装、错误归一全部收口到 `imagesService.generate()`

## 3. 本批次已落地内容

### 3.1 统一服务来源

`CapabilitiesService.image()` 不再自己拼装图片运行时配置并直接调用底层图片能力。

现在改为直接委托：

- `backend/src/modules/images/images.service.js`

这意味着图片能力的真实后端入口已经收口为：

- `imagesService.generate(body)`

`/api/capabilities/image` 与 `/api/images/generate` 后续再调整时，只需要围绕这一处演进。

### 3.2 统一请求校验

`/api/images/generate` 现在补上与 `/api/capabilities/image` 相同的 `validateImageBody()` 校验。

这样两条路由在以下方面保持一致：

- 必填字段校验
- 图片与蒙版 URL 合法性校验
- 尺寸、质量、数量等边界校验
- 错误 envelope 结构

### 3.3 补齐兼容入口 contract

新增验证点：

- `/api/images/generate` 成功响应保持 envelope-only
- `/api/images/generate` 与 `/api/capabilities/image` 对非法请求返回完全一致的校验结果

## 4. 当前状态判断

Week 5 还不能算整体完成，但“图片链路先收口”这一小段已经落地，状态可视为：

- Week 5：进行中
- 图片入口主次关系：已明确
- 图片服务单一实现：已完成
- 图片兼容入口 contract：已补齐第一批

## 5. 后续建议顺序

Week 5 剩余部分建议继续按下面顺序推进：

1. 继续梳理视频入口是否也存在重复链路
2. 评估 `backend/services/imageService.js` 与 `backend/engine/helpers/imageGeneration.js` 的职责边界
3. 为图片能力补更多 provider 级错误归一测试
4. 在文档中正式登记“兼容入口保留期”和未来删除条件
