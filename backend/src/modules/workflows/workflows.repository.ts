import fs from 'node:fs';
import path from 'node:path';
import { NotFoundError, ValidationError } from '../../app/errors/index.ts';
import { STORAGE_PATHS, ensureStorageDirectories, safeResolveWithin } from '../../platform/storage/index.ts';
import type { DynamicValue, PlainObject } from '../types.ts';
import { BUILTIN_WORKFLOW_TEMPLATES } from './workflow-templates.ts';

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
    return files.map((file) => {
      const content = fs.readFileSync(path.join(STORAGE_PATHS.workflowsDir, file), 'utf-8');
      return JSON.parse(content);
    });
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
    fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2), 'utf8');
    return workflow;
  }

  delete(id: string) {
    const { filePath } = this.read(id);
    fs.unlinkSync(filePath);
  }
}

export const workflowsRepository = new WorkflowsRepository();
