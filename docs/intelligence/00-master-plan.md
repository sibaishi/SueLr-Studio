# Conversational Agent + LLM Planner Master Plan

## Purpose

SueLr Studio should evolve into a local-first conversational AI work system.

The user starts from Workflow and opens the Agent workspace when conversational planning is needed. The Agent asks clarifying questions when needed, uses an LLM planner to create a structured plan, calls controlled tools, and returns final results with collapsed trace records.

Workflow remains the primary product workspace; Agent is the conversational planning and execution layer inside it.

## Direction Change

Previous direction:

```text
User request
  -> design team selection
  -> role/task decomposition
  -> workflow assistant draft
  -> user continues inside workflow page
```

Current direction:

```text
User request
  -> workflow Agent workspace
  -> planner model selected inside Agent window
  -> LLM planner creates a structured plan
  -> runtime validates the plan
  -> controlled tools execute
  -> final result is shown
  -> tool records stay collapsed by default
```

Design-team templates may return later as an internal strategy or advanced mode, but they are no longer the primary MVP path.

## Core Principles

- Agent is a tool-calling conversational worker.
- LLM planner plans; runtime validates and executes.
- Planner model selection lives in the Agent window, not as a separate global settings item.
- Only explicitly enabled chat models may be used as planner models.
- Image/video/discovered-but-disabled models must not be silently used for planning.
- Every tool declares schemas, side effects, approval requirements, and trace behavior.
- React Flow state remains owned by React Flow.
- Workflow drafts must be compiled and validated before applying to canvas.

## Target Architecture

```text
backend/src/modules/intelligence/
  agent/              conversation, planning, orchestration
  planner/            LLM planner and structured plans
  skills/             governed backend capabilities
  tools/              Agent-callable tool adapters
  knowledge/          Studio Brain
  workflow-builder/   intent, draft, compiler, validator
  runtime/            traces, approvals, tool call records
  governance/         side effects, permissions, audit
```

Frontend ownership:

```text
src/features/agent/       workflow Agent workspace and planner model picker
src/domains/workflow/     workflow canvas and workflow tool targets
src/features/settings/    provider and model enablement, not planner selection
```

## First Local Loop

```text
User asks in Agent
  -> select planner model in Agent window
  -> planner reads tool definitions, node knowledge, current context
  -> planner selects workflow.createDraft
  -> runtime validates tool call
  -> workflow draft is generated and validated
  -> Agent shows final result and collapsed tool record
  -> user confirms opening a new canvas
```

This is the fastest loop for testing whether node semantics, tool definitions, and knowledge retrieval are good enough.

## Local MVP Success Criteria

- Users can open Agent from the workflow workspace.
- The Agent window can select the planner model.
- The LLM planner returns structured plans.
- Tool records are collapsed by default.
- Workflow generation is no longer only hard-coded local rules.
- Workflow drafts are validated before applying to the canvas.
- `workflow.edit` / `workflow.applyDraft` / `workflow.execute` / `workflow.diagnose` can be added as tools.
- Image, video, text, asset, and knowledge tools can be added to the same runtime.
- Important knowledge writeback requires confirmation.
- Legacy Agent and legacy workflow assistant are no longer the primary flow.
- `npm run check` passes.
