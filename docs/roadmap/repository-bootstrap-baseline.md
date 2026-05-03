# 当前仓库初始化 / 首次提交基线说明

## 1. 结论

截至 2026-05-03，Week 1 当前应判定为“部分完成”，不是“完全完成”。

已经完成的部分：

- `docs/` 已重建，并有可用入口文档
- 仓库目录边界已明确
- `.gitignore` 已补齐常见运行日志与临时目录
- “纯净部署版”保留范围已明确
- 最小 smoke 检查清单已补齐

尚未完成的关键缺口：

- 仓库还没有形成一次可信的 Git 初始化 / 首次提交基线
- 当前 `git status --short` 仍显示整仓库大范围未跟踪

这意味着：文档层面的基线已经建立，但版本控制层面的基线还没有真正落地。

## 2. 什么叫“首次提交基线”

这里的“首次提交基线”，不是指项目历史上的真正第一天提交，而是指：

- 以当前这份可部署、可构建、可测试、目录边界清晰的代码状态
- 形成一次明确、可回溯、可作为后续优化起点的 Git 提交

完成这一步后，后续 Week 2 及之后的结构调整，才有稳定的对照点和回滚点。

## 3. 这次基线提交应该包含什么

建议纳入版本控制的内容：

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
- `storage/.gitkeep`

如果这些内容代表当前“可交付的仓库最小集合”，它们就应该进入基线提交。

## 4. 不应该进入基线提交的内容

以下内容应继续保持忽略或人工排除：

- `node_modules/`
- `backend/node_modules/`
- `dist/`
- `.logs/`
- `.run-logs/`
- `.codex-logs/`
- `tmp/`
- `temp/`
- 任意本地 `.log` 文件
- 本地真实配置文件，如 `.env`
- 本地上传文件、生成结果、运行缓存
- `storage/` 下除 `.gitkeep` 以外的真实运行数据

如果提交前发现这些内容仍在暂存区，应先清理再提交。

## 5. 建议的落地步骤

### Step 1：先确认忽略规则生效

```bash
git status --short
```

预期：

- 只看到应该纳入仓库的源码、配置、文档文件
- 不应看到运行日志、依赖目录、构建产物、真实用户数据

### Step 2：选择性加入基线内容

建议优先显式添加，而不是直接全量 `git add .`：

```bash
git add .env.example .gitignore README.md
git add backend docs src skills workflows
git add index.html package.json package-lock.json tsconfig.json vite.config.ts
git add start.bat start.sh
git add storage/.gitkeep
```

如果后续确认还有其他必须纳入的根目录文件，再单独补加。

### Step 3：再次检查暂存结果

```bash
git status --short
```

重点检查：

- 是否仍有不该提交的运行期目录
- 是否有遗漏的部署必要文件
- 是否把本地私有配置误带入暂存区

### Step 4：形成基线提交

```bash
git commit -m "chore: initialize repository baseline"
```

### Step 5：把这次提交视为 Week 1 的正式收口点

完成后建议立即记录：

- 提交 hash
- 提交日期
- 基线包含范围
- 当时通过的验证命令

## 6. 建议配套验证

在发出基线提交前，建议至少确认以下命令通过：

```bash
cmd /c npx tsc --noEmit
cmd /c npm run build
cmd /c npm test
```

如果本次只变更文档，不一定要重复执行；但如果仓库内容即将作为“首次可信基线”提交，建议重新确认一次。

## 7. Week 1 完成判定更新

当前状态：

- Week 1 = 部分完成

转为“完全完成”的条件：

1. 文档、目录边界、忽略规则、纯净部署范围、smoke 清单保持有效
2. 完成一次明确的 Git 基线提交
3. 提交后 `git status` 回到可预期状态

满足以上三点后，Week 1 才可以正式判定为“完全完成”。
