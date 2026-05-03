import { Router } from 'express';
import { imagesController } from './images.controller.js';

const router = Router();

router.post('/generate', imagesController.generate.bind(imagesController));

export default router;
