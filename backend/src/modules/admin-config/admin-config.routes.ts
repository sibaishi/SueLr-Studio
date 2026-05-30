// @ts-expect-error Express does not ship local type declarations in this backend package yet.
import { Router } from 'express';
import { requireAdminAccess } from '../../app/middleware/require-admin-access.ts';
import { validateBody } from '../../app/middleware/validate-request.ts';
import { zodValidator } from '../../app/middleware/zod-validator.ts';
import { adminConfigController } from './admin-config.controller.ts';
import {
  adminAccessSchema,
  adminConfigPatchSchema,
  adminDeleteUserSchema,
  adminEmailTestSchema,
  adminSearchTestSchema,
  legacyMigrationSchema,
} from './admin-config.schema.ts';

const router = Router();

router.post(
  '/access/validate',
  validateBody(zodValidator(adminAccessSchema)),
  adminConfigController.validateAccess.bind(adminConfigController),
);
router.use(requireAdminAccess);
router.get('/users', adminConfigController.listUsers.bind(adminConfigController));
router.post('/users/:id/approve', adminConfigController.approveUser.bind(adminConfigController));
router.post('/users/:id/reject', adminConfigController.rejectUser.bind(adminConfigController));
router.post('/users/:id/disable', adminConfigController.disableUser.bind(adminConfigController));
router.post('/users/:id/enable', adminConfigController.enableUser.bind(adminConfigController));
router.delete(
  '/users/:id',
  validateBody(zodValidator(adminDeleteUserSchema)),
  adminConfigController.deleteUser.bind(adminConfigController),
);
router.get('/audit', adminConfigController.getAudit.bind(adminConfigController));
router.get('/password-reset-requests', adminConfigController.listPasswordResetRequests.bind(adminConfigController));
router.post(
  '/password-reset-requests/:id/issue',
  adminConfigController.issuePasswordResetRequest.bind(adminConfigController),
);
router.post(
  '/password-reset-requests/:id/revoke',
  adminConfigController.revokePasswordResetRequest.bind(adminConfigController),
);
router.get('/legacy-data/summary', adminConfigController.getLegacyDataSummary.bind(adminConfigController));
router.post(
  '/legacy-data/dry-run',
  validateBody(zodValidator(legacyMigrationSchema)),
  adminConfigController.dryRunLegacyDataMigration.bind(adminConfigController),
);
router.post(
  '/legacy-data/migrate',
  validateBody(zodValidator(legacyMigrationSchema)),
  adminConfigController.migrateLegacyData.bind(adminConfigController),
);
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
router.post(
  '/email/test',
  validateBody(zodValidator(adminEmailTestSchema)),
  adminConfigController.testEmail.bind(adminConfigController),
);

export default router;
