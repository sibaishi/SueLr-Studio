# Acceptance Plan

## Acceptance Philosophy

The new intelligence system must be accepted as a real tool-calling loop, not as a model demo.

The local MVP acceptance chain is:

```text
user starts in global Agent
planner model is selected inside Agent window
LLM planner returns a structured plan
runtime validates tool calls
tools execute with approval when needed
final result is shown clearly
tool records are collapsed but traceable
knowledge writeback is governed
legacy workflow assistant is no longer primary
```

`server-web`, shared public knowledge, per-user provider consumption, and sync are not local MVP pass conditions.

## Phase Gates

### Phase 0: Direction Reset

```bash
npm run check:encoding
```

- Docs describe global conversational Agent as the primary surface.
- Docs no longer present design teams or workflow assistant as the MVP entry.
- Planner model selection is documented as an Agent-window control.

### Phase 1: Global Agent UI

```bash
npm run typecheck
npm run check:encoding
npm run build
```

- `AI Assistant` opens the global `AI Agent`.
- No primary `AI Workflow Assistant` or `AI Design Team` title remains.
- Tool records are collapsed by default.

### Phase 2: Planner Model Picker

```bash
npm run typecheck
npm run test:unit
npm run check:encoding
```

- Agent window lists explicitly enabled chat models.
- The user can switch planner model.
- No chat model means no planner call and a clear prompt.
- Image/video/discovered-disabled models are not silently used.

### Phase 3: LLM Planner

```bash
npm run typecheck
npm run test --prefix backend
npm run check:encoding
```

- Planner endpoint validates inputs with Zod.
- Planner output passes schema validation.
- Unknown tool ids are rejected.
- Planner can ask clarification questions.
- Planner cannot mutate canvas state directly.

Manual case:

```text
Build a storyboard image workflow from a text script, producing 8 sequential storyboard frames.
```

Expected: planner treats this as image sequence/storyboard work, not direct video generation.

### Phase 4: Tool Runtime and Workflow Tools

```bash
npm run typecheck
npm run test:unit
npm run test --prefix backend
```

- `workflow.build` creates a validated draft.
- `workflow.applyDraft` requires confirmation.
- `workflow.run` requires confirmation.
- Tool calls write trace.
- React Flow state does not move to Zustand.

### Phase 5: Node Semantics

```bash
npm run typecheck
npm run test --prefix backend
npm run check:encoding
```

- Node knowledge is retrievable by planner.
- Prompt helper is not forced into simple flows.
- Storyboard requests do not misuse video generation.
- Iteration nodes are understood as item-wise transfer/execution.
- Merge nodes are understood as aggregation, not execution order.

### Phase 6: Workflow Edit/Run/Diagnose

```bash
npm run typecheck
npm run test --prefix backend
npm run test:unit
```

- Agent can inspect current canvas.
- Agent can propose confirmed edits.
- Execution uses `ExecutionService`.
- Artifacts use `/api/outputs/...` or `/api/assistant/files/...`.
- Failed runs produce node-level diagnosis when possible.

### Phase 7: Production Tools

```bash
npm run typecheck
npm run test --prefix backend
npm run check:encoding
```

- Image/video/text tools reuse existing provider and output contracts.
- High-cost tools require approval.
- Results reuse existing media/text viewing behavior.
- Large base64 payloads are not logged.

### Phase 8: Studio Brain

```bash
npm run typecheck
npm run test --prefix backend
npm run check:encoding
```

- Knowledge records have type, source, scope, evidence, and timestamps.
- Run knowledge comes from real trace.
- Important brand/project/tool rules require confirmation.
- No raw chain-of-thought, giant base64, or absolute paths are written.

### Phase 9: Legacy Cutover

```bash
npm run check
```

- Global Agent is the primary flow.
- Workflow page has no independent workflow assistant.
- `/api/agent` is deprecated or compatibility-only.
- Legacy Agent profile UI is not the primary control path.

## Local MVP Total Acceptance

Manual smoke:

1. Start the app.
2. Configure and enable at least one chat model.
3. Open the global Agent from `AI Assistant`.
4. Select the Planner model inside the Agent window.
5. Ask for a storyboard image workflow from a text script.
6. Confirm the planner chooses workflow/image sequence tools, not direct video generation.
7. Generate a workflow draft.
8. Confirm opening it on a new canvas.
9. Run or diagnose only after explicit confirmation.
10. Confirm final result and collapsed tool records are visible.

The local MVP passes when this flow works in local runtime shapes and `npm run check` passes.

## Full Program Acceptance

Full acceptance requires local MVP acceptance plus later server migration, multi-user isolation, shared knowledge review, and sync gates.
