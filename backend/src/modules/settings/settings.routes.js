import { Router } from 'express';
import { settingsController } from './settings.controller.js';
import { ensureObjectBody } from './settings.schema.js';

const router = Router();

router.get('/', settingsController.getSettings.bind(settingsController));
router.put('/', (req, _res, next) => {
  try {
    req.body = ensureObjectBody(req.body, '设置更新体必须为对象');
    next();
  } catch (error) {
    next(error);
  }
}, settingsController.updateSettings.bind(settingsController));
router.post('/reset', settingsController.resetSettings.bind(settingsController));
router.post('/test-api', (req, _res, next) => {
  try {
    req.body = ensureObjectBody(req.body, '请求体必须为对象');
    next();
  } catch (error) {
    next(error);
  }
}, settingsController.testApi.bind(settingsController));
router.get('/models', settingsController.getModels.bind(settingsController));
router.post('/discover-models', (req, _res, next) => {
  try {
    req.body = ensureObjectBody(req.body, '请求体必须为对象');
    next();
  } catch (error) {
    next(error);
  }
}, settingsController.discoverModels.bind(settingsController));
router.get('/studio', settingsController.getStudioSettings.bind(settingsController));
router.put('/studio', (req, _res, next) => {
  try {
    req.body = ensureObjectBody(req.body, '请求体必须为对象');
    next();
  } catch (error) {
    next(error);
  }
}, settingsController.updateStudioSettings.bind(settingsController));

export default router;
