// @ts-expect-error Express does not ship local type declarations in this backend package yet.
import { Router } from 'express';
import { validateBody } from '../../app/middleware/validate-request.ts';
import { zodValidator } from '../../app/middleware/zod-validator.ts';
import { authController } from './auth.controller.ts';
import { loginSchema, registerSchema } from './auth.schema.ts';

const router = Router();

router.post('/register', validateBody(zodValidator(registerSchema)), authController.register.bind(authController));
router.post('/login', validateBody(zodValidator(loginSchema)), authController.login.bind(authController));
router.post('/logout', authController.logout.bind(authController));
router.get('/me', authController.me.bind(authController));

export default router;
