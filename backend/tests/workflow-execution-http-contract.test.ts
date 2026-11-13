// @ts-nocheck

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createTestServer as createRuntimeTestServer, requestJson } from './helpers/runtime-test.ts';

const createTestServer = (name) =>
  createRuntimeTestServer(name, { prefix: 'workflow-execution-http', queryKey: 'workflowExecutionHttp' });

function deferred() {
  let resolve: (value?: unknown) => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<unknown>((promiseResolve, promiseReject) => {
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
  const originalIo = NODE_EXECUTORS.io;
  const started = deferred();
  const release = deferred();
  NODE_EXECUTORS.io = async (node, inputs, apiConfig, progress) => {
    if (node.data?.content !== undefined || node.id === 'merge') return originalIo(node, inputs, apiConfig, progress);
    started.resolve();
    await release.promise;
    return { result: String(inputs.input || '') };
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
          { id: 'input', type: 'io', position: { x: 0, y: 0 }, data: { content: 'hello' } },
          {
            id: 'clean',
            type: 'io',
            position: { x: 160, y: 0 },
            data: {},
          },
        ],
        edges: [
          {
            id: 'edge-input-clean',
            source: 'input',
            sourceHandle: 'result',
            target: 'clean',
            targetHandle: 'input',
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
    NODE_EXECUTORS.io = originalIo;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('workflow runtime assets remain served after completion until the same workflow starts again', async () => {
  const { NODE_EXECUTORS } = await import('../src/engine/nodes/index.ts');
  const { writeWorkflowRuntimeAsset } = await import('../src/platform/storage/workflow-runtime-assets.ts');
  const originalIo = NODE_EXECUTORS.io;
  const assetReady = deferred();
  const release = deferred();
  NODE_EXECUTORS.io = async (node, inputs, apiConfig, progress) => {
    if (node.id === 'input') return originalIo(node, inputs, apiConfig, progress);
    const url = writeWorkflowRuntimeAsset(apiConfig.runId, Buffer.from('runtime-image'), 'image/png', apiConfig.scope);
    assetReady.resolve(url);
    await release.promise;
    return { result: url };
  };

  const { server, baseUrl } = await createTestServer('runtime-asset-lifecycle');
  try {
    const response = await fetch(`${baseUrl}/api/execute/wf_runtime_asset_lifecycle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'draft',
        name: 'Runtime Asset Lifecycle',
        nodes: [
          { id: 'input', type: 'io', position: { x: 0, y: 0 }, data: { content: 'source' } },
          {
            id: 'split',
            type: 'io',
            position: { x: 160, y: 0 },
            data: {},
          },
        ],
        edges: [
          {
            id: 'edge-input-split',
            source: 'input',
            sourceHandle: 'result',
            target: 'split',
            targetHandle: 'input',
          },
        ],
      }),
    });
    assert.equal(response.status, 200);
    const runId = await waitForRunIdFromSse(response);
    assert.equal(typeof runId, 'string');

    const runtimeUrl = await assetReady.promise;
    const liveAsset = await fetch(`${baseUrl}${runtimeUrl}`);
    assert.equal(liveAsset.status, 200);
    assert.deepEqual(Buffer.from(await liveAsset.arrayBuffer()), Buffer.from('runtime-image'));

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

    assert.equal((await fetch(`${baseUrl}${runtimeUrl}`)).status, 200);

    const nextResponse = await fetch(`${baseUrl}/api/execute/wf_runtime_asset_lifecycle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'draft',
        name: 'Runtime Asset Lifecycle',
        nodes: [
          { id: 'input', type: 'io', position: { x: 0, y: 0 }, data: { content: 'source' } },
          {
            id: 'split',
            type: 'io',
            position: { x: 160, y: 0 },
            data: {},
          },
        ],
        edges: [
          {
            id: 'edge-input-split',
            source: 'input',
            sourceHandle: 'result',
            target: 'split',
            targetHandle: 'input',
          },
        ],
      }),
    });
    await waitForRunIdFromSse(nextResponse);
    assert.equal((await fetch(`${baseUrl}${runtimeUrl}`)).status, 404);
  } finally {
    release.resolve();
    NODE_EXECUTORS.io = originalIo;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('failed workflow runtime assets remain served until the same workflow starts again', async () => {
  const { NODE_EXECUTORS } = await import('../src/engine/nodes/index.ts');
  const { writeWorkflowRuntimeAsset } = await import('../src/platform/storage/workflow-runtime-assets.ts');
  const originalIo = NODE_EXECUTORS.io;
  const assetReady = deferred();
  const release = deferred();
  NODE_EXECUTORS.io = async (node, inputs, apiConfig, progress) => {
    if (node.id === 'input') return originalIo(node, inputs, apiConfig, progress);
    const url = writeWorkflowRuntimeAsset(apiConfig.runId, Buffer.from('failed-runtime-image'), 'image/png');
    assetReady.resolve(url);
    await release.promise;
    throw new Error('expected runtime failure');
  };

  const { server, baseUrl } = await createTestServer('runtime-asset-failure');
  try {
    const response = await fetch(`${baseUrl}/api/execute/wf_runtime_asset_failure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'draft',
        name: 'Runtime Asset Failure',
        nodes: [
          { id: 'input', type: 'io', position: { x: 0, y: 0 }, data: { content: 'source' } },
          {
            id: 'split',
            type: 'io',
            position: { x: 160, y: 0 },
            data: {},
          },
        ],
        edges: [
          {
            id: 'edge-input-split',
            source: 'input',
            sourceHandle: 'result',
            target: 'split',
            targetHandle: 'input',
          },
        ],
      }),
    });
    const runId = await waitForRunIdFromSse(response);
    const runtimeUrl = await assetReady.promise;
    assert.equal((await fetch(`${baseUrl}${runtimeUrl}`)).status, 200);

    release.resolve();
    const deadline = Date.now() + 1000;
    let finalStatus = null;
    while (Date.now() < deadline) {
      const status = await requestJson(baseUrl, `/api/execute/runs/${runId}/status`);
      finalStatus = status.body.data.status;
      if (finalStatus === 'failed') break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(finalStatus, 'failed');
    assert.equal((await fetch(`${baseUrl}${runtimeUrl}`)).status, 200);

    const nextResponse = await fetch(`${baseUrl}/api/execute/wf_runtime_asset_failure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'draft',
        name: 'Runtime Asset Failure',
        nodes: [
          { id: 'input', type: 'io', position: { x: 0, y: 0 }, data: { content: 'source' } },
          {
            id: 'split',
            type: 'io',
            position: { x: 160, y: 0 },
            data: {},
          },
        ],
        edges: [
          {
            id: 'edge-input-split',
            source: 'input',
            sourceHandle: 'result',
            target: 'split',
            targetHandle: 'input',
          },
        ],
      }),
    });
    await waitForRunIdFromSse(nextResponse);
    assert.equal((await fetch(`${baseUrl}${runtimeUrl}`)).status, 404);
  } finally {
    release.resolve();
    NODE_EXECUTORS.io = originalIo;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('cancelled workflow runtime assets remain served until the same workflow starts again', async () => {
  const { NODE_EXECUTORS } = await import('../src/engine/nodes/index.ts');
  const { writeWorkflowRuntimeAsset } = await import('../src/platform/storage/workflow-runtime-assets.ts');
  const originalIo = NODE_EXECUTORS.io;
  const assetReady = deferred();
  NODE_EXECUTORS.io = async (node, inputs, apiConfig, progress) => {
    if (node.id === 'input') return originalIo(node, inputs, apiConfig, progress);
    const url = writeWorkflowRuntimeAsset(apiConfig.runId, Buffer.from('cancelled-runtime-image'), 'image/png');
    assetReady.resolve(url);
    await new Promise((resolve, reject) => {
      if (apiConfig.abortSignal?.aborted) {
        reject(new Error('cancelled'));
        return;
      }
      apiConfig.abortSignal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
    });
    return { result: url };
  };

  const { server, baseUrl } = await createTestServer('runtime-asset-cancellation');
  try {
    const response = await fetch(`${baseUrl}/api/execute/wf_runtime_asset_cancellation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'draft',
        name: 'Runtime Asset Cancellation',
        nodes: [
          { id: 'input', type: 'io', position: { x: 0, y: 0 }, data: { content: 'source' } },
          {
            id: 'split',
            type: 'io',
            position: { x: 160, y: 0 },
            data: {},
          },
        ],
        edges: [
          {
            id: 'edge-input-split',
            source: 'input',
            sourceHandle: 'result',
            target: 'split',
            targetHandle: 'input',
          },
        ],
      }),
    });
    const runId = await waitForRunIdFromSse(response);
    const runtimeUrl = await assetReady.promise;
    assert.equal((await fetch(`${baseUrl}${runtimeUrl}`)).status, 200);

    const cancelled = await requestJson(baseUrl, `/api/execute/runs/${runId}/cancel`, { method: 'POST' });
    assert.equal(cancelled.status, 200);

    const deadline = Date.now() + 1000;
    let finalStatus = null;
    while (Date.now() < deadline) {
      const status = await requestJson(baseUrl, `/api/execute/runs/${runId}/status`);
      finalStatus = status.body.data.status;
      if (finalStatus === 'cancelled') break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(finalStatus, 'cancelled');
    assert.equal((await fetch(`${baseUrl}${runtimeUrl}`)).status, 200);

    const nextResponse = await fetch(`${baseUrl}/api/execute/wf_runtime_asset_cancellation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'draft',
        name: 'Runtime Asset Cancellation',
        nodes: [
          { id: 'input', type: 'io', position: { x: 0, y: 0 }, data: { content: 'source' } },
          {
            id: 'split',
            type: 'io',
            position: { x: 160, y: 0 },
            data: {},
          },
        ],
        edges: [
          {
            id: 'edge-input-split',
            source: 'input',
            sourceHandle: 'result',
            target: 'split',
            targetHandle: 'input',
          },
        ],
      }),
    });
    const nextRunId = await waitForRunIdFromSse(nextResponse);
    assert.equal((await fetch(`${baseUrl}${runtimeUrl}`)).status, 404);
    await requestJson(baseUrl, `/api/execute/runs/${nextRunId}/cancel`, { method: 'POST' });
  } finally {
    NODE_EXECUTORS.io = originalIo;
    await new Promise((resolve) => server.close(resolve));
  }
});
