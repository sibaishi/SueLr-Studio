import fs from 'fs';
import { successEnvelope } from '../../app/http/envelope.js';
import { settingsService } from '../settings/settings.service.js';
import { assistantService } from './assistant.service.js';

export class AssistantController {
  getStatus(req, res) {
    res.json(successEnvelope(assistantService.getStatus({ scope: req.scope })));
  }

  getConversations(req, res) {
    res.json(successEnvelope(assistantService.getConversations({ scope: req.scope })));
  }

  saveConversations(req, res) {
    assistantService.saveConversations(req.body, { scope: req.scope });
    res.json(successEnvelope(null));
  }

  deleteConversation(req, res) {
    assistantService.deleteConversation(req.params.id, { scope: req.scope });
    res.json(successEnvelope(null));
  }

  getImages(req, res) {
    res.json(successEnvelope(assistantService.getImages({ scope: req.scope })));
  }

  async saveImage(req, res, next) {
    try {
      const data = await assistantService.saveImage(req.body, { scope: req.scope });
      res.json(successEnvelope(data));
    } catch (error) {
      next(error);
    }
  }

  clearImages(req, res) {
    assistantService.clearImages({ scope: req.scope });
    res.json(successEnvelope(null));
  }

  deleteImage(req, res) {
    assistantService.deleteImage(req.params.id, { scope: req.scope });
    res.json(successEnvelope(null));
  }

  getVideos(req, res) {
    res.json(successEnvelope(assistantService.getVideos({ scope: req.scope })));
  }

  async saveVideo(req, res, next) {
    try {
      const data = await assistantService.saveVideo(req.body, { scope: req.scope });
      res.json(successEnvelope(data));
    } catch (error) {
      next(error);
    }
  }

  clearVideos(req, res) {
    assistantService.clearVideos({ scope: req.scope });
    res.json(successEnvelope(null));
  }

  deleteVideo(req, res) {
    assistantService.deleteVideo(req.params.id, { scope: req.scope });
    res.json(successEnvelope(null));
  }

  getSettings(_req, res) {
    res.json(successEnvelope(settingsService.getStudioSettings()));
  }

  updateSettings(req, res) {
    settingsService.updateStudioSettings(req.body);
    res.json(successEnvelope(null));
  }

  streamFile(req, res, next) {
    try {
      const file = assistantService.openGeneratedFile(req.params[0], { scope: req.scope });
      res.writeHead(200, { 'Content-Type': file.contentType });
      fs.createReadStream(file.filePath).pipe(res);
    } catch (error) {
      next(error);
    }
  }
}

export const assistantController = new AssistantController();
