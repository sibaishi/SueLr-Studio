// @ts-expect-error Express does not ship local type declarations in this backend package yet.
import { Router } from 'express';
import { validateBody } from '../../app/middleware/validate-request.ts';
import { validateImageBody } from '../capabilities/capabilities.schema.ts';
import { imagesController } from './images.controller.ts';

const router = Router();

router.post('/generate', validateBody(validateImageBody), imagesController.generate.bind(imagesController));

export default router;
