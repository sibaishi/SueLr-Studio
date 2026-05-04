import { successEnvelope } from '../../app/http/envelope.js';
import { filesService } from './files.service.js';

export class FilesController {
  listGenerated(_req, res) {
    res.json(successEnvelope(filesService.listGeneratedOutputs()));
  }

  upload(req, res) {
    res.json(successEnvelope(filesService.buildUploadResponse(req.file)));
  }

  remove(req, res) {
    filesService.deleteUpload(req.params.filename);
    res.json(successEnvelope(null));
  }
}

export const filesController = new FilesController();
