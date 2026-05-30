import type { DynamicValue } from '../../types.ts';
import { knowledgeService } from '../knowledge/knowledge.service.ts';
import type { WorkflowDraftRequest } from '../intelligence.schema.ts';
import { compileWorkflowDraft } from './workflow-compiler.ts';
import { planWorkflowDraft, parseWorkflowIntent } from './workflow-planner.ts';
import { validateCompiledWorkflow } from './workflow-validator.ts';
import { workflowArchitectService } from './workflow-architect.service.ts';

function readAgentContext(input: WorkflowDraftRequest) {
  const plannerModel = input.context?.agent?.plannerModel;
  if (!plannerModel) return undefined;
  return {
    plannerModel: {
      id: plannerModel.id,
      ...(plannerModel.modelId ? { modelId: plannerModel.modelId } : {}),
      ...(plannerModel.configId ? { configId: plannerModel.configId } : {}),
      ...(plannerModel.configName ? { configName: plannerModel.configName } : {}),
      ...(plannerModel.label ? { label: plannerModel.label } : {}),
    },
  };
}

export class WorkflowBuilderService {
  async createDraft(input: WorkflowDraftRequest, options: { scope?: DynamicValue } = {}) {
    knowledgeService.rebuildSeedKnowledge({ scope: options.scope });
    const knowledgeContext = knowledgeService.search(
      {
        query: input.input,
        categories: ['workflow-knowledge', 'model-knowledge', 'user-memory', 'project-knowledge', 'brand-knowledge'],
        limit: 8,
      },
      { scope: options.scope },
    );
    const intent = parseWorkflowIntent(input);
    const draft = planWorkflowDraft(intent, { items: knowledgeContext.items });
    const architect = await workflowArchitectService.tryCreateWorkflow(input, intent, draft, {
      scope: options.scope,
      knowledgeItems: knowledgeContext.items,
    });
    const workflow =
      architect.workflow || compileWorkflowDraft(intent, draft, { scope: options.scope, knowledgeItems: knowledgeContext.items });
    const validation = validateCompiledWorkflow(workflow, { scope: options.scope });
    const agentContext = readAgentContext(input);

    return {
      intent,
      draft,
      workflow: validation.workflow || workflow,
      validation: {
        valid: validation.valid,
        issues: validation.issues,
      },
      approvalsRequired: draft.approvalsRequired,
      knowledgeContext: {
        items: knowledgeContext.items,
        source: knowledgeContext.source,
        governance: knowledgeContext.governance,
      },
      architect: architect.attempt,
      ...(agentContext ? { agentContext } : {}),
    };
  }

  validateWorkflow(workflow: DynamicValue, options: { scope?: DynamicValue } = {}) {
    return validateCompiledWorkflow(workflow, { scope: options.scope });
  }
}

export const workflowBuilderService = new WorkflowBuilderService();
