# Agent + Skills + Knowledge Base Master Plan

## Purpose

SueLr Studio should evolve from a local-first multimodal tool into a complete local AI design studio operating system first.

The first product milestone is a full local loop in `desktop` and `local-web`: Agent + Skills + Knowledge Base + automatic workflow construction + design-team collaboration + review + asset output + knowledge writeback. `server-web`, multi-user shared knowledge, and cross-runtime synchronization are later migration targets after the local loop is stable.

The new intelligence system should be able to:

- understand a creative or business requirement
- ask clarifying questions when the brief is underspecified
- assemble a suitable design team
- retrieve project, brand, workflow, asset, and model knowledge
- create or modify workflow drafts from requirements
- execute approved workflows and production skills
- review generated outputs
- retry or revise when results fail quality gates
- package outputs into usable deliverables
- write reusable knowledge, prompts, workflow templates, and run lessons back into the studio brain

This plan intentionally allows a complete replacement of the current `backend/src/modules/agent/` module. The replacement must be gradual and verifiable so the app keeps working during the migration.

## Rollout Priority

The rollout order is intentionally conservative:

1. Complete the local studio loop in `desktop` and `local-web`.
2. Replace the immature local Agent runtime with the new intelligence module.
3. Stabilize local templates, knowledge governance, workflow generation, execution, review, and asset packaging.
4. Design `server-web` migration only after local total acceptance passes.
5. Then implement multi-user Agent access, shared knowledge review, per-user provider ownership, and synchronization.

The local MVP must not depend on server-side user isolation, global knowledge review, or three-runtime synchronization. Data contracts may keep `ownerUserId`, `workspaceId`, `source`, and runtime metadata so the later migration has a clean path, but those fields are not a reason to add server complexity to the first implementation.

## Current Project Facts

As of this plan, SueLr Studio already has:

- Electron 41 desktop shell with `electron/main.cjs` kept as CommonJS
- React 19 + TypeScript + Vite frontend
- Express backend on port `3001`
- workflow canvas under `src/domains/workflow/`
- React Flow node definitions under `src/shared/workflow/node-definitions/`
- backend workflow execution under `backend/src/modules/execution/` and `backend/src/engine/`
- provider routing and model configuration under `src/shared/providers/` and `backend/src/platform/providers/`
- settings UI under `src/features/settings/`
- current agent, tool, session, profile, and memory code under `backend/src/modules/agent/`
- current assistant routes under `backend/src/modules/assistant/`
- runtime storage resolver under `backend/src/platform/storage/`
- generated file URL contracts rooted at `/api/outputs/...` and `/api/assistant/files/...`
- supported local runtime shapes: `desktop` and `local-web`
- `server-web` deployment assets exist as a later rollout surface, not as a local MVP dependency

The new system must not violate existing hard constraints:

- do not move domain components into `src/components/`
- do not put React Flow nodes, edges, or viewport into Zustand
- do not call `ipcRenderer` from renderer code
- do not hardcode runtime data paths
- do not change fixed workflow shortcuts
- validate backend API inputs with Zod at boundaries
- keep backend error responses normalized as `{ error, code, status }`

## Target Product Shape

The long-term shape is an AI design company inside SueLr Studio:

```text
User request
  -> Brief intake
  -> Studio Brain retrieval
  -> Team selection
  -> Project plan
  -> Workflow draft generation
  -> User approval
  -> Workflow or Skill execution
  -> Review and retry loop
  -> Asset packaging
  -> Knowledge writeback
```

The user experience should support requests such as:

```text
Create a full launch package for a new Chinese tea drink brand:
brand positioning, main visual, package direction, e-commerce detail page assets,
Xiaohongshu launch content, and a 15-second product video.
```

The system should respond by:

1. asking only necessary clarifying questions
2. creating a brief
3. selecting a team template
4. assigning tasks to roles
5. creating workflow drafts for the production steps
6. requesting approval before expensive or persistent side effects
7. generating assets and copy
8. reviewing results against criteria
9. retrying or revising when needed
10. delivering an asset package and project report
11. storing reusable lessons in the knowledge base

## Target Architecture

The intelligence system should live primarily in a new backend module:

```text
backend/src/modules/intelligence/
  agents/
  teams/
  skills/
  knowledge/
  workflow-builder/
  planner/
  runtime/
  review/
  telemetry/
  governance/
```

Frontend surfaces should stay within existing ownership boundaries:

```text
src/domains/chat/        chat-facing Agent and team interaction
src/domains/workflow/    workflow AI assistant, draft preview, and diagnostics
src/features/settings/   Agent, team, Skill, and knowledge settings
src/shared/api/          typed API clients shared by product surfaces
```

No domain-specific intelligence UI belongs in `src/components/`.

## Layer Model

The target system has seven layers:

```text
Studio Brain
  Knowledge, memory, project state, asset index, model capability notes, run lessons.

Team System
  Role definitions, team templates, collaboration modes, task handoff rules.

Project Manager
  Brief parsing, task decomposition, team selection, progress tracking, final reporting.

Workflow Architect
  Requirement-to-workflow planning, draft creation, validation, modification, templating.

Skill Runtime
  Structured executable capabilities with schemas, side-effect levels, approval rules.

Asset Pipeline
  Image, video, audio, copy, prompt, file, and package production flows.

Review Loop
  Quality review, brand consistency review, risk checks, retry plans, final acceptance.
```

## Core Design Principle

Models should plan and decide. Code should enforce contracts.

The system must not rely on models directly emitting arbitrary backend objects or React Flow node graphs. Instead:

```text
Model output
  -> typed intermediate schema
  -> deterministic compiler or validator
  -> persisted domain object or workflow draft
```

For workflow creation:

```text
Requirement
  -> WorkflowIntent
  -> WorkflowDraft
  -> WorkflowCompiler
  -> WorkflowValidator
  -> React Flow-compatible workflow JSON
```

This keeps workflow generation extensible while protecting existing editor and execution contracts.

## Key Backend Concepts

### Agent

An Agent is a role-bound decision unit, not just a system prompt.

```text
AgentRole
  id
  name
  domain
  responsibility
  defaultModelRole
  allowedSkills
  knowledgeScopes
  approvalPolicy
  reviewCriteria
  handoffRules
```

### Team

A Team is an orchestrated collection of Agents.

```text
TeamTemplate
  id
  name
  useCases
  roles
  requiredKnowledgeScopes
  collaborationMode
  defaultWorkflowTemplates
  acceptanceCriteria
```

### Skill

A Skill is a structured backend capability.

```text
SkillDefinition
  id
  name
  domain
  description
  inputSchema
  outputSchema
  sideEffectLevel
  requiresApproval
  handler
  timeout
  retryPolicy
  telemetryPolicy
```

### Knowledge

Knowledge is typed, sourced, scoped, and governed.

```text
KnowledgeRecord
  id
  type
  scope
  title
  content
  structured
  tags
  source
  confidence
  evidence
  createdAt
  updatedAt
```

### Run Trace

Every intelligence run must produce a trace:

```text
IntelligenceRun
  id
  request
  selectedTeam
  plan
  knowledgeHits
  modelCalls
  skillCalls
  workflowDrafts
  workflowRuns
  reviewResults
  artifacts
  writebacks
  status
  errors
```

The trace is the foundation for debugging, replay, audit, and future knowledge writeback.

## Design Domains

The system should eventually support these design directions:

- brand strategy and visual identity
- print and graphic design
- packaging design
- e-commerce product visuals and detail pages
- social media content
- short video creation
- UI and UX design
- design systems
- IP and character design
- spatial, exhibition, and retail visual direction
- 3D and motion concept direction
- prompt engineering and model production pipelines
- design operations and asset management

The first production path should focus on workflow-assisted brand and e-commerce visual generation because it best matches the existing workflow, image, settings, and results surfaces.

## Replacement Strategy

The current `backend/src/modules/agent/` module should become a legacy compatibility layer, not the long-term home.

The replacement path is:

1. build `backend/src/modules/intelligence/` in parallel
2. expose new APIs beside current `/api/agent`
3. migrate read-only capabilities first
4. migrate workflow inspection and workflow draft generation
5. migrate workflow execution through the existing `ExecutionService`
6. migrate memory into typed knowledge services
7. migrate frontend settings and chat surfaces
8. mark old routes deprecated
9. delete old module after parity, telemetry, and tests pass

Detailed replacement steps are in `03-legacy-agent-replacement-plan.md`.

## Program Success Criteria

The local MVP is successful when, in both `desktop` and `local-web` where applicable:

- users can ask for a design outcome rather than manually assemble every node
- the system can create a validated workflow draft from a brief
- users can inspect and approve that draft before saving or execution
- approved workflows run through the existing backend workflow engine
- results are reviewed by role-based criteria
- retries are explainable and traceable
- generated outputs are packaged and linked as artifacts
- run lessons and reusable prompts are written to knowledge with evidence
- the legacy Agent module is removed or reduced to a compatibility shim
- all public docs, gates, and tests agree with the implemented architecture

Server success is a later program layer. It is successful only after local acceptance, when:

- `server-web` exposes Agent capabilities to authenticated users
- every Agent run consumes the requesting user's configured provider credentials or allowed provider budget
- shared knowledge can be contributed by users but requires review before becoming public or global
- user-owned, workspace-owned, and public knowledge are isolated correctly
- local and server data migration, conflict handling, and rollback are tested

