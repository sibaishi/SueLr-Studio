import { createLogger } from '../../platform/logging/logger.js';
import { workflowsRepository } from './workflows.repository.js';
import { normalizePersistedWorkflow } from './workflows.schema.js';
import { migrateWorkflowDocument } from './workflow-migrations.js';
import { exportWorkflowDocument, importWorkflowDocument } from './workflows.import-export.js';

const logger = createLogger({ module: 'workflows-service' });

export class WorkflowsService {
  constructor(repository = workflowsRepository) {
    this.repository = repository;
  }

  list() {
    return this.repository.list()
      .map((workflow) => ({
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        nodeCount: workflow.nodes?.length || 0,
        updatedAt: workflow.updatedAt,
      }))
      .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
  }

  getById(id) {
    return this.repository.read(id).workflow;
  }

  create(input) {
    const id = input.id || `wf_${Date.now()}`;
    const { workflow: migrated } = migrateWorkflowDocument({ ...input, id });
    const workflow = normalizePersistedWorkflow(migrated, { preserveCreatedAt: false });
    this.repository.save(id, workflow);
    logger.info('workflow created', { workflowId: id });
    return workflow;
  }

  update(id, input) {
    const { workflow: existing } = this.repository.read(id);
    const { workflow: migrated } = migrateWorkflowDocument({
      ...existing,
      ...input,
      id: existing.id,
      createdAt: existing.createdAt,
    });
    const updated = normalizePersistedWorkflow(migrated, {
      preserveCreatedAt: true,
      updatedAt: Date.now(),
    });
    this.repository.save(id, updated);
    logger.info('workflow updated', { workflowId: id });
    return updated;
  }

  delete(id) {
    this.repository.delete(id);
    logger.info('workflow deleted', { workflowId: id });
  }

  duplicate(id) {
    const { workflow: source } = this.repository.read(id);
    const newId = `wf_${Date.now()}`;
    const duplicated = normalizePersistedWorkflow({
      ...source,
      id: newId,
      name: `${source.name} (副本)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }, { preserveCreatedAt: true, updatedAt: Date.now() });
    this.repository.save(newId, duplicated);
    logger.info('workflow duplicated', { workflowId: id, duplicatedWorkflowId: newId });
    return duplicated;
  }

  export(id) {
    const { workflow } = this.repository.read(id);
    return exportWorkflowDocument(workflow);
  }

  import(input, options = {}) {
    const requestedId = options.id || input?.id;
    const hasExistingId = !options.generateNewId
      && typeof requestedId === 'string'
      && this.repository.list().some((workflow) => workflow.id === requestedId);
    const { workflow, report } = importWorkflowDocument(input, { ...options, hasExistingId });
    this.repository.save(workflow.id, workflow);
    logger.info('workflow imported', { workflowId: workflow.id, result: report.result });
    return { workflow, report };
  }
}

export const workflowsService = new WorkflowsService();
