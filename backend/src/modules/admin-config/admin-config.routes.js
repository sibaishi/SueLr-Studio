import { Router } from 'express';
import { requireAdminAccess } from '../../app/middleware/require-admin-access.js';
import { validateBody } from '../../app/middleware/validate-request.js';
import { zodValidator } from '../../app/middleware/zod-validator.js';
import { adminConfigController } from './admin-config.controller.js';
import { adminAccessSchema, adminConfigPatchSchema, adminSearchTestSchema } from './admin-config.schema.js';

const router = Router();

router.post(
  '/access/validate',
  validateBody(zodValidator(adminAccessSchema)),
  adminConfigController.validateAccess.bind(adminConfigController),
);
router.use(requireAdminAccess);
router.get('/settings', adminConfigController.getSettings.bind(adminConfigController));
router.put(
  '/settings',
  validateBody(zodValidator(adminConfigPatchSchema)),
  adminConfigController.updateSettings.bind(adminConfigController),
);
router.post(
  '/search/test',
  validateBody(zodValidator(adminSearchTestSchema)),
  adminConfigController.testSearch.bind(adminConfigController),
);

export default router;
