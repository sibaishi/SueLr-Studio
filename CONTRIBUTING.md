# Contributing

Thanks for taking a look at SueLr Studio.

This project is maintained as a local-first multimodal studio. The main contribution goal is to improve product behavior without making the repository harder to understand or operate.

## Local Setup

Requirements:

- Node.js `>=22.12.0`
- npm

Install dependencies from the repository root:

```bash
npm install
npm run install:all
```

Start frontend and backend together:

```bash
npm run dev
```

Default local addresses:

- frontend: `http://localhost:5173`
- backend: `http://127.0.0.1:3001`

If Windows PowerShell blocks `npm.ps1`, run commands through:

```bash
cmd /c npm run dev
```

Convenience launchers are also available at the repo root:

- `start.bat`
- `start.sh`

They install missing dependencies and then start the combined dev flow.

## First Local Pass

For a clean newcomer sanity check:

1. Install dependencies with `npm install` and `npm run install:all`.
2. Start the app with `npm run dev`.
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

Run end-to-end smoke coverage when your change touches user-facing flows:

```bash
npm run test:e2e
```

If this is the first E2E run on the machine, install the Playwright browser first:

```bash
npm run test:e2e:install
```

## Contribution Expectations

Please keep changes aligned with the existing architecture:

- extend the owning frontend feature or backend module instead of routing logic through unrelated files
- keep validation close to route contracts and reuse shared validation middleware
- prefer narrowly scoped changes over broad refactors unless a larger refactor is necessary to finish safely
- add or update tests when behavior, contracts, or shared workflow logic changes

## Documentation Policy

The `docs/` directory is intentionally reserved for stable public-facing project documentation.

At this stage, the maintained project docs are:

- `docs/user-guide.md`
- `docs/developer-guide.md`

Weekly execution notes, scratch plans, private rollout checklists, and similar process artifacts should stay outside the public documentation surface shipped with the repository.

## Pull Request Notes

Helpful pull requests usually include:

- a short summary of the user-visible or developer-visible change
- any config, migration, or runtime impact
- the commands you ran to validate the change

If a change affects setup, runtime behavior, or repository conventions, update the matching public documentation in the same pull request.
