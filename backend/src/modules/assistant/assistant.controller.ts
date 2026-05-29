import fs from 'node:fs';
import { successEnvelope } from '../../app/http/envelope.ts';
import { settingsService } from '../settings/settings.service.ts';
import type { DynamicValue, NextFunctionLike, RequestLike, ResponseLike } from '../types.ts';
import { assistantService } from './assistant.service.ts';

export class AssistantController {
  getStatus(req: RequestLike, res: ResponseLike) {
    res.json(successEnvelope(assistantService.getStatus({ scope: req.scope })));
  }

  getConversations(req: RequestLike, res: ResponseLike) {
    res.json(successEnvelope(assistantService.getConversations({ scope: req.scope })));
  }

  saveConversations(req: RequestLike, res: ResponseLike) {
    assistantService.saveConversations(req.body, { scope: req.scope });
    res.json(successEnvelope(null));
  }

  deleteConversation(req: RequestLike, res: ResponseLike) {
    assistantService.deleteConversation(req.params.id, { scope: req.scope });
    res.json(successEnvelope(null));
  }

  getImages(req: RequestLike, res: ResponseLike) {
    res.json(successEnvelope(assistantService.getImages({ scope: req.scope })));
  }

  async saveImage(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      const data = await assistantService.saveImage(req.body, { scope: req.scope });
      res.json(successEnvelope(data));
    } catch (error) {
      next(error);
    }
  }

  clearImages(req: RequestLike, res: ResponseLike) {
    assistantService.clearImages({ scope: req.scope });
    res.json(successEnvelope(null));
  }

  deleteImage(req: RequestLike, res: ResponseLike) {
    assistantService.deleteImage(req.params.id, { scope: req.scope });
    res.json(successEnvelope(null));
  }

  getVideos(req: RequestLike, res: ResponseLike) {
    res.json(successEnvelope(assistantService.getVideos({ scope: req.scope })));
  }

  async saveVideo(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      const data = await assistantService.saveVideo(req.body, { scope: req.scope });
      res.json(successEnvelope(data));
    } catch (error) {
      next(error);
    }
  }

  clearVideos(req: RequestLike, res: ResponseLike) {
    assistantService.clearVideos({ scope: req.scope });
    res.json(successEnvelope(null));
  }

  deleteVideo(req: RequestLike, res: ResponseLike) {
    assistantService.deleteVideo(req.params.id, { scope: req.scope });
    res.json(successEnvelope(null));
  }

  getSettings(req: RequestLike, res: ResponseLike) {
    res.json(successEnvelope(settingsService.getStudioSettings(req.scope)));
  }

  updateSettings(req: RequestLike, res: ResponseLike) {
    settingsService.updateStudioSettings(req.body, req.scope);
    res.json(successEnvelope(null));
  }

  streamFile(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      const file = assistantService.openGeneratedFile(req.params[0], { scope: req.scope });
      res.writeHead(200, { 'Content-Type': file.contentType });
      fs.createReadStream(file.filePath).pipe(res as DynamicValue);
    } catch (error) {
      next(error);
    }
  }
}

export const assistantController = new AssistantController();
