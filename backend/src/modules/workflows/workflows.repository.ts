import fs from 'node:fs';
import path from 'node:path';
import { NotFoundError, ValidationError } from '../../app/errors/index.ts';
import { STORAGE_PATHS, ensureStorageDirectories, safeResolveWithin } from '../../platform/storage/index.ts';
import { createLogger } from '../../platform/logging/logger.ts';
import { writeJsonFile } from '../../platform/storage/json-store.ts';
import type { DynamicValue, PlainObject } from '../types.ts';
import { BUILTIN_WORKFLOW_TEMPLATES } from './workflow-templates.ts';

const logger = createLogger({ module: 'workflows-repository' });

export class WorkflowsRepository {
  constructor() {
    ensureStorageDirectories();
    this.seedBuiltinTemplatesIfEmpty();
  }

  getFilePath(id: string) {
    const filePath = safeResolveWithin(STORAGE_PATHS.workflowsDir, `${id}.json`);
    if (!filePath) throw new ValidationError('WORKFLOW_INVALID', '工作流 ID 非法');
    return filePath;
  }

  seedBuiltinTemplatesIfEmpty() {
    const files = fs.readdirSync(STORAGE_PATHS.workflowsDir).filter((file) => file.endsWith('.json'));
    if (files.length > 0) return;
    for (const template of BUILTIN_WORKFLOW_TEMPLATES) {
      this.save(template.id, template);
    }
  }

  list(): PlainObject[] {
    const files = fs.readdirSync(STORAGE_PATHS.workflowsDir).filter((file) => file.endsWith('.json'));
    const workflows: PlainObject[] = [];
    for (const file of files) {
      try {
        const workflow: unknown = JSON.parse(fs.readFileSync(path.join(STORAGE_PATHS.workflowsDir, file), 'utf8'));
        if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) {
          logger.warn('skipping invalid workflow file', { file });
          continue;
        }
        workflows.push(workflow as PlainObject);
      } catch {
        logger.warn('skipping unreadable workflow file', { file });
      }
    }
    return workflows;
  }

  read(id: string) {
    const filePath = this.getFilePath(id);
    if (!fs.existsSync(filePath)) throw new NotFoundError('WORKFLOW_NOT_FOUND', '工作流不存在');
    return {
      filePath,
      workflow: JSON.parse(fs.readFileSync(filePath, 'utf-8')),
    };
  }

  save(id: string, workflow: DynamicValue) {
    const filePath = this.getFilePath(id);
    writeJsonFile(filePath, workflow);
    return workflow;
  }

  delete(id: string) {
    const { filePath } = this.read(id);
    fs.unlinkSync(filePath);
  }
}

export const workflowsRepository = new WorkflowsRepository();
