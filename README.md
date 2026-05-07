# SueLr Studio

SueLr Studio is a local-first multimodal studio for chat, image, video, and workflow-based AI tasks.

It is built for people who want a desktop-style AI workspace on their own machine: configure providers, run multimodal tasks, assemble workflows on canvas, and keep runtime data under local control.

## What This Repository Ships

- a Vite + React frontend for chat, image, video, and workflow editing
- an Express-based local backend for provider access, workflow runtime, files, and settings
- a local-first runtime model that stores app data outside the repository by default
- repository quality gates for docs, runtime boundaries, workflow store structure, tests, and builds

## Project Status

This repository is actively maintained as a local application project, not a hosted multi-user SaaS.

Current public documentation is intentionally small:

- [User Guide](docs/user-guide.md)
- [Developer Guide](docs/developer-guide.md)

## Quick Start

### Requirements

- Node.js `>=22.12.0`
- npm

### Install

```bash
npm install
npm run install:all
```

### Start

```bash
npm start
```

Windows PowerShell may block `npm.ps1` depending on local execution policy. If that happens, use:

```bash
start.bat
```

Default local addresses:

- frontend: `http://localhost:5173`
- backend: `http://127.0.0.1:3001`

## Typical Use

SueLr Studio is organized around four everyday flows:

1. Configure providers and model access from settings.
2. Run direct chat, image, and video tasks.
3. Build and execute workflows on the canvas, including centered node picking, grouped nodes, and keyboard copy-paste.
4. Review outputs, logs, generated files, and workflow run details locally.

## Runtime Data

Runtime data is stored in the system config directory by default instead of the repository `storage/` folder:

```text
Windows: %APPDATA%\SueLr-Studio
macOS:   ~/Library/Application Support/SueLr-Studio
Linux:   ${XDG_CONFIG_HOME:-~/.config}/SueLr-Studio
```

Set `APP_CONFIG_DIR` if you want to pin runtime data to a custom absolute path.

## Common Commands

```bash
npm start
npm run dev
npm run dev:frontend
npm run dev:backend
npm run build
npm run check
npm run electron:dist
npm run test:e2e
npm run test:e2e:install
```

`start.bat` and `start.sh` are convenience launchers for `npm start`. The one-click launcher checks the Node.js version, installs missing root and backend dependencies, finds available frontend/backend ports, writes timestamped logs under `.run-logs/`, opens the browser, and stops both processes on `Ctrl+C`.

`npm run dev` remains available for maintainers who want the simpler combined development command without launcher orchestration.

## Repository Layout

```text
src/            frontend application code
backend/        backend server and feature modules
tests/          frontend unit and end-to-end verification
docs/           public project documentation
scripts/        repository quality-gate scripts
workflows/      example workflow files
```

## Contributing

External collaboration is welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, validation commands, and repository conventions.
For a first contributor pass, run the app locally once, then use `npm run check`, and install Playwright with `npm run test:e2e:install` before your first local `npm run test:e2e`.

## License Status

This repository does not currently declare an open-source license file.
If you plan to publish it for broader reuse, the license choice should be made explicitly before treating it as an open-source distribution.
