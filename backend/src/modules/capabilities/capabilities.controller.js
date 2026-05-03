import { successEnvelope } from '../../app/http/envelope.js';
import { capabilitiesService } from './capabilities.service.js';

export class CapabilitiesController {
  async chat(req, res, next) {
    try {
      res.json(successEnvelope(await capabilitiesService.chat(req.body)));
    } catch (error) {
      next(error);
    }
  }

  async search(req, res, next) {
    try {
      res.json(successEnvelope(await capabilitiesService.search(req.body)));
    } catch (error) {
      next(error);
    }
  }

  async image(req, res, next) {
    try {
      res.json(successEnvelope(await capabilitiesService.image(req.body)));
    } catch (error) {
      next(error);
    }
  }

  async submitVideo(req, res, next) {
    try {
      res.json(successEnvelope(await capabilitiesService.submitVideo(req.body)));
    } catch (error) {
      next(error);
    }
  }

  async getVideoStatus(req, res, next) {
    try {
      res.json(successEnvelope(await capabilitiesService.getVideoStatus(req.params.taskId)));
    } catch (error) {
      next(error);
    }
  }
}

export const capabilitiesController = new CapabilitiesController();
