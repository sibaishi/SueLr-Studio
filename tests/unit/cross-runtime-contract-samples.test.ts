import { type AgentPlanWire, toAgentPlanViewModel } from '@/domains/workflow/lib/api/intelligenceWire';
import { normalizeProjectModels } from '@/domains/workflow/lib/projectModels';
import type { RuntimeCapabilities } from '@/shared/runtime';
import type { ExecutionSnapshot } from '@/shared/workflow/types';
import { describe, expect, it } from 'vitest';
import samples from '../contracts/cross-runtime.samples.json';

describe('cross-runtime contract samples', () => {
  it('matches the frontend runtime capability contract', () => {
    const capabilities: RuntimeCapabilities = {
      ...samples.runtimeCapabilities,
      mode: samples.runtimeCapabilities.mode as RuntimeCapabilities['mode'],
    };
    expect(capabilities).toEqual(samples.runtimeCapabilities);
  });

  it('normalizes project models exactly like the backend contract sample', () => {
    expect(normalizeProjectModels(samples.projectModels.input)).toEqual(samples.projectModels.expected);
  });

  it('keeps the execution snapshot wire fields represented by the shared type', () => {
    const snapshot = {
      ...samples.executionSnapshot.expected,
      source: 'draft' as const,
      nodes: samples.executionSnapshot.draftWorkflow.nodes,
      edges: [],
      settings: {},
      createdAt: 1000,
    } satisfies ExecutionSnapshot;

    expect(snapshot.nodeContractVersion).toBe(1);
    expect(snapshot.name).toBe('Draft Contract');
  });

  it('converts the optional wire fields into stable Agent UI fields', () => {
    const viewModel = toAgentPlanViewModel(samples.agentPlanWire as AgentPlanWire);
    expect(viewModel.warnings).toEqual([]);
    expect(viewModel.knowledgeContext).toEqual({ source: 'none', items: [] });
    expect(viewModel.toolInput.workflowId).toBe('wf-contract');
  });
});
