import { successEnvelope } from '../../app/http/envelope.js';
import { createRequestAbortSignal } from '../../app/http/request-abort.js';
import { imagesService } from './images.service.js';

export class ImagesController {
  async generate(req, res, next) {
    try {
      const result = await imagesService.generate(req.body, {
        signal: createRequestAbortSignal(req, res),
        scope: req.scope,
      });
      res.json(successEnvelope(result));
    } catch (error) {
      next(error);
    }
  }
}

export const imagesController = new ImagesController();
