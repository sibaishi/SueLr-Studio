# SueLr Studio 优化执行计划

> 执行时机：第五阶段（Milestone 5A-5C）全部完成之后。
> 当前状态：Milestone 5 已关闭；Phase 0 已在 `codex/project-structure-optimization` 落地；构建分包优化已完成；后续优化继续按 Phase 1 -> Phase 2 -> Phase 3 推进。
> 创建日期：2026-05-26
> 最后更新：2026-05-27

## 2026-05-27 同步状态

- 已隐藏 server runtime 下不可用的「重启后端」入口。
- 已删除根级 `src/lib/`，后续共享辅助模块统一归入 `src/shared/*`、`src/app/` 或所属 domain。
- 已接入 Biome 作为 `src/` 与 `backend/src/` 的 lint/format 基线，并保留 `noExplicitAny` 为错误级别。
- 已补充前端顶层页面懒加载：chat、image、video、workflow、settings 与 first-run onboarding 按访问加载，已访问页面继续挂载以保留页面状态。
- 已补充普通 Vite 构建的 vendor 分包：React、React Flow、Three.js、Markdown 与 icons；`VITE_SINGLEFILE=1` 仍保持单文件构建兼容。
- 已同步更新 `docs/developer-guide.md`、`docs/deployment-variants-plan.md` 与 `CONTRIBUTING.md`。

---

## 关联文档

本计划整合了以下 `.private-docs/` 中独立治理方案的共同部分，并将其串成一条有依赖顺序的执行路线：

- `code-simplifier-rollout.md` — 6 批次渐进式代码简化
- `encoding-governance-rollout.md` — UTF-8 全链路修复 + 防回归
- `workflow-core-split-plan.md` — FlowCanvas / editorGraph / executor 大文件拆分
- `workflow-node-folder-split-plan.md` — 工作流节点按类型分文件夹（前端部分）
- `project-optimization-process.md` — 性能基线记录

以上文档的独立执行不再重复，本计划仅吸收其中与本路线正交或可合并的部分。

---

## 优化清单总览

| 编号 | 优化项 | 严重度 | 投入 | 涉及文件 | 说明 |
|:----:|--------|:------:|:----:|------|------|
| O1 | 「重启后端」按钮在 server 端隐藏 | 中 | 1 行 | `src/features/settings/components/DefaultsSection.tsx` | 当前 disabled + 提示文字，应改为条件渲染不显示 |
| O2 | 删除 `src/lib/` 遗留目录 | 低 | 1 条命令 | `src/lib/`（12 文件） | 零引用，纯历史垃圾 |
| O3 | 接入 Biome（lint + format） | 中 | 1 配置文件 | 仓库根 | 485 个源文件风格自动化，禁止 `any` |
| O4a | NodeContent.tsx 按节点类型拆文件 | 高 | 1-2 天 | `src/domains/workflow/components/nodes/NodeContent.tsx`（1582 行） | 只拆渲染层，不动目录结构、不动注册逻辑、不动执行 |
| O4b | 节点目录重组（前端部分） | 中 | 1 天 | `src/domains/workflow/components/nodes/` | 在 O4a 基础上，每节点类型独立文件夹含 config + UI，不动 execution |
| O5 | 后端迁移 TypeScript | 中高 | 3-5 天 | `backend/src/`（56 文件, 14920 行） | 编译时类型安全，按模块逐批迁移 |
| O6 | FlowCanvas.tsx 拆子组件 | 中 | 1-2 天 | `src/domains/workflow/components/FlowCanvas.tsx`（1802 行） | ContextMenu/EdgeInsertion/Clipboard 独立子组件 |
| O7 | imageGeneration.js 按 provider 拆分 | 低中 | 半天 | `backend/src/engine/helpers/imageGeneration.js`（1633 行） | DALL-E / Gemini / 通用三块 |
| O8 | Electron 增加 macOS / Linux 打包 target | 低 | 半天 | `package.json` `build` 段 | 当前仅 Windows portable |

---

## 依赖关系图

```
O1 ──── 无依赖，随时做
O2 ──── 无依赖，随时做
         │
O3 ───── 必须先于 O4a/O4b/O5，统一风格基线
         │
    ┌────┼────┐
    ▼    ▼    ▼
   O4a  O4b  O5 ──── O7 可在迁 engine/helpers 时顺手做
    │    │    │
    └────┼────┘
         ▼
        O6 ──── 做完 O4a 后按手感决定是否做
         │
         ▼
        O8 ──── 优先级最低，个人需求决定
```

注意：O4b 依赖 O4a（先有文件级拆分，再做文件夹级重组）。O4a 和 O5 无相互依赖，可并行。

---

## Phase 0：基线清理

**预计耗时**：半天
**目标**：清垃圾，建风格基线，为后续所有结构改动提供一致环境。

### Step 0.1：隐藏 server 端「重启后端」按钮（O1）

**文件**：`src/features/settings/components/DefaultsSection.tsx`

**当前行为**：`canRestartBackend` 为 false 时按钮 `disabled` + 下方显示解释性提示文字。

**理由**：server 端 `canRestartBackend` 恒为 false，一个永远不可点的红色按钮除了制造困惑没有意义。

**改动**：将按钮和提示文字整个包在条件渲染中。

按钮部分 —— 从：

```tsx
<IOSButton
  label={view.backendRestarting ? '重启中...' : '重启后端'}
  onClick={() => { void actions.restartBackend(); }}
  disabled={view.backendRestarting || !view.canRestartBackend}
  data-testid="settings-restart-backend"
  small
  style={{ ... }}
/>
```

改为：

```tsx
{view.canRestartBackend ? (
  <IOSButton
    label={view.backendRestarting ? '重启中...' : '重启后端'}
    onClick={() => { void actions.restartBackend(); }}
    disabled={view.backendRestarting}
    data-testid="settings-restart-backend"
    small
    style={{ ... }}
  />
) : null}
```

提示文字部分 —— 删除以下整个块：

```tsx
{!view.canRestartBackend ? (
  <div data-testid="settings-restart-backend-hint" style={{ ... }}>
    {restartBackendHint}
  </div>
) : null}
```

**验证**：`npm run typecheck && npm run test:unit`

---

### Step 0.2：删除 `src/lib/` 遗留目录（O2）

**背景**：`AGENTS.md` 明确标注 `src/lib/` 为「兼容层，禁止新增模块」。代码审计确认该目录下的 12 个文件在全项目中零引用。

```bash
# 最终确认
rg "from ['\"]@/lib/" src/
# 预期输出：空

# 删除
rm -rf src/lib/
```

**验证**：`npm run typecheck && npm run build`

---

### Step 0.3：接入 Biome（O3）

```bash
cd <project-root>
npx @biomejs/biome init
```

**根配置 `biome.json`**（前端 TS/TSX）：

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 120
  },
  "linter": {
    "rules": {
      "recommended": true,
      "style": {
        "noNonNullAssertion": "warn"
      },
      "suspicious": {
        "noExplicitAny": "error"
      }
    }
  },
  "javascript": {
    "formatter": {
      "semicolons": "always",
      "quoteStyle": "single",
      "trailingCommas": "all"
    }
  }
}
```

**后端配置 `backend/biome.json`**（JS）：

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 120
  },
  "linter": {
    "rules": {
      "recommended": true
    }
  },
  "javascript": {
    "formatter": {
      "semicolons": "always",
      "quoteStyle": "single",
      "trailingCommas": "all"
    }
  }
}
```

**package.json 补充**：

```json
{
  "scripts": {
    "lint": "biome check src/ backend/src/",
    "lint:fix": "biome check --write src/ backend/src/",
    "format": "biome format --write src/ backend/src/",
    "format:check": "biome format src/ backend/src/"
  }
}
```

**执行**：

```bash
npx biome check --write src/ backend/src/
npx biome format --write src/ backend/src/
```

**关键提醒**：全量 format 会产生覆盖 485 个文件的大 diff。单独一个 commit，混在功能改动里会污染 git blame。

**验证**：`npm run lint && npm run typecheck && npm run build && npm run test:backend`

---

## Phase 1：NodeContent 渲染层拆分 → 目录重组

**预计耗时**：2-3 天
**目标**：分两步走——先把 1582 行的 god component 拆成每节点类型一个渲染文件（O4a），再在拆好的基础上把每节点类型的 config + UI 放入独立文件夹（O4b）。两个步骤都不动后端 execution。

### 设计决策：为什么分两步

`workflow-node-folder-split-plan.md` 的理想布局（每节点类型一个文件夹，含 config + UI + execution）方向正确，但步子太大。本计划将其拆成两个独立阶段：

- **O4a（本次执行）**：只拆渲染层。文件级拆分，不改目录结构、不改注册逻辑、不碰 `engine/nodes/` 和 `node-definitions/`。
- **O4b（O4a 完成后）**：在 O4a 的基础上，把每节点类型的 config（元数据、默认值、参数 schema）和渲染文件移入独立文件夹。仍不动 execution。

**后端 execution 逻辑不做节点目录重组**——`backend/src/engine/nodes/` 已有自己清晰的目录结构，前后端分层收益大于「所有代码在一个文件夹」的便利。

---

### Step 1.1：NodeContent 渲染层拆分（O4a）

**当前问题**：[NodeContent.tsx](src/domains/workflow/components/nodes/NodeContent.tsx) 包含十几个节点类型的渲染逻辑，全部挤在同一个文件里。虽然内部已有命名子组件（`PromptHelperContent`、`GroupNodeContent`、`GroupContent`），但它们共享同一个文件空间。

**目标结构**（此次只加文件，不动目录）：

```
src/domains/workflow/components/nodes/
  NodeContent.tsx                 ← 100 行以内，纯路由
  TextInputContent.tsx            ← 从 NodeContent 拆分
  ImageInputContent.tsx
  ImageGenContent.tsx
  VideoInputContent.tsx
  AudioInputContent.tsx
  TextSplitContent.tsx
  PromptHelperContent.tsx         ← 直接从 NodeContent 提出
  GroupContent.tsx                ← 同上
  GroupNodeContent.tsx            ← 同上
  FileInputContent.tsx            ← 合并 imageInput/videoInput/audioInput 共用逻辑
  FallbackContent.tsx             ← 未知节点类型的兜底渲染
  shared.ts                       ← 各内容组件共用的工具函数
  nodeConstants.ts                ← 保持不变
```

**拆分原则**：

1. 每个文件 `export` 一个 React 组件，命名 `XxxContent`
2. 主文件 `NodeContent.tsx` 维护一个 `CONTENT_BY_TYPE` 映射表
3. 公共纯函数（`buildTextCleanPreview`、`getUploadProcessingState` 等）移到 `shared.ts`
4. 公共样式常量保持在各组件内部，不提取到全局

**主文件最终形态**（示意）：

```tsx
import type { ComponentType } from 'react';
import { TextInputContent } from './TextInputContent';
import { ImageGenContent } from './ImageGenContent';
import { FileInputContent } from './FileInputContent';
import { PromptHelperContent } from './PromptHelperContent';
import { GroupContent } from './GroupContent';
import { GroupNodeContent } from './GroupNodeContent';
import { FallbackContent } from './FallbackContent';
// ...

const CONTENT_BY_TYPE: Record<string, ComponentType<NodeContentProps>> = {
  textInput: TextInputContent,
  imageGen: ImageGenContent,
  videoGen: VideoGenContent,
  imageInput: FileInputContent,
  videoInput: FileInputContent,
  audioInput: FileInputContent,
  textSplit: TextSplitContent,
  promptHelper: PromptHelperContent,
  group: GroupContent,
  groupNode: GroupNodeContent,
  // ...
};

export function NodeContent(props: NodeContentProps) {
  const Content = CONTENT_BY_TYPE[props.nodeType];
  if (!Content) return <FallbackContent {...props} />;
  return <Content {...props} />;
}
```

**执行节奏**：一次一个节点类型，每拆一个就跑 `npm run typecheck && npm run test:unit && npm run build`。每个节点类型独立 commit。推荐从已有的独立子组件开始（`GroupContent`、`GroupNodeContent`——提出来即可），再到复杂的（`ImageInputContent`——处理上传状态和预览逻辑）。

---

### Step 1.2：节点目录重组 —— 前端部分（O4b）

**前置条件**：O4a 完成，所有节点类型已有独立渲染文件。

**目标**：在 O4a 拆好的基础上，把每节点类型的 config（元数据、默认值、参数 schema）和渲染文件放入独立文件夹。形成一个「改一个节点类型只需要进一个文件夹」的开发体验。

**目标结构**：

```
src/domains/workflow/components/nodes/
  registry.ts                    ← 统一注册入口
  shared.ts                      ← 跨节点公共工具
  nodeConstants.ts               ← 保持不变
  input/
    TextInput/
      config.ts                  ← 节点元数据、默认值、参数 schema
      TextInputContent.tsx       ← 渲染组件（从 O4a 搬入）
    ImageInput/
      config.ts
      ImageInputContent.tsx      ← 或合并为 FileInput
    VideoInput/
      config.ts
      VideoInputContent.tsx
    AudioInput/
      config.ts
      AudioInputContent.tsx
    MaskInput/
      config.ts
      MaskInputContent.tsx
    ImageResize/
      config.ts
      ImageResizeContent.tsx
  ai/
    AiChat/
      config.ts
      AiChatContent.tsx
    ImageGen/
      config.ts
      ImageGenContent.tsx
    VideoGen/
      config.ts
      VideoGenContent.tsx
  merge/
    TextSplit/
      config.ts
      TextSplitContent.tsx
    TextMerge/
      config.ts
      TextMergeContent.tsx
    ImageMerge/
      config.ts
      ImageMergeContent.tsx
    VideoMerge/
      config.ts
      VideoMergeContent.tsx
    AudioMerge/
      config.ts
      AudioMergeContent.tsx
    UniversalMerge/
      config.ts
      UniversalMergeContent.tsx
  output/
    Output/
      config.ts
      OutputContent.tsx
    SaveFile/
      config.ts
      SaveFileContent.tsx
  group/
    Group/
      config.ts
      GroupContent.tsx
      GroupNodeContent.tsx
```

**关键约束**：

- `registry.ts` 是唯一注册入口，所有新节点通过它暴露
- 每个 `config.ts` 导出：`nodeType`、`defaultData`、`paramSchema`、`category`、`color`、`icon` 等元数据
- 不动 `src/shared/workflow/node-definitions/`（React Flow 的 `group/index.js → node/index.js → node.js` 导入链）
- 不动后端 `engine/nodes/`
- 不动 `flowCanvasConfig.ts` 中已有的全局配置——新 config 从节点文件夹导入后通过 registry 转发给调用方

**迁移策略**：

1. 新建 `registry.ts`，与旧注册入口并行运行（兼容期）
2. 逐个节点类型迁移：建文件夹 → 移 config → 移渲染 → 更新 registry
3. 每迁一个就跑 `npm run typecheck && npm run test:unit`
4. 全部迁完后，将旧注册入口改为 thin wrapper 转发到 registry
5. 后续新节点只需要：建文件夹 → 写 config.ts + Content.tsx → 在 registry.ts 注册一行

**验证**：`npm run typecheck && npm run test:unit && npm run build && npm run test:e2e`

---

## Phase 2：后端 TypeScript 迁移

**预计耗时**：3-5 天
**目标**：将 `backend/src/` 的 56 个 JS 文件逐模块迁移为 TypeScript，获得编译时类型安全。

### 前置条件

- Phase 0 完成（Biome 已接入，TypeScript lint 规则就位）

### 技术方案

利用 Node.js 22 原生 TypeScript 支持（`--experimental-strip-types` flag），无需 ts-node 或额外构建步骤。类型检查通过 `tsc --noEmit` 独立运行。

**后端 `backend/tsconfig.json`**：

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "server.ts"],
  "exclude": ["node_modules", "tests"]
}
```

**`backend/package.json` 调整**：

```json
{
  "scripts": {
    "start": "node --experimental-strip-types server.ts",
    "dev": "node --watch --experimental-strip-types server.ts",
    "test": "node --test --experimental-strip-types \"tests/**/*.test.ts\"",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.9.0"
  }
}
```

### 迁移批次

从最底层到最上层，确保每批都不依赖尚未迁移的模块。

| 批次 | 目录 | 文件数 | 说明 |
|:----:|------|:------:|------|
| 1 | `platform/storage/` | 5 | 最底层，无上下游依赖 |
| 2 | `platform/logging/` | 5 | 日志系统 |
| 3 | `platform/security/` | 2 | 网络守卫 |
| 4 | `platform/providers/` | 3 | AI 提供者适配 |
| 5 | `platform/runtime/` | 2 | 运行模式定义 |
| 6 | `platform/media/` | 3 | 媒体处理 |
| 7 | `platform/http/` | 2 | proxy-aware-fetch |
| 8 | `platform/ai/` | 3 | AI 服务层 |
| 9 | `platform/system/` | 2 | 重启触发器 |
| 10 | `app/errors/` | 2 | 错误类型定义 |
| 11 | `app/http/` | 2 | HTTP 响应封装 |
| 12 | `app/middleware/` | 6 | 中间件 |
| 13 | `engine/helpers/` | 5 | 引擎辅助（含 O7 拆分） |
| 14 | `engine/nodes/` | 4 | 工作流节点执行 |
| 15 | `engine/contracts/` | 2 | 引擎类型契约 |
| 16 | `modules/*/` | 8 模块 | 业务层，依赖上面全部 |

### 每文件迁移步骤

1. 改扩展名 `.js` → `.ts`
2. 添加接口/类型定义（函数参数、返回值、配置对象）
3. 修正所有 import 路径
4. 跑相关测试
5. 跑 `npm run typecheck`

### 特殊处理

- **`server.ts` 入口**：改完同步更新 Dockerfile 和 Electron `embedded-backend.cjs` 中的启动路径
- **`engine/executor.js`**：工作流执行入口，动态性最强。如果迁移阻力大可以最后处理
- **第三方类型**：`undici`、`sharp`、`multer`、`cors`、`express` 都有 DefinitelyTyped 包

### 可选：在迁移 engine/helpers 时顺手做 O7

`imageGeneration.js`（1633 行）在迁到 TS 时按 AI provider 拆成四个文件：

```
engine/helpers/
  imageGeneration.ts        ← 公共入口 + 类型定义
  imageGenDalle.ts          ← DALL-E 专有逻辑
  imageGenGemini.ts         ← Gemini 专有逻辑
  imageGenGeneric.ts        ← 通用 OpenAI 兼容逻辑
```

### 迁移中的风险控制

- 每批迁移后立即跑 `npm run test:backend`，不在多批累积后一起验证
- 如有测试覆盖不足的模块，迁移时不引入新逻辑，只做类型标注
- `Zod` 的 schema 定义保留，不强行用 TypeScript 类型替代运行时校验

---

## Phase 3：按需决策

以下两项在 Phase 1-2 完成后根据实际体验决定是否执行。

### O6：FlowCanvas.tsx 拆子组件

**触发条件**：Phase 1 的拆分体验良好，且 FlowCanvas 的 1802 行仍然感觉难以导航。

**拆分方案**：

```
workflow/components/
  FlowCanvas.tsx                    ← 编排层，预计 400-500 行
  FlowCanvasContextMenu.tsx         ← 右键菜单逻辑
  FlowCanvasEdgeInsertion.tsx       ← 边插入预览
  FlowCanvasClipboard.tsx           ← 复制/粘贴
  FlowCanvasDropHandler.tsx         ← 文件拖放处理
```

每个子组件通过 props 接收所需状态和回调，主组件负责编排。

**风险**：当前 8 个 helper 模块（`flowCanvasConnections.ts`、`flowCanvasClipboard.ts` 等）的模式实际已经实现了逻辑分离。进一步拆成 React 子组件的收益是独立的 memo 和测试，代价是状态传递从闭包共享变成 props 传递。建议在 Phase 1 完成后评估手感再决定。

### O8：Electron 多平台打包

**触发条件**：有 macOS 或 Linux 用户的实际需求。

`package.json` `build` 段补充：

```json
{
  "build": {
    "mac": {
      "icon": "build/icon.png",
      "target": [
        { "target": "dmg", "arch": ["x64", "arm64"] }
      ]
    },
    "linux": {
      "icon": "build/icon.png",
      "target": [
        { "target": "AppImage", "arch": ["x64"] }
      ]
    }
  }
}
```

---

## 各阶段验证命令

| Phase | 验证命令 |
|-------|----------|
| 0 | `npm run lint && npm run check:encoding && npm run typecheck && npm run build && npm run test:backend` |
| 1 | `npm run lint && npm run typecheck && npm run test:unit && npm run build && npm run test:e2e` |
| 2 | `npm run lint && npm run typecheck && npm run test:backend && npm run build && npm run check` |
| 3 | 全量 `npm run check` |

---

## 完整执行路线图

```
Week 1 (Phase 0)
  Mon  ─ O1 重启按钮隐藏 (1 commit)
         O2 删除 src/lib/ (1 commit)
  Tue  ─ O3 接入 Biome，全量 format (1 commit)
         npm run lint 通过 → Phase 0 收口

Week 2-3 (Phase 1)
  O4a ─ 逐个节点类型拆分 NodeContent 渲染
         每天 2-3 个节点类型，每拆一个独立 commit
         全部拆完后跑全量 check → O4a 收口
         │
  O4b ─ 节点目录重组
         建 registry.ts，逐个迁移 config + UI 入独立文件夹
         每迁一个跑验证 → 全部迁完后 O4b 收口

Week 4-6 (Phase 2)
  按批次迁移 backend TS
  每天 1-2 批（platform 底层可以快，modules 慢）
  每批跑 test:backend + typecheck
  O7 在迁 engine/helpers 时顺手做
  全迁完后跑 npm run check → Phase 2 收口

Week 7+ (Phase 3)
  根据手感决定 O6 (FlowCanvas)
  根据需求决定 O8 (Electron 多平台)
```

---

## 不做的事

以下不在本次优化范围内，列入远期备忘：

| 项 | 原因 |
|----|------|
| 引入数据库（SQLite/PostgreSQL）替代文件系统 | 第六阶段多用户时再考虑 |
| 前后端共享类型改 monorepo package 导出 | 当前路径引用够用，不构成痛点 |
| 引入 React Router | 单页应用，无路由需求 |
| CI/CD pipeline（GitHub Actions 等） | 个人项目，本地 `npm run check` 在第五阶段后覆盖足够 |
| 节点目录重组包含后端 execution 逻辑 | `engine/nodes/` 已有清晰的目录结构，前后端分层收益更大 |
| 迁移 `src/shared/workflow/node-definitions/` | React Flow 导入链有严格约束，不动更安全 |

---

> 最后更新：2026-05-26
> 状态：第五阶段已关闭；方案继续按 Phase 1 -> Phase 2 -> Phase 3 顺序执行
