import { Router } from 'express';
import { capabilitiesController } from './capabilities.controller.js';
import {
  validateChatBody,
  validateImageBody,
  validateSearchBody,
  validateTaskId,
  validateVideoBody,
} from './capabilities.schema.js';

const router = Router();

router.post('/chat', (req, _res, next) => {
  try {
    req.body = validateChatBody(req.body);
    next();
  } catch (error) {
    next(error);
  }
}, capabilitiesController.chat.bind(capabilitiesController));

router.post('/search', (req, _res, next) => {
  try {
    req.body = validateSearchBody(req.body);
    next();
  } catch (error) {
    next(error);
  }
}, capabilitiesController.search.bind(capabilitiesController));

router.post('/image', (req, _res, next) => {
  try {
    req.body = validateImageBody(req.body);
    next();
  } catch (error) {
    next(error);
  }
}, capabilitiesController.image.bind(capabilitiesController));

router.post('/video', (req, _res, next) => {
  try {
    req.body = validateVideoBody(req.body);
    next();
  } catch (error) {
    next(error);
  }
}, capabilitiesController.submitVideo.bind(capabilitiesController));

router.get('/video/:taskId', (req, _res, next) => {
  try {
    req.params.taskId = validateTaskId(req.params.taskId);
    next();
  } catch (error) {
    next(error);
  }
}, capabilitiesController.getVideoStatus.bind(capabilitiesController));

export default router;
