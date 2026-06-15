// @ts-nocheck
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { agentRunner } from '../src/modules/intelligence/runtime/agent-runner.ts';

function createStorageDir(name) {
  const root = path.resolve(os.tmpdir(), 'suelr-studio-tests', `intelligence-${name}-${Date.now()}`);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

async function createTestServer(name) {
  const root = createStorageDir(name);
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';
  const { createApp } = await import(`../src/app/create-app.ts?test=${Date.now()}`);
  const app = createApp();

  return await new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
    server.on('error', reject);
  });
}

async function requestJson(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

function assertEnvelopeShape(body) {
  assert.equal(typeof body?.success, 'boolean');
  const allowedKeys = body.success ? ['data', 'success'] : ['error', 'success'];
  assert.deepEqual(Object.keys(body).sort(), allowedKeys);
}

const plannerModel = {
  id: 'test-planner',
  modelId: 'test-model',
  label: 'Test Model',
};

function createWorkflow(id) {
  return {
    id,
    name: 'Agent 确认测试工作流',
    nodes: [
      {
        id: 'prompt',
        type: 'io',
        position: { x: 0, y: 0 },
        data: { label: '提示词', text: '默认输入' },
      },
      {
        id: 'output',
        type: 'io',
        position: { x: 220, y: 0 },
        data: {},
      },
    ],
    edges: [
      {
        id: 'edge_prompt_output',
        source: 'prompt',
        sourceHandle: 'result',
        target: 'output',
        targetHandle: 'input',
      },
    ],
    settings: {},
  };
}

function buildExecutePlan({ workflowId, workflowName, workflowSnapshot } = {}) {
  return {
    id: `plan_${workflowId || workflowSnapshot?.id || 'snapshot'}`,
    source: 'llm',
    plannerModel,
    summary: '准备执行当前工作流',
    toolName: 'workflow.execute',
    toolInput: {
      ...(workflowId ? { workflowId } : {}),
      ...(workflowName ? { workflowName } : {}),
      ...(workflowSnapshot ? { workflowSnapshot } : {}),
    },
    reasoningSummary: '用户要求执行当前工作流',
    warnings: [],
    knowledgeContext: { source: 'test', items: [] },
  };
}

function stubPlanner(planInput) {
  const originalPlanner = agentRunner.planner;
  agentRunner.planner = {
    async createPlan() {
      return buildExecutePlan(planInput);
    },
  };
  return () => {
    agentRunner.planner = originalPlanner;
    agentRunner.pendingApprovals.clear();
  };
}

async function saveWorkflow(baseUrl, workflowId) {
  const saved = await requestJson(baseUrl, '/api/workflows', {
    method: 'POST',
    body: JSON.stringify(createWorkflow(workflowId)),
  });
  assert.equal(saved.status, 200);
}

async function createPendingApproval(baseUrl, workflowId) {
  await saveWorkflow(baseUrl, workflowId);
  const pending = await requestJson(baseUrl, '/api/intelligence/agent-runs', {
    method: 'POST',
    body: JSON.stringify({
      input: '执行这个工作流',
      plannerModel,
      context: { workflowId },
    }),
  });
  assert.equal(pending.status, 200);
  assertEnvelopeShape(pending.body);
  assert.equal(pending.body.data.approvalRequired, true);
  assert.equal(pending.body.data.pendingApproval.toolName, 'workflow.execute');
  assert.match(pending.body.data.pendingApproval.id, /^approval_/);
  return pending.body.data.pendingApproval;
}

async function postApproval(baseUrl, pendingApproval, input = '确认执行', toolInput = pendingApproval.toolInput) {
  return requestJson(baseUrl, '/api/intelligence/agent-runs', {
    method: 'POST',
    body: JSON.stringify({
      input,
      plannerModel,
      approval: {
        id: pendingApproval.id,
        toolName: 'workflow.execute',
        toolInput,
      },
    }),
  });
}

test('agent-runs confirms workflow.execute approval over HTTP', async () => {
  const workflowId = 'wf_agent_approval';
  const restorePlanner = stubPlanner({ workflowId });
  const { server, baseUrl } = await createTestServer('agent-run-approval');
  try {
    const pendingApproval = await createPendingApproval(baseUrl, workflowId);
    assert.equal(Array.isArray(pendingApproval.toolInput.requiredInputs), true);

    const confirmed = await postApproval(baseUrl, pendingApproval, '确认执行', {
      ...pendingApproval.toolInput,
      inputs: {
        prompt: '来自确认卡片的输入覆盖',
      },
    });

    assert.equal(confirmed.status, 200);
    assertEnvelopeShape(confirmed.body);
    assert.equal(confirmed.body.data.approvalRequired, false);
    assert.equal(confirmed.body.data.pendingApproval, null);
    assert.equal(confirmed.body.data.toolResults[0].skillId, 'workflow.execute');
    assert.equal(confirmed.body.data.toolResults[0].output.run.status, 'completed');
    assert.equal(confirmed.body.data.toolResults[0].output.run.appliedInputs[0].matchedBy, 'prompt');
  } finally {
    restorePlanner();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('agent-runs rejects forged workflow.execute approval over HTTP', async () => {
  const { server, baseUrl } = await createTestServer('agent-run-forged');
  try {
    const forged = await postApproval(baseUrl, {
      id: 'approval_00000000-0000-0000-0000-000000000000',
      toolInput: { workflowId: 'wf_fake', confirmed: true },
    });

    assert.equal(forged.status, 400);
    assertEnvelopeShape(forged.body);
    assert.equal(forged.body.error.code, 'AGENT_TOOL_APPROVAL_INVALID');
    assert.match(forged.body.error.message, /已失效/);
  } finally {
    agentRunner.pendingApprovals.clear();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('agent-runs rejects expired workflow.execute approval over HTTP', async () => {
  const workflowId = 'wf_agent_expired';
  const restorePlanner = stubPlanner({ workflowId });
  const { server, baseUrl } = await createTestServer('agent-run-expired');
  try {
    const pendingApproval = await createPendingApproval(baseUrl, workflowId);
    const approval = agentRunner.pendingApprovals.get(pendingApproval.id);
    assert.ok(approval);
    approval.expiresAt = Date.now() - 1000;

    const expired = await postApproval(baseUrl, pendingApproval);
    assert.equal(expired.status, 400);
    assertEnvelopeShape(expired.body);
    assert.equal(expired.body.error.code, 'AGENT_TOOL_APPROVAL_INVALID');
    assert.match(expired.body.error.message, /已失效/);
  } finally {
    restorePlanner();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('agent-runs normalizes approval scope to local single-user over HTTP', async () => {
  const workflowId = 'wf_agent_local_scope';
  const { server, baseUrl } = await createTestServer('agent-run-local-scope');
  try {
    await saveWorkflow(baseUrl, workflowId);
    const pendingApproval = agentRunner.createPendingApproval(buildExecutePlan({ workflowId }), {
      userId: 'other-user',
      workspaceId: 'default',
      runtimeMode: 'local-web',
    });

    const localScope = await postApproval(baseUrl, pendingApproval);
    assert.equal(localScope.status, 200);
    assertEnvelopeShape(localScope.body);
    assert.equal(localScope.body.data.approvalRequired, false);
  } finally {
    agentRunner.pendingApprovals.clear();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('agent-runs rejects duplicate workflow.execute approval consumption over HTTP', async () => {
  const workflowId = 'wf_agent_duplicate';
  const restorePlanner = stubPlanner({ workflowId });
  const { server, baseUrl } = await createTestServer('agent-run-duplicate');
  try {
    const pendingApproval = await createPendingApproval(baseUrl, workflowId);

    const firstConfirm = await postApproval(baseUrl, pendingApproval);
    assert.equal(firstConfirm.status, 200);

    const secondConfirm = await postApproval(baseUrl, pendingApproval, '再次确认');
    assert.equal(secondConfirm.status, 400);
    assertEnvelopeShape(secondConfirm.body);
    assert.equal(secondConfirm.body.error.code, 'AGENT_TOOL_APPROVAL_INVALID');
    assert.match(secondConfirm.body.error.message, /已失效/);
  } finally {
    restorePlanner();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('agent-runs confirms workflow.execute approval for an unsaved workflow snapshot over HTTP', async () => {
  const workflowSnapshot = createWorkflow('wf_agent_unsaved_snapshot');
  workflowSnapshot.name = '未保存画布执行确认测试';
  const restorePlanner = stubPlanner({ workflowSnapshot, workflowName: workflowSnapshot.name });
  const { server, baseUrl } = await createTestServer('agent-run-unsaved-snapshot');
  try {
    const pending = await requestJson(baseUrl, '/api/intelligence/agent-runs', {
      method: 'POST',
      body: JSON.stringify({
        input: '执行当前画布',
        plannerModel,
        context: {
          workflowName: workflowSnapshot.name,
          workflowSnapshot,
        },
      }),
    });
    assert.equal(pending.status, 200);
    assertEnvelopeShape(pending.body);
    assert.equal(pending.body.data.approvalRequired, true);
    const pendingApproval = pending.body.data.pendingApproval;
    assert.equal(pendingApproval.toolName, 'workflow.execute');
    assert.equal(pendingApproval.toolInput.workflowSnapshot.name, workflowSnapshot.name);

    const confirmed = await postApproval(baseUrl, pendingApproval, '确认执行当前画布', {
      ...pendingApproval.toolInput,
      workflowSnapshot,
      inputs: {
        prompt: '来自未保存画布的输入覆盖',
      },
    });

    assert.equal(confirmed.status, 200);
    assertEnvelopeShape(confirmed.body);
    assert.equal(confirmed.body.data.approvalRequired, false);
    assert.equal(confirmed.body.data.toolResults[0].skillId, 'workflow.execute');
    assert.equal(confirmed.body.data.toolResults[0].output.run.status, 'completed');
    assert.equal(confirmed.body.data.toolResults[0].output.run.workflowId, workflowSnapshot.id);
    assert.equal(confirmed.body.data.toolResults[0].output.run.appliedInputs[0].matchedBy, 'prompt');
  } finally {
    restorePlanner();
    await new Promise((resolve) => server.close(resolve));
  }
});
