# Phased Execution Plan

## Execution Rules

Every phase must obey these rules:

- keep the app usable at the end of the phase
- keep current Agent APIs working until the replacement gate explicitly removes them
- treat `desktop` and `local-web` as the first implementation and acceptance environments
- defer `server-web`, multi-user shared knowledge, and three-runtime synchronization until the local loop passes total acceptance
- prefer additive APIs before rewiring product surfaces
- validate API boundaries with Zod
- keep workflow execution routed through `backend/src/modules/execution/`
- keep runtime data under the storage resolver
- log intelligence runs with enough detail to diagnose failures
- update public docs and tests in the same change as behavior changes

## Phase 0: Baseline, Encoding, and Governance

### Goal

Prepare the repository so the intelligence program does not build on unstable or unclear foundations.

### Scope

- Fix visible Chinese mojibake in user-facing intelligence and settings surfaces.
- Audit current `backend/src/modules/agent/`, `src/shared/api/agent.ts`, and settings Agent UI.
- Mark current agent code as legacy in developer docs.
- Add this public intelligence plan under `docs/intelligence/`.
- Update public docs gate so this directory is allowed.
- Create an ADR or documented decision that the new module is `backend/src/modules/intelligence/`.

### Out of Scope

- No runtime Agent replacement.
- No new model provider behavior.
- No UI redesign.

### Implementation Notes

High-signal files to inspect:

- `backend/src/modules/agent/agent-runtime.ts`
- `backend/src/modules/agent/tool-registry.ts`
- `backend/src/modules/agent/agent-memory.service.ts`
- `backend/src/modules/execution/execution.service.ts`
- `src/features/settings/components/AgentProfileEditor.tsx`
- `src/shared/api/agent.ts`

### Risks

- Existing mojibake may hide real product copy.
- Existing tests may not cover all malformed Chinese strings.

### Exit Criteria

- Documentation gate passes.
- Encoding gate passes.
- Current branch has no unexplained doc policy drift.

## Phase 1: Local Intelligence Runtime Skeleton

### Goal

Add a parallel, non-disruptive local intelligence backend module for `desktop` and `local-web`.

### Scope

Create:

```text
backend/src/modules/intelligence/
  intelligence.routes.ts
  intelligence.controller.ts
  intelligence.schema.ts
  runtime/intelligence-runtime.ts
  runtime/run-trace.ts
  skills/skill-registry.ts
  knowledge/knowledge.service.ts
  agents/agent-role.service.ts
```

Initial read-only Skills:

```text
knowledge.search
workflow.list
workflow.inspect
model.list
```

Initial APIs:

```text
POST /api/intelligence/runs
GET  /api/intelligence/runs/:id
GET  /api/intelligence/skills
GET  /api/intelligence/knowledge
```

### Out of Scope

- No workflow creation.
- No workflow execution.
- No automatic knowledge writeback.
- No frontend replacement.
- No `server-web` user isolation or synchronization.

### Dependencies

- `backend/src/modules/workflows/`
- `backend/src/modules/settings/`
- `backend/src/platform/storage/`

### Exit Criteria

- Backend tests cover route validation and read-only skill dispatch.
- Old `/api/agent` still works.
- New run trace is persisted under runtime storage.

## Phase 2: Local Workflow Architect MVP

### Goal

Generate valid local workflow drafts from user requirements without executing or saving by default.

### Scope

Add:

```text
workflow-builder/workflow-intent.schema.ts
workflow-builder/workflow-draft.schema.ts
workflow-builder/workflow-compiler.ts
workflow-builder/workflow-validator.ts
```

Skills:

```text
brief.parse
workflow.plan
workflow.createDraft
workflow.validate
```

Draft flow:

```text
User requirement
  -> Brief
  -> WorkflowDraft
  -> compiled workflow JSON
  -> validation report
  -> frontend preview
```

Frontend entry:

- workflow page assistant panel under `src/domains/workflow/`
- draft preview modal under `src/domains/workflow/components/`
- API client under `src/shared/api/intelligence.ts` or domain-specific workflow API helpers when the surface is workflow-only

### Out of Scope

- No automatic saving.
- No automatic execution.
- No free-form node mutation from the model.
- No server-side workflow drafting requirement.

### Exit Criteria

- A requirement such as "input a product image and a selling point, output 6 e-commerce hero images" produces a validated draft.
- The user can preview the draft.
- The draft can be imported into the workflow editor only after explicit confirmation.
- React Flow state remains owned by React Flow.

## Phase 3: Local Workflow Execution Loop

### Goal

Allow approved local intelligence plans to execute workflows through the existing execution engine.

### Scope

Skills:

```text
workflow.execute
workflow.diagnose
workflow.suggestInputs
workflow.summarizeRun
```

Rules:

- Execution must use `ExecutionService`.
- Workflow target and input overrides must be grounded in the current user request or explicit user approval.
- Intelligence may propose inputs from knowledge, but must ask for confirmation before execution.
- Run results must be recorded in the intelligence trace.

### Exit Criteria

- A generated draft can be saved and executed after approval.
- A failed run produces a diagnosis with node-level evidence when available.
- A successful run produces artifact references and a concise result report.
- Closing SSE does not count as cancellation; explicit cancel still uses the cancel endpoint.

## Phase 4: Local Studio Brain MVP

### Goal

Replace loose local memory behavior with typed personal and project knowledge records.

### Scope

Implement JSON-backed stores:

```text
knowledge/project-knowledge.json
knowledge/brand-knowledge.json
knowledge/workflow-knowledge.json
knowledge/asset-knowledge.json
knowledge/run-knowledge.json
knowledge/prompt-library.json
knowledge/model-knowledge.json
```

Skills:

```text
knowledge.search
knowledge.write
knowledge.linkAsset
knowledge.summarizeRun
knowledge.extractPreference
knowledge.promoteToTemplate
```

Frontend:

- settings knowledge management section under `src/features/settings/`
- knowledge search and cleanup tools
- run lesson display in workflow results

### Out of Scope

- No embedding requirement yet.
- No external vector database.
- No cross-user shared knowledge.
- No global knowledge review queue.

### Exit Criteria

- Knowledge records are typed, sourced, scoped, and retrievable.
- User-confirmed project and brand knowledge can guide workflow planning.
- Run knowledge is written only with execution evidence.
- Memory cannot select workflow target or supply workflow input without confirmation.

## Phase 5: Local Design Team MVP

### Goal

Introduce local multi-role orchestration without uncontrolled multi-agent loops.

### Scope

Add:

```text
teams/team-orchestrator.ts
teams/team-template.service.ts
agents/role-runner.ts
planner/project-plan.service.ts
review/review.service.ts
```

Initial team templates:

```text
Brand Visual Team
Workflow Engineering Team
E-commerce Asset Team
```

Initial collaboration modes:

```text
serial
parallel-proposal
review-and-retry
```

### Exit Criteria

- A project manager role can turn a brief into role tasks.
- A creative director role can review proposals.
- A workflow architect role can produce a workflow draft.
- A quality reviewer role can score outputs against explicit criteria.
- All role outputs are traceable.

## Phase 6: Local Asset Pipeline Expansion

### Goal

Bring local image, video, prompt, copy, and packaging flows into the Skill system.

### Scope

Skills:

```text
prompt.optimize
prompt.variant
copy.write
image.generate
image.edit
image.compare
video.generate
asset.package
asset.index
```

Rules:

- Generated media must use existing output URL contracts.
- Large base64 payloads must not flood logs or model context.
- Expensive generation requires approval unless the user has explicitly configured otherwise.

### Exit Criteria

- Team plans can call asset production Skills.
- Generated assets are visible in existing result surfaces.
- Assets are indexed into knowledge with source and usage metadata.

## Phase 7: Local Legacy Agent Cutover

### Goal

Move local product surfaces from old Agent APIs to intelligence APIs.

### Scope

- Chat uses intelligence runtime for Agent/team interactions.
- Settings edits new Agent roles, teams, Skills, and knowledge scopes.
- Legacy memory is migrated or imported into typed knowledge.
- `/api/agent` becomes deprecated and then removed.

### Exit Criteria

- Feature parity for existing chat tool use is verified.
- Legacy tests are either migrated or intentionally removed.
- No frontend code depends on `src/shared/api/agent.ts` except compatibility shims.
- `backend/src/modules/agent/` is deleted or reduced to a documented compatibility wrapper.

## Phase 8: Local Template and Review Enhancement

### Goal

Turn repeated successful local runs into reusable operating assets.

### Scope

- Automatic workflow template suggestions.
- Design team template marketplace or local library.
- Prompt and style package promotion.
- Project-level dashboards.
- Optional embedding-backed retrieval.
- Optional SQLite storage upgrade.

### Exit Criteria

- The system recommends prior workflows based on current brief.
- Users can save a successful team + workflow + prompt set as a reusable studio template.
- Knowledge retrieval improves planning accuracy without bypassing approvals.

## Phase 9: Server Migration Design

### Goal

Design the `server-web` migration only after the local MVP has passed total acceptance.

### Scope

- Define migration boundaries for local JSON or SQLite knowledge stores.
- Define user, workspace, and public ownership rules.
- Define provider ownership so Agent calls consume the requesting user's configured providers or allowed budget.
- Define data export, import, rollback, and conflict resolution.
- Map local APIs to server-safe API contracts.

### Out of Scope

- No production multi-user Agent rollout yet.
- No public shared knowledge ingestion yet.

### Exit Criteria

- A migration design document or ADR exists.
- Local data can be exported in a server-importable format.
- Ownership, provider consumption, and conflict rules are testable before server rollout.

## Phase 10: Server-Web Multi-User Agent Rollout

### Goal

Expose the intelligence runtime to `server-web` users without breaking local runtime behavior.

### Scope

- Add authenticated user and workspace ownership to intelligence runs.
- Route model calls through the current user's provider configuration or server-approved billing policy.
- Keep local `desktop` and `local-web` behavior intact.
- Add server-safe rate limits, audit traces, and error handling.

### Exit Criteria

- Two users can run Agents without seeing each other's private runs, knowledge, or provider configuration.
- Provider usage is attributable to the requesting user or workspace.
- Local runtime acceptance remains green.

## Phase 11: Shared Knowledge Review and Sync

### Goal

Allow knowledge from all users to become shared only through governance.

### Scope

- Add contribution, review, approval, rejection, and versioning flows.
- Separate private, workspace, and public knowledge scopes.
- Add synchronization or import/export for approved knowledge where needed.
- Preserve source, evidence, owner, reviewer, and visibility metadata.

### Exit Criteria

- User-contributed knowledge is private or workspace-scoped by default.
- Public knowledge requires review before use as global guidance.
- Sync conflicts are detectable and resolvable.

## Phase 12: Cross-Runtime Sync or Server-Centered Expansion

### Goal

Decide whether the mature product should use three-runtime synchronization or a server-centered operating model.

### Scope

- Evaluate `desktop`, `local-web`, and `server-web` data flows after real server usage exists.
- Add bidirectional sync only if it is justified by product workflows.
- Otherwise keep server as the shared center and local runtimes as local-first clients with explicit import/export.

### Exit Criteria

- The chosen model has documented tradeoffs.
- Conflict handling, offline behavior, and rollback are tested.
- Local-first operation remains available for users who do not need server sharing.

