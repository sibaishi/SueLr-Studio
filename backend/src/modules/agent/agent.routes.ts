// @ts-expect-error Express does not ship local type declarations in this backend package yet.
import { Router } from 'express';
import { validateBody, validateParam } from '../../app/middleware/validate-request.ts';
import { agentController } from './agent.controller.ts';
import {
  validateAgentChatBody,
  validateAgentMemoryImportBody,
  validateAgentRecordId,
  validateAgentSessionId,
} from './agent.schema.ts';

const router = Router();

router.get('/status', agentController.getStatus.bind(agentController));
router.get('/profiles', agentController.getProfiles.bind(agentController));
router.post('/profiles', agentController.saveProfiles.bind(agentController));
router.get('/memories', agentController.getMemories.bind(agentController));
router.post(
  '/memories/import',
  validateBody(validateAgentMemoryImportBody),
  agentController.importMemories.bind(agentController),
);
router.delete('/memories', agentController.clearMemories.bind(agentController));
router.delete(
  '/memories/:id',
  validateParam('id', validateAgentRecordId, decodeURIComponent),
  agentController.deleteMemory.bind(agentController),
);
router.post('/chat', validateBody(validateAgentChatBody), agentController.chat.bind(agentController));
router.get(
  '/sessions/:sessionId',
  validateParam('sessionId', validateAgentSessionId, decodeURIComponent),
  agentController.getSession.bind(agentController),
);
router.post(
  '/sessions/:sessionId/cancel',
  validateParam('sessionId', validateAgentSessionId, decodeURIComponent),
  agentController.cancelSession.bind(agentController),
);

export default router;
