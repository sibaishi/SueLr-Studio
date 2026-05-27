import { successEnvelope } from '../../app/http/envelope.js';
import { createRequestAbortSignal } from '../../app/http/request-abort.js';
import type { NextFunctionLike, RequestLike, ResponseLike } from '../types.js';
import { capabilitiesService } from './capabilities.service.js';

export class CapabilitiesController {
  runtime(_req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(capabilitiesService.getRuntimeCapabilities()));
    } catch (error) {
      next(error);
    }
  }

  async chat(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      if (req.query.stream === 'true' || req.body.stream === true) {
        const upstream = await capabilitiesService.chatStream(req.body, { scope: req.scope });
        const contentType = upstream.headers.get('content-type') || '';

        res.writeHead(200, {
          'Content-Type': contentType.includes('text/event-stream') ? contentType : 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        if (!upstream.body || contentType.includes('application/json')) {
          const payload = await upstream.json();
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }

        const reader = upstream.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (res.writableEnded || res.destroyed) {
              await reader.cancel().catch(() => {});
              break;
            }
            res.write(Buffer.from(value));
          }
        } finally {
          reader.releaseLock();
        }

        res.end();
        return;
      }

      res.json(successEnvelope(await capabilitiesService.chat(req.body, { scope: req.scope })));
    } catch (error) {
      next(error);
    }
  }

  async search(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(await capabilitiesService.search(req.body, { scope: req.scope })));
    } catch (error) {
      next(error);
    }
  }

  async image(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(
        successEnvelope(
          await capabilitiesService.image(req.body, {
            signal: createRequestAbortSignal(req, res),
            scope: req.scope,
          }),
        ),
      );
    } catch (error) {
      next(error);
    }
  }

  async submitVideo(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(await capabilitiesService.submitVideo(req.body, { scope: req.scope })));
    } catch (error) {
      next(error);
    }
  }

  async getVideoStatus(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(
        successEnvelope(
          await capabilitiesService.getVideoStatus(req.params.taskId, req.body?.apiConfig || {}, { scope: req.scope }),
        ),
      );
    } catch (error) {
      next(error);
    }
  }
}

export const capabilitiesController = new CapabilitiesController();
