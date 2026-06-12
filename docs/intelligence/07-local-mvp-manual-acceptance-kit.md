# Local MVP Manual Acceptance Kit

This guide prepares the manual acceptance pass for the current local MVP closure work.

Scope:

- cover `local-web` and `desktop`
- focus on Phase 5 planner quality and Phase 6 workflow edit/run/diagnose closure
- verify only the supported local runtime shapes

## Ready-to-use Samples

- [workflows/sample-agent-local-text-output.json](/Users/sueliuran/Documents/Codex/2026-05-26/new-chat-3/SueLr-Studio/workflows/sample-agent-local-text-output.json)
  - stable success path
  - no model and no API key required
  - use it to verify execution confirmation, input override, final output, and run summary
- [workflows/sample-agent-local-ai-failure.json](/Users/sueliuran/Documents/Codex/2026-05-26/new-chat-3/SueLr-Studio/workflows/sample-agent-local-ai-failure.json)
  - stable failure path when no API key is configured
  - use it to verify execution confirmation, failure diagnosis, and run summary
- [workflows/sample-basic-chat.json](/Users/sueliuran/Documents/Codex/2026-05-26/new-chat-3/SueLr-Studio/workflows/sample-basic-chat.json)
  - optional reference sample
  - can be used as an AI success case only after a chat model and provider key are configured

## Startup Matrix

### `local-web`

```bash
npm run dev:local-web
```

Expected:

- backend runs in `local-web`
- browser app opens on `http://localhost:5173/`
- Agent and workflow page share the same local backend

### `desktop`

```bash
npm run build
npm run electron:dev
```

Expected:

- Electron opens a single `SueLr Studio` window
- embedded backend starts automatically
- app data and outputs resolve through the desktop runtime path

## Manual Prompt Pack

Use these prompts in the global Agent after enabling at least one chat model and selecting a Planner model.

### Case A: storyboard planning quality

Prompt:

```text
帮我做一个分镜图生成流程，用文本脚本生成 8 张连续分镜图。
```

Pass when:

- planner treats the task as storyboard image sequence work
- no direct `videoGen` choice appears as the primary path
- the draft can reasonably include text input, split or iterate, image generation, save or output
- if the task lacks enough detail, the Agent asks for clarification instead of forcing execution

### Case B: simple direct output

Prompt:

```text
做一个文本输入后直接输出展示的最小流程。
```

Pass when:

- planner chooses a minimal text-input-to-output structure
- prompt-helper-style nodes are not forced in

### Case C: merge semantics

Prompt:

```text
做一个流程，把标题、卖点、CTA 三个文本输入合并后输出展示。
```

Pass when:

- planner understands merge as aggregation
- the result is not reduced to only one non-empty input

### Case D: iteration semantics

Prompt:

```text
把 8 条分镜文案逐条执行并分别输出结果。
```

Pass when:

- planner understands per-item execution
- the result is not planned as “pick the first non-empty input and run once”

## Manual Closure Flow

### 1. Draft generation and open-canvas handoff

Steps:

1. Open `AI Assistant`.
2. Select a Planner model inside `AI Agent`.
3. Use Case A or Case B.
4. Ask the Agent to generate the workflow draft.
5. Click `新建画布`.

Pass when:

- a draft is generated
- tool records stay collapsed by default
- opening the draft creates or switches to a workflow canvas

### 2. Current-canvas inspect and edit preview

Steps:

1. Keep the opened canvas active.
2. Return to the Agent.
3. Ask the Agent to inspect the current workflow.
4. Ask the Agent to make a small safe edit, for example:

```text
把当前工作流里的文本输入标签改成“本次执行输入”。
```

5. Review the edit preview.
6. Click the apply request and then confirm the patch application.

Pass when:

- Agent can summarize the current canvas
- Agent returns a patch preview instead of mutating the canvas directly
- `workflow.applyDraft` asks for confirmation before the canvas changes
- the canvas updates only after confirmation

### 3. Success run without external models

Preparation:

1. Import [workflows/sample-agent-local-text-output.json](/Users/sueliuran/Documents/Codex/2026-05-26/new-chat-3/SueLr-Studio/workflows/sample-agent-local-text-output.json) on the workflow page.
2. Keep this canvas active.

Steps:

1. In Agent, say `运行当前工作流`。
2. Confirm the execution card lists the input node and current value.
3. Replace the input with a visible override such as:

```text
第 5 步本地验收成功路径已连通。
```

4. Click confirm run.
5. After completion, ask:

```text
请总结刚才的运行
```

Pass when:

- `workflow.execute` requires confirmation
- the input-confirmation card shows current value and editable override
- the final run completes successfully
- output content reflects the confirmed override value
- the Agent can summarize the run and show a clear result

### 4. Failure run and diagnosis

Preparation:

1. Import [workflows/sample-agent-local-ai-failure.json](/Users/sueliuran/Documents/Codex/2026-05-26/new-chat-3/SueLr-Studio/workflows/sample-agent-local-ai-failure.json) on the workflow page.
2. Do not configure an API key for this case.

Steps:

1. In Agent, say `运行当前工作流`。
2. Confirm the run.
3. After the run fails, ask:

```text
请诊断刚才的运行
```

4. Then ask:

```text
请总结刚才的运行
```

Pass when:

- execution still requires confirmation before running
- the run fails for a clear runtime reason rather than a broken Agent loop
- diagnosis explains the failure at node or provider level when possible
- summary still returns the failed run status and report envelope

## Variant-by-Variant Exit Checklist

Each of `local-web` and `desktop` should pass the following:

- global Agent is reachable from `AI Assistant`
- planner model can be selected inside Agent
- storyboard prompt does not default to direct video generation
- draft opens on canvas
- inspect works on the current canvas
- edit preview works and requires confirmation before applying
- success run works with the text-output sample
- failure diagnosis works with the no-key AI sample
- tool records are collapsed by default and can be expanded

## Command Gate

Before calling the local MVP pass complete, run:

```bash
npm run check
```

If the current machine cannot use the repository root `typecheck` script because it shells through `npm.cmd`, use that only as an environment workaround during iteration, not as the final release sign-off condition.
