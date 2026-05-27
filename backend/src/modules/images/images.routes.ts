// @ts-expect-error Express does not ship local type declarations in this backend package yet.
import { Router } from 'express';
import { validateBody } from '../../app/middleware/validate-request.js';
import { validateImageBody } from '../capabilities/capabilities.schema.js';
import { imagesController } from './images.controller.js';

const router = Router();

router.post('/generate', validateBody(validateImageBody), imagesController.generate.bind(imagesController));

export default router;
