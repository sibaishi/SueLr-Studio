# Release Checklist

## Scope

This checklist is the Week 12 release gate for SueLr Studio.

Use it before every deploy, whether the change is local-only, a manual server
update, or a future automated release.

## Automated Gates

These checks must pass before a release is allowed to move forward:

1. `npm run check`
2. `npm run test:e2e` for changes touching workflow UI, settings UI, or other
   user-facing flows already covered by Playwright
3. any focused test lane added for the feature area being changed

Minimum rule:

- no release goes out on a red local gate
- no skipped test is accepted without being called out in the release record

## Change Classification

Map the change first, then pick the matching regression work:

1. workflow editor or store logic
2. workflow execution or logs
3. settings or provider configuration
4. image, video, or file transfer chain
5. backend contract or storage boundary
6. documentation-only change

Use `docs/ops/regression-matrix.md` to decide the exact automated and manual
checks required for the change.

## Manual Smoke

Run this minimum smoke after build or deploy:

1. open the app shell
2. open settings and verify saved configuration loads
3. run provider connection test when provider-related code changed
4. open workflow page and add a node
5. run one minimal workflow
6. confirm logs or outputs can be written when execution-related code changed

When image, video, or file transfer logic changed, also verify one real media
request in the affected path.

## Documentation Updates

Before release, confirm whether the change also requires updates to:

- `docs/README.md`
- the matching weekly roadmap note
- the matching weekly testing checklist
- `docs/ops/deployment-and-rollback.md`
- `docs/ops/regression-matrix.md`
- `docs/ops/triage-entrypoints.md`

Rule: if the way we verify or debug the system changed, the docs must move in
the same commit.

## Rollback Readiness

Before starting deployment, record:

1. current commit id being released
2. last known good commit id
3. whether lockfiles changed
4. whether env or runtime path expectations changed

If release validation fails, follow
`docs/ops/deployment-and-rollback.md` immediately instead of improvising.

## Release Record

Capture one short release note for every deployment:

- date
- operator
- target environment
- commit id
- result of `npm run check`
- result of `npm run test:e2e` when applicable
- manual smoke result
- rollback target
- notable config or env changes
- known follow-up items
