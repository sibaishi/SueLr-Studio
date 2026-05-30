import { successEnvelope } from '../../app/http/envelope.ts';
import type { NextFunctionLike, RequestLike, ResponseLike } from '../types.ts';
import { intelligenceService } from './intelligence.service.ts';

export class IntelligenceController {
  listSkills(_req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(intelligenceService.listSkills()));
    } catch (error) {
      next(error);
    }
  }

  listKnowledge(_req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(intelligenceService.listKnowledge({ scope: _req.scope })));
    } catch (error) {
      next(error);
    }
  }

  searchKnowledge(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(intelligenceService.searchKnowledge(req.body, { scope: req.scope })));
    } catch (error) {
      next(error);
    }
  }

  writeKnowledge(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(intelligenceService.writeKnowledge(req.body, { scope: req.scope })));
    } catch (error) {
      next(error);
    }
  }

  importLegacyMemory(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(intelligenceService.importLegacyMemory({ scope: req.scope })));
    } catch (error) {
      next(error);
    }
  }

  rebuildSeedKnowledge(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(intelligenceService.rebuildSeedKnowledge({ scope: req.scope })));
    } catch (error) {
      next(error);
    }
  }

  async createRun(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(await intelligenceService.createRun(req.body, { scope: req.scope })));
    } catch (error) {
      next(error);
    }
  }

  getRun(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(intelligenceService.getRun(req.params.id, { scope: req.scope })));
    } catch (error) {
      next(error);
    }
  }

  createWorkflowDraft(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(intelligenceService.createWorkflowDraft(req.body, { scope: req.scope })));
    } catch (error) {
      next(error);
    }
  }
}

export const intelligenceController = new IntelligenceController();
