import { existsSync } from 'node:fs';
import path, { resolve } from 'node:path';
// @ts-expect-error Express middleware packages do not ship local type declarations in this backend package yet.
import cors from 'cors';
// @ts-expect-error Express does not ship local type declarations in this backend package yet.
import express from 'express';
import adminConfigRoutes from '../modules/admin-config/admin-config.routes.ts';
import agentRoutes from '../modules/agent/agent.routes.ts';
import assistantRoutes from '../modules/assistant/assistant.routes.ts';
import authRoutes from '../modules/auth/auth.routes.ts';
import capabilitiesRoutes from '../modules/capabilities/capabilities.routes.ts';
import executeRoutes from '../modules/execution/execution.routes.ts';
import storageRoutes from '../modules/files/files.routes.ts';
import { filesService } from '../modules/files/files.service.ts';
import imageRoutes from '../modules/images/images.routes.ts';
import intelligenceRoutes from '../modules/intelligence/intelligence.routes.ts';
import settingsRoutes from '../modules/settings/settings.routes.ts';
import type { NextFunctionLike, RequestLike, ResponseLike } from '../modules/types.ts';
import workflowRoutes from '../modules/workflows/workflows.routes.ts';
import { ensureAgentLogDirectories } from '../platform/logging/agent-run-logger.ts';
import { getRequestContext } from '../platform/logging/request-context.ts';
import { getProcessInstanceId } from '../platform/logging/runtime-observability.ts';
import { ensureLogDirectories } from '../platform/logging/workflow-run-logger.ts';
import {
  ensureGeneratedThumbnailFromFile,
  ensureUploadThumbnail,
  resolveGeneratedOriginalFromThumbnailRelativePath,
  resolveUploadOriginalFromThumbnailName,
} from '../platform/media/image-thumbnails.ts';
import { getMimeType } from '../platform/media/media-resolver.ts';
import { getRuntimeCapabilities, summarizeScopeFoundation } from '../platform/runtime/index.ts';
import {
  ensureStorageDirectories,
  getScopedStoragePaths,
  migrateLegacyStorageIfNeeded,
  safeResolveWithin,
} from '../platform/storage/index.ts';
import { errorEnvelope, successEnvelope } from './http/envelope.ts';
import { authContextMiddleware, requireAuthenticatedUser } from './middleware/auth-context.ts';
import { errorHandler } from './middleware/error-handler.ts';
import { requestContextMiddleware } from './middleware/request-context.ts';
import { requestLoggerMiddleware } from './middleware/request-logger.ts';

function buildAllowedOrigins(): string[] {
  const configured = String(process.env.APP_ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (configured.length > 0) return configured;
  return [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5175',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
  ];
}

function getWildcardParam(req: RequestLike): string {
  return String(req.params?.[0] || '');
}

export function createApp() {
  ensureStorageDirectories();
  migrateLegacyStorageIfNeeded();
  ensureLogDirectories();
  ensureAgentLogDirectories();
  filesService.resumePendingUploadProcessingIfNeeded();

  const app = express();
  const allowedOrigins = buildAllowedOrigins();
  const runtimeCapabilities = getRuntimeCapabilities();

  app.use(
    cors({
      origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('CORS origin not allowed'));
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Admin-Access-Key',
        'X-SueLr-User-Id',
        'X-SueLr-Workspace-Id',
        'X-SueLr-Runtime-Mode',
      ],
    }),
  );
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.locals.runtimeCapabilities = runtimeCapabilities;
  app.use(authContextMiddleware);
  app.use(requestContextMiddleware);
  app.use(requireAuthenticatedUser);
  app.use(requestLoggerMiddleware);

  app.get('/api/files/.thumbnails/:filename', async (req: RequestLike, res: ResponseLike, next: NextFunctionLike) => {
    try {
      const filename = String(req.params?.filename || '');
      const storagePaths = getScopedStoragePaths(req.scope);
      const targetPath = safeResolveWithin(path.join(storagePaths.uploadsDir, '.thumbnails'), filename);
      if (!targetPath) return next();
      if (!existsSync(targetPath)) {
        const original = resolveUploadOriginalFromThumbnailName(filename, { scope: req.scope });
        if (!original) return next();
        await ensureUploadThumbnail({
          filename: original.filename,
          sourcePath: original.absolutePath,
          mimeType: getMimeType(original.absolutePath),
          scope: req.scope,
        });
      }
      res.sendFile(targetPath);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/outputs/*', async (req: RequestLike, res: ResponseLike, next: NextFunctionLike) => {
    try {
      const relativePath = getWildcardParam(req);
      const storagePaths = getScopedStoragePaths(req.scope);
      const absolutePath = safeResolveWithin(storagePaths.generatedDir, relativePath);
      if (!absolutePath) return next();
      if (!relativePath.includes('/.thumbnails/') || existsSync(absolutePath)) return next();

      const original = resolveGeneratedOriginalFromThumbnailRelativePath(relativePath, { scope: req.scope });
      if (!original) return next();
      await ensureGeneratedThumbnailFromFile({
        relativePath: original.relativePath,
        absolutePath: original.absolutePath,
        mimeType: getMimeType(original.absolutePath),
        scope: req.scope,
      });

      if (!existsSync(absolutePath)) return next();
      res.sendFile(absolutePath);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/outputs/*', (req: RequestLike, res: ResponseLike, next: NextFunctionLike) => {
    const relativePath = getWildcardParam(req);
    const filePath = safeResolveWithin(getScopedStoragePaths(req.scope).generatedDir, relativePath);
    if (!filePath || !existsSync(filePath)) return next();
    res.sendFile(filePath);
  });
  app.get('/api/files/*', (req: RequestLike, res: ResponseLike, next: NextFunctionLike) => {
    const relativePath = getWildcardParam(req);
    const filePath = safeResolveWithin(getScopedStoragePaths(req.scope).uploadsDir, relativePath);
    if (!filePath || !existsSync(filePath)) return next();
    res.sendFile(filePath);
  });

  app.use('/api/workflows', workflowRoutes);
  app.use('/api/execute', executeRoutes);
  app.use('/api/assistant', assistantRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/agent', agentRoutes);
  app.use('/api/intelligence', intelligenceRoutes);
  app.use('/api/images', imageRoutes);
  app.use('/api/capabilities', capabilitiesRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/admin', adminConfigRoutes);
  app.use('/api', storageRoutes);

  app.get('/api/health', (_req: RequestLike, res: ResponseLike) => {
    res.json(successEnvelope({ status: 'ok', version: '0.1.0', timestamp: Date.now() }));
  });

  app.get('/api/status', (_req: RequestLike, res: ResponseLike) => {
    res.json(
      successEnvelope({
        ok: true,
        version: '1.0.0',
        processInstanceId: getProcessInstanceId(),
        runtime: runtimeCapabilities,
        scope: summarizeScopeFoundation(getRequestContext()?.scope),
      }),
    );
  });

  const frontendDist = process.env.APP_FRONTEND_DIST ? resolve(process.env.APP_FRONTEND_DIST) : '';
  if (frontendDist && existsSync(resolve(frontendDist, 'index.html'))) {
    app.use(express.static(frontendDist));
    app.get('*', (req: RequestLike, res: ResponseLike, next: NextFunctionLike) => {
      if (String(req.path || '').startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(resolve(frontendDist, 'index.html'));
    });
  }

  app.use((error: Error, _req: RequestLike, res: ResponseLike, next: NextFunctionLike) => {
    if (error?.message === 'CORS origin not allowed') {
      res.status(403).json(errorEnvelope({ code: 'CORS_FORBIDDEN', message: '当前来源未被允许访问 API' }));
      return;
    }
    next(error);
  });

  app.use(errorHandler);

  return app;
}
