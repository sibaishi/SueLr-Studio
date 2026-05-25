# Release SOP

This document defines the standard release workflow for SueLr Studio variants. The detailed execution roadmap for the current `master` trunk plus `local-web`, `desktop`, and `server-web` lives in `docs/deployment-variants-plan.md`.

## Branching

- `master` is the shared long-lived source branch in this repository.
- `release/local-web`, `release/desktop`, and `release/server-web` are long-lived release branches for variant-specific work.
- shared behavior must land on `master` before it is promoted into a release branch unless the change is a release-only hotfix.
- GitHub Releases remains the official distribution channel for packaged desktop builds unless a variant-specific distribution process is defined later.
- Packaged artifacts such as `.exe`, `dist/`, and `release/` outputs must not be committed to git.

## Standard Release Flow

1. Finish shared feature work and fixes on `master`.
2. Merge or cherry-pick any required variant-specific release work into the target `release/*` branch.
3. Pull the latest source for the branch you are releasing:

   ```powershell
   git pull origin master
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

   For `server-web` repository-checkout deployments, use:

   ```bash
   bash ./scripts/deploy/server-web/install.sh
   bash ./scripts/deploy/server-web/update.sh
   bash ./scripts/deploy/server-web/uninstall.sh
   ```

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

7. Commit and push source changes:

   ```powershell
   git status
   git add .
   git commit -m "Describe the release changes"
   git push origin master
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
- If a release candidate fails manual verification, fix the issue on `master` first unless it is truly release-branch-specific.
- If a release-only fix is required on a `release/*` branch, merge the shared portion back to `master` as soon as practical.

## Notes

- `local-web` release validation should explicitly cover both `build:local-web` and `start:local-web`.
- Variant-specific launchers and packaging steps must stay documented in `docs/deployment-variants-plan.md`.
- `server-web` deployment precheck, environment contract, and rollout smoke SOP live in `docs/deployment-variants-plan.md`.
