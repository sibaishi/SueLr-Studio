# Week 1 基线治理落地说明

## 1. 目标

Week 1 的目标不是调整业务功能，而是先把仓库基线、文档入口、运行时目录边界和纯净部署范围固定下来。

这一阶段完成后，团队至少应该能回答四个问题：

1. 哪些目录属于源码，应该进入版本控制
2. 哪些目录属于运行时数据、日志或构建产物，不应该提交
3. 纯净部署版最少需要保留哪些文件
4. 结构调整后，最小验证应该怎么做

## 2. 当前目录归属

### 应进入版本控制的目录和文件

- `src/`
- `backend/`
- `docs/`
- `skills/`
- `workflows/`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `vite.config.ts`
- `index.html`
- `.gitignore`
- `.env.example`
- `README.md`
- `start.bat`
- `start.sh`

### 仅作为运行时或构建产物，不应提交的数据

- `node_modules/`
- `backend/node_modules/`
- `dist/`
- `.logs/`
- `.run-logs/`
- `.codex-logs/`
- `tmp/`
- `temp/`
- `storage/` 下除 `.gitkeep` 以外的真实用户数据
- 任意 `.log` 文件
- 本地真实 `.env`

## 3. `storage/` 与 `workflows/` 的边界

### `workflows/`

- 定位：仓库内示例工作流目录
- 用途：保存可复用、可演示、可随源码发布的样例工作流
- 版本策略：应纳入版本控制

### `storage/`

- 定位：兼容性保留目录，不再作为默认权威数据目录
- 用途：仅用于历史部署兼容或本地迁移观察
- 版本策略：仅保留 `.gitkeep`，其余真实数据不应提交

### 实际运行时数据目录

默认应写入系统用户配置目录，而不是仓库内 `storage/`：

- Windows: `%APPDATA%\\SueLr-Studio`
- macOS: `~/Library/Application Support/SueLr-Studio`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/SueLr-Studio`

## 4. 纯净部署版范围

用于部署或交接的纯净版，最少保留以下内容：

- `src/`
- `backend/`
- `docs/`
- `workflows/`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `vite.config.ts`
- `index.html`
- `.gitignore`
- `.env.example`
- `README.md`
- `start.bat`
- `start.sh`

以下内容不应作为纯净部署版的一部分：

- 本地日志
- 运行缓存
- 本地上传文件
- 本地生成图片、视频、下载结果
- 用户会话与设置快照
- 构建产物目录

## 5. 本周已收口规则

- `.logs/`、`.run-logs/`、`.codex-logs/` 已纳入忽略范围
- `tmp/`、`temp/` 已纳入忽略范围
- `storage/` 中的真实数据视为运行时数据，不纳入版本控制
- `workflows/` 只保留示例工作流与说明文档，作为仓库交付物的一部分
- 新文档体系以 `docs/README.md` 为入口，不再依赖旧阶段文档

## 6. Week 1 完成判定

Week 1 的原始完成条件为：

- 文档能够说明仓库目录边界
- `.gitignore` 覆盖当前已知运行日志与构建产物
- 纯净部署范围有明确清单
- 至少存在一份最小手工验证清单

### 2026-05-03 当前复核结论

Week 1 当前应判定为“部分完成”，不是“完全完成”。

已完成：

- `docs/` 入口、路线图、执行计划已重建
- 仓库目录边界、纯净部署范围以及 `storage/` / `workflows/` 策略已明确
- `.gitignore` 已补齐常见运行日志与临时目录
- Week 1 最小 smoke 验证清单已存在

未完成：

- 仓库尚未形成一次可信的 Git 首次提交基线
- 当前 `git status` 仍显示大范围未跟踪文件，还不是“基线已建立”状态

因此，更准确的结论是：文档治理已经基本到位，但版本控制基线尚未正式收口。

详细说明见：`docs/roadmap/repository-bootstrap-baseline.md`

## 7. 后续衔接

Week 1 收口后，下一步应进入：

1. Week 2：梳理后端真实调用链
2. Week 3：梳理前端 provider 重复关系与能力契约

在完成首次 Git 基线提交之前，不建议直接做大规模结构迁移。
