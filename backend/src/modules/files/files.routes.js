import { Router } from 'express';
import { ValidationError } from '../../app/errors/index.js';
import { validateParam } from '../../app/middleware/validate-request.js';
import { filesController } from './files.controller.js';
import { filesService } from './files.service.js';
import { validateFilename, validateUploadFile, validateUploadMetadataQuery } from './files.schema.js';

const router = Router();
const upload = filesService.createUploader();

router.get('/files/generated', filesController.listGenerated.bind(filesController));
router.delete('/files/generated', filesController.clearGenerated.bind(filesController));

router.post('/files/upload', (req, res, next) => {
  upload.single('file')(req, res, (error) => {
    if (error) {
      next(new ValidationError('UPLOAD_FAILED', error.message || '文件上传失败'));
      return;
    }
    try {
      validateUploadFile(req.file);
      next();
    } catch (validationError) {
      filesService.cleanupUploadedFile(req.file);
      next(validationError);
    }
  });
}, filesController.upload.bind(filesController));

router.get('/files/:filename/metadata', validateParam('filename', validateUploadMetadataQuery), filesController.metadata.bind(filesController));
router.delete('/files/:filename', validateParam('filename', validateFilename), filesController.remove.bind(filesController));

export default router;
