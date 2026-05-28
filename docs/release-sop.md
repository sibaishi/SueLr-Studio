# Release SOP

This document defines the standard release workflow for SueLr Studio variants. The detailed execution roadmap for the current `main` trunk plus `local-web`, `desktop`, and `server-web` lives in `docs/deployment-variants-plan.md`.

## Branching

- `main` is the shared long-lived source branch in this repository.
- `release/local-web`, `release/desktop`, and `release/server-web` are long-lived release branches for variant-specific work.
- shared behavior must land on `main` before it is promoted into a release branch unless the change is a release-only hotfix.
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

4. Run validation:

   ```powershell
   npm.cmd run typecheck
   npm.cmd run test --prefix backend
   npm.cmd run check:encoding
   npm.cmd run check:repo-hygiene
   npm.cmd run check:docs
   ```

5. Build the target release artifact.

   For desktop:

   ```powershell
   npm.cmd run electron:dist
   ```

   Desktop targets are Windows portable x64, macOS dmg/zip x64+arm64, and Linux AppImage/deb x64. Build macOS artifacts on macOS; Windows release hosts should produce Windows and Linux artifacts only.

   For `server-web` repository-checkout deployments, use:

   ```bash
   bash ./scripts/deploy/server-web/install.sh
   bash ./scripts/deploy/server-web/update.sh
   bash ./scripts/deploy/server-web/uninstall.sh
   ```

   For `server-web` prebuilt image deployments through the self-hosted Gitea container registry, build and push from the local workstation or CI runner, then update from the server that can pull the registry image:

   ```bash
   docker login git.suelr.com
   SUE_LR_IMAGE=git.suelr.com/sueadmin/suelr-studio:server-web SUE_LR_PUSH=1 bash ./scripts/deploy/server-web/build-image.sh
   ```

   On Windows PowerShell without a working Bash environment, build and push the same image with:

   ```powershell
   node .\scripts\build-server-web-release.mjs
   docker build `
     -t git.suelr.com/sueadmin/suelr-studio:server-web `
     -f .\.server-web-release\app\scripts\deploy\server-web\Dockerfile `
     .\.server-web-release\app
   docker push git.suelr.com/sueadmin/suelr-studio:server-web
   ```

   Then on the server:

   ```bash
   docker login git.suelr.com
   cd /srv/suelr-studio/runtime
   sudo docker compose -f compose.yaml pull
   sudo docker compose -f compose.yaml up -d --no-build
   ```

   Use `update-image.sh` when the server has a current source checkout and should refresh `compose.image.yaml` or nginx from the repository. For an already migrated image deployment under `/srv/suelr-studio/runtime`, the normal rollout is only `docker compose pull` plus `up -d --no-build`.

   If the server does not have a source checkout, do not run `update-image.sh` from `/srv/suelr-studio/runtime`; manually update `/srv/suelr-studio/runtime/compose.yaml` and `/etc/nginx/sites-available/studio.suelr.com`, then reload nginx.

   `server-web` release rule:

   - keep the source checkout on the host only as the update source
   - treat `runtime/app` as the minimized live build context
   - keep `scripts/deploy/server-web/release-files.txt` aligned with every frontend entry, backend runtime file, and server-web helper script needed by Docker
   - prefer `update-image.sh` on low-resource hosts so production frontend builds happen on a workstation or CI runner; this path pulls the prebuilt image and skips source checkout updates unless `SUE_LR_PULL_SOURCE=1` is set
   - for image-based host rollouts, preserve `/srv/suelr-studio/runtime/compose.yaml` settings such as `APP_ALLOWED_ORIGINS`, `APP_ADMIN_ACCESS_KEY`, ports, and data volumes
   - when exposing the independent admin console, route a separate origin such as `https://admin.studio.suelr.com` to `127.0.0.1:3002` and add that exact origin to `APP_ALLOWED_ORIGINS`
   - verify the independent admin console with `curl -I https://admin.studio.suelr.com`, `curl -I http://127.0.0.1:3002/admin.html`, and an `/api/admin/access/validate` request carrying the configured admin key
   - keep `APP_RUNTIME_MODE` defaulting to `server-single-user` in compose and Docker assets unless the release explicitly enables `server-multi-user`
   - when testing `server-multi-user`, configure `APP_AUTH_BOOTSTRAP_USERNAME` and `APP_AUTH_BOOTSTRAP_PASSWORD`; do not use `APP_ADMIN_ACCESS_KEY` as regular app authentication
   - do not deploy repository `tests/`, `e2e`, `docs/`, or other development-only surfaces into the server-web runtime app tree
   - keep the server-web Docker runtime image limited to built frontend assets, backend runtime files, backend production dependencies, and shared workflow contracts

   For other variants, follow the build steps defined in `docs/deployment-variants-plan.md`.

6. Verify the packaged or deployed app manually.

   Recommended checks:

   - The app launches successfully.
   - First-run onboarding works as expected.
   - First-run onboarding only saves connection info and discovered models; it must not auto-enable project models.
   - Saving configuration applies correctly.
   - A second desktop launch focuses the existing instance instead of opening a second main window.
   - Restart behavior works after settings changes.
   - Core workflows can run successfully.
   - For the Milestone 5 release candidate, confirm request scope diagnostics, representative ownership metadata, scoped storage behavior, and stable file URLs by inspecting real workflows, run logs, generated files, assistant/agent records, memory records, uploads, and `/api/outputs/...` responses. Automated `npm.cmd run check` is required but does not replace this manual acceptance.
   - For a `server-multi-user` release candidate, confirm the Phase 6 readiness gate: auth is enabled, request scope comes from the server session, spoofed browser scope headers cannot impersonate users, cross-user negative tests cover workflow/files/execution/assistant/agent/settings, legacy unowned records are not globally visible, and `npm.cmd run test:e2e -- --grep "server multi user"` passes.

7. Commit and push source changes:

   ```powershell
   git status
   git add .
   git commit -m "Describe the release changes"
   git push origin main
   ```

8. Create and push a version tag:

   ```powershell
   git tag -a v1.0.1 -m "SueLr Studio v1.0.1"
   git push origin v1.0.1
   ```

9. Create a GitHub Release based on the new tag and upload the appropriate variant artifact.

   - `release/SueLr-Studio.exe`

## Versioning Guidance

- keep version bumps aligned with the actual packaged scope
- use changelog notes or release descriptions to call out variant-specific differences
- prefer tagging only after validation has passed on the branch being released

## Failure Handling

- If validation fails, fix the issue and rerun the failed checks before continuing.
- If a release candidate fails manual verification, fix the issue on `main` first unless it is truly release-branch-specific.
- If a release-only fix is required on a `release/*` branch, merge the shared portion back to `main` as soon as practical.

## Notes

- `local-web` release validation should explicitly cover both `build:local-web` and `start:local-web`.
- Variant-specific launchers and packaging steps must stay documented in `docs/deployment-variants-plan.md`.
- `server-web` deployment precheck, environment contract, and rollout smoke SOP live in `docs/deployment-variants-plan.md`.
