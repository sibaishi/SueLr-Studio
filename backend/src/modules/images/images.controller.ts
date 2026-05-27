import { successEnvelope } from '../../app/http/envelope.ts';
import { createRequestAbortSignal } from '../../app/http/request-abort.ts';
import type { NextFunctionLike, RequestLike, ResponseLike } from '../types.ts';
import { imagesService } from './images.service.ts';

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
