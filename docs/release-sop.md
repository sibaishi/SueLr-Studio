# Release SOP

This document defines the standard release workflow for SueLr Studio. The active delivery variants are `desktop` and `local-web`; remote server deployment is no longer part of the supported release surface.

> Current release baseline: 2026-11-10.

## Branching

- `main` is the shared long-lived source branch in this repository.
- `release/local-web` and `release/desktop` are long-lived release branches for variant-specific work.
- Shared behavior must land on `main` before it is promoted into a release branch unless the change is a release-only hotfix.
- GitHub Releases remains the official distribution channel for packaged desktop builds unless a variant-specific distribution process is defined later.
- Packaged artifacts such as `.exe`, `dist/`, and `release/` outputs must not be committed to git.

## Standard Release Flow

1. Finish shared feature work and fixes on `main`.
2. Merge or cherry-pick any required variant-specific release work into the target `release/*` branch.
3. Pull the latest source for the branch you are releasing:

   ```powershell
   git pull origin main
   ```

   Or, for a variant release branch:

   ```powershell
   git pull origin release/desktop
   ```

4. Validate clean installs and the quality gate on Linux, macOS, and Windows. Run browser smoke tests before promoting either release variant:

   ```powershell
   npm.cmd run check
   npm.cmd run test:e2e
   ```

   `npm run check` includes workflow-store structure, documentation, runtime baseline, test-surface, repository hygiene, encoding, typecheck, frontend unit tests, frontend build, and backend tests. Run the individual scripts only while diagnosing a failed gate.

5. Build the target release artifact.

   For desktop:

   ```powershell
   npm run electron:dist
   ```

   Desktop targets are Windows portable x64, macOS dmg/zip x64+arm64, and Linux AppImage/deb x64. Build macOS artifacts on macOS; Windows release hosts should produce Windows and Linux artifacts only. The desktop package excludes Playwright runtime data under `backend/.playwright/`.

   For local-web:

   ```powershell
   npm run build:local-web
   npm run start:local-web
   ```

6. Verify the packaged or locally served app manually.

   Recommended checks:

   - The app launches successfully.
   - First-run onboarding works as expected.
   - First-run onboarding only saves connection info and discovered models; it must not auto-enable project models.
   - Saving configuration applies correctly.
   - A second desktop launch focuses the existing instance instead of opening a second main window.
   - Restart behavior works after settings changes.
   - Core workflows can run successfully.
   - `io -> ai -> io` executes with at least one configured project model.
   - Enabled provider configurations remain independently selectable and their project models do not overwrite each other.
   - Workflow library covers create, save, duplicate, cover assignment, import, export, and delete.
   - Verify the Local-Web homepage and `/api/health` at the address printed by the launcher.

7. Commit and push source changes:

   ```powershell
   git status
   git add .
   git commit -m "Describe the release changes"
   git push origin main
   ```

8. Create and push a version tag:

   ```powershell
   git tag -a v2.0.0 -m "SueLr Studio v2.0.0"
   git push origin v2.0.0
   ```

9. Create a GitHub Release based on the new tag and upload the appropriate variant artifact.

   - `release/SueLr-Studio.exe`

## Versioning Guidance

- 2026-11-24：当前产品版本统一为 `2.0.0`。此后每次提交前执行 `npm run version:bump`，补丁位加一，例如 `2.0.0 → 2.0.1`；同一批提交只递增一次，检查失败后的修正不重复递增。
- 该命令同步前后端包清单及锁文件中的产品版本；界面、启动页、Electron 和后端接口读取包版本。不要修改依赖版本、数据格式版本或历史记录。
- 递增后运行 `npm run check`，版本文件与业务修改一起提交。`npm run check:version` 校验前后端及锁文件一致；该检查不会自动修改版本，也未安装 Git 钩子。
- 大版本或次版本升级须按用户明确指示执行。标签示例应替换为本次实际版本，仅在正式发布时创建。
- Use changelog notes or release descriptions to call out variant-specific differences.
- Prefer tagging only after validation has passed on the branch being released.

## Failure Handling

- If validation fails, fix the issue and rerun the failed checks before continuing.
- If a release candidate fails manual verification, fix the issue on `main` first unless it is truly release-branch-specific.
- If a release-only fix is required on a `release/*` branch, merge the shared portion back to `main` as soon as practical.

## Notes

- `local-web` release validation should explicitly cover both `build:local-web` and `start:local-web`.
- Variant-specific launchers and packaging steps must stay documented in this SOP and the user/developer guides.
- Server deployment, Docker image publishing, and independent admin-console release flows have been retired from this repository.


2026-11-22：后端执行器与前端共用 `src/shared/types/generation.ts` 中的生成记录契约和参数白名单。Electron 打包 files 清单须包含该文件，避免安装包内后端运行时缺少导入模块。生成元信息通过运行时存储解析器持久化，不写入安装目录。
