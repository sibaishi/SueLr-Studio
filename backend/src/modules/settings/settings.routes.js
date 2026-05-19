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
router.get('/storage', settingsController.getStorageSettings.bind(settingsController));
router.put('/storage', validateObjectBody(), settingsController.updateStorageSettings.bind(settingsController));
router.post('/storage/reset', settingsController.resetStorageSettings.bind(settingsController));
router.get('/account-details', settingsController.getAccountDetails.bind(settingsController));
router.put('/account-details', validateObjectBody(), settingsController.updateAccountDetails.bind(settingsController));
router.post('/account-details/refresh', settingsController.refreshAccountDetails.bind(settingsController));
router.get('/account-details/logs', settingsController.getAccountDetailsLogs.bind(settingsController));
router.delete('/account-details', settingsController.clearAccountDetails.bind(settingsController));
router.get('/6789-account', settingsController.getAccountDetails.bind(settingsController));
router.put('/6789-account', validateObjectBody(), settingsController.updateAccountDetails.bind(settingsController));
router.post('/6789-account/refresh', settingsController.refreshAccountDetails.bind(settingsController));
router.get('/6789-account/logs', settingsController.getAccountDetailsLogs.bind(settingsController));
router.delete('/6789-account', settingsController.clearAccountDetails.bind(settingsController));
router.post('/select-directory', settingsController.selectDirectory.bind(settingsController));
router.post('/restart-backend', settingsController.restartBackend.bind(settingsController));

export default router;
