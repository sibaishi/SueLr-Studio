# Release SOP

This document defines the standard release workflow for SueLr Studio. The active delivery variants are `desktop` and `local-web`; remote server deployment is no longer part of the supported release surface.

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

   For local-web:

   ```powershell
   npm.cmd run build:local-web
   npm.cmd run start:local-web
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
   - Local-web serves the main app through the backend on port `3001`.

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

- Keep version bumps aligned with the actual packaged scope.
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
