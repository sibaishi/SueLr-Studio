import { Router } from 'express';
import { validateBody, validateParam } from '../../app/middleware/validate-request.js';
import { executionController } from './execution.controller.js';
import { validateExecutionBody, validateExecutionRunId, validateExecutionWorkflowId } from './execution.schema.js';

const router = Router();

router.post(
  '/:id',
  validateParam('id', validateExecutionWorkflowId),
  validateBody(validateExecutionBody),
  executionController.execute.bind(executionController),
);

router.get(
  '/runs/:runId/status',
  validateParam('runId', validateExecutionRunId),
  executionController.getStatus.bind(executionController),
);
router.post(
  '/runs/:runId/cancel',
  validateParam('runId', validateExecutionRunId),
  executionController.cancel.bind(executionController),
);

export default router;
