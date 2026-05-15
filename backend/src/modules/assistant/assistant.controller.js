import fs from 'fs';
import { successEnvelope } from '../../app/http/envelope.js';
import { settingsService } from '../settings/settings.service.js';
import { assistantService } from './assistant.service.js';

export class AssistantController {
  getStatus(_req, res) {
    res.json(successEnvelope(assistantService.getStatus()));
  }

  getConversations(_req, res) {
    res.json(successEnvelope(assistantService.getConversations()));
  }

  saveConversations(req, res) {
    assistantService.saveConversations(req.body);
    res.json(successEnvelope(null));
  }

  deleteConversation(req, res) {
    assistantService.deleteConversation(req.params.id);
    res.json(successEnvelope(null));
  }

  getImages(_req, res) {
    res.json(successEnvelope(assistantService.getImages()));
  }

  async saveImage(req, res, next) {
    try {
      const data = await assistantService.saveImage(req.body);
      res.json(successEnvelope(data));
    } catch (error) {
      next(error);
    }
  }

  clearImages(_req, res) {
    assistantService.clearImages();
    res.json(successEnvelope(null));
  }

  deleteImage(req, res) {
    assistantService.deleteImage(req.params.id);
    res.json(successEnvelope(null));
  }

  getVideos(_req, res) {
    res.json(successEnvelope(assistantService.getVideos()));
  }

  async saveVideo(req, res, next) {
    try {
      const data = await assistantService.saveVideo(req.body);
      res.json(successEnvelope(data));
    } catch (error) {
      next(error);
    }
  }

  clearVideos(_req, res) {
    assistantService.clearVideos();
    res.json(successEnvelope(null));
  }

  deleteVideo(req, res) {
    assistantService.deleteVideo(req.params.id);
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
      const file = assistantService.openGeneratedFile(req.params[0]);
      res.writeHead(200, { 'Content-Type': file.contentType });
      fs.createReadStream(file.filePath).pipe(res);
    } catch (error) {
      next(error);
    }
  }
}

export const assistantController = new AssistantController();
