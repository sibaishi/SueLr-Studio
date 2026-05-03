import { Router } from 'express';
import { executionController } from './execution.controller.js';
import { validateExecutionBody, validateExecutionRunId, validateExecutionWorkflowId } from './execution.schema.js';

const router = Router();

router.post('/:id', (req, _res, next) => {
  try {
    req.params.id = validateExecutionWorkflowId(req.params.id);
    req.body = validateExecutionBody(req.body);
    next();
  } catch (error) {
    next(error);
  }
}, executionController.execute.bind(executionController));

router.get('/runs/:runId/status', (req, _res, next) => {
  try {
    req.params.runId = validateExecutionRunId(req.params.runId);
    next();
  } catch (error) {
    next(error);
  }
}, executionController.getStatus.bind(executionController));

router.post('/runs/:runId/cancel', (req, _res, next) => {
  try {
    req.params.runId = validateExecutionRunId(req.params.runId);
    next();
  } catch (error) {
    next(error);
  }
}, executionController.cancel.bind(executionController));

export default router;
