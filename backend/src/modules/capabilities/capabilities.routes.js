import { Router } from 'express';
import { validateBody, validateParam } from '../../app/middleware/validate-request.js';
import { capabilitiesController } from './capabilities.controller.js';
import {
  validateChatBody,
  validateImageBody,
  validateSearchBody,
  validateTaskId,
  validateVideoBody,
} from './capabilities.schema.js';

const router = Router();

router.post('/chat', validateBody(validateChatBody), capabilitiesController.chat.bind(capabilitiesController));
router.post('/search', validateBody(validateSearchBody), capabilitiesController.search.bind(capabilitiesController));
router.post('/image', validateBody(validateImageBody), capabilitiesController.image.bind(capabilitiesController));
router.post('/video', validateBody(validateVideoBody), capabilitiesController.submitVideo.bind(capabilitiesController));
router.get('/video/:taskId', validateParam('taskId', validateTaskId), capabilitiesController.getVideoStatus.bind(capabilitiesController));

export default router;
