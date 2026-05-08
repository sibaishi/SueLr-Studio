# Release SOP

This document defines the standard desktop release process for SueLr Studio.

## Branching

- `master` is the only long-lived source branch.
- GitHub Releases is the only official distribution channel for packaged desktop builds.
- Packaged artifacts such as `.exe`, `dist/`, and `release/` outputs must not be committed to git.

## Standard Release Flow

1. Finish feature work and fixes on `master`.
2. Pull the latest source:

   ```powershell
   git pull origin master
   ```

3. Run validation:

   ```powershell
   npm.cmd run typecheck
   npm.cmd run test --prefix backend
   npm.cmd run check:encoding
   npm.cmd run check:repo-hygiene
   ```

4. Build the desktop single-file executable:

   ```powershell
   npm.cmd run electron:dist
   ```

5. Verify the packaged app manually.

   Recommended checks:

   - The app launches successfully.
   - First-run onboarding works as expected.
   - Saving configuration applies correctly.
   - Restart behavior works after settings changes.
   - Core workflows can run successfully.

6. Commit and push source changes:

   ```powershell
   git status
   git add .
   git commit -m "Describe the release changes"
   git push origin master
   ```

7. Create and push a version tag:

   ```powershell
   git tag -a v1.0.1 -m "SueLr Studio v1.0.1"
   git push origin v1.0.1
   ```

8. Create a GitHub Release based on the new tag and upload:

   - `release/SueLr-Studio.exe`

## Versioning Guidance

- Patch release: `v1.0.1`
- Minor feature release: `v1.1.0`
- Major release: `v2.0.0`

## Notes

- Only publish a release after confirming it is suitable for normal users.
- Keep release notes concise and user-facing.
- If a release candidate fails manual verification, fix the issue on `master` before tagging.
