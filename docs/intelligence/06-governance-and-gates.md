# Intelligence Governance and Gates

## Public Documentation Gate

Durable public intelligence plans may live under:

```text
docs/intelligence/
docs/intelligence/zh/
```

Temporary or private notes must not be placed there.

## Code Ownership

Backend:

```text
backend/src/modules/intelligence/
```

Frontend:

```text
src/features/agent/       global Agent
src/domains/workflow/     workflow domain
src/domains/chat/         chat domain
src/features/settings/    settings
```

Image and video generation are capabilities exposed through Chat, Agent, and Workflow tools, not standalone frontend page domains.

Do not put domain-specific UI under `src/components/`.

## Agent Gates

Required:

- global conversational Agent is the primary surface
- planner model is selected in the Agent window
- only explicitly enabled chat models can be planner models
- LLM planner returns structured plans
- runtime validates plans and calls tools
- tool records are collapsed by default

Forbidden:

- workflow-page-only Agent identity
- fixed design-team template as MVP entry
- silent planner use of image/video models
- use of discovered but disabled models
- exposing raw chain-of-thought

## Workflow Gates

Forbidden:

- model directly mutates React Flow state
- model directly writes arbitrary persisted workflow JSON
- execution without approval
- knowledge silently chooses workflow target or inputs

Required:

```text
AgentPlan
  -> WorkflowDraft
  -> compiler
  -> validator
  -> preview
  -> user confirmation
  -> apply/save/run
```

## Local MVP Gate

Local MVP is `desktop` and `local-web`:

- Agent window can select planner model.
- LLM planner creates structured plans.
- Tool runtime validates and executes governed tools.
- Workflow tools can build, validate, apply, and run drafts locally.
- Studio Brain defaults to local personal/project knowledge.
- Legacy Agent replacement is verified locally.

## Skill / Tool Gates

Each Skill/Tool defines:

- input schema
- output schema
- side-effect level
- approval requirement
- timeout/cancel behavior
- logging policy

Side effect levels:

```text
read
suggest
writeDraft
write
execute
external
destructive
```

Default approval:

- `read`: no approval
- `suggest`: no approval
- `writeDraft`: creating draft does not need approval; applying it does
- `write`: approval when durable or user-visible
- `execute`: approval by default
- `external`: approval or explicit opt-in
- `destructive`: always approval

## Knowledge Gates

Knowledge writes must include type, source, scope, evidence/confidence, and timestamps.

Do not write:

- raw chain-of-thought
- giant payloads
- temporary debug noise
- absolute filesystem paths
- unapproved brand rules
- unapproved project constraints

## Verification

Docs only:

```bash
npm run check:docs
npm run check:encoding
```

Backend intelligence:

```bash
npm run typecheck
npm run test --prefix backend
npm run check:encoding
```

Frontend Agent UI:

```bash
npm run typecheck
npm run test:unit
npm run build
```

Major cutover:

```bash
npm run check
```
