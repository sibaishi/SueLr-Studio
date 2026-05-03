import { Router } from 'express';
import { ValidationError } from '../../app/errors/index.js';
import { filesController } from './files.controller.js';
import { filesService } from './files.service.js';
import { validateFilename, validateUploadFile } from './files.schema.js';

const router = Router();
const upload = filesService.createUploader();

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

router.delete('/files/:filename', (req, _res, next) => {
  try {
    req.params.filename = validateFilename(req.params.filename);
    next();
  } catch (error) {
    next(error);
  }
}, filesController.remove.bind(filesController));

export default router;
