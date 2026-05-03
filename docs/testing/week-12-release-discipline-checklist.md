# Week 12 Release Discipline Checklist

## Goal

Confirm that Week 12 converted release knowledge, regression mapping, and
triage entrypoints into repeatable project discipline.

## Automated Verification

- [x] `npm run check:release-docs` passes
- [x] release docs are part of `npm run check`
- [x] release checklist exists under `docs/ops/release-checklist.md`
- [x] regression matrix exists under `docs/ops/regression-matrix.md`
- [x] triage entrypoints exist under `docs/ops/triage-entrypoints.md`
- [x] release rhythm note exists under `docs/ops/release-rhythm.md`

## Manual Review

- [x] read the release checklist once from top to bottom
- [x] confirm a risky change can be mapped to the regression matrix
- [x] confirm the first debugging entrypoint is documented for backend,
  frontend, and provider/media failures
- [x] confirm `docs/README.md`, the Week 12 roadmap note, and ops docs point to
  the same release process

## Pass Criteria

Week 12 is complete when all of the following are true:

1. release flow is documented as a fixed checklist
2. automated and manual regression expectations are mapped by risk area
3. debugging starts from stable entrypoints instead of memory
4. the release-process docs are guarded by the quality gate
