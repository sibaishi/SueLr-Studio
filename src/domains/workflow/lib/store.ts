import { syncActiveDocument } from '@/domains/workflow/lib/store/activeDocumentSync';
import { createWorkflowDocumentActions } from '@/domains/workflow/lib/store/document';
import { createWorkflowDocumentTabActions } from '@/domains/workflow/lib/store/documents';
import { createWorkflowEditorActions } from '@/domains/workflow/lib/store/editor';
import { createWorkflowExecutionActions } from '@/domains/workflow/lib/store/execution';
import {
  createInitialWorkflowState,
  createResetWorkflowState,
  initialDraft,
} from '@/domains/workflow/lib/store/initialState';
import type { WorkflowState } from '@/domains/workflow/lib/store/types';
import { create } from 'zustand';

export type {
  ActiveRunSnapshot,
  ExecutionLogEntry,
  NodeExecStatus,
  WorkflowDraftSnapshot,
  WorkflowDocument,
  WorkflowEditorSnapshot,
  WorkflowImportResult,
  WorkflowState,
} from '@/domains/workflow/lib/store/types';

export const useWorkflowStore = create<WorkflowState>((baseSet, get) => {
  const set: typeof baseSet = (partial) => {
    baseSet((state) => {
      const patch = typeof partial === 'function' ? partial(state) : partial;
      const nextState = { ...state, ...patch };
      return 'documents' in patch ? nextState : syncActiveDocument(nextState);
    });
  };

  return {
    ...createInitialWorkflowState(),
    resetUserWorkspace: () => set(createResetWorkflowState()),

    patchNodeOutput: (nodeId, patch) =>
      set((s) => {
        const prev = s.nodeOutputs[nodeId] || {};
        return { nodeOutputs: { ...s.nodeOutputs, [nodeId]: { ...prev, ...patch } } };
      }),

    ...createWorkflowEditorActions(set, get),
    ...createWorkflowDocumentTabActions(set, get),
    ...createWorkflowExecutionActions(set, get),
    ...createWorkflowDocumentActions(set, get, { initialDraft }),
  };
});
