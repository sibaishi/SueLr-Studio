// @ts-expect-error Express does not ship local type declarations in this backend package yet.
import { Router } from 'express';
import { zodValidator } from '../../app/middleware/zod-validator.ts';
import { validateBody, validateParam } from '../../app/middleware/validate-request.ts';
import { intelligenceController } from './intelligence.controller.ts';
import {
  agentPlanRequestSchema,
  intelligenceRunIdSchema,
  intelligenceRunRequestSchema,
  knowledgeSearchRequestSchema,
  knowledgeWriteRequestSchema,
  workflowDraftRequestSchema,
} from './intelligence.schema.ts';

const router = Router();

router.get('/skills', intelligenceController.listSkills.bind(intelligenceController));
router.get('/knowledge', intelligenceController.listKnowledge.bind(intelligenceController));
router.post(
  '/knowledge/search',
  validateBody(zodValidator(knowledgeSearchRequestSchema)),
  intelligenceController.searchKnowledge.bind(intelligenceController),
);
router.post(
  '/knowledge',
  validateBody(zodValidator(knowledgeWriteRequestSchema)),
  intelligenceController.writeKnowledge.bind(intelligenceController),
);
router.post('/knowledge/import-legacy-memory', intelligenceController.importLegacyMemory.bind(intelligenceController));
router.post('/knowledge/rebuild-seeds', intelligenceController.rebuildSeedKnowledge.bind(intelligenceController));
router.post(
  '/agent-plans',
  validateBody(zodValidator(agentPlanRequestSchema)),
  intelligenceController.createAgentPlan.bind(intelligenceController),
);
router.post(
  '/workflow-drafts',
  validateBody(zodValidator(workflowDraftRequestSchema)),
  intelligenceController.createWorkflowDraft.bind(intelligenceController),
);
router.post(
  '/runs',
  validateBody(zodValidator(intelligenceRunRequestSchema)),
  intelligenceController.createRun.bind(intelligenceController),
);
router.get(
  '/runs/:id',
  validateParam('id', zodValidator(intelligenceRunIdSchema)),
  intelligenceController.getRun.bind(intelligenceController),
);

export default router;
