# Frontend & Electron Optimization Plan / 前端与 Electron 优化计划

> 创建日期：2026-05-27
> 基线分支：`codex/architecture-optimization`
> 状态：未开始

## O1 FlowCanvas 拆分 — 自定义 Hooks / FlowCanvas Decomposition

### 基线 / Baseline

`src/domains/workflow/components/FlowCanvas.tsx`：**1881 行**，7 个 `useState`，49 个 `useCallback`，5 个 `useRef`，4 个 `useEffect`，10 个 `useMemo`。

已有 13 个本地 helper 模块抽走了纯逻辑（连接、剪贴板、几何、菜单布局等）。组件内剩余的是状态 + 事件回调 + JSX 三者的交织体，状态高度耦合（contextMenu 的引用散布全文件），不适合拆子组件。

### 策略：5 个自定义 Hooks / Strategy: 5 Custom Hooks

```
src/domains/workflow/components/
  flowCanvasHooks/
    types.ts                 ← 共享 FlowHookDeps 类型
    useFlowFileDrop.ts       ← 拖放/上传 + addFilesToCanvas
    useFlowEdgeCutting.ts    ← edgeCutting 状态 + Alt+拖拽切割
    useFlowClipboard.ts      ← clipboardNode + 复制/粘贴
    useFlowConnection.ts     ← edge insertion + commit + 验证
    useFlowContextMenu.ts    ← contextMenu 状态 + 右键菜单回调
```

### 拆分顺序 / Execution Order

| 序号 | Hook | 依赖 / Deps | 难度 |
|:---:|------|-------------|:---:|
| 1 | `useFlowFileDrop` | store, reactFlow, containerRef | 低 |
| 2 | `useFlowEdgeCutting` | store, reactFlow, containerRef | 低 |
| 3 | `useFlowClipboard` | store, reactFlow | 中 |
| 4 | `useFlowConnection` | store, reactFlow, pendingConnectionRef | 中 |
| 5 | `useFlowContextMenu` | store, reactFlow, containerRef，前 4 个 hook 的返回值 | 高 |

每个 hook 提取后立即跑 `npm run typecheck && npm run test:unit && npm run build`。

注意：当前 `useWorkflowCanvasStore` 仍暴露 `nodes` / `edges`，这是既有状态形态。本计划只做行为等价拆分，不扩大 React Flow 状态进入 Zustand 的范围，也不顺手迁移画布状态。拆 hook 时若遇到现有 `useWorkflowStore.getState()` / `useWorkflowStore.setState()` 调用，应在 hook 内显式保留并隔离这些低层访问，避免把隐式 store 写入藏进共享类型。

### 共享类型 / Shared Types

```ts
// flowCanvasHooks/types.ts
interface FlowHookDeps {
  store: ReturnType<typeof useWorkflowCanvasStore>;
  reactFlow: ReturnType<typeof useReactFlow>;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}
```

主组件调用 hooks 后变为：

```tsx
export function FlowCanvas() {
  const store = useWorkflowCanvasStore();
  const reactFlow = useReactFlow();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const ctxMenu = useFlowContextMenu({ store, reactFlow, containerRef });
  const connection = useFlowConnection({ store, reactFlow });
  const fileDrop = useFlowFileDrop({ store, reactFlow, containerRef });
  const clipboard = useFlowClipboard({ store, reactFlow });
  const edgeCut = useFlowEdgeCutting({ store, reactFlow, containerRef });

  // 不能归入 hooks 的独立回调 + JSX 渲染
}
```

### 目标行数 / Target Line Count

| 文件 | 行数 |
|------|:---:|
| FlowCanvas.tsx（拆分后） | ~700 |
| useFlowFileDrop.ts | ~130 |
| useFlowEdgeCutting.ts | ~80 |
| useFlowClipboard.ts | ~80 |
| useFlowConnection.ts | ~200 |
| useFlowContextMenu.ts | ~250 |
| types.ts | ~15 |

### 验证标准 / Acceptance Criteria

- `npm run typecheck` 零错误
- `npm run test:unit` 通过
- `npm run build` 成功
- 浏览器中验证：右键菜单、连接到新节点、拖放文件、粘贴图片、复制粘贴节点、连线、节点分组/取消分组、Alt+拖拽切边全部正常

---

## O2 Electron 多平台打包 / Multi-Platform Packaging

### 基线 / Baseline

当前 `package.json` `build` 块只配了 Windows portable x64：

```json
"win": { "target": [{ "target": "portable", "arch": ["x64"] }] }
```

`build/` 目录只有 `icon.ico` 和 `icon.png`，缺少 macOS 所需的 `icon.icns`。

### 新增配置 / New Targets

```jsonc
// package.json "build" 块内追加
"mac": {
  "icon": "build/icon.icns",
  "category": "public.app-category.developer-tools",
  "target": [
    { "target": "dmg", "arch": ["x64", "arm64"] },
    { "target": "zip", "arch": ["x64", "arm64"] }
  ]
},
"linux": {
  "icon": "build/icon.png",
  "category": "Development",
  "target": [
    { "target": "AppImage", "arch": ["x64"] },
    { "target": "deb", "arch": ["x64"] }
  ]
}
```

### 工作项 / Work Items

| 序号 | 项 / Item | 说明 / Notes |
|:---:|-----------|-------------|
| 1 | 生成 `build/icon.icns` | 从现有 `icon.png`（≥512×512）用 `sips -s format icns` 转换 |
| 2 | 追加 mac target 配置 | dmg + zip，x64 + arm64 双架构 |
| 3 | 追加 linux target 配置 | AppImage + deb，x64 |
| 4 | 检查 asarUnpack | sharp 等 native 模块在 macOS/Linux 的二进制路径 |
| 5 | 更新构建说明 | 同步更新 `README.md`、`docs/developer-guide.md`、`docs/release-sop.md`；macOS 可打三平台产物，Windows 只能打 win + linux |

### 不在范围内 / Out of Scope

| 项 / Item | 原因 / Reason |
|-----------|-------------|
| macOS 代码签名 | 需 Apple Developer 账号，属发布阶段 |
| Linux snap / flatpak | 同上，按需后续追加 |
| 自动更新 | 需签名 + 更新服务器 |

### 验证标准 / Acceptance Criteria

- macOS 上 `npm run electron:dist` 产出 `.dmg` 和 `.zip`
- Linux 上产出 `.AppImage` 和 `.deb`
- 产物可安装运行，backend 正常启动
- `npm run build` 不因新增字段报错
- `README.md`、`docs/developer-guide.md`、`docs/release-sop.md` 的桌面构建说明与新增 target 保持一致
