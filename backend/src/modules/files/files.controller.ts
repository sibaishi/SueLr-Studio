import { NotFoundError } from '../../app/errors/index.js';
import { successEnvelope } from '../../app/http/envelope.js';
import type { NextFunctionLike, RequestLike, ResponseLike } from '../types.js';
import { filesService } from './files.service.js';

export class FilesController {
  async listGenerated(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(await filesService.listGeneratedOutputs({ scope: req.scope })));
    } catch (error) {
      next(error);
    }
  }

  clearGenerated(req: RequestLike, res: ResponseLike) {
    res.json(successEnvelope(filesService.clearGeneratedOutputs({ scope: req.scope })));
  }

  async upload(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(await filesService.buildUploadResponse(req.file, { scope: req.scope })));
    } catch (error) {
      next(error);
    }
  }

  metadata(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      const result = filesService.getUploadMetadata(req.params.filename, { scope: req.scope });
      if (!result) throw new NotFoundError('FILE_NOT_FOUND', '文件不存在');
      res.json(successEnvelope(result));
    } catch (error) {
      next(error);
    }
  }

  remove(req: RequestLike, res: ResponseLike) {
    filesService.deleteUpload(req.params.filename, { scope: req.scope });
    res.json(successEnvelope(null));
  }
}

export const filesController = new FilesController();
