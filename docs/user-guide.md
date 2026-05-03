# User Guide

## Overview

SueLr Studio is a local-first multimodal studio for chat, image, video, and workflow-based AI tasks.
The frontend runs in the browser, and the backend provides local API, file, workflow, and provider access.

## Install

Install frontend dependencies in the repository root:

```bash
npm install
```

Install backend dependencies:

```bash
npm install --prefix backend
```

You can also run:

```bash
npm run install:all
```

## Start The App

Start frontend and backend together:

```bash
npm run dev
```

Frontend only:

```bash
npm run dev:frontend
```

Backend only:

```bash
npm run dev:backend
```

Default local addresses:

- frontend: `http://localhost:5173`
- backend: `http://127.0.0.1:3001`

On Windows PowerShell, if script policy blocks `npm.ps1`, use:

```bash
cmd /c npm run dev
```

## Main User Flows

The current app focuses on four daily flows:

1. Configure providers and model access from the settings area.
2. Use chat, image, and video panels for direct generation tasks.
3. Build workflows on the canvas and run them from the workflow editor.
4. Review outputs, logs, generated files, and workflow run details locally.

Runtime data is stored in the system config directory by default instead of the repo `storage/` folder:

```text
Windows: %APPDATA%\SueLr-Studio
macOS:   ~/Library/Application Support/SueLr-Studio
Linux:   ${XDG_CONFIG_HOME:-~/.config}/SueLr-Studio
```

Set `APP_CONFIG_DIR` if you want to pin data to a custom absolute path.

## Troubleshooting

- If the frontend cannot reach the backend, confirm the backend is running on `127.0.0.1:3001`.
- If you change host or port settings, update `.env` and restart both frontend and backend.
- If a port is already in use, stop the old process before restarting the app.
- If provider calls fail, verify base URL, API key, and model configuration in settings.
- If local data looks stale, inspect the active `APP_CONFIG_DIR` path rather than the repo `storage/` folder.
