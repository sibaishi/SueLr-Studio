import type { WorkflowState, WorkflowStoreGet, WorkflowStoreSet } from '@/domains/workflow/lib/store/types';
import type { GroupPortSide } from '@/domains/workflow/lib/groupPorts';

const EXPORT_WORKFLOW_RESULT = {
  id: 'wf_local',
  name: 'Test Workflow',
  version: 1,
  createdAt: 0,
  updatedAt: 0,
  nodes: [],
  edges: [],
  settings: {},
};

function createNoopAsync<T>(result: T) {
  return async () => result;
}

export function createBaseWorkflowState(overrides: Partial<WorkflowState> = {}): WorkflowState {
  return {
    workflowId: 'wf_local',
    workflowName: 'Test Workflow',
    workflowList: [],
    isHydratingWorkflow: false,
    isSavingWorkflow: false,
    hasUnsavedChanges: false,
    lastSavedAt: null,
    nodes: [],
    edges: [],
    selectedNodeId: null,
    isExecuting: false,
    executionProgress: null,
    executionMessage: null,
    currentRunId: null,
    executingNodeId: null,
    lastExecutionStatus: null,
    lastExecutionTime: null,
    lastExecutionError: null,
    lastExecutionSummary: null,
    nodeExecStatus: {},
    nodeExecutionTime: {},
    nodeExecutionStartedAt: {},
    nodeExecutionActiveCounts: {},
    nodeExecutionStartedCounts: {},
    nodeExecutionCompletedCounts: {},
    nodeExecutionExpectedCounts: {},
    nodeErrors: {},
    nodeWarnings: {},
    nodeOutputs: {},
    aiResultOutputs: {},
    executionLogs: [],
    workflowWarningMessage: null,
    availableModels: { all: [], chat: [], image: [], video: [] },
    workflowRuntimeConfigs: [],
    projectModels: [],
    showDebugSizes: false,
    snapToGridEnabled: false,
    setWorkflowName: () => undefined,
    addNode: () => '',
    duplicateNode: () => null,
    updateNodeData: () => undefined,
    setNodeSize: () => undefined,
    resetNodeSize: () => undefined,
    removeNode: () => undefined,
    removeNodes: () => undefined,
    removeNodeWithoutReconnect: () => undefined,
    removeNodesWithoutReconnect: () => undefined,
    detachNodeFromChain: () => undefined,
    insertNodeOnEdge: () => undefined,
    addEdge: () => undefined,
    removeEdge: () => undefined,
    selectNode: () => undefined,
    duplicateNodes: () => [],
    autoArrangeWorkflow: () => undefined,
    createNodeGroup: () => null,
    toggleGroupCollapsed: () => undefined,
    updateGroupPort: (_groupId: string, _side: GroupPortSide, _portId: string) => undefined,
    ungroupNodes: () => undefined,
    releaseNodesFromGroup: () => undefined,
    toggleNodesLocked: () => undefined,
    toggleNodesDisabled: () => undefined,
    onNodesChange: () => undefined,
    onEdgesChange: () => undefined,
    setNodeExecStatus: () => undefined,
    clearAllExecStatus: () => undefined,
    setExecuting: () => undefined,
    setExecutionResult: () => undefined,
    addExecutionLog: () => undefined,
    clearExecutionLogs: () => undefined,
    applyEditorSnapshot: () => undefined,
    newWorkflow: () => undefined,
    markWorkflowDirty: () => undefined,
    setShowDebugSizes: () => undefined,
    setSnapToGridEnabled: () => undefined,
    resetUserWorkspace: () => undefined,
    executeWorkflow: createNoopAsync(undefined),
    executeWorkflowToNode: createNoopAsync(undefined),
    cancelWorkflowExecution: createNoopAsync(undefined),
    saveWorkflow: createNoopAsync(false),
    loadWorkflow: createNoopAsync(false),
    fetchWorkflowList: createNoopAsync(undefined),
    initializeWorkflowPersistence: createNoopAsync(undefined),
    restoreExecutionRun: createNoopAsync(undefined),
    syncExecutionRunStatus: createNoopAsync(undefined),
    duplicateCurrentWorkflow: createNoopAsync(false),
    deleteCurrentWorkflow: createNoopAsync(false),
    exportCurrentWorkflow: () => EXPORT_WORKFLOW_RESULT,
    importWorkflowData: createNoopAsync({ success: false, report: null }),
    importWorkflowDataWithMode: createNoopAsync({ success: false, report: null }),
    fetchModels: createNoopAsync({ success: true, count: 0 }),
    setAvailableModels: () => undefined,
    setProjectModels: () => undefined,
    persistLocalDraft: () => undefined,
    ...overrides,
  };
}

export function createWorkflowStoreHarness(overrides: Partial<WorkflowState> = {}) {
  let state = createBaseWorkflowState(overrides);

  const set: WorkflowStoreSet = (partial) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...next };
  };

  const get: WorkflowStoreGet = () => state;

  return {
    set,
    get,
    getState: () => state,
    setState: (partial: Partial<WorkflowState>) => {
      state = { ...state, ...partial };
    },
    attachActions: <T extends object>(actions: T) => {
      state = { ...state, ...actions };
      return actions;
    },
  };
}
