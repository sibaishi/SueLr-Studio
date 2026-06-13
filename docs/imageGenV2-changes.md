# imageGenV2 节点改动全录

> 分支：`refactor/ImageGenV2-node-styles`  
> 日期：2026-06-13  
> 用途：后续将其他节点迁移到 V2 形式时的参考文档

---

## 核心设计

V2 节点的核心变更：原有节点的多个独立类型端口（prompt/reference/mask/apiKey）合并为**一个 `any` 类型端口**，支持无限连线，由执行引擎按来源节点类型自动分类。

### 输入规格（imageGenV2）

| 类型 | 上限 | 行为 |
|---|---|---|
| text | ∞ | 全部 `\n` 拼接，textarea 内容追加末尾 |
| image | 9 | 前台连线时拦截，超过 9 拒绝连线 |
| mask | 1 | 前台连线时拦截，超过 1 拒绝连线 |
| apiKey | 已删除 | 完全移除，不再出现在类型系统中 |

---

## 改动文件清单

### 后端（5 文件）

| 文件 | 改动 |
|---|---|
| `backend/src/engine/nodes/imageGenV2.ts` | **新增**。V2 节点执行器：`_inputTypes` 元数据分类 + 类型上限 + 值回退兜底 |
| `backend/src/engine/nodes/index.ts` | 导入并注册 `imageGenV2` 到 `NODE_EXECUTORS` |
| `backend/src/engine/executor-helpers.ts` | `collectInputs` 新增可选 `nodes` 参数，传入时附带 `_inputTypes` 元数据；多条边同 handle 时收集为数组 |
| `backend/src/engine/executor.ts` | `collectInputs` 调用处传入 `executableNodes` |

### 前端（16 文件）

#### 节点组件（4 新文件）

| 文件 | 说明 |
|---|---|
| `src/.../nodes/ai/ImageGenV2/ImageGenV2Node.tsx` | **新增**。独立 ReactFlow 节点组件，无标题头，端口在左右边缘垂直居中 |
| `src/.../nodes/ai/ImageGenV2/ImageGenV2Content.tsx` | **新增**。内容渲染：纯展示区，显示生成图片或"待生成"占位 |
| `src/.../nodes/ai/ImageGenV2/renderer.tsx` | **新增**。渲染入口，绕过 GenericSettings |
| `src/.../nodes/node-v2.css` | **新增**。完全独立的 CSS（~2700 行），所有类名加 `-v2` 后缀，与共享 `node.css` 零耦合 |

#### 节点定义（3 文件）

| 文件 | 说明 |
|---|---|
| `src/shared/workflow/node-definitions/ai/imageGenV2/node.js` | **新增**。type=`imageGenV2`，单 `any` 输入，params 含 model/ratio/resolution/n/width/height/output_format |
| `src/shared/workflow/node-definitions/ai/imageGenV2/index.js` | 导出 |
| `src/shared/workflow/node-definitions/ai/index.js` | 引入 imageGenV2 到 AI 分类 |

#### 控制面板（1 文件）

| 文件 | 说明 |
|---|---|
| `src/domains/workflow/components/NodeStylePanel.tsx` | **新增**。V2 节点底部控制面板。含 textarea（prompt）、4 个向上弹窗按钮（模型/比例/尺寸/格式）、输入缩略图 chips（可拖拽排序）、顶部拖拽调整高度 |

#### 注册和配置（3 文件）

| 文件 | 改动 |
|---|---|
| `src/domains/workflow/components/flowCanvasConfig.ts` | `FLOW_NODE_TYPES` 中 `imageGenV2: ImageGenV2Node`（不是 FlowNode） |
| `src/domains/workflow/components/nodes/settingsContentRegistry.tsx` | 注册 `imageGenV2` 内容渲染器 |
| `src/domains/workflow/lib/constants.ts` | V2 节点默认尺寸 10×10 grid（280×280px） |

#### Store 层（3 文件）

| 文件 | 改动 |
|---|---|
| `src/domains/workflow/lib/store/editorGraph.ts` | `addEdge`：imageGenV2 跳过单连线过滤器；**新增类型上限拦截**（mask≤1，image≤9） |
| `src/domains/workflow/lib/store/execution.ts` | `MULTI_INPUT_NODE_TYPES` 含 imageGenV2；`sortEdgesByInputOrder` 按 `node.data.inputOrder` 排序边 |
| `src/domains/workflow/lib/store/helpers.ts` | 辅助更新 |

---

## 架构关键点

### 1. CSS 隔离策略

V2 节点使用完全独立的 CSS 文件 `node-v2.css`，所有选择器加 `-v2` 后缀：
- `.flow-node` → `.flow-node-v2`
- `.node-title` → 不存在（V2 无标题）
- `.node-gallery-shell` → `.node-gallery-shell-v2`

**零耦合**：不共享任何样式，改原版不影响 V2，反之亦然。

### 2. 独立 ReactFlow 节点组件

V2 节点不使用共享的 `FlowNode.tsx`，而是使用独立的 `ImageGenV2Node.tsx`。这允许：
- 无标题头（纯卡片）
- 端口位置完全自定义（左右边缘垂直居中，而非底部 port row）
- 节点卡片专为展示区设计

其他节点迁移到 V2 时，同理需要自己的独立 Node 组件。

### 3. 单 `any` 端口 + 执行器分类

前端：节点的 `inputs` 定义只有 `{ id: 'input', type: 'any', required: false }`  
后端：分类分两层

**优先：`_inputTypes` 元数据**
`collectInputs` 在传入 `nodes` 时会附带 `_{handle}Types` 数组，直接给出每个值的源节点类型字符串：

```ts
// 示例：input 端口连了 textInput + imageInput + maskInput
// inputs.input = [textVal, imageVal, maskVal]
// (inputs as any)._inputTypes = ['textInput', 'imageInput', 'maskInput']
```

`classifyBySourceType` 做精确映射：
- `maskInput` → mask
- `image*` / `video*` → image
- `text*` / `*chat*` / `*prompt*` → text

**兜底：`classifyByValue`**
无元数据时（单连接未附带 types），按值内容启发式判断。

### 4. 连线限制（前端拦截）

在 `editorGraph.ts` 的 `addEdge` 中：
- 源节点是 maskInput → 已有 1 条 mask 连接 → 拒绝
- 源节点是 image*/video* → 已有 9 条 image 连接 → 拒绝
- 后端仍保留 `references.length < MAX_IMAGES` 守卫，做最后防线

### 5. 多输入排序

`NodeStylePanel` 中的输入 chips 支持 HTML5 原生拖拽重排。排序结果存入 `node.data.inputOrder`（edge id 数组）。

执行时 `sortEdgesByInputOrder` 按 `inputOrder` 重排边数组，确保执行器收到正确顺序的值。

### 6. `collectInputs` 泛化

```ts
// 之前：单值覆盖
inputs[targetHandle] = lastValue;

// 现在：多条边收集为数组，单条边保持单值
inputs[targetHandle] = values.length === 1 ? values[0] : values;

// 可选附带类型
inputs._inputTypes = ['textInput', 'imageInput'];
```

该改动对所有节点类型兼容（`nodes` 参数可选，不传行为完全不变）。

---

## 后续节点迁移 checklist

将现有节点改为 V2 形式时，按以下清单检查：

- [ ] **节点定义**：新建 `node.js`，type 名加 V2 后缀，inputs 改为单 `any` 端口
- [ ] **执行器**：新建 `xxxV2.ts`，实现 `classifyBySourceType` + `classifyByValue` 两层分类
- [ ] **NODE_EXECUTORS 注册**：在 `backend/src/engine/nodes/index.ts` 添加
- [ ] **CSS**：新建独立 CSS 文件（`node-v2.css` 基础上扩展，或另建），所有类名独立
- [ ] **ReactFlow 节点组件**：新建独立 Node 组件，不继承 FlowNode
- [ ] **内容渲染器**：新建 content 组件 + renderer
- [ ] **FLOW_NODE_TYPES**：在 `flowCanvasConfig.ts` 注册
- [ ] **settingsContentRegistry**：注册内容渲染器
- [ ] **constants.ts**：设默认尺寸
- [ ] **控制面板**：如需要底部面板，参考 `NodeStylePanel.tsx`（或改为通用）
- [ ] **editorGraph.ts**：如有限制需求，在 `addEdge` 添加类型上限拦截
- [ ] **execution.ts**：如有排序需求，加入 `MULTI_INPUT_NODE_TYPES`
- [ ] **前端类型常量**：如有新增/删除的输入类型，更新 `InputThumb` 和 `TYPE_ORDER`
