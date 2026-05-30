// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

function createStorageDir(name) {
  const root = path.resolve('.tmp-tests', `workflow-execution-http-${name}-${Date.now()}`);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

async function createTestServer(name) {
  const root = createStorageDir(name);
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';
  const { createApp } = await import(`../src/app/create-app.ts?workflowExecutionHttp=${Date.now()}-${Math.random()}`);
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

async function waitForRunIdFromSse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return null;
      buffer += decoder.decode(value, { stream: true });
      const match = buffer.match(/event: workflow_snapshot_built\ndata: (.+?)\n\n/s);
      if (match) {
        const snapshot = JSON.parse(match[1]);
        return snapshot.runId;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function assertValidationEnvelope(response) {
  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  assert.equal(typeof response.body.error.message, 'string');
  assert.equal('stack' in response.body.error, false);
}

test('workflow HTTP boundary rejects invalid workflow ids with a validation envelope', async () => {
  const { server, baseUrl } = await createTestServer('workflow-id');
  try {
    const response = await requestJson(baseUrl, '/api/workflows/bad$id');

    assertValidationEnvelope(response);
    assert.match(response.body.error.message, /workflow\.id/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('workflow import HTTP boundary rejects invalid import mode with a validation envelope', async () => {
  const { server, baseUrl } = await createTestServer('workflow-import-mode');
  try {
    const response = await requestJson(baseUrl, '/api/workflows/import?mode=invalid_mode', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    assertValidationEnvelope(response);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('execution HTTP boundary rejects invalid draft execution bodies with a validation envelope', async () => {
  const { server, baseUrl } = await createTestServer('execution-body');
  try {
    const response = await requestJson(baseUrl, '/api/execute/wf_valid', {
      method: 'POST',
      body: JSON.stringify({ source: 'draft', edges: [] }),
    });

    assertValidationEnvelope(response);
    assert.match(response.body.error.message, /nodes/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('execution SSE disconnect does not cancel the active run so polling can recover it', async () => {
  const { NODE_EXECUTORS } = await import('../src/engine/nodes/index.ts');
  const originalTextClean = NODE_EXECUTORS.textClean;
  const started = deferred();
  const release = deferred();
  NODE_EXECUTORS.textClean = async (_node, inputs) => {
    started.resolve();
    await release.promise;
    return { text: String(inputs.text || '') };
  };

  const { server, baseUrl } = await createTestServer('execution-disconnect-recover');
  try {
    const response = await fetch(`${baseUrl}/api/execute/wf_disconnect_recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'draft',
        name: 'Disconnect Recover Workflow',
        nodes: [
          { id: 'input', type: 'textInput', position: { x: 0, y: 0 }, data: { text: 'hello' } },
          { id: 'clean', type: 'textClean', position: { x: 160, y: 0 }, data: {} },
        ],
        edges: [
          {
            id: 'edge-input-clean',
            source: 'input',
            sourceHandle: 'text',
            target: 'clean',
            targetHandle: 'text',
          },
        ],
      }),
    });
    assert.equal(response.status, 200);

    const runId = await waitForRunIdFromSse(response);
    assert.equal(typeof runId, 'string');
    await started.promise;

    const running = await requestJson(baseUrl, `/api/execute/runs/${runId}/status`);
    assert.equal(running.status, 200);
    assert.equal(running.body.success, true);
    assert.equal(running.body.data.status, 'running');

    release.resolve();

    const deadline = Date.now() + 1000;
    let finalStatus = null;
    while (Date.now() < deadline) {
      const status = await requestJson(baseUrl, `/api/execute/runs/${runId}/status`);
      finalStatus = status.body.data.status;
      if (finalStatus === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    assert.equal(finalStatus, 'completed');
  } finally {
    release.resolve();
    NODE_EXECUTORS.textClean = originalTextClean;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('regular workflow execution caches output artifacts for intelligence summaries', async () => {
  const { server, baseUrl } = await createTestServer('execution-summary-artifacts');
  try {
    const response = await fetch(`${baseUrl}/api/execute/wf_summary_artifacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'draft',
        name: 'Summary Artifacts Workflow',
        nodes: [
          { id: 'input', type: 'textInput', position: { x: 0, y: 0 }, data: { text: 'hello summary artifact' } },
          { id: 'output', type: 'output', position: { x: 220, y: 0 }, data: {} },
        ],
        edges: [
          {
            id: 'edge-input-output',
            source: 'input',
            sourceHandle: 'text',
            target: 'output',
            targetHandle: 'content',
          },
        ],
      }),
    });
    assert.equal(response.status, 200);

    const runId = await waitForRunIdFromSse(response);
    assert.equal(typeof runId, 'string');

    const deadline = Date.now() + 1000;
    let finalStatus = null;
    while (Date.now() < deadline) {
      const status = await requestJson(baseUrl, `/api/execute/runs/${runId}/status`);
      finalStatus = status.body.data.status;
      if (finalStatus === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(finalStatus, 'completed');

    const summary = await requestJson(baseUrl, '/api/intelligence/runs', {
      method: 'POST',
      body: JSON.stringify({
        input: '总结刚才的常规执行结果',
        skills: ['workflow.summarizeRun'],
        context: { runId },
      }),
    });
    assert.equal(summary.status, 200);
    const report = summary.body.data.skillResults[0].output.report;
    assert.equal(Array.isArray(report.keyOutputs), true);
    assert.equal(report.keyOutputs.some((item) => item.nodeId === 'output'), true);
    assert.equal(Array.isArray(report.artifacts), true);
    assert.equal(report.artifacts.length > 0, true);
    assert.match(report.artifacts[0].url, /^\/api\/outputs\//);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('intelligence summaries exclude generated thumbnails from output artifacts', async () => {
  const { server, baseUrl } = await createTestServer('execution-summary-thumbnail-filter');
  const imageDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lx18XwAAAABJRU5ErkJggg==';

  try {
    const response = await fetch(`${baseUrl}/api/execute/wf_summary_thumbnail_filter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'draft',
        name: 'Summary Thumbnail Filter Workflow',
        nodes: [
          { id: 'input', type: 'imageInput', position: { x: 0, y: 0 }, data: { fileUrl: imageDataUrl } },
          { id: 'output', type: 'output', position: { x: 220, y: 0 }, data: {} },
        ],
        edges: [
          {
            id: 'edge-input-output',
            source: 'input',
            sourceHandle: 'image',
            target: 'output',
            targetHandle: 'content',
          },
        ],
      }),
    });
    assert.equal(response.status, 200);

    const runId = await waitForRunIdFromSse(response);
    assert.equal(typeof runId, 'string');

    const deadline = Date.now() + 1000;
    let finalStatus = null;
    while (Date.now() < deadline) {
      const status = await requestJson(baseUrl, `/api/execute/runs/${runId}/status`);
      finalStatus = status.body.data.status;
      if (finalStatus === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(finalStatus, 'completed');

    const summary = await requestJson(baseUrl, '/api/intelligence/runs', {
      method: 'POST',
      body: JSON.stringify({
        input: '总结刚才的图片输出结果',
        skills: ['workflow.summarizeRun'],
        context: { runId },
      }),
    });
    assert.equal(summary.status, 200);
    const report = summary.body.data.skillResults[0].output.report;
    assert.deepEqual(
      report.artifacts.map((artifact) => artifact.url),
      report.artifacts.map((artifact) => artifact.url).filter((url) => !url.includes('/.thumbnails/')),
    );
    assert.equal(report.artifacts.length, 1);
    assert.match(report.artifacts[0].url, /^\/api\/outputs\/images\/.+\.png$/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
