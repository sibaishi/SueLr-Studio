// @ts-expect-error Express does not ship local type declarations in this backend package yet.
import { Router } from 'express';
import { validateBody, validateParam } from '../../app/middleware/validate-request.ts';
import { assistantController } from './assistant.controller.ts';
import {
  validateAssistantFilePath,
  validateAssistantRecordId,
  validateConversationList,
  validateGalleryItem,
  validateVideoItem,
} from './assistant.schema.ts';

const router = Router();

router.get('/status', assistantController.getStatus.bind(assistantController));
router.get('/conversations', assistantController.getConversations.bind(assistantController));
router.post(
  '/conversations',
  validateBody(validateConversationList),
  assistantController.saveConversations.bind(assistantController),
);
router.delete(
  '/conversations/:id',
  validateParam('id', (value) => validateAssistantRecordId(value, 'conversation.id'), decodeURIComponent),
  assistantController.deleteConversation.bind(assistantController),
);
router.get('/images', assistantController.getImages.bind(assistantController));
router.post('/images', validateBody(validateGalleryItem), assistantController.saveImage.bind(assistantController));
router.delete('/images', assistantController.clearImages.bind(assistantController));
router.delete(
  '/images/:id',
  validateParam('id', (value) => validateAssistantRecordId(value, 'image.id'), decodeURIComponent),
  assistantController.deleteImage.bind(assistantController),
);
router.get('/videos', assistantController.getVideos.bind(assistantController));
router.post('/videos', validateBody(validateVideoItem), assistantController.saveVideo.bind(assistantController));
router.delete('/videos', assistantController.clearVideos.bind(assistantController));
router.delete(
  '/videos/:id',
  validateParam('id', (value) => validateAssistantRecordId(value, 'video.id'), decodeURIComponent),
  assistantController.deleteVideo.bind(assistantController),
);
router.get('/settings', assistantController.getSettings.bind(assistantController));
router.post('/settings', assistantController.updateSettings.bind(assistantController));
router.get(
  '/files/*',
  validateParam('0', validateAssistantFilePath),
  assistantController.streamFile.bind(assistantController),
);

export default router;
