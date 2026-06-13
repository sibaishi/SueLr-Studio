# Phased Execution Plan

## Execution Rules

- Keep the app usable at the end of every phase.
- Treat `desktop` and `local-web` as the first implementation and acceptance targets.
- Workflow is the primary surface; Agent is opened from the workflow workspace.
- Planner model selection belongs inside the Agent window.
- LLM planner creates structured plans; runtime validates and executes.
- High-cost or side-effectful tools require approval.
- React Flow state remains owned by React Flow.
- Backend API boundaries use Zod and `{ error, code, status }`.

## Phase 0: Direction Reset and Docs

Goal: update the program from "design team / workflow assistant" to "workflow Agent workspace / LLM planner / tool calls".

Scope:

- Update master, phased, acceptance, knowledge, replacement, and governance docs.
- Replace the design-team operating model with the conversational Agent planner model.
- Make planner model selection an Agent-window responsibility.

Exit criteria:

```bash
npm run check:encoding
```

## Phase 1: Global Agent UI Baseline

Goal: route the workflow Agent entry to the Agent workspace.

Scope:

- `src/features/agent/` owns the workflow Agent workspace.
- Workflow page only opens the Agent.
- Agent shows conversation, final result, and collapsed tool records.
- Legacy workflow assistant panels are no longer mounted.

Exit criteria:

- Clicking `AI Assistant` opens `AI Agent`.
- No primary `AI Workflow Assistant` or `AI Design Team` UI remains.
- Tool records are collapsed by default.
- `npm run typecheck`
- `npm run check:encoding`
- `npm run build`

## Phase 2: Planner Model Picker in Agent Window

Goal: let the user select the LLM planner model directly inside the Agent window.

Rules:

- Only explicitly enabled chat models are selectable.
- Do not silently use image/video models.
- Do not use discovered but disabled models.
- Remember the last local selection.
- If no chat model is available, show a clear prompt to enable one.

## Phase 3: LLM Planner MVP

Goal: add a real LLM planner that returns structured plans.

API:

```text
POST /api/intelligence/agent/plans
```

Planner input:

- user request
- selected planner model reference
- current app/page/workflow context
- available tool definitions
- node knowledge
- relevant knowledge search results

Planner output:

```text
AgentPlan
  goal
  needsClarification
  clarificationQuestions
  steps[]
  finalResponseHint
```

Exit criteria:

- Planner output is schema validated.
- Tool ids in the plan must exist.
- Planner cannot directly mutate canvas state.
- Planner can ask clarifying questions.

Key manual test:

```text
Build a storyboard image workflow from a text script, producing 8 sequential storyboard frames.
```

Expected: the planner treats this as image sequence/storyboard work, not direct video generation.

## Phase 4: Tool Runtime and Workflow Tools

Goal: make workflow behavior Agent tools, not a page-specific assistant.

Initial tools:

```text
workflow.inspect
workflow.createDraft
workflow.validate
workflow.suggestInputs
workflow.execute
workflow.diagnose
workflow.summarizeRun
```

Planned Phase 6 additions:

```text
workflow.edit
workflow.applyDraft
```

Rules:

- `workflow.createDraft` can be automatic.
- `workflow.applyDraft` requires confirmation when draft or patch application lands in Phase 6.
- `workflow.execute` requires confirmation.
- Every tool call writes trace.

## Phase 5: Node Semantics and Planning Quality

Goal: fix inaccurate node knowledge so the planner chooses the right workflow structure.

Priority nodes:

- prompt helper
- text/image item iteration
- merge nodes
- AI chat
- image generation
- video generation
- save file
- output display

Exit criteria:

- Storyboard requests do not misuse video generation.
- Simple input-output tasks do not force prompt helper.
- Iteration and merge nodes are used according to their real behavior.

## Phase 6: Workflow Edit, Run, and Diagnose Loop

Goal: allow the Agent to work with existing canvases.

Capabilities:

- inspect current canvas
- propose editable patches
- apply confirmed patches
- run workflows
- inspect artifacts
- diagnose failed nodes
- summarize results

## Phase 7: Production Tool Expansion

Goal: add image, video, text, prompt, asset, and result tools to the same Agent runtime.

Tools:

```text
image.generate
image.edit
image.compare
video.generate
copy.write
prompt.optimize
asset.package
asset.index
result.inspect
```

## Phase 8: Studio Brain Enhancement

Goal: improve planner quality through governed knowledge.

Knowledge:

- user preferences
- node semantics
- tool experience
- model experience
- successful workflow templates
- failed run lessons
- artifacts and assets

## Phase 9: Legacy Cutover

Goal: make the workflow Agent workspace the primary conversational path.

Scope:

- Deprecate or wrap `/api/agent`.
- Remove legacy workflow assistant path.
- Keep compatibility until parity is verified.

Exit criteria:

```bash
npm run check
```

## Phase 10+: Local Templates and Review

After local MVP acceptance:

- preserve successful workflows as reusable templates
- preserve prompt packs and task patterns
- keep knowledge writeback governed and local-first
- keep `desktop` and `local-web` as the supported runtime shapes
