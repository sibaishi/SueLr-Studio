# SueLr Studio

SueLr Studio is a local-first multimodal studio for chat, image, video, and workflow-based AI tasks.

Project documentation shipped with the repository is intentionally minimal:

- [User Guide](docs/user-guide.md)
- [Developer Guide](docs/developer-guide.md)

## Overview

This repository is organized as a browser frontend plus a local backend:

- frontend: React + Vite + TypeScript
- backend: Express-based local API and workflow runtime
- focus areas: chat, image, video, workflow editing, local file/runtime storage

The project is designed first for local desktop-style use rather than multi-user hosted deployment.

## Quick Start

```bash
npm install
npm install --prefix backend
npm run dev
```

On Windows PowerShell, if script policy blocks `npm.ps1`, use:

```bash
cmd /c npm run dev
```

Default local addresses:

- frontend: `http://localhost:5173`
- backend: `http://127.0.0.1:3001`

## Runtime Data

Runtime data is stored in the system config directory by default instead of the repo `storage/` folder:

```text
Windows: %APPDATA%\SueLr-Studio
macOS:   ~/Library/Application Support/SueLr-Studio
Linux:   ${XDG_CONFIG_HOME:-~/.config}/SueLr-Studio
```

Set `APP_CONFIG_DIR` if you want to pin runtime data to a custom absolute path.

## Common Commands

```bash
npm run dev
npm run dev:frontend
npm run dev:backend
npm run build
npm run check
npm run test:e2e
```

## Repository Layout

```text
src/            frontend application code
backend/        backend server and feature modules
tests/          frontend unit and end-to-end verification
docs/           public project documentation
scripts/        repository quality-gate scripts
workflows/      example workflow files
```
