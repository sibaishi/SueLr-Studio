import { Router } from 'express';
import { assistantController } from './assistant.controller.js';
import {
  validateAssistantFilePath,
  validateAssistantRecordId,
  validateConversationList,
  validateGalleryItem,
  validateVideoItem,
} from './assistant.schema.js';

const router = Router();

router.get('/status', assistantController.getStatus.bind(assistantController));
router.get('/conversations', assistantController.getConversations.bind(assistantController));
router.post('/conversations', (req, _res, next) => {
  try {
    req.body = validateConversationList(req.body);
    next();
  } catch (error) {
    next(error);
  }
}, assistantController.saveConversations.bind(assistantController));
router.delete('/conversations/:id', (req, _res, next) => {
  try {
    req.params.id = validateAssistantRecordId(decodeURIComponent(req.params.id), 'conversation.id');
    next();
  } catch (error) {
    next(error);
  }
}, assistantController.deleteConversation.bind(assistantController));
router.get('/images', assistantController.getImages.bind(assistantController));
router.post('/images', (req, _res, next) => {
  try {
    req.body = validateGalleryItem(req.body);
    next();
  } catch (error) {
    next(error);
  }
}, assistantController.saveImage.bind(assistantController));
router.delete('/images', assistantController.clearImages.bind(assistantController));
router.delete('/images/:id', (req, _res, next) => {
  try {
    req.params.id = validateAssistantRecordId(decodeURIComponent(req.params.id), 'image.id');
    next();
  } catch (error) {
    next(error);
  }
}, assistantController.deleteImage.bind(assistantController));
router.get('/videos', assistantController.getVideos.bind(assistantController));
router.post('/videos', (req, _res, next) => {
  try {
    req.body = validateVideoItem(req.body);
    next();
  } catch (error) {
    next(error);
  }
}, assistantController.saveVideo.bind(assistantController));
router.delete('/videos', assistantController.clearVideos.bind(assistantController));
router.delete('/videos/:id', (req, _res, next) => {
  try {
    req.params.id = validateAssistantRecordId(decodeURIComponent(req.params.id), 'video.id');
    next();
  } catch (error) {
    next(error);
  }
}, assistantController.deleteVideo.bind(assistantController));
router.get('/settings', assistantController.getSettings.bind(assistantController));
router.post('/settings', assistantController.updateSettings.bind(assistantController));
router.get('/files/*', (req, _res, next) => {
  try {
    req.params[0] = validateAssistantFilePath(req.params[0]);
    next();
  } catch (error) {
    next(error);
  }
}, assistantController.streamFile.bind(assistantController));

export default router;
