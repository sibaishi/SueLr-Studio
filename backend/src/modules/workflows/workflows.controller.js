import { successEnvelope } from '../../app/http/envelope.js';
import { workflowsService } from './workflows.service.js';
import { validateWorkflowId } from './workflows.schema.js';

export class WorkflowsController {
  list(_req, res, next) {
    try {
      res.json(successEnvelope(workflowsService.list()));
    } catch (error) {
      next(error);
    }
  }

  get(req, res, next) {
    try {
      res.json(successEnvelope(workflowsService.getById(validateWorkflowId(req.params.id))));
    } catch (error) {
      next(error);
    }
  }

  create(req, res, next) {
    try {
      res.json(successEnvelope(workflowsService.create(req.body)));
    } catch (error) {
      next(error);
    }
  }

  update(req, res, next) {
    try {
      res.json(successEnvelope(workflowsService.update(validateWorkflowId(req.params.id), req.body)));
    } catch (error) {
      next(error);
    }
  }

  remove(req, res, next) {
    try {
      workflowsService.delete(validateWorkflowId(req.params.id));
      res.json(successEnvelope(null));
    } catch (error) {
      next(error);
    }
  }

  duplicate(req, res, next) {
    try {
      res.json(successEnvelope(workflowsService.duplicate(validateWorkflowId(req.params.id))));
    } catch (error) {
      next(error);
    }
  }

  export(req, res, next) {
    try {
      res.json(successEnvelope(workflowsService.export(validateWorkflowId(req.params.id))));
    } catch (error) {
      next(error);
    }
  }

  import(req, res, next) {
    try {
      const generateNewId = req.query.generateNewId === 'true';
      const mode = typeof req.query.mode === 'string'
        ? req.query.mode
        : (generateNewId ? 'generate_new_id' : 'preserve_id');
      const result = workflowsService.import(req.body, { generateNewId, mode });
      res.json(successEnvelope({
        workflow: result.workflow,
        report: result.report,
      }));
    } catch (error) {
      next(error);
    }
  }
}

export const workflowsController = new WorkflowsController();
