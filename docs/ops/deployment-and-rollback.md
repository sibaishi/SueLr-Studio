# Deployment And Rollback

## 1. Scope

This document captures the minimum deploy, release verification, and rollback
steps for SueLr Studio after Week 9 hardening.

The goal is not platform-specific automation yet. The goal is to make releases
repeatable and reversible.

## 2. Release Inputs

Before deployment, confirm:

1. current branch has passed `npm run check`
2. target environment uses Node `22.17.0` or another version within `>=22.12.0 <23`
3. target environment has both root and `backend/` dependencies installed
4. required environment variables are prepared from `.env.example`
5. rollback target is known before release starts

## 3. Build And Start

Install dependencies:

```bash
npm ci
npm ci --prefix backend
```

Build frontend:

```bash
npm run build
```

Start backend:

```bash
npm run start:backend
```

Expected artifacts and runtime pieces:

- frontend build output: `dist/`
- backend runtime entry: `backend/server.js`
- runtime data root: `APP_CONFIG_DIR` or platform default config directory

## 4. First-Time Deployment Checks

1. confirm backend host and port are correct
2. confirm frontend can reach `/api`
3. confirm CORS origins match actual frontend address
4. confirm runtime data directory is writable
5. confirm required logs can be written

## 5. Release Smoke Checklist

Run the minimum manual smoke after deployment:

1. open workflow page
2. open settings page
3. load existing settings or create a minimal provider config
4. save settings successfully
5. run one minimal workflow
6. confirm workflow logs and generated outputs can be written

The detailed Week 9 checklist lives in:

- `docs/testing/week-9-ci-and-release-hardening-checklist.md`

## 6. Rollback Procedure

If release validation fails:

1. stop the new backend process
2. switch application code back to the last known good revision
3. reinstall dependencies if lockfiles changed
4. rebuild frontend if the reverted revision requires it
5. restart backend with the reverted revision
6. re-run the minimum smoke checklist

Rollback must prefer code rollback over runtime data deletion.
Do not delete user data, generated files, or logs as a first response.

## 7. Release Record Template

For each release, capture:

- release date
- revision or commit id
- operator
- environment
- `npm run check` result
- smoke result
- rollback target
- notable config changes

This record can live in your normal release notes, issue tracker, or ops log.
