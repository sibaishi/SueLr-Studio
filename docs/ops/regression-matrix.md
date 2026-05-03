# Regression Matrix

## Scope

This matrix maps risky change areas to the minimum verification SueLr Studio
expects before release.

Use it together with `docs/ops/release-checklist.md`.

## Matrix

| Area | Typical change | Automated gates | Manual smoke | Primary risk |
| --- | --- | --- | --- | --- |
| Workflow editor | node add/remove/connect, grouping, undo, toolbar actions | `npm run check`, `npm run test:unit`, `npm run test:e2e` | create node, undo, open workflow page | editor regression reaches users immediately |
| Workflow execution | runtime state, restore, SSE, run logging | `npm run check`, `npm run test:unit`, `npm run test:backend` | run one workflow and inspect log output | failures may only show during execution |
| Settings | provider config, model sync, persistence | `npm run check`, `npm run test:e2e`, `npm run test:backend` | save settings, reload, run connection test | bad config blocks the whole app |
| Provider contract | request body, headers, endpoint mapping, error normalization | `npm run check`, `npm run test:backend` | run one real provider call in changed path | upstream integration can fail while UI still loads |
| Image and media chain | image generation, edit, download, upload, video submit/status | `npm run check`, `npm run test:backend` | run one real media request and verify output path | long-running or binary flows fail differently from text |
| Storage and files | runtime root, uploads, generated files, logs | `npm run check`, `npm run test:backend` | confirm files are written to expected runtime directory | path bugs can look like feature bugs |
| Frontend shell | navigation, panels, startup hydration, error boundary | `npm run check`, `npm run test:e2e` | open app, switch panels, reload once | shell regressions block every feature |
| Docs only | release docs, architecture notes, checklists | `npm run check:release-docs` | read changed doc links once | docs can drift from real workflow |

## Change Mapping Rules

Use the highest-risk matching row, and add every additional row that also
applies.

Examples:

1. if a change touches workflow store execution restore logic, run both
   `Workflow editor` and `Workflow execution`
2. if a change touches provider request shaping for images, run both
   `Provider contract` and `Image and media chain`
3. if a change only updates release process docs, run `Docs only`

Do not down-scope verification just because a change looks small. If the change
crosses a boundary, verify both sides.
