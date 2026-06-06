# Design System — SueLr Studio

> 自动检测生成：2026-06-06 | 预设：`vite-react-tailwind`

## Stack
- framework: React 19 + Vite 7
- styling: Tailwind CSS 4.1 (CSS-first)
- components: 自建 iOS-style 设计系统
- animation: CSS @keyframes + inline transitions
- icons: Lucide React
- state: Zustand 5（小型领域 store）
- electron: Electron 41

## Design Philosophy
Apple-like minimalism with AI-native depth. 中文优先 UI，深色模式为默认。
三层玻璃态纵深系统 + 蓝/紫/绿径向渐变背景。

## Tokens
| 令牌 | 值 | 用途 |
|---|---|---|
| `--radius-sm` | 8px | 标签/徽章 |
| `--radius-md` | 12px | 分段控件 |
| `--radius-lg` | 16px | 内嵌卡片 |
| `--radius-xl` | 24px | 主面板 |
| `--btn-radius` | 10px | 按钮 |
| `--input-radius` | 10px | 输入框 |
| `--card-radius` | 18px | 卡片 |
| `--toast-radius` | 12px | Toast |
| `--modal-radius` | 20px | 模态框 |

## Non-Goals
- 无 Framer Motion
- 无 shadcn/ui
- 无 Figma 同步
