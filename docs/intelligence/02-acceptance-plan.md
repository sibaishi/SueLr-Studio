# Acceptance Plan

## Acceptance Philosophy

The intelligence program must be accepted as a set of reliable production loops, not as isolated model demos.

Every accepted phase must prove:

- the feature is grounded in existing SueLr Studio architecture
- data is stored under the runtime resolver
- backend inputs are validated
- errors are normalized
- user-visible Chinese text remains UTF-8
- workflow state ownership rules are preserved
- side effects are approved when required
- traces are sufficient to debug wrong behavior

## Phase Acceptance Gates

### Phase 0 Acceptance

Required checks:

```bash
npm run check:docs
npm run check:encoding
```

Manual acceptance:

- Public docs explain the intelligence program.
- Docs gate allows only approved public planning docs.
- Existing Agent module is documented as legacy or transitional.
- No private scratch notes are stored under `docs/`.

### Phase 1 Acceptance

Required checks:

```bash
npm run typecheck
npm run test --prefix backend
npm run check:encoding
```

Backend acceptance:

- `GET /api/intelligence/skills` returns registered Skills.
- `POST /api/intelligence/runs` validates request bodies with Zod.
- Invalid requests return `{ error, code, status }`.
- Read-only Skills cannot mutate workflows, files, or knowledge.
- Run trace is created and retrievable.

Regression acceptance:

- Existing `/api/agent` tests still pass.
- Existing workflow execution tests still pass.

### Phase 2 Acceptance

Required checks:

```bash
npm run typecheck
npm run test:unit
npm run test --prefix backend
```

Workflow draft acceptance:

- The system can generate a workflow draft for at least these briefs:
  - product image plus selling point to e-commerce hero image set
  - brand main visual exploration from text brief
  - social media image set from topic and style
- The draft compiler produces valid workflow JSON.
- Validator reports missing models, missing required inputs, and invalid connections.
- The frontend can preview a draft before applying it.
- Applying a draft does not put React Flow nodes or edges into Zustand.

Manual acceptance:

- The user sees what will be created before saving.
- The user can cancel without changing the current workflow.

### Phase 3 Acceptance

Required checks:

```bash
npm run typecheck
npm run test --prefix backend
npm run test:unit
```

Execution acceptance:

- Approved generated workflow runs through `ExecutionService`.
- Cancel uses the existing cancel endpoint.
- Run status recovery still works after stream disconnect.
- Run artifacts are shown as `/api/outputs/...` or `/api/assistant/files/...` URLs.
- Failed runs produce actionable diagnosis.
- Successful runs produce a report and artifact list.

Safety acceptance:

- Knowledge or memory cannot silently choose a workflow target.
- Knowledge or memory cannot silently fill execution inputs.
- Proposed inputs from knowledge require user confirmation before execution.

### Phase 4 Acceptance

Required checks:

```bash
npm run typecheck
npm run test --prefix backend
npm run check:encoding
```

Knowledge acceptance:

- Each knowledge category has schema validation.
- Records include source, scope, timestamps, and confidence or evidence where relevant.
- Search returns typed records with source metadata.
- Run knowledge requires actual run evidence.
- Brand rules and project rules require user confirmation before promotion to durable knowledge.
- Storage uses the runtime resolver and does not hardcode app-data paths.

Migration acceptance:

- Existing memories can be imported into typed knowledge.
- Existing memory governance remains true during migration.

### Phase 5 Acceptance

Required checks:

```bash
npm run typecheck
npm run test:unit
npm run test --prefix backend
```

Team acceptance:

- A Project Manager Agent can create a task plan from a brief.
- A Brand Visual Team can produce strategy, concept, workflow draft, review, and report outputs.
- A Workflow Engineering Team can inspect or create workflows.
- A Quality Reviewer can score outputs against explicit criteria.
- Role handoffs are logged in the run trace.

Manual acceptance:

- Users can see which role produced which decision.
- Users can override or stop the team plan.

### Phase 6 Acceptance

Required checks:

```bash
npm run typecheck
npm run test --prefix backend
npm run check:encoding
```

Asset acceptance:

- Image and video Skills reuse existing provider and file output contracts.
- Prompt and copy Skills produce structured outputs.
- Asset package output contains relative URLs and metadata.
- Logs sanitize oversized payloads.
- Generated assets are indexable into knowledge.

### Phase 7 Acceptance

Required checks:

```bash
npm run check
```

Cutover acceptance:

- Chat and settings no longer rely on the old Agent runtime for primary behavior.
- New intelligence APIs cover the old required capabilities.
- Old memory records are migrated or intentionally archived.
- Legacy routes are removed only after tests and frontend callers are migrated.
- Developer docs no longer list `backend/src/modules/agent/` as the active runtime.

### Phase 8 Acceptance

Required checks:

```bash
npm run check
```

Automation acceptance:

- Successful project runs can be promoted to templates.
- Reused templates produce predictable workflow drafts.
- Optional embedding retrieval has fallback behavior.
- SQLite or embedding storage migration has rollback or import/export support.

## Total Program Acceptance

The whole program is accepted when:

1. A user can describe a design project in natural language.
2. The system asks clarifying questions only when required.
3. The system selects a design team template.
4. The team produces a project plan and workflow draft.
5. The user can inspect and approve the draft.
6. The approved workflow executes through existing backend execution.
7. Results are reviewed and scored.
8. The system can perform at least one retry or revision loop.
9. Final assets are packaged with stable app URLs.
10. Run trace shows plan, Skills, knowledge hits, workflow runs, reviews, and writebacks.
11. Reusable knowledge is written only with source and governance.
12. Legacy Agent code is removed or reduced to a compatibility shim.
13. `npm run check` passes.
14. Manual smoke testing covers Chat, Workflow, Settings, generated outputs, and restart/storage behavior.

## Total Manual Smoke Script

Use this smoke flow after Phase 7:

1. Start the app with `npm start`.
2. Configure provider and enabled project models in Settings.
3. Open Workflow.
4. Ask the workflow assistant to create an e-commerce hero image workflow.
5. Inspect the draft.
6. Apply and save the workflow.
7. Run it with a product image and selling point.
8. Confirm outputs appear in Results.
9. Ask for diagnosis if any node fails.
10. Ask the design team to review successful outputs.
11. Promote the successful prompt and workflow to reusable knowledge.
12. Restart the backend if storage settings changed.
13. Confirm the knowledge is still searchable.

