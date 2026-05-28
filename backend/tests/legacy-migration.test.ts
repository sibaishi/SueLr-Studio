// @ts-nocheck
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function createStorageDir(name) {
  const root = path.resolve('.tmp-tests', `legacy-migration-${name}-${Date.now()}`);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

async function withEnv(name, callback) {
  const root = createStorageDir(name);
  const previousEnv = {};
  for (const [key, value] of Object.entries({
    APP_CONFIG_DIR: root,
    APP_STORAGE_BOOTSTRAP_FILE: path.join(root, 'config', 'bootstrap.json'),
    APP_DISABLE_LEGACY_STORAGE_MIGRATION: '1',
    APP_RUNTIME_MODE: 'server-multi-user',
  })) {
    previousEnv[key] = process.env[key];
    process.env[key] = value;
  }
  try {
    await callback(root);
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function seedActiveUser() {
  const { authRepository } = await import(`../src/modules/auth/auth.repository.ts?legacy=${Date.now()}-${Math.random()}`);
  return authRepository.upsertUser({
    username: 'legacy-owner',
    passwordHash: 'scrypt:salt:hash',
    status: 'active',
  });
}

test('legacy migration summary and dry-run count unowned data without exposing content', async () => {
  await withEnv('summary', async () => {
    const { STORAGE_PATHS, writeJsonFile } = await import(`../src/platform/storage/index.ts?summary=${Date.now()}`);
    const { legacyMigrationService } = await import(`../src/modules/admin-config/legacy-migration.service.ts?summary=${Date.now()}`);
    const user = await seedActiveUser();

    fs.mkdirSync(STORAGE_PATHS.workflowsDir, { recursive: true });
    fs.mkdirSync(path.join(STORAGE_PATHS.generatedDir, 'text'), { recursive: true });
    fs.writeFileSync(path.join(STORAGE_PATHS.workflowsDir, 'legacy.json'), JSON.stringify({ id: 'legacy', name: 'Private' }));
    fs.writeFileSync(path.join(STORAGE_PATHS.generatedDir, 'text', 'legacy.txt'), 'private');
    writeJsonFile(STORAGE_PATHS.galleryFile, [{ id: 'img_legacy', prompt: 'secret prompt' }]);

    const summary = legacyMigrationService.getSummary();
    assert.equal(summary.counts.workflows, 1);
    assert.equal(summary.counts.gallery, 1);
    assert.equal(summary.counts.generatedFiles, 1);

    const dryRun = legacyMigrationService.dryRun({ targetUserId: user.id });
    assert.equal(dryRun.targetUser.id, user.id);
    assert.match(dryRun.destinationNamespace, /scopes[\\/]+v1|scopes\/v1/);
    assert.equal(JSON.stringify(dryRun).includes('secret prompt'), false);
  });
});

test('legacy migration assigns JSON ownership and moves legacy files into target namespace', async () => {
  await withEnv('migrate', async () => {
    const { STORAGE_PATHS, readJsonFile, writeJsonFile } = await import(`../src/platform/storage/index.ts?migrate=${Date.now()}`);
    const { getScopedStoragePaths } = await import(`../src/platform/storage/scoped-storage.ts?migrate=${Date.now()}`);
    const { legacyMigrationService } = await import(`../src/modules/admin-config/legacy-migration.service.ts?migrate=${Date.now()}`);
    const user = await seedActiveUser();
    const scope = { userId: user.id, workspaceId: 'default', runtimeMode: 'server-multi-user' };
    const scopedPaths = getScopedStoragePaths(scope);

    fs.mkdirSync(STORAGE_PATHS.workflowsDir, { recursive: true });
    fs.mkdirSync(path.join(STORAGE_PATHS.generatedDir, 'images'), { recursive: true });
    fs.mkdirSync(STORAGE_PATHS.uploadsDir, { recursive: true });
    writeJsonFile(path.join(STORAGE_PATHS.workflowsDir, 'legacy.json'), { id: 'legacy', name: 'Legacy' });
    writeJsonFile(STORAGE_PATHS.conversationsFile, [{ id: 'conv_legacy' }]);
    fs.writeFileSync(path.join(STORAGE_PATHS.generatedDir, 'images', 'legacy.png'), 'image');
    fs.writeFileSync(path.join(STORAGE_PATHS.uploadsDir, 'upload.txt'), 'upload');

    const result = legacyMigrationService.migrate({ targetUserId: user.id });
    assert.equal(result.countsAfter.workflows, 0);
    assert.equal(result.countsAfter.conversations, 0);
    assert.equal(result.countsAfter.generatedFiles, 0);
    assert.equal(result.countsAfter.uploads, 0);
    assert.equal(fs.existsSync(result.manifestPath), true);

    const workflow = readJsonFile(path.join(STORAGE_PATHS.workflowsDir, 'legacy.json'), {});
    assert.equal(workflow.ownerUserId, user.id);
    assert.equal(readJsonFile(STORAGE_PATHS.conversationsFile, [])[0].ownerUserId, user.id);
    assert.equal(fs.existsSync(path.join(scopedPaths.generatedDir, 'images', 'legacy.png')), true);
    assert.equal(fs.existsSync(path.join(scopedPaths.uploadsDir, 'upload.txt')), true);
  });
});
