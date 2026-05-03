import { createWorkflowGraphEditorActions } from '@/features/workflow/lib/store/editorGraph';
import { createWorkflowGroupEditorActions } from '@/features/workflow/lib/store/editorGroups';
import { createWorkflowEditorSessionActions } from '@/features/workflow/lib/store/editorSession';
import type { WorkflowStoreEditorActions } from '@/features/workflow/lib/store/editorShared';
import type { WorkflowStoreGet, WorkflowStoreSet } from '@/features/workflow/lib/store/types';

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
