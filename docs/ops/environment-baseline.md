# Environment Baseline

## 1. Scope

This document defines the single source of truth for SueLr Studio local setup,
CI execution, and deployment runtime assumptions.

Week 9 freezes the environment baseline so that local debugging, CI validation,
and release execution all use the same expectations.

## 2. Node And Package Baseline

- Node: `22.17.0`
- Supported range: `>=22.12.0 <23`
- Package manager: `npm`
- Lockfiles:
  - root: `package-lock.json`
  - backend: `backend/package-lock.json`

Recommended commands:

```bash
npm install
npm install --prefix backend
```

Or:

```bash
npm run install:all
```

## 3. Repository Entry Points

- frontend dev: `npm run dev:frontend`
- backend dev: `npm run dev:backend`
- full local dev: `npm run dev`
- frontend build: `npm run build`
- backend start: `npm run start:backend`
- quality gate: `npm run check`

On Windows PowerShell, if script policy blocks `npm.ps1`, use:

```bash
cmd /c npm run check
```

## 4. Required Environment Variables

The repository provides `.env.example` as the baseline template.

Core variables:

- `VITE_API_BASE`: frontend API base path, default `/api`
- `APP_PORT`: backend port, default `3001`
- `APP_HOST`: backend host, default `127.0.0.1`
- `APP_ALLOWED_ORIGINS`: allowed frontend origins for backend CORS
- `APP_CONFIG_DIR`: runtime config, files, workflows, and logs root
- `APP_STORAGE_DIR`: legacy compatibility variable, lower priority
- `APP_ALLOW_PRIVATE_PROVIDER_URLS`: explicit opt-in for non-loopback private provider access

## 5. Runtime Data Baseline

Default runtime data is stored in the system user config directory instead of
the repository `storage/` directory.

Default directories:

```text
Windows: %APPDATA%\SueLr-Studio
macOS:   ~/Library/Application Support/SueLr-Studio
Linux:   ${XDG_CONFIG_HOME:-~/.config}/SueLr-Studio
```

Typical subdirectories:

- `workflows/`
- `files/uploads/`
- `files/generated/`
- `logs/`

## 6. Local Bring-Up Baseline

1. Install root dependencies: `npm install`
2. Install backend dependencies: `npm install --prefix backend`
3. Copy `.env.example` to `.env` if custom values are needed
4. Start local development: `npm run dev`
5. Open frontend: `http://localhost:5173`
6. Confirm backend is reachable through `/api`

## 7. CI Baseline

Week 9 introduces remote CI in `.github/workflows/ci.yml`.

Current CI contract:

1. checkout repository
2. setup Node from `.nvmrc`
3. run `npm ci`
4. run `npm ci --prefix backend`
5. run `npm run check`

Any future toolchain upgrade should update these three places together:

- `.nvmrc`
- root `package.json` engines
- `backend/package.json` engines
