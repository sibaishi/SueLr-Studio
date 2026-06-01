# Legacy Agent Replacement Plan

## Current Legacy Surface

```text
backend/src/modules/agent/
src/shared/api/agent.ts
src/shared/hooks/useMemory.ts
src/features/settings/components/AgentProfileEditor.tsx
src/features/settings/components/AgentPersonaSection.tsx
src/features/settings/components/MemorySection.tsx
```

Current capabilities include chat/tool loops, web search, image/video generation, workflow execution, memory, profiles, sessions, and streaming responses.

Known limitations:

- profiles are too close to `prompt + tools`
- no structured LLM planner layer
- no governed Tool/Skill runtime
- memory is not typed knowledge
- workflow creation/editing is not reliable
- run traces are not rich enough

## Replacement Principles

- Replace by capability, not by immediate deletion.
- Preserve legacy routes until the new Agent covers required flows.
- New backend intelligence code lives under `backend/src/modules/intelligence/`.
- New frontend Agent UI lives under `src/features/agent/`.
- Legacy Agent receives no new strategic features.

## Migration Map

```text
Legacy AgentRuntime
  -> intelligence/agent/
  -> intelligence/runtime/

Legacy ToolRegistry
  -> intelligence/skills/
  -> intelligence/tools/

Legacy Agent profiles
  -> Agent-window planner model selection
  -> planner context builder
  -> tool policy

Legacy memory
  -> intelligence/knowledge/

Legacy sessions
  -> intelligence/runtime/run-trace

Legacy workflow_execute
  -> workflow.execute tool
  -> ExecutionService

Legacy workflow assistant
  -> workflow.createDraft / workflow.edit / workflow.execute tools in the global Agent
```

## Compatibility Phases

1. Parallel intelligence routes.
2. Shared Skill/Tool backends.
3. Memory to Knowledge bridge.
4. Global Agent UI.
5. LLM planner.
6. Default cutover.
7. Removal or compatibility shell.

## Deletion Criteria

Do not delete `backend/src/modules/agent/` until all are true:

- `npm run check` passes.
- No primary frontend surface depends on `src/shared/api/agent.ts`.
- Legacy profile data has migration or archival path.
- Legacy memory has migration or archival path.
- New Agent covers image, video, search, and workflow execution.
- New Agent has trace records.
- User-facing docs describe the new system.

## Rollback Strategy

Before final deletion:

- keep legacy routes mounted
- keep legacy persisted files readable
- preserve API clients until no callers remain
- make major cutover after a stable commit or tag
