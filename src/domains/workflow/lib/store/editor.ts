import { createWorkflowGraphEditorActions } from '@/domains/workflow/lib/store/editorGraph';
import { createWorkflowGroupEditorActions } from '@/domains/workflow/lib/store/editorGroups';
import { createWorkflowEditorSessionActions } from '@/domains/workflow/lib/store/editorSession';
import type { WorkflowStoreEditorActions } from '@/domains/workflow/lib/store/editorShared';
import type { WorkflowStoreGet, WorkflowStoreSet } from '@/domains/workflow/lib/store/types';

export function createWorkflowEditorActions(
  set: WorkflowStoreSet,
  get: WorkflowStoreGet,
): WorkflowStoreEditorActions {
  return {
    ...createWorkflowGraphEditorActions(set, get),
    ...createWorkflowGroupEditorActions(set, get),
    ...createWorkflowEditorSessionActions(set, get),
  };
}
