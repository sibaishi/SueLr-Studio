# Week 12 Release Discipline And Observability

## Weekly Goal

Week 12 turns the previous eleven weeks of cleanup into a release habit the
project can keep using.

The point is not to add another feature. The point is to make release,
regression selection, and first-response debugging more repeatable.

## Delivered This Week

### 1. Release Checklist

`docs/ops/release-checklist.md` now defines the minimum release gate:

- which automated checks must pass
- how to classify a change before release
- which manual smoke steps are always required
- when docs must move with code
- what release record must be captured

This moves the project from ad hoc release memory to a stable checklist.

### 2. Regression Matrix

`docs/ops/regression-matrix.md` now maps risky change areas to the expected
verification lanes.

Covered areas include:

1. workflow editor
2. workflow execution
3. settings
4. provider contract
5. image and media chain
6. storage and files
7. frontend shell
8. docs-only process changes

### 3. Triage Entry Points

`docs/ops/triage-entrypoints.md` now captures the minimum debugging map for:

- startup and configuration failures
- workflow execution failures
- provider and media request failures
- frontend-only failures
- release-day triage order

This is intentionally lightweight. It gives a stable first place to look
without introducing a heavy observability platform.

### 4. Release Rhythm Rules

`docs/ops/release-rhythm.md` now records the minimum maintenance discipline for:

- per-change proof expectations
- per-release record expectations
- per-regression follow-up expectations
- which long-lived documents must stay aligned

### 5. Lightweight Release Docs Gate

The repo now includes `npm run check:release-docs`, backed by
`scripts/check-release-docs.mjs`.

`npm run check` now enforces that the Week 12 release documents exist and
contain their required sections.

## Verification Result

Week 12 closes when the following pass together:

- `npm run check:release-docs`
- `npm run check`
- one manual review pass across the release checklist, regression matrix, and
  triage entrypoints

## Why This Matters

Weeks 9 through 11 made the codebase safer to change.

Week 12 makes the release process safer to repeat:

1. change risk now maps to an explicit regression lane
2. debugging starts from a documented entry point instead of guesswork
3. release proof is expected to leave behind a small record
4. release-process docs are now guarded by the repo quality gate

## Conclusion

Week 12 is complete once the release checklist, regression matrix, triage
entrypoints, release-rhythm note, and release-docs gate all land together.
