// @ts-expect-error Express does not ship local type declarations in this backend package yet.
import { Router } from 'express';
import { ValidationError } from '../../app/errors/index.ts';
import { successEnvelope } from '../../app/http/envelope.ts';
import { validateBody, validateParam, validateQuery } from '../../app/middleware/validate-request.ts';
import { zodValidator } from '../../app/middleware/zod-validator.ts';
import type { DynamicValue, NextFunctionLike, RequestLike, ResponseLike } from '../types.ts';
import {
  assetBatchSchema,
  assetIdSchema,
  assetMetadataSchema,
  assetQuerySchema,
  listAssets,
  mutateAssetBatch,
  removeAsset,
  updateAsset,
} from './asset-library.ts';
import { filesController } from './files.controller.ts';
import { validateFilename, validateUploadFile, validateUploadMetadataQuery } from './files.schema.ts';
import { filesService } from './files.service.ts';

const router = Router();
const upload = filesService.createUploader();
const validateAssetId = validateParam('id', zodValidator(assetIdSchema));

router.get(
  '/assets',
  validateQuery(zodValidator(assetQuerySchema)),
  (req: RequestLike, res: ResponseLike, next: NextFunctionLike) => {
    try {
      res.json(successEnvelope(listAssets(req.query, { scope: req.scope })));
    } catch (error) {
      next(error);
    }
  },
);
router.post(
  '/assets/batch',
  validateBody(zodValidator(assetBatchSchema)),
  (req: RequestLike, res: ResponseLike, next: NextFunctionLike) => {
    try {
      res.json(successEnvelope(mutateAssetBatch(req.body, { scope: req.scope })));
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/assets/:id',
  validateAssetId,
  validateBody(zodValidator(assetMetadataSchema)),
  (req: RequestLike, res: ResponseLike, next: NextFunctionLike) => {
    try {
      res.json(successEnvelope(updateAsset(req.params.id, req.body, { scope: req.scope })));
    } catch (error) {
      next(error);
    }
  },
);

router.delete('/assets/:id', validateAssetId, (req: RequestLike, res: ResponseLike, next: NextFunctionLike) => {
  try {
    res.json(successEnvelope(removeAsset(req.params.id, { scope: req.scope })));
  } catch (error) {
    next(error);
  }
});

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
