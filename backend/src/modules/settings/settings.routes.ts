// @ts-expect-error Express does not ship local type declarations in this backend package yet.
import { Router } from 'express';
import { validateBody } from '../../app/middleware/validate-request.ts';
import { settingsController } from './settings.controller.ts';
import { ensureObjectBody } from './settings.schema.ts';

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
router.get('/storage', settingsController.getStorageSettings.bind(settingsController));
router.put('/storage', validateObjectBody(), settingsController.updateStorageSettings.bind(settingsController));
router.post('/storage/reset', settingsController.resetStorageSettings.bind(settingsController));
router.post('/select-directory', settingsController.selectDirectory.bind(settingsController));
router.post('/restart-backend', settingsController.restartBackend.bind(settingsController));

export default router;
