# Contributing

Thanks for taking a look at SueLr Studio.

This project is maintained as a local-first multimodal studio. The main contribution goal is to improve product behavior without making the repository harder to understand or operate.

## Branch Model

SueLr Studio now uses the current `main` trunk plus three long-lived release branches:

- `main`
- `release/local-web`
- `release/desktop`
- `release/server-web`

Contribution rules:

- shared behavior belongs on `main` first in this repository
- release branches are for variant-specific packaging, deployment, and shell work
- if a change affects more than one variant, do not implement it only on a release branch
- when a release branch needs a hotfix, keep the fix minimal and merge the shared portion back to `main`

## Local Setup

Requirements:

- Node.js `>=22.12.0`
- npm

Install dependencies from the repository root:

```bash
npm install
npm run install:all
```

Start the normal local launcher:

```bash
npm start
```

Default local addresses:

- frontend: `http://localhost:5173`
- backend: `http://127.0.0.1:3001`

If Windows PowerShell blocks `npm.ps1`, run commands through:

```bash
cmd /c npm start
```

Convenience launchers are also available at the repo root:

- `start.bat`
- `start.sh`

They install missing dependencies and then start the combined dev flow.

`npm run dev` remains available for maintainers who explicitly want the raw concurrently-based frontend/backend development command.

## First Local Pass

For a clean newcomer sanity check:

1. Install dependencies with `npm install` and `npm run install:all`.
2. Start the app with `npm start`.
3. Open `http://localhost:5173` and confirm the shell loads while the backend responds on `http://127.0.0.1:3001`.
4. Install Playwright once on the machine before the first local browser run:

```bash
npm run test:e2e:install
```

## Validation Before Submission

Run the repository quality gate before opening a pull request:

```bash
npm run check
```

During implementation, use the faster Biome checks for source-only feedback:

```bash
npm run lint
npm run format:check
```

Run end-to-end smoke coverage when your change touches user-facing flows:

```bash
npm run test:e2e
```

If this is the first E2E run on the machine, install the Playwright browser first:

```bash
npm run test:e2e:install
```

## Encoding Expectations

Keep user-visible text, docs, logs, and persisted content in UTF-8 without BOM.

If your change touches text transport, file paths, or saved data:

- preserve Chinese text end to end
- prefer explicit UTF-8 handling over ad hoc conversions
- run `npm run check:encoding` before submission

## Contribution Expectations

Please keep changes aligned with the existing architecture:

- extend the owning frontend feature or backend module instead of routing logic through unrelated files
- keep validation close to route contracts and reuse shared validation middleware
- prefer narrowly scoped changes over broad refactors unless a larger refactor is necessary to finish safely
- add or update tests when behavior, contracts, or shared workflow logic changes
- when touching workflow nodes, keep each node isolated in its own folder under `src/shared/workflow/node-definitions/<group>/<node>/`
- preserve compatibility entry files and registry surfaces unless the change explicitly includes a coordinated registry migration

## Documentation Policy

The `docs/` directory is intentionally reserved for stable public-facing project documentation.

At this stage, the maintained project docs are:

- `docs/user-guide.md`
- `docs/developer-guide.md`
- `docs/release-sop.md`
- `docs/deployment-variants-plan.md`
- `docs/backend-typescript-migration-plan.md`

Weekly execution notes, scratch plans, private rollout checklists, and similar process artifacts should stay outside the public documentation surface shipped with the repository.

Use these ownership buckets when you need a home for non-product files:

- keep repo-wide launchers and config at the root
- keep maintenance and validation helpers in `scripts/`
- keep private plans, local acceptance notes, and temporary implementation records in `.private-docs/`
- keep `development/` drained instead of treating it as a second documentation area

Root `src/lib/` has been removed after the shared helper migration. Do not recreate it, and do not introduce new `@/lib/*` imports. Place new shared runtime and provider-facing helpers under `src/shared/runtime/` or `src/shared/providers/`, place shared contracts under `src/shared/types/`, and place feature-local helpers under the owning feature tree.

Backend TypeScript migration work is tracked in `docs/backend-typescript-migration-plan.md`. Until that plan is implemented end to end, existing backend `.js` runtime files may be facades over `.ts` implementations; new backend behavior should land in TypeScript sources, not in parallel JavaScript implementations.

## Pull Request Notes

Helpful pull requests usually include:

- a short summary of the user-visible or developer-visible change
- any config, migration, or runtime impact
- the commands you ran to validate the change

If a change affects setup, runtime behavior, or repository conventions, update the matching public documentation in the same pull request.
