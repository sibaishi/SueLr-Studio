# Knowledge Base Taxonomy

## Goal

The knowledge base should become the Studio Brain: a structured, searchable, evidence-aware memory layer for design work, workflow automation, model behavior, assets, and project operations.

It must not be a bag of unsourced text snippets.

For the local MVP, the knowledge base is local personal and project knowledge for `desktop` and `local-web`. Public knowledge, cross-user contributions, review queues, and server synchronization are later `server-web` migration concerns.

## Storage Evolution

### Stage 1: JSON Stores

Use runtime storage JSON files for the MVP:

```text
knowledge/
  user-memory.json
  project-knowledge.json
  brand-knowledge.json
  design-system-knowledge.json
  workflow-knowledge.json
  skill-knowledge.json
  model-knowledge.json
  prompt-library.json
  asset-knowledge.json
  run-knowledge.json
  review-knowledge.json
  team-knowledge.json
  template-knowledge.json
  domain-knowledge.json
  safety-knowledge.json
```

### Stage 2: SQLite

Move to `knowledge/studio-brain.db` after JSON access patterns stabilize.

### Stage 3: Embeddings

Add local embedding-backed retrieval only after:

- typed records exist
- source metadata is reliable
- keyword retrieval has clear limitations
- import/export and migration are tested

No external vector database is required for the first implementation.

### Later Stage: Server Migration

After the local MVP passes total acceptance, add server-ready storage and synchronization only with explicit migration design:

- private, workspace, and public visibility scopes
- per-user and per-workspace ownership
- contribution and review workflow for public knowledge
- conflict detection and rollback
- provider and run attribution for every server Agent action

## Record Contract

Every knowledge record should include:

```text
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
ownerUserId
workspaceId
ownershipScope
sourceRuntime
version
syncStatus
```

`ownerUserId`, `workspaceId`, `ownershipScope`, `sourceRuntime`, `version`, and `syncStatus` are migration-ready fields. In the local MVP they can default to a single local user, a local workspace, `local`, and `localOnly`. They do not require cross-user sharing or server sync in the first implementation.

## Knowledge Categories

### 1. User Memory

Purpose:

- stable user preferences
- language preference
- default style tendencies
- disliked formats
- repeated delivery preferences

Write policy:

- low-risk preferences may be written automatically when clear
- ambiguous preferences require confirmation
- temporary task details must not be written

### 2. Project Knowledge

Purpose:

- project goals
- client context
- deliverables
- deadlines
- constraints
- current decisions

Write policy:

- requires project context
- important decisions require confirmation

### 3. Brand Knowledge

Purpose:

- brand positioning
- target audience
- tone
- color rules
- typography rules
- visual references
- forbidden styles
- competitor notes

Write policy:

- durable brand rules require user confirmation
- generated suggestions remain proposals until approved

### 4. Design System Knowledge

Purpose:

- UI component rules
- spacing
- typography
- color tokens
- layout density
- product interface guidelines

Write policy:

- requires explicit user or code evidence
- should link to project files when derived from implementation

### 5. Workflow Knowledge

Purpose:

- workflow purpose
- required inputs
- node descriptions
- output expectations
- known failure modes
- recommended models

Write policy:

- workflow inspection can write descriptive summaries
- operational recommendations require execution evidence

### 6. Skill Knowledge

Purpose:

- when to use each Skill
- common parameter choices
- retry strategy
- failure signatures
- cost and risk notes

Write policy:

- requires trace or maintainer input

### 7. Model Knowledge

Purpose:

- model capabilities
- domain fit
- context limits
- image/video behavior
- known quirks
- stable parameter recipes

Write policy:

- discovered models are not automatically usable project models
- capability notes should reference actual provider discovery or run evidence

### 8. Prompt Library

Purpose:

- successful prompts
- negative prompts
- style prompts
- camera and lighting prompts
- brand-specific prompt fragments
- failed prompt examples

Write policy:

- successful prompts should link to output artifacts or run traces
- failed prompts should include failure reason

### 9. Asset Knowledge

Purpose:

- generated images
- videos
- audio
- uploaded references
- file metadata
- style tags
- reuse status

Write policy:

- asset record must reference app URLs or storage-relative identifiers
- do not store absolute host paths

### 10. Run Knowledge

Purpose:

- execution input summary
- workflow and model used
- outputs
- errors
- duration
- retry count
- final rating

Write policy:

- requires real run trace
- should not be injected as unquestioned truth into future executions

### 11. Review Knowledge

Purpose:

- quality scores
- review criteria
- rejection reasons
- accepted output characteristics

Write policy:

- should link to reviewer role, criteria, and artifacts

### 12. Team Knowledge

Purpose:

- team templates
- role descriptions
- handoff patterns
- known collaboration strategies

Write policy:

- system-provided templates are versioned
- custom teams require explicit save

### 13. Template Knowledge

Purpose:

- reusable project templates
- workflow templates
- prompt packs
- asset packaging templates

Write policy:

- promotion to template requires user confirmation

### 14. Domain Knowledge

Purpose:

- branding methods
- e-commerce design heuristics
- social media content patterns
- video production guidelines
- packaging design conventions
- UI/UX heuristics

Write policy:

- should separate generic design knowledge from project-specific rules

### 15. Safety Knowledge

Purpose:

- copyright risk notes
- sensitive topics
- forbidden brand claims
- external-call restrictions
- destructive operation policy

Write policy:

- high-sensitivity records should require explicit confirmation and clear source

## Retrieval Rules

Knowledge retrieval should return:

- typed records
- relevance score
- source
- confidence
- last updated time
- governance note

The runtime should distinguish:

```text
Context
  Useful background, may influence reasoning.

Candidate
  A proposed value that needs confirmation.

Evidence
  Trace-backed record from actual project or workflow output.

Rule
  User-approved constraint that the system should follow.
```

## Writeback Rules

Automatic writeback is allowed only when:

- the source is known
- the category is appropriate
- the write policy allows it
- the record is not duplicate
- the content is not temporary noise

User confirmation is required for:

- brand rules
- project constraints
- workflow template promotion
- model preference changes
- deletion or destructive cleanup
- any knowledge that could alter future production behavior materially

Visibility rules:

- local MVP records default to private local or project scope
- workspace and public visibility are server migration features
- public knowledge must never be created directly from a user run without review
- shared records must retain original source, owner, evidence, reviewer, version, and visibility metadata

## Anti-Patterns

Do not:

- store raw model chain-of-thought
- store giant base64 payloads
- store stack traces as user memory
- use memory to choose workflow targets silently
- use memory to supply workflow inputs silently
- store absolute runtime paths
- merge unrelated domains into one global memory blob

