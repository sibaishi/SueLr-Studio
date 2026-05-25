import { successEnvelope } from '../../app/http/envelope.js';
import { filesService } from './files.service.js';

export class FilesController {
  async listGenerated(_req, res, next) {
    try {
      res.json(successEnvelope(await filesService.listGeneratedOutputs()));
    } catch (error) {
      next(error);
    }
  }

  clearGenerated(_req, res) {
    res.json(successEnvelope(filesService.clearGeneratedOutputs()));
  }

  async upload(req, res, next) {
    try {
      res.json(successEnvelope(await filesService.buildUploadResponse(req.file)));
    } catch (error) {
      next(error);
    }
  }

  remove(req, res) {
    filesService.deleteUpload(req.params.filename);
    res.json(successEnvelope(null));
  }
}

export const filesController = new FilesController();
