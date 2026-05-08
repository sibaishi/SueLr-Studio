# SueLr Studio User Guide

## Overview

SueLr Studio is a local-first multimodal studio with four main work areas:

- `Chat`: talk to configured chat models, attach files, and reuse generated assets
- `Image`: submit image generation or edit requests and manage results
- `Workflow`: build node-based automation flows on a canvas and run them locally
- `Settings`: configure providers, models, roles, memory, diagnostics, and storage

The app is split into:

- Frontend: `http://localhost:5173`
- Backend API: `http://127.0.0.1:3001`

Current product status:

- Chat is available
- Image generation is available
- Workflow is available
- Video UI is retained, but video capability is still a reserved or incomplete area

## Install

### Environment

- Node.js `>= 22.12.0`

### Dependencies

Run these commands in the repository root:

```bash
npm install
npm run install:all
```

What they do:

- `npm install`: installs frontend and repo-level tooling
- `npm run install:all`: installs backend dependencies under `backend/`

If PowerShell blocks `npm.ps1`, use:

```bash
cmd /c npm install
cmd /c npm run install:all
```

## Start The App

Start the app with the one-click launcher:

```bash
npm start
```

On Windows, double-click `start.bat` or run it from Command Prompt. On macOS or Linux, run `./start.sh`.

What the launcher does:

- checks Node.js `>= 22.12.0`
- installs missing root and backend dependencies
- starts backend first, then frontend
- picks the next available port if the default port is already occupied
- writes logs to `.run-logs/`
- opens the frontend in your default browser

For manual development, start both frontend and backend together:

```bash
npm run dev
```

Start only the frontend:

```bash
npm run dev:frontend
```

Start only the backend:

```bash
npm run dev:backend
```

Default local addresses:

- Frontend: `http://localhost:5173`
- Backend health check: `http://127.0.0.1:3001/api/health`

## Main User Flows

### 1. First-time setup

Open `Settings` and complete this order:

1. `Connection`
   - Fill in `Base URL`
   - Fill in `API Key`
   - Adjust provider auth mode only if your upstream requires it
   - Run connection test and model discovery
2. `Models`
   - Import the discovered models into the project model library
   - Mark each model with the right capability type such as `chat`, `image`, or `video`
   - Enable only the models you actually want to use
3. `Defaults`
   - Choose theme mode
   - Optionally set an external data path
   - If you changed the external data path, click `Restart Backend` after saving

### 2. Use Chat

In `Chat`, you can:

- create and switch conversations
- choose a role
- choose a chat model
- upload attachments
- optionally enable web search when supported
- reuse assets produced by image or workflow runs

Typical flow:

1. Open `Chat`
2. Create or switch to a conversation
3. Choose role and model
4. Enter your message
5. Submit and continue the thread

### 3. Use Image

In `Image`, you can:

- choose an image model
- enter prompt text
- switch between text-to-image and reference or edit-style flows
- control size, ratio, quality, count, and output format
- preview and download results
- send results back into chat

Typical flow:

1. Open `Image`
2. Choose a model
3. Enter prompt text
4. Add reference image if needed
5. Submit generation
6. Review results in the gallery and task area

### 4. Use Workflow

`Workflow` is the canvas-based automation studio.

Main areas:

- top toolbar: workflow switching, save, import/export, execute, stop
- left sidebar: node library
- center canvas: nodes and edges
- right results panel: outputs, logs, preflight issues
- bottom status bar: graph and execution summary

Typical flow:

1. Open `Workflow`
2. Add nodes from the left panel, or double-click blank canvas space to open the centered node picker
3. Connect them on the canvas
4. Edit node parameters
5. Save the workflow
6. Click `Execute`
7. Read outputs and logs in the results panel

Common node groups:

- input nodes
- AI nodes
- merge nodes
- output nodes
- group nodes

Text cleanup:

- use `文本清理` to remove content between custom start and end keywords before passing model output to the next AI node
- the default range is `<think>` through `</think>`, which is useful for stripping explicit thinking blocks from upstream responses
- if the end keyword is missing, the node leaves that unmatched section unchanged instead of guessing what to remove

Itemized runs:

- use `逐项运行` when several text inputs should drive the same downstream chain one by one
- the node uses dynamic text inputs like merge nodes: it starts with one input and adds the next input as connections are made
- each run exposes only the current text to downstream nodes; downstream nodes stay ordinary single-input nodes
- execution is sequential, empty text inputs are skipped, and the first failed item stops later items while preserving earlier completed outputs

Workflow node organization notes:

- image generation and video generation are both standard AI nodes in the workflow canvas
- each workflow node is maintained as an isolated definition internally, which helps future fixes land without changing the canvas behavior you already see
- this internal organization does not change existing workflow JSON shape, node types, or normal editor usage

Workflow groups:

- group selected nodes when a canvas area becomes too crowded
- collapse a group to keep the canvas readable while preserving the internal nodes
- use group input and output ports to route connections across the group boundary
- drag from a group port toward the inside of the group to create an internal connection
- drag from a group port toward the outside of the group to create an external connection
- connect external nodes to group ports instead of wiring every internal node directly
- ungroup when you need to return the child nodes to the main canvas

Canvas interaction notes:

- double-click blank canvas space to open the centered `New Node` panel
- right-click blank canvas space to open the lightweight action menu, including `Paste Node`
- right-click selected nodes to open node or multi-node actions
- use `Ctrl+C` to copy selected nodes or groups
- use `Ctrl+V` to paste near the current mouse position on the canvas

### 5. Use Save File in Workflow

The `Save File` node writes output content to disk.

Important behavior:

- if no output directory is configured, the node skips the write but still passes content downstream
- if an output directory is configured, it writes files to that target path

This is useful for:

- text results
- generated images
- other serialized outputs

### 6. External data path

By default, runtime data does not need to live inside the repo itself.

Default app data root:

- Windows: `%APPDATA%\\SueLr-Studio`
- macOS: `~/Library/Application Support/SueLr-Studio`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/SueLr-Studio`

You can override that from `Settings -> Defaults`.

What gets stored there:

- workflows
- uploaded files
- generated files
- logs
- memories
- runtime settings

If `APP_CONFIG_DIR` is set in the environment, it overrides the in-app storage path setting.

### 7. Restart backend from Settings

`Settings -> Defaults` includes a `Restart Backend` button.

This is mainly used after changing storage-root-related settings.

Safety rule:

- if the project is currently busy with chat, image generation, workflow execution, or other running tasks, restart is blocked and the UI asks you to try again later

## Troubleshooting

### Frontend does not load

Check:

- the terminal running `npm start`, `start.bat`, or `start.sh` is still open
- the frontend URL printed by the launcher
- the backend health URL printed by the launcher
- the latest `.run-logs/frontend-dev-*.log` and `.run-logs/backend-dev-*.log`

### Settings saved but external path did not take effect

That is expected until backend restart.

Do this:

1. save the path in `Settings -> Defaults`
2. click `Restart Backend`
3. wait for backend to come back

### API connects but models do not show up where you need them

Discovery alone is not enough.

You must:

1. discover models in `Settings -> Connection`
2. import them in `Settings -> Models`
3. mark capability type correctly

### Chinese text or file names look garbled

The project now includes an explicit encoding check for common regressions.

If you are validating a local build or reviewing a text-handling change, run:

```bash
npm run check:encoding
```
