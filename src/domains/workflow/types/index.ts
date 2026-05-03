import type { Workflow, WorkflowEdge, WorkflowNode, WorkflowSettings } from '@/shared/workflow/types';

export type PersistedWorkflow = Workflow;

export interface WorkflowDraft {
  workflowId: string;
  workflowName: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface ExecutionSnapshot {
  runId: string;
  workflowId: string;
  workflowVersion: number;
  snapshotVersion: number;
  source: 'persisted' | 'draft';
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings: WorkflowSettings;
  createdAt: number;
}

export interface WorkflowImportReport {
  sourceVersion: number;
  targetVersion: number;
  appliedMigrations: string[];
  warnings: string[];
  rejectedFields: string[];
  result: 'imported' | 'imported_with_warnings';
}

export type WorkflowImportMode = 'generate_new_id' | 'preserve_id' | 'overwrite';

export interface WorkflowImportConflictDetails {
  workflowId?: string;
  suggestedModes?: WorkflowImportMode[];
}

export interface WorkflowImportError {
  code?: string;
  message: string;
  details?: WorkflowImportConflictDetails;
}
