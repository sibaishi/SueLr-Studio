// @ts-expect-error Express does not ship local type declarations in this backend package yet.
import { Router } from 'express';
import { validateBody, validateParam } from '../../app/middleware/validate-request.ts';
import { workflowsController } from './workflows.controller.ts';
import { ensureWorkflowBody, validateWorkflowId } from './workflows.schema.ts';

const router = Router();

router.get('/', workflowsController.list.bind(workflowsController));
router.post('/import', validateBody(ensureWorkflowBody), workflowsController.import.bind(workflowsController));
router.get('/:id', validateParam('id', validateWorkflowId), workflowsController.get.bind(workflowsController));
router.get(
  '/:id/export',
  validateParam('id', validateWorkflowId),
  workflowsController.export.bind(workflowsController),
);
router.post('/', validateBody(ensureWorkflowBody), workflowsController.create.bind(workflowsController));
router.put(
  '/:id',
  validateParam('id', validateWorkflowId),
  validateBody(ensureWorkflowBody),
  workflowsController.update.bind(workflowsController),
);
router.delete('/:id', validateParam('id', validateWorkflowId), workflowsController.remove.bind(workflowsController));
router.post(
  '/:id/duplicate',
  validateParam('id', validateWorkflowId),
  workflowsController.duplicate.bind(workflowsController),
);

export default router;
