# Design Team Operating Model

## Goal

SueLr Studio should support complete AI design teams, not only individual assistants.

The team system should let users work at the level of outcomes:

```text
Create a brand launch package.
Create an e-commerce product visual set.
Create a short video campaign.
Create a workflow that generates consistent social media images.
```

The system should translate those requests into team roles, tasks, Skills, workflow drafts, reviews, and deliverables.

## Agent Role Types

### Management Roles

```text
Project Manager
  Owns brief intake, task planning, progress, approvals, and final report.

Team Orchestrator
  Selects team template, assigns tasks, resolves handoff order.

Knowledge Curator
  Searches, organizes, and writes knowledge with policy checks.

Run Reviewer
  Reviews run traces, failures, and improvement opportunities.
```

### Strategy Roles

```text
Brand Strategist
  Owns positioning, audience, value proposition, tone, and competitive framing.

Marketing Strategist
  Owns channel strategy, campaign angle, and conversion goals.

Content Strategist
  Owns content pillars, publishing formats, and topic structure.
```

### Creative Roles

```text
Creative Director
  Owns concept direction, visual coherence, and final creative judgment.

Art Director
  Owns composition, style, color, mood, and reference direction.

Copywriter
  Owns slogans, headlines, body copy, social copy, and scripts.

Storyboard Artist
  Owns video scene sequence, shot list, and visual transitions.
```

### Production Roles

```text
Prompt Engineer
  Converts creative direction into model-ready prompts and variants.

Image Production Agent
  Runs image generation and edit Skills.

Video Production Agent
  Runs video generation and video planning Skills.

Asset Manager
  Saves, indexes, packages, and labels outputs.
```

### Workflow Roles

```text
Workflow Architect
  Designs workflow structure from requirements.

Node Configuration Agent
  Maps planned stages to existing node types and parameters.

Workflow Validator
  Checks graph validity, missing inputs, model availability, and output paths.

Workflow Diagnostician
  Reads run logs and suggests fixes.
```

### Review Roles

```text
Quality Reviewer
  Scores output usability, technical quality, and obvious defects.

Brand Consistency Reviewer
  Scores alignment with brand knowledge.

Risk Reviewer
  Checks copyright, sensitive content, claims, and destructive operations.
```

## Team Templates

### Brand Visual Team

Use cases:

- new brand concept
- campaign key visual
- packaging direction
- visual identity exploration

Roles:

- Project Manager
- Brand Strategist
- Creative Director
- Art Director
- Copywriter
- Prompt Engineer
- Image Production Agent
- Quality Reviewer
- Knowledge Curator

### E-commerce Asset Team

Use cases:

- product hero images
- detail page modules
- marketplace listing visuals
- A/B creative variants

Roles:

- Project Manager
- Marketing Strategist
- Copywriter
- Art Director
- Prompt Engineer
- Image Production Agent
- Brand Consistency Reviewer
- Quality Reviewer
- Asset Manager

### Video Creation Team

Use cases:

- product ad videos
- social short videos
- storyboard generation
- video prompt preparation

Roles:

- Project Manager
- Content Strategist
- Copywriter
- Storyboard Artist
- Creative Director
- Image Production Agent
- Video Production Agent
- Quality Reviewer

### UI/UX Team

Use cases:

- app screens
- web dashboards
- component systems
- user flows

Roles:

- Product Manager
- UX Designer
- UI Designer
- Design System Reviewer
- Workflow Architect
- Quality Reviewer

### Workflow Engineering Team

Use cases:

- create workflow from requirement
- modify existing workflow
- diagnose failed workflow
- promote workflow to template

Roles:

- Project Manager
- Workflow Architect
- Node Configuration Agent
- Workflow Validator
- Workflow Diagnostician
- Knowledge Curator

### Knowledge Operations Team

Use cases:

- organize project memory
- index assets
- summarize run history
- create prompt packs
- clean obsolete knowledge

Roles:

- Knowledge Curator
- Asset Manager
- Run Reviewer
- Template Librarian
- Risk Reviewer

## Collaboration Modes

### Serial Production

```text
Brief -> Strategy -> Concept -> Workflow -> Production -> Review -> Delivery
```

Use for stable, predictable tasks.

### Parallel Proposal

```text
Brief
  -> Concept A
  -> Concept B
  -> Concept C
  -> Creative Director review
```

Use for creative exploration.

### Review and Retry

```text
Production -> Quality review -> Prompt or workflow revision -> Production retry
```

Use for image/video quality improvement.

### Meeting Mode

```text
Multiple roles produce opinions -> Project Manager summarizes decision
```

Use for early ideation. This should be later-stage because it is harder to control.

## Workflow Building Behavior

Workflow Architect must not directly emit raw final React Flow node graphs without validation.

Required path:

```text
User brief
  -> WorkflowIntent
  -> WorkflowDraft
  -> deterministic compiler
  -> validation report
  -> user preview
  -> user confirmation
  -> save or execute
```

Example:

```text
Request:
  Build a workflow that takes a product image and a selling point, then outputs 6 hero images.

WorkflowDraft:
  Inputs:
    product image
    selling point text
  Stages:
    retrieve brand rules
    expand selling point
    create prompt variants
    generate six image candidates
    review candidates
    save accepted outputs
```

Compiled workflow:

```text
Image Input
Text Input
Prompt Helper or AI Chat
Image Gen x 6
Image Compare or Review
Save File
Output
```

## Approval Rules

Default approvals:

- read-only knowledge search: automatic
- workflow draft creation: automatic
- applying draft to current canvas: confirmation
- saving workflow: confirmation
- executing workflow: confirmation
- image or video generation with cost: confirmation
- knowledge promotion to durable brand/project rule: confirmation
- deletion or overwrite: confirmation

## Deliverables

Every team run should produce:

- brief summary
- selected team and roles
- task plan
- workflow drafts or executed workflow IDs
- generated artifacts
- review scores
- retry notes
- final recommendation
- knowledge writeback summary

