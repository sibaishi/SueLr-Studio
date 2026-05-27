import { successEnvelope } from '../../app/http/envelope.js';
import { createRequestAbortSignal } from '../../app/http/request-abort.js';
import type { NextFunctionLike, RequestLike, ResponseLike } from '../types.js';
import { imagesService } from './images.service.js';

export class ImagesController {
  async generate(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
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
