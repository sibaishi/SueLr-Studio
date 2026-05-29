# Legacy Agent Replacement Plan

## Current Legacy Surface

The current Agent implementation lives mainly under:

```text
backend/src/modules/agent/
src/shared/api/agent.ts
src/shared/hooks/useMemory.ts
src/features/settings/components/AgentProfileEditor.tsx
src/features/settings/components/AgentPersonaSection.tsx
src/features/settings/components/MemorySection.tsx
```

Important current capabilities:

- Agent profile resolution
- chat/tool loop runtime
- tool registry
- web search
- image generation
- video generation
- workflow execution
- memory search/write
- session store
- streaming responses

Known limitations:

- profile model is too close to "prompt plus tools"
- Skills are embedded in one tool registry instead of a composable capability system
- memory is not a full typed knowledge base
- workflow creation is not first-class
- multi-role design teams are not represented
- run traces are not rich enough for full team/workflow/knowledge auditing
- some Chinese user-facing strings currently require encoding cleanup

## Replacement Principles

- Replace by capability, not by file deletion first.
- Preserve current user flows until the new runtime covers them.
- Keep old `/api/agent` compatible until chat and settings move.
- New code should live in `backend/src/modules/intelligence/`.
- Old code should not receive new strategic features after Phase 1.
- Existing tests should be migrated or kept as regression protection until cutover.

## Migration Map

```text
Legacy AgentRuntime
  -> intelligence/runtime/intelligence-runtime.ts

Legacy ToolRegistry
  -> intelligence/skills/skill-registry.ts

Legacy Agent profiles
  -> intelligence/agents/agent-role.service.ts
  -> intelligence/teams/team-template.service.ts

Legacy memory service
  -> intelligence/knowledge/knowledge.service.ts
  -> typed knowledge stores

Legacy sessions
  -> intelligence/runtime/run-trace.ts

Legacy workflow_execute tool
  -> intelligence/skills/workflow.execute
  -> still calls ExecutionService

Legacy frontend API client
  -> src/shared/api/intelligence.ts
```

## Compatibility Phases

### Compatibility Phase A: Parallel Runtime

Add intelligence routes without touching old routes.

Expected state:

- `/api/agent` works as before
- `/api/intelligence` exists for new read-only capabilities
- settings still edits old profiles
- tests cover both surfaces

### Compatibility Phase B: Shared Skill Backends

Move reusable handlers behind new Skill interfaces while old tool registry can call adapters.

Expected state:

- old tools still work
- new Skills become canonical
- duplicate logic is reduced

### Compatibility Phase C: Knowledge Bridge

Add import/export between old memory and new typed knowledge.

Expected state:

- old memory remains readable
- new knowledge can search imported memory
- governance metadata makes memory "context only"

### Compatibility Phase D: Frontend Opt-In

Expose new intelligence mode in settings or behind a development flag.

Expected state:

- selected users can use new runtime
- old runtime remains fallback
- traces compare outputs between systems

### Compatibility Phase E: Default Cutover

Make intelligence runtime the default path for chat/team/workflow assistant.

Expected state:

- old runtime still available as fallback only
- old profile editor is replaced by Agent/Team/Skill configuration
- frontend callers prefer `src/shared/api/intelligence.ts`

### Compatibility Phase F: Removal

Remove old runtime when parity and acceptance gates pass.

Expected state:

- no primary frontend caller imports `src/shared/api/agent.ts`
- backend route registration no longer mounts old agent routes
- old tests are migrated to intelligence tests
- developer docs list legacy removal

## Required Parity Matrix

| Capability | Legacy Source | New Owner | Cutover Requirement |
| --- | --- | --- | --- |
| Chat response | `agent-runtime.ts` | `intelligence-runtime.ts` | streaming and non-streaming parity |
| Tool registry | `tool-registry.ts` | `skill-registry.ts` | schema, side effect, approval metadata |
| Web search | legacy tool | `web.search` Skill | same provider config behavior |
| Image generation | legacy tool | `image.generate` Skill | same artifact URL contract |
| Video generation | legacy tool | `video.generate` Skill | same task/result behavior |
| Workflow execution | legacy tool | `workflow.execute` Skill | uses `ExecutionService` and current grounding rules |
| Memory search | `agent-memory.service.ts` | `knowledge.search` + memory import | memory remains context only |
| Memory write | `agent-memory.service.ts` | `knowledge.write` with policy | source, scope, confirmation rules |
| Profiles | `agent-profile.service.ts` | Agent role and team services | migration path for custom profiles |
| Sessions | `agent-session-store.ts` | run trace | recoverable run visibility |

## Deletion Criteria

Do not delete `backend/src/modules/agent/` until all are true:

- `npm run check` passes
- no active frontend surface depends on old agent APIs
- old profile data has a migration or archival path
- old memory data has a migration or archival path
- current workflow execution through Agent is covered by new tests
- user-facing docs describe the new system
- release SOP mentions any migration risk if user data format changed

## Rollback Strategy

During Phases A through E:

- keep old routes mounted
- keep old persisted files readable
- preserve API clients until no callers remain
- gate new behavior behind settings or runtime feature flags when risky

After Phase F:

- rollback requires restoring the last commit before deletion
- therefore Phase F must happen only after a tagged or easily identifiable stable commit

