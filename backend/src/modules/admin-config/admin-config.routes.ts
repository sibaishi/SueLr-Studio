// @ts-expect-error Express does not ship local type declarations in this backend package yet.
import { Router } from 'express';
import { requireAdminAccess } from '../../app/middleware/require-admin-access.ts';
import { validateBody } from '../../app/middleware/validate-request.ts';
import { zodValidator } from '../../app/middleware/zod-validator.ts';
import { adminConfigController } from './admin-config.controller.ts';
import { adminAccessSchema, adminConfigPatchSchema, adminSearchTestSchema } from './admin-config.schema.ts';

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
