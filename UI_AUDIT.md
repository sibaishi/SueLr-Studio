# UI Audit Report — SueLr Studio

> 审计时间：2026-06-06 | 审计范围：全局 CSS / 共享 UI / Chat / Image / Video / Workflow

## Score: 7.8 / 10

| Category | Score | Notes |
|---|---|---|
| Visual Hierarchy | 8/10 | 玻璃态三级纵深 + 三色径向渐变背景构成清晰的空间层次。Workbench 三段式布局抽象统一了四个域。 |
| Typography | 7/10 | 全局 anti-aliased，中文字体渲染优秀。缺少显式排版尺度（已在 P3-12 修复）。Markdown 标题现统一 tracking-tight。 |
| Depth & Layering | 9/10 | 三层 blur (40/20/60px) + saturate 补偿 + 双层阴影 (tight+ambient) + inset 顶部高光 = 接近 iOS 级别的纵深。亮点。 |
| Interactive States | 7/10 | 全局 button:active scale(0.97) + focus-visible 蓝环 + input:focus 光晕覆盖了基础态。骨架屏和空状态覆盖不全，hover 依赖全局规则。P0+P1 修复后提升至 7 分。 |
| Responsiveness | 7/10 | Workbench 在 1280/1440 断点有适配，Agent 工作台在 820/1100 有重排。缺少 container queries 使面板独立响应式。 |
| Accessibility | 6/10 | prefers-reduced-motion 已添加（P0），focus-visible 已组件化，Toast 有 aria-live。缺少语义化 HTML（nav/main/aside）、键盘导航完整性待验证。EAA 2025 基础合规。 |
| Motion | 8/10 | 边流光（白点+蓝光晕）美观克制，面板 crossfade 流畅，toast 动画干净。高频动画（fadeInUp）已优化至 0.2s ease-out。transition:all 全面清理。缺失：节点增删动画、页面离开动效。 |

## Top 3 improvements

### 1. Accessibility — 语义化 HTML 导航

**Before:**
```tsx
<div style={{ display: 'flex', flexDirection: 'row', height: '100%' }}>
  <div>...</div> {/* sidebar */}
  <div style={{ flex: 1 }}> {/* main content */}
    <aside>...</aside>
    <section>...</section>
  </div>
</div>
```

**After:**
```tsx
<div style={{ display: 'flex', flexDirection: 'row', height: '100%' }} role="application">
  <nav aria-label="主导航">...</nav>
  <main style={{ flex: 1 }}>
    <aside aria-label="侧边栏">...</aside>
    <section aria-label="内容区">...</section>
  </main>
</div>
```

### 2. Accessibility — 键盘导航增强

当前仅 `AutoTextarea` 有 `onKeyDown`。建议全局添加：
- `Escape` 关闭弹窗/侧栏
- `Tab` 焦点环可见性验证
- 拖拽操作的键盘替代（`Space`+方向键移动节点）

### 3. Motion — 边动画方向感知

**Before:** 边流光始终从 source 向 target（即使选中 target 节点）

**After:**
```tsx
const isSourceSelected = selectedIds.has(edge.source);
const isTargetSelected = selectedIds.has(edge.target);
const flowDir = isSourceSelected ? 'normal' : 'reverse';
// 反向时动画从 target 流向 source
```

## 已修复的历史问题

| 日期 | 修复 |
|---|---|
| 2026-06-06 | 全局 `transition: all` → 精确属性列表 |
| 2026-06-06 | 添加 `prefers-reduced-motion` 守卫 |
| 2026-06-06 | 三层设计令牌体系（Primitive → Semantic → Component） |
| 2026-06-06 | `@layer` 级联层结构 |
| 2026-06-06 | 圆角统一到 11 个语义令牌 |
| 2026-06-06 | 面板切换 crossfade（opacity + position） |
| 2026-06-06 | 边选中流光动画 |
| 2026-06-06 | Suspense fallback 骨架屏 |
| 2026-06-06 | fadeInUp 0.3s→0.2s ease-out |
| 2026-06-06 | `.flow-node` transform transition 移除（拖拽性能） |
