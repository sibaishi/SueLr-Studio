// @ts-expect-error Express does not ship local type declarations in this backend package yet.
import { Router } from 'express';
import { validateBody, validateParam } from '../../app/middleware/validate-request.ts';
import { capabilitiesController } from './capabilities.controller.ts';
import {
  validateChatBody,
  validateImageBody,
  validateSearchBody,
  validateTaskId,
  validateVideoBody,
  validateVideoStatusBody,
} from './capabilities.schema.ts';

const router = Router();

router.get('/runtime', capabilitiesController.runtime.bind(capabilitiesController));
router.post('/chat', validateBody(validateChatBody), capabilitiesController.chat.bind(capabilitiesController));
router.post('/search', validateBody(validateSearchBody), capabilitiesController.search.bind(capabilitiesController));
router.post('/image', validateBody(validateImageBody), capabilitiesController.image.bind(capabilitiesController));
router.post('/video', validateBody(validateVideoBody), capabilitiesController.submitVideo.bind(capabilitiesController));
router.get(
  '/video/:taskId',
  validateParam('taskId', validateTaskId),
  capabilitiesController.getVideoStatus.bind(capabilitiesController),
);
router.post(
  '/video/:taskId/status',
  validateParam('taskId', validateTaskId),
  validateBody(validateVideoStatusBody),
  capabilitiesController.getVideoStatus.bind(capabilitiesController),
);

export default router;
