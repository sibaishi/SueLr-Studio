import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

function createStorageDir(name) {
  const root = path.resolve('C:/Users/ADMINI~1.WIN/AppData/Local/Temp/opencode', `phase2-${name}-${Date.now()}`);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

test('workflows service supports CRUD through repository layer', async () => {
  const root = createStorageDir('workflows');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const { WorkflowsRepository } = await import(`../src/modules/workflows/workflows.repository.js?test=${Date.now()}`);
  const { WorkflowsService } = await import(`../src/modules/workflows/workflows.service.js?test=${Date.now()}`);

  const repository = new WorkflowsRepository();
  const service = new WorkflowsService(repository);

  const created = service.create({
    name: 'Test Workflow',
    nodes: [{ id: 'node-1', type: 'textInput', data: {} }],
    edges: [],
  });

  assert.ok(created.id.startsWith('wf_'));
  assert.equal(service.list().length, 1);
  assert.equal(service.getById(created.id).name, 'Test Workflow');

  const updated = service.update(created.id, {
    name: 'Updated Workflow',
    nodes: created.nodes,
    edges: created.edges,
  });

  assert.equal(updated.name, 'Updated Workflow');

  const duplicated = service.duplicate(created.id);
  assert.equal(service.list().length, 2);
  assert.notEqual(duplicated.id, created.id);

  service.delete(created.id);
  assert.equal(service.list().length, 1);
});

test('workflows service rejects unsupported node types', async () => {
  const root = createStorageDir('workflow-invalid-node');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const { WorkflowsRepository } = await import(`../src/modules/workflows/workflows.repository.js?test=${Date.now()}`);
  const { WorkflowsService } = await import(`../src/modules/workflows/workflows.service.js?test=${Date.now()}`);

  const repository = new WorkflowsRepository();
  const service = new WorkflowsService(repository);

  assert.throws(() => {
    service.create({
      id: 'wf_invalid',
      name: 'Invalid Workflow',
      nodes: [{ id: 'node-1', type: 'unknownNode', position: { x: 0, y: 0 }, data: {} }],
      edges: [],
      settings: {},
    });
  }, /不支持的节点类型/);
});

test('workflow update keeps createdAt stable', async () => {
  const root = createStorageDir('workflow-created-at');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const { WorkflowsRepository } = await import(`../src/modules/workflows/workflows.repository.js?test=${Date.now()}`);
  const { WorkflowsService } = await import(`../src/modules/workflows/workflows.service.js?test=${Date.now()}`);

  const repository = new WorkflowsRepository();
  const service = new WorkflowsService(repository);

  const created = service.create({
    id: 'wf_created_at',
    name: 'CreatedAt Workflow',
    nodes: [{ id: 'node-1', type: 'textInput', position: { x: 0, y: 0 }, data: {} }],
    edges: [],
    settings: {},
  });

  const updated = service.update(created.id, {
    name: 'CreatedAt Workflow Updated',
    nodes: created.nodes,
    edges: created.edges,
    settings: created.settings,
  });

  assert.equal(updated.createdAt, created.createdAt);
});

test('workflow import/export round-trip keeps structure stable', async () => {
  const root = createStorageDir('workflow-roundtrip');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const { WorkflowsRepository } = await import(`../src/modules/workflows/workflows.repository.js?test=${Date.now()}`);
  const { WorkflowsService } = await import(`../src/modules/workflows/workflows.service.js?test=${Date.now()}`);

  const repository = new WorkflowsRepository();
  const service = new WorkflowsService(repository);

  const created = service.create({
    id: 'wf_roundtrip',
    name: 'Round Trip Workflow',
    nodes: [{ id: 'node-1', type: 'textInput', position: { x: 16, y: 24 }, data: { text: 'hello' } }],
    edges: [],
    settings: {},
  });

  const exported = service.export(created.id);
  const imported = service.import(exported, { generateNewId: true });

  assert.equal(imported.report.result, 'imported_with_warnings');
  assert.equal(imported.workflow.name, created.name);
  assert.equal(imported.workflow.nodes.length, created.nodes.length);
  assert.equal(imported.workflow.nodes[0].type, created.nodes[0].type);
  assert.equal(imported.workflow.nodes[0].data.text, 'hello');
});

test('workflow import supports preserve id conflict and overwrite mode', async () => {
  const root = createStorageDir('workflow-import-conflict');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const { WorkflowsRepository } = await import(`../src/modules/workflows/workflows.repository.js?test=${Date.now()}`);
  const { WorkflowsService } = await import(`../src/modules/workflows/workflows.service.js?test=${Date.now()}`);

  const repository = new WorkflowsRepository();
  const service = new WorkflowsService(repository);

  service.create({
    id: 'wf_conflict',
    name: 'Existing Workflow',
    nodes: [{ id: 'node-1', type: 'textInput', position: { x: 0, y: 0 }, data: { text: 'old' } }],
    edges: [],
    settings: {},
  });

  assert.throws(() => {
    service.import({
      id: 'wf_conflict',
      name: 'Imported Workflow',
      version: 1,
      createdAt: 1,
      updatedAt: 1,
      nodes: [{ id: 'node-1', type: 'textInput', position: { x: 0, y: 0 }, data: { text: 'new' } }],
      edges: [],
      settings: {},
    }, { mode: 'preserve_id' });
  }, /已存在/);

  const overwritten = service.import({
    id: 'wf_conflict',
    name: 'Imported Workflow',
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    nodes: [{ id: 'node-1', type: 'textInput', position: { x: 0, y: 0 }, data: { text: 'new' } }],
    edges: [],
    settings: {},
  }, { mode: 'overwrite' });

  assert.equal(overwritten.workflow.id, 'wf_conflict');
  assert.equal(overwritten.workflow.name, 'Imported Workflow');
  assert.ok(overwritten.report.warnings.some((warning) => warning.includes('已覆盖现有工作流')));
});

test('workflow import migrates historical version and reports applied migration', async () => {
  const root = createStorageDir('workflow-import-migration');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const { WorkflowsRepository } = await import(`../src/modules/workflows/workflows.repository.js?test=${Date.now()}`);
  const { WorkflowsService } = await import(`../src/modules/workflows/workflows.service.js?test=${Date.now()}`);

  const repository = new WorkflowsRepository();
  const service = new WorkflowsService(repository);

  const imported = service.import({
    id: 'wf_legacy',
    name: 'Legacy Workflow',
    version: 0,
    createdAt: 1,
    updatedAt: 1,
    nodes: [{ id: 'node-1', type: 'textInput', position: { x: 0, y: 0 }, data: { text: 'legacy' } }],
    edges: [],
    settings: {},
  }, { mode: 'preserve_id' });

  assert.equal(imported.workflow.version, 1);
  assert.deepEqual(imported.report.appliedMigrations, []);
  assert.equal(imported.report.sourceVersion, 1);
  assert.equal(imported.report.targetVersion, 1);
  assert.equal(imported.report.result, 'imported');
});

test('workflow import rejects future version and unknown node type with structured errors', async () => {
  const root = createStorageDir('workflow-import-validation');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const { WorkflowsRepository } = await import(`../src/modules/workflows/workflows.repository.js?test=${Date.now()}`);
  const { WorkflowsService } = await import(`../src/modules/workflows/workflows.service.js?test=${Date.now()}`);

  const repository = new WorkflowsRepository();
  const service = new WorkflowsService(repository);

  assert.throws(() => {
    service.import({
      id: 'wf_future',
      name: 'Future Workflow',
      version: 99,
      createdAt: 1,
      updatedAt: 1,
      nodes: [{ id: 'node-1', type: 'textInput', position: { x: 0, y: 0 }, data: {} }],
      edges: [],
      settings: {},
    }, { mode: 'preserve_id' });
  }, /暂不支持导入版本 99 的工作流/);

  assert.throws(() => {
    service.import({
      id: 'wf_unknown_node',
      name: 'Unknown Node Workflow',
      version: 1,
      createdAt: 1,
      updatedAt: 1,
      nodes: [{ id: 'node-1', type: 'unknownNode', position: { x: 0, y: 0 }, data: {} }],
      edges: [],
      settings: {},
    }, { mode: 'preserve_id' });
  }, /不支持的节点类型: unknownNode/);
});
