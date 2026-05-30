# SueLr Studio Intelligence Program

This directory contains the public plan for replacing the immature legacy Agent with a global conversational Agent powered by an LLM planner and governed tool calls.

The product direction has changed: the first-class experience is not a design-team template system and not a workflow-page assistant. Users talk to a global Agent. The Agent selects a planner model inside the Agent window, creates a structured plan, calls controlled tools, and returns final results while keeping tool records collapsed by default.

Start here:

- `00-master-plan.md`: product vision, target architecture, ownership boundaries, and rollout principles
- `01-phased-execution-plan.md`: implementation phases and exit criteria
- `02-acceptance-plan.md`: per-phase acceptance plan and total acceptance gate
- `03-legacy-agent-replacement-plan.md`: migration path from legacy Agent APIs to the new Agent runtime
- `04-knowledge-base-taxonomy.md`: knowledge categories, write policies, retrieval rules, and storage evolution
- `05-conversational-agent-planner.md`: Agent UX, planner model selection, LLM planner, and tool orchestration
- `06-governance-and-gates.md`: documentation gates, safety policy, and verification checklist

Workflow creation, editing, running, and diagnosis are tools the Agent may call. They are not the Agent's identity.
