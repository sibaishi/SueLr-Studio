import { Router } from 'express';
import { validateBody } from '../../app/middleware/validate-request.js';
import { settingsController } from './settings.controller.js';
import { ensureObjectBody } from './settings.schema.js';

const router = Router();
const objectBodyMessage = '请求体必须为对象';
const validateObjectBody = () => validateBody((body) => ensureObjectBody(body, objectBodyMessage));

router.get('/', settingsController.getSettings.bind(settingsController));
router.put('/', validateObjectBody(), settingsController.updateSettings.bind(settingsController));
router.post('/reset', settingsController.resetSettings.bind(settingsController));
router.post('/test-api', validateObjectBody(), settingsController.testApi.bind(settingsController));
router.get('/models', settingsController.getModels.bind(settingsController));
router.post('/discover-models', validateObjectBody(), settingsController.discoverModels.bind(settingsController));
router.get('/studio', settingsController.getStudioSettings.bind(settingsController));
router.put('/studio', validateObjectBody(), settingsController.updateStudioSettings.bind(settingsController));

export default router;
