import { successEnvelope } from '../../app/http/envelope.js';
import { imagesService } from './images.service.js';

export class ImagesController {
  async generate(req, res, next) {
    try {
      const result = await imagesService.generate(req.body);
      res.json(successEnvelope(result));
    } catch (error) {
      next(error);
    }
  }
}

export const imagesController = new ImagesController();
