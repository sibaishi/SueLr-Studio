import { Router } from 'express';
import { workflowsController } from './workflows.controller.js';
import { ensureWorkflowBody } from './workflows.schema.js';

const router = Router();

router.get('/', workflowsController.list.bind(workflowsController));
router.post('/import', (req, _res, next) => {
  try {
    req.body = ensureWorkflowBody(req.body);
    next();
  } catch (error) {
    next(error);
  }
}, workflowsController.import.bind(workflowsController));
router.get('/:id', workflowsController.get.bind(workflowsController));
router.get('/:id/export', workflowsController.export.bind(workflowsController));
router.post('/', (req, _res, next) => {
  try {
    req.body = ensureWorkflowBody(req.body);
    next();
  } catch (error) {
    next(error);
  }
}, workflowsController.create.bind(workflowsController));
router.put('/:id', (req, _res, next) => {
  try {
    req.body = ensureWorkflowBody(req.body);
    next();
  } catch (error) {
    next(error);
  }
}, workflowsController.update.bind(workflowsController));
router.delete('/:id', workflowsController.remove.bind(workflowsController));
router.post('/:id/duplicate', workflowsController.duplicate.bind(workflowsController));

export default router;
