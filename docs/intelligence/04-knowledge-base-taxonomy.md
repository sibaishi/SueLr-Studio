# Knowledge Base Taxonomy

## Goal

The knowledge base is long-term context for the LLM planner and tool runtime. It is not a team-template database and not a bag of unsourced memory snippets.

It should help the Agent understand:

- user preferences
- project and brand constraints
- real node semantics
- tool usage rules
- model capabilities
- successful workflow patterns
- failed run lessons
- artifacts and assets

## Storage Evolution

MVP JSON stores:

```text
knowledge/
  user-memory.json
  project-knowledge.json
  brand-knowledge.json
  node-knowledge.json
  tool-knowledge.json
  workflow-knowledge.json
  model-knowledge.json
  prompt-library.json
  asset-knowledge.json
  run-knowledge.json
  review-knowledge.json
  template-knowledge.json
  domain-knowledge.json
  safety-knowledge.json
```

Later:

- SQLite after JSON access patterns stabilize.
- Local embeddings after records, provenance, and migration are stable.
- Server storage only after local MVP acceptance.

## Record Contract

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
sourceRuntime
version
syncStatus
```

## Key Categories

### User Memory

Stable preferences, language, delivery formats, disliked outputs.

### Project Knowledge

Project goals, client context, deliverables, constraints, decisions.

### Brand Knowledge

Positioning, audience, tone, visual rules, competitors, forbidden styles.

Durable brand rules require confirmation.

### Node Knowledge

Critical for workflow planning.

Each node should record:

- real purpose
- input ports
- output ports
- parameters
- applicable scenarios
- non-applicable scenarios
- common upstream/downstream nodes
- common misuse
- typical combinations

Priority nodes:

- prompt helper
- text/image iteration
- merge nodes
- AI chat
- image generation
- video generation
- save file
- output display

### Tool Knowledge

Tool id, schemas, side effects, approval rules, parameter experience, failure signatures, cost risk.

### Workflow Knowledge

Workflow purpose, input requirements, node patterns, failure modes, recommended models, successful examples.

### Model Knowledge

Capabilities, suitable tasks, unsuitable tasks, context limits, known issues.

Planner can only use explicitly enabled chat models.

### Prompt Library

Successful prompts, failed prompts, style prompts, camera/shot prompts, brand prompt fragments.

### Asset Knowledge

Generated or uploaded images, videos, files, style tags, reuse status.

Store app URLs or storage-relative identifiers, not absolute paths.

### Run Knowledge

Input summary, tools, workflow, model, outputs, errors, duration, diagnosis.

Must come from real trace.

### Template Knowledge

Task patterns, workflow templates, tool call patterns, prompt packs, delivery templates.

Promotion requires user confirmation.

## Retrieval Rules

Return:

- type
- relevance
- source
- confidence
- updated time
- governance note
- whether user-confirmed

## Write Rules

Automatic writeback is allowed for:

- clear low-risk preferences
- trace-backed run summaries
- user-explicitly saved prompts

Confirmation is required for:

- brand rules
- project constraints
- workflow templates
- tool call templates
- model preferences
- destructive cleanup
- knowledge that materially changes future production behavior

Never write:

- raw chain-of-thought
- giant base64 payloads
- temporary debug noise
- stack traces as user memory
- absolute filesystem paths
- unconfirmed brand rules
