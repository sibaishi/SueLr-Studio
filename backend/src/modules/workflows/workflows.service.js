import { NotFoundError } from '../../app/errors/index.js';
import { createLogger } from '../../platform/logging/logger.js';
import { ensureResourceOwnership } from '../../platform/runtime/index.js';
import { isResourceVisibleForScope } from '../../platform/storage/index.js';
import { migrateWorkflowDocument } from './workflow-migrations.js';
import { exportWorkflowDocument, importWorkflowDocument } from './workflows.import-export.js';
import { workflowsRepository } from './workflows.repository.js';
import { normalizePersistedWorkflow } from './workflows.schema.js';

const logger = createLogger({ module: 'workflows-service' });

function assertWorkflowVisible(workflow, scope) {
  if (!isResourceVisibleForScope(workflow, scope)) {
    throw new NotFoundError('WORKFLOW_NOT_FOUND', '工作流不存在');
  }
  return workflow;
}

export class WorkflowsService {
  constructor(repository = workflowsRepository) {
    this.repository = repository;
  }

  list(options = {}) {
    return this.repository
      .list()
      .filter((workflow) => isResourceVisibleForScope(workflow, options.scope))
      .map((workflow) => ensureResourceOwnership(workflow, options.scope))
      .map((workflow) => ({
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        ownerUserId: workflow.ownerUserId,
        workspaceId: workflow.workspaceId,
        ownershipScope: workflow.ownershipScope,
        nodeCount: workflow.nodes?.length || 0,
        updatedAt: workflow.updatedAt,
      }))
      .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
  }

  getById(id, options = {}) {
    return ensureResourceOwnership(
      assertWorkflowVisible(this.repository.read(id).workflow, options.scope),
      options.scope,
    );
  }

  create(input, options = {}) {
    const id = input.id || `wf_${Date.now()}`;
    const { workflow: migrated } = migrateWorkflowDocument({ ...input, id });
    const workflow = normalizePersistedWorkflow(migrated, { preserveCreatedAt: false, scope: options.scope });
    this.repository.save(id, workflow);
    logger.info('workflow created', {
      workflowId: id,
      ownerUserId: workflow.ownerUserId,
      workspaceId: workflow.workspaceId,
    });
    return workflow;
  }

  update(id, input, options = {}) {
    const { workflow: existing } = this.repository.read(id);
    assertWorkflowVisible(existing, options.scope);
    const { workflow: migrated } = migrateWorkflowDocument({
      ...existing,
      ...input,
      id: existing.id,
      createdAt: existing.createdAt,
    });
    const updated = normalizePersistedWorkflow(migrated, {
      preserveCreatedAt: true,
      updatedAt: Date.now(),
      scope: existing.ownershipScope || existing.scope || options.scope,
    });
    this.repository.save(id, updated);
    logger.info('workflow updated', {
      workflowId: id,
      ownerUserId: updated.ownerUserId,
      workspaceId: updated.workspaceId,
    });
    return updated;
  }

  delete(id, _options = {}) {
    const { workflow } = this.repository.read(id);
    assertWorkflowVisible(workflow, _options.scope);
    this.repository.delete(id);
    logger.info('workflow deleted', { workflowId: id });
  }

  duplicate(id, options = {}) {
    const { workflow: source } = this.repository.read(id);
    assertWorkflowVisible(source, options.scope);
    const newId = `wf_${Date.now()}`;
    const duplicated = normalizePersistedWorkflow(
      {
        ...source,
        id: newId,
        name: `${source.name} (副本)`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      { preserveCreatedAt: true, updatedAt: Date.now(), scope: source.ownershipScope || source.scope || options.scope },
    );
    this.repository.save(newId, duplicated);
    logger.info('workflow duplicated', { workflowId: id, duplicatedWorkflowId: newId });
    return duplicated;
  }

  export(id, _options = {}) {
    const { workflow } = this.repository.read(id);
    assertWorkflowVisible(workflow, _options.scope);
    return exportWorkflowDocument(workflow);
  }

  import(input, options = {}) {
    const requestedId = options.id || input?.id;
    const hasExistingId =
      !options.generateNewId &&
      typeof requestedId === 'string' &&
      this.repository
        .list()
        .filter((workflow) => isResourceVisibleForScope(workflow, options.scope))
        .some((workflow) => workflow.id === requestedId);
    const { workflow, report } = importWorkflowDocument(input, { ...options, hasExistingId });
    this.repository.save(workflow.id, workflow);
    logger.info('workflow imported', { workflowId: workflow.id, result: report.result });
    return { workflow, report };
  }
}

export const workflowsService = new WorkflowsService();
