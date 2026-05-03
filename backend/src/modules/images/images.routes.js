import { Router } from 'express';
import { validateBody } from '../../app/middleware/validate-request.js';
import { imagesController } from './images.controller.js';
import { validateImageBody } from '../capabilities/capabilities.schema.js';

const router = Router();

router.post('/generate', validateBody(validateImageBody), imagesController.generate.bind(imagesController));

export default router;
