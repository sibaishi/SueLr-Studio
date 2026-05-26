import { successEnvelope } from '../../app/http/envelope.js';
import { workflowsService } from './workflows.service.js';

export class WorkflowsController {
  list(req, res, next) {
    try {
      res.json(successEnvelope(workflowsService.list({ scope: req.scope })));
    } catch (error) {
      next(error);
    }
  }

  get(req, res, next) {
    try {
      res.json(successEnvelope(workflowsService.getById(req.params.id, { scope: req.scope })));
    } catch (error) {
      next(error);
    }
  }

  create(req, res, next) {
    try {
      res.json(successEnvelope(workflowsService.create(req.body, { scope: req.scope })));
    } catch (error) {
      next(error);
    }
  }

  update(req, res, next) {
    try {
      res.json(successEnvelope(workflowsService.update(req.params.id, req.body, { scope: req.scope })));
    } catch (error) {
      next(error);
    }
  }

  remove(req, res, next) {
    try {
      workflowsService.delete(req.params.id, { scope: req.scope });
      res.json(successEnvelope(null));
    } catch (error) {
      next(error);
    }
  }

  duplicate(req, res, next) {
    try {
      res.json(successEnvelope(workflowsService.duplicate(req.params.id, { scope: req.scope })));
    } catch (error) {
      next(error);
    }
  }

  export(req, res, next) {
    try {
      res.json(successEnvelope(workflowsService.export(req.params.id, { scope: req.scope })));
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
      const result = workflowsService.import(req.body, { generateNewId, mode, scope: req.scope });
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
