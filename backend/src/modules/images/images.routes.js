import { Router } from 'express';
import { imagesController } from './images.controller.js';
import { validateImageBody } from '../capabilities/capabilities.schema.js';

const router = Router();

router.post('/generate', (req, _res, next) => {
  try {
    req.body = validateImageBody(req.body);
    next();
  } catch (error) {
    next(error);
  }
}, imagesController.generate.bind(imagesController));

export default router;
