// @ts-expect-error Express does not ship local type declarations in this backend package yet.
import { Router } from 'express';
import { ValidationError } from '../../app/errors/index.ts';
import { validateParam } from '../../app/middleware/validate-request.ts';
import type { DynamicValue, NextFunctionLike, RequestLike, ResponseLike } from '../types.ts';
import { filesController } from './files.controller.ts';
import { validateFilename, validateUploadFile, validateUploadMetadataQuery } from './files.schema.ts';
import { filesService } from './files.service.ts';

const router = Router();
const upload = filesService.createUploader();

router.get('/files/generated', filesController.listGenerated.bind(filesController));
router.delete('/files/generated', filesController.clearGenerated.bind(filesController));

router.post(
  '/files/upload',
  (req: RequestLike, res: ResponseLike, next: NextFunctionLike) => {
    upload.single('file')(req, res, (error: DynamicValue) => {
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
  },
  filesController.upload.bind(filesController),
);

router.get(
  '/files/:filename/metadata',
  validateParam('filename', validateUploadMetadataQuery),
  filesController.metadata.bind(filesController),
);
router.delete(
  '/files/:filename',
  validateParam('filename', validateFilename),
  filesController.remove.bind(filesController),
);

export default router;
