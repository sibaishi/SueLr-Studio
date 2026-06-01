# Conversational Agent and Tool Planner

## Goal

SueLr Studio's Agent is a global conversational worker. It is not a workflow-page assistant and not a fixed design-team template picker.

The user describes a task. The Agent selects a planner model, creates a structured plan, calls controlled tools, and returns results. Tool records are collapsed by default and can be expanded for traceability.

## Planner Model Source

Planner model selection belongs inside the Agent window.

Rules:

- Only explicitly enabled chat models can be selected.
- Image and video models cannot be silently used as planner models.
- Discovered but disabled models cannot be used.
- If no chat model is available, the Agent asks the user to enable one.
- The last local selection may be remembered.

## Planner Flow

```text
User request
  -> optional clarification
  -> selected planner model
  -> tool definitions
  -> node knowledge
  -> relevant knowledge hits
  -> AgentPlan
  -> runtime validation
  -> tool execution
  -> final response
```

## AgentPlan Shape

```ts
type AgentPlan = {
  goal: string;
  needsClarification: boolean;
  clarificationQuestions: string[];
  steps: AgentPlanStep[];
  finalResponseHint: string;
};

type AgentPlanStep = {
  id: string;
  tool: string;
  reason: string;
  input: Record<string, unknown>;
  requiresApproval: boolean;
};
```

## Tool Categories

Planning and knowledge:

```text
chat.respond
brief.parse
knowledge.search
knowledge.write
```

Workflow:

```text
workflow.inspect
workflow.createDraft
workflow.validate
workflow.suggestInputs
workflow.edit
workflow.applyDraft
workflow.execute
workflow.diagnose
workflow.summarizeRun
```

Production:

```text
image.generate
image.edit
image.compare
video.generate
copy.write
prompt.optimize
asset.package
asset.index
```

Results:

```text
result.inspect
artifact.open
artifact.collect
knowledge.summarizeRun
knowledge.promoteToTemplate
```

## First Acceptance Case

```text
Build a storyboard image workflow from a text script, producing 8 sequential storyboard frames.
```

Expected behavior:

- The planner treats this as storyboard/image-sequence work.
- It does not directly pick video generation.
- It uses node knowledge to choose text input, splitting or iteration, image generation, saving, and output.
- It asks a clarification question if essential information is missing.

## Out of Current Main Path

The following are no longer the MVP product path:

- a fixed AI design team entry
- selecting a team template before work begins
- a workflow-page-only assistant
- always exposing the full tool process to the user

These can return later as advanced orchestration strategies, not as the first user-facing architecture.
