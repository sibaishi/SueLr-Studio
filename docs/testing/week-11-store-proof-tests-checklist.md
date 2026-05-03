# Week 11 Store Proof Tests Checklist

## Goal

Confirm that Week 11 establishes a first repeatable proof layer for high-risk workflow store behavior and strengthens the boundaries that protect that layer from drifting back into large composition files.

## Automated Verification

- [x] Workflow store logic has an independent frontend unit-test entry point
- [x] Node deletion and edge replacement logic are covered
- [x] Merge node sizing normalization is covered
- [x] Group creation / ungroup recovery logic is covered
- [x] Workflow load / hydration / import runtime reset logic is covered
- [x] Execution preflight / restore / resync logic is covered
- [x] `store.ts` remains a thin entry and composition layer
- [x] `editor.ts` remains a thin editor composition layer
- [x] Structure checks now enforce proof-test and boundary-doc presence
- [x] Editor / document / execution boundary documentation is in place

## Manual Review

- [x] New tests are logic-first unit tests, not pseudo-E2E rewrites
- [x] Boundary checks protect module responsibilities instead of formatting trivia
- [x] Editor / document / execution responsibilities are documented in one place
- [x] A future contributor can now tell where to patch logic and what proof to add

## Pass Criteria

Week 11 is complete when these all hold:

1. `npm run test:unit` passes
2. `npm run check:workflow-store` passes
3. `npm run check` passes
4. the new docs and tests clearly point developers toward the correct workflow-store layer
