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

If you start only the frontend, make sure the Vite `/api` proxy still points to the backend you actually have running. When the backend is not on the default `http://localhost:3001`, set `VITE_DEV_PROXY_TARGET` before starting the frontend.

Start only the backend:

```bash
npm run dev:backend
```

Local-web variant:

```bash
npm.cmd run dev:local-web
```

- starts backend in `local-web` runtime mode
- starts Vite for browser-based local development
- opens the app in your default browser

Build local-web assets:

```bash
npm.cmd run build:local-web
```

Run the production-style local-web launcher:

```bash
npm.cmd run start:local-web
```

- builds frontend assets if needed
- serves `dist/` through the backend using `APP_FRONTEND_DIST`
- opens the browser against the backend-hosted app
- uses the same config-dir storage resolver as the desktop variant

Desktop variant:

```bash
npm.cmd run electron:dist
```

- builds the portable desktop package
- the desktop app is single-window by design
- launching the packaged app a second time should focus the existing window instead of opening a second main window

Server-web repository deployment:

- first-time setup can use `bash ./scripts/deploy/server-web/install.sh`
- later updates on the same host can use `bash ./scripts/deploy/server-web/update.sh`
- low-resource hosts should prefer prebuilt image updates with `bash ./scripts/deploy/server-web/update-image.sh`
- build and optionally push that image from a workstation with `bash ./scripts/deploy/server-web/build-image.sh`
- for the self-hosted Gitea container registry flow, build locally with `SUE_LR_IMAGE=git.suelr.com/sueadmin/suelr-studio:server-web SUE_LR_PUSH=1 bash ./scripts/deploy/server-web/build-image.sh`, then run `sudo docker compose -f /srv/suelr-studio/runtime/compose.yaml pull && sudo docker compose -f /srv/suelr-studio/runtime/compose.yaml up -d --no-build` on an existing image-based server deployment
- removal can use `bash ./scripts/deploy/server-web/uninstall.sh`
- the scripts refresh docker compose and nginx config together, so browser routing and app container stay aligned
- the scripts now sync a minimized runtime app directory under `runtime/app` before rebuilding, so the deployed host no longer needs to keep the full repository checkout as the live build context
- that sync uses `scripts/deploy/server-web/release-files.txt` as the release file manifest
- that minimized runtime app directory is intentionally release-only: it excludes repository docs, frontend tests, backend tests, and other development-only content
- prebuilt image updates do not run the frontend production build on the deployed host and do not pull source code by default; set `SUE_LR_PULL_SOURCE=1` only if you also want to refresh the checked-out deployment scripts before updating
- if the host was already deployed with the older repository-checkout flow, running `update.sh` once will migrate the live compose build context to the minimized `runtime/app` directory automatically
- `uninstall.sh` keeps runtime data by default; set `SUE_LR_REMOVE_DATA=1` if you really want to delete stored files and settings

Server-web authentication modes:

- the provided compose files and Dockerfile default to `APP_RUNTIME_MODE=server-multi-user`
- in `server-multi-user`, unauthenticated users see the login and registration screen before the main app
- public registration creates pending users; an administrator must approve the user before login is allowed
- `APP_ADMIN_ACCESS_KEY` protects only the independent admin console and `/api/admin/...`; it is not a normal app login password
- SMTP is optional; disabled or misconfigured SMTP must not block registration, approval, login, or password reset fallback flows
- `server-single-user` remains available only as an explicit compatibility override and uses the default `single-user/default` scope without a login gate

Existing server-web image deployment:

1. Choose the remote image name. Use the registry host, namespace, repository, and tag that your server will pull later:

   ```bash
   export SUE_LR_IMAGE=git.suelr.com/sueadmin/suelr-studio:server-web
   ```

2. Log in to the remote registry from the workstation or CI runner that builds and pushes the image:

   ```bash
   docker login git.suelr.com
   ```

3. Build the minimized server-web release tree, build the Docker image, and push it to the remote registry:

   ```bash
   SUE_LR_IMAGE=git.suelr.com/sueadmin/suelr-studio:server-web SUE_LR_PUSH=1 bash ./scripts/deploy/server-web/build-image.sh
   ```

   `build-image.sh` runs `scripts/build-server-web-release.mjs` first, so the Docker build context is `.server-web-release/app` rather than the full development checkout.

   On Windows PowerShell without a working Bash environment, run the equivalent commands from the repository root:

   ```powershell
   node .\scripts\build-server-web-release.mjs

   docker build `
     -t git.suelr.com/sueadmin/suelr-studio:server-web `
     -f .\.server-web-release\app\scripts\deploy\server-web\Dockerfile `
     .\.server-web-release\app

   docker push git.suelr.com/sueadmin/suelr-studio:server-web
   ```

4. Log in to the same registry once on the server:

   ```bash
   docker login git.suelr.com
   ```

5. Keep `/srv/suelr-studio/runtime/compose.yaml` image-based:

   ```yaml
   services:
     suelr-studio:
       image: git.suelr.com/sueadmin/suelr-studio:server-web
       container_name: suelr-studio
       restart: unless-stopped
       ports:
         - "127.0.0.1:3001:3001"
         - "127.0.0.1:3002:3002"
       environment:
         APP_ALLOWED_ORIGINS: https://studio.suelr.com,https://admin.studio.suelr.com
         APP_ADMIN_ACCESS_KEY: change-this-admin-key
         APP_RUNTIME_MODE: server-multi-user
         APP_CONFIG_DIR: /data
       volumes:
         - ./data:/data
   ```

6. Pull and restart without rebuilding on the server:

   ```bash
   cd /srv/suelr-studio/runtime
   sudo docker compose -f compose.yaml pull
   sudo docker compose -f compose.yaml up -d --no-build
   ```

If the server also has a current source checkout and should refresh the repository-provided image compose file and nginx config, run the scripted image update instead:

```bash
SUE_LR_IMAGE=git.suelr.com/sueadmin/suelr-studio:server-web bash ./scripts/deploy/server-web/update-image.sh
```

`update-image.sh` lives in the source checkout, not in `/srv/suelr-studio/runtime`. If the server does not keep a source checkout, update `/srv/suelr-studio/runtime/compose.yaml` and `/etc/nginx/sites-available/studio.suelr.com` manually, then run the two compose commands above plus `sudo nginx -t && sudo systemctl reload nginx`.

The public app reverse-proxies to `127.0.0.1:3001`. The independent admin console runs on `127.0.0.1:3002`; expose it with a separate nginx server such as `admin.studio.suelr.com`, and include that origin in `APP_ALLOWED_ORIGINS`. The admin console access key is `APP_ADMIN_ACCESS_KEY`; it is checked by `/api/admin/...` and is separate from regular app user login.

After updating nginx and compose, verify both admin routes from the server:

```bash
curl -I https://admin.studio.suelr.com
curl -I http://127.0.0.1:3002/admin.html
curl -sS -X POST http://127.0.0.1:3002/api/admin/access/validate \
  -H 'Content-Type: application/json' \
  -d '{"accessKey":"<admin-access-key>"}'
```

To test the multi-user login path on a prepared release candidate, keep `APP_RUNTIME_MODE=server-multi-user`, restart the deployment, open the public app, submit a registration request, approve it from the independent admin console, and then sign in as the approved user. Use `APP_RUNTIME_MODE=server-single-user` only when you intentionally need the legacy no-login compatibility mode.

Default local addresses:

- Frontend: `http://localhost:5173`
- Backend health check: `http://127.0.0.1:3001/api/health`

## Main User Flows

### 1. First-time setup

On first launch, the onboarding page only saves connection info and discovers remote models. It does not auto-enable those models for Chat, Image, Video, or Workflow use.

After onboarding, open `Settings` and complete this order:

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

Important rule:

- discovered models are not the same as enabled project models
- product model pickers only show models that you explicitly imported and enabled in `Settings -> Models`

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

Workflow management:

- `New` starts a local draft. Save it before relying on it as a reusable workflow.
- `Save` writes the current workflow to the backend workflow store. The toolbar shows whether the canvas is still a local draft, has unsaved changes, is saving, or was saved recently.
- `Duplicate` creates a copy of the current workflow and opens the copy.
- `Delete` asks for confirmation and explains whether the current item is a saved workflow or only a local draft.
- `Import` reports migrations, warnings, ignored fields, and ID conflicts. Conflict handling can generate a new ID, preserve the imported ID, or overwrite the existing workflow when that mode is selected.

Execution behavior:

- `Execute` starts a backend workflow run and streams progress to the canvas.
- `Stop` is the explicit way to cancel a running workflow.
- Closing the browser tab, refreshing the page, or losing the streaming connection does not by itself cancel the backend run. The app can recover run status by polling after reconnecting.
- If a run finishes while the stream is disconnected, the latest terminal status is still available from the run-status endpoint for recovery.

Common node groups:

- input nodes
- AI nodes
- merge nodes
- output nodes
- group nodes

Text input:

- `文本输入` can also accept an optional upstream text connection; when connected with non-empty text, that upstream value replaces the text written inside the node for that run

Text cleanup:

- use `文本清理` to remove content between custom start and end keywords before passing model output to the next AI node
- the default range is `<think>` through `</think>`, which is useful for stripping explicit thinking blocks from upstream responses
- if the end keyword is missing, the node leaves that unmatched section unchanged instead of guessing what to remove

Itemized runs:

- use `文本逐项` when several text inputs should drive the same downstream chain one by one
- the node uses dynamic text inputs like merge nodes: it starts with one input and adds the next input as connections are made
- each run exposes only the current text to downstream nodes; downstream nodes stay ordinary single-input nodes
- execution is sequential, empty text inputs are skipped, and the first failed item stops later items while preserving earlier completed outputs
- use `图像逐项` when several image inputs should drive the same downstream chain one by one
- the image variant follows the same sequential replay model, but exposes only the current image to downstream nodes on each pass

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
- use `Alt+G` to create a group from the current node selection
- use `Ctrl+Shift+Enter` to start workflow execution from the keyboard
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

Runtime-specific behavior:

- in `desktop` and `local-web`, the settings page can offer local path selection and backend restart when the runtime exposes those capabilities
- in `server-web`, the same `外部数据路径` entry stays visible, but it represents the current browser user's local auto-download target rather than the server host storage directory
- in `server-web`, backend restart stays unavailable from the browser UI
- when a server runtime blocks a host-only action, `Settings -> Diagnostics` shows the active runtime mode and capability snapshot so the reason is visible in the UI

What gets stored there:

- workflows
- uploaded files
- generated files
- logs
- memories
- runtime settings

Generated media is organized under the app data root:

- `files/generated/images/`: raw image-generation outputs from Image, Chat tool calls, and workflow image generation
- `files/generated/videos/`: raw synchronous or downloaded video-generation outputs from tool/workflow execution
- `files/generated/assistant-images/`: images explicitly saved into the Chat/assistant gallery
- `files/generated/assistant-videos/`: videos explicitly saved into the Chat/assistant video gallery

All generated files are still served through `/api/outputs/...` or `/api/assistant/files/...`, so display and reuse flows keep using local URLs rather than absolute filesystem paths.

In `server-web`, generated files may be stored temporarily on the server before you download them. The settings path shown in the browser does not change the server host storage directory.

In `Workflow -> 结果`, `server-web` can expose a `清空服务器结果` action. This deletes the server's currently retained temporary output history directly. The action is irreversible, so the UI will ask for confirmation first.

If `APP_CONFIG_DIR` is set in the environment, it overrides the in-app storage path setting.

### 7. Restart backend from Settings

`Settings -> Defaults` includes a `Restart Backend` button.

This is mainly used after changing storage-root-related settings.

In `local-web`, this button is still valid because the backend is running on the same local machine as the browser UI.

In `server-web`, this button is intentionally disabled. Restart must be handled by the deployment-side process manager or service supervisor.

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
