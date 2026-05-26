import { existsSync } from 'node:fs';
import path, { resolve } from 'node:path';
import cors from 'cors';
import express from 'express';
import adminConfigRoutes from '../modules/admin-config/admin-config.routes.js';
import agentRoutes from '../modules/agent/agent.routes.js';
import assistantRoutes from '../modules/assistant/assistant.routes.js';
import capabilitiesRoutes from '../modules/capabilities/capabilities.routes.js';
import executeRoutes from '../modules/execution/execution.routes.js';
import storageRoutes from '../modules/files/files.routes.js';
import { filesService } from '../modules/files/files.service.js';
import imageRoutes from '../modules/images/images.routes.js';
import settingsRoutes from '../modules/settings/settings.routes.js';
import workflowRoutes from '../modules/workflows/workflows.routes.js';
import { ensureAgentLogDirectories } from '../platform/logging/agent-run-logger.js';
import { getRequestContext } from '../platform/logging/request-context.js';
import { getProcessInstanceId } from '../platform/logging/runtime-observability.js';
import { ensureLogDirectories } from '../platform/logging/workflow-run-logger.js';
import {
  ensureGeneratedThumbnailFromFile,
  ensureUploadThumbnail,
  resolveGeneratedOriginalFromThumbnailRelativePath,
  resolveUploadOriginalFromThumbnailName,
} from '../platform/media/image-thumbnails.js';
import { getMimeType } from '../platform/media/media-resolver.js';
import { getRuntimeCapabilities, summarizeScopeFoundation } from '../platform/runtime/index.js';
import {
  STORAGE_PATHS,
  ensureStorageDirectories,
  getScopedStoragePaths,
  migrateLegacyStorageIfNeeded,
  safeResolveWithin,
} from '../platform/storage/index.js';
import { errorEnvelope, successEnvelope } from './http/envelope.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestContextMiddleware } from './middleware/request-context.js';
import { requestLoggerMiddleware } from './middleware/request-logger.js';

function buildAllowedOrigins() {
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
      origin(origin, callback) {
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
  app.use(requestContextMiddleware);
  app.use(requestLoggerMiddleware);

  app.get('/api/files/.thumbnails/:filename', async (req, res, next) => {
    try {
      const storagePaths = getScopedStoragePaths(req.scope);
      const targetPath = safeResolveWithin(path.join(storagePaths.uploadsDir, '.thumbnails'), req.params.filename);
      if (!targetPath) return next();
      if (!existsSync(targetPath)) {
        const original = resolveUploadOriginalFromThumbnailName(req.params.filename, { scope: req.scope });
        if (!original) return next();
        await ensureUploadThumbnail({
          filename: original.filename,
          sourcePath: original.absolutePath,
          mimeType: getMimeType(original.absolutePath),
        });
      }
      res.sendFile(targetPath);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/outputs/*', async (req, res, next) => {
    try {
      const relativePath = String(req.params[0] || '');
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

  app.get('/api/outputs/*', (req, res, next) => {
    const relativePath = String(req.params[0] || '');
    const filePath = safeResolveWithin(getScopedStoragePaths(req.scope).generatedDir, relativePath);
    if (!filePath || !existsSync(filePath)) return next();
    res.sendFile(filePath);
  });
  app.get('/api/files/*', (req, res, next) => {
    const relativePath = String(req.params[0] || '');
    const filePath = safeResolveWithin(getScopedStoragePaths(req.scope).uploadsDir, relativePath);
    if (!filePath || !existsSync(filePath)) return next();
    res.sendFile(filePath);
  });

  app.use('/api/workflows', workflowRoutes);
  app.use('/api/execute', executeRoutes);
  app.use('/api/assistant', assistantRoutes);
  app.use('/api/agent', agentRoutes);
  app.use('/api/images', imageRoutes);
  app.use('/api/capabilities', capabilitiesRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/admin', adminConfigRoutes);
  app.use('/api', storageRoutes);

  app.get('/api/health', (_req, res) => {
    res.json(successEnvelope({ status: 'ok', version: '0.1.0', timestamp: Date.now() }));
  });

  app.get('/api/status', (_req, res) => {
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
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(resolve(frontendDist, 'index.html'));
    });
  }

  app.use((error, _req, res, next) => {
    if (error?.message === 'CORS origin not allowed') {
      res.status(403).json(errorEnvelope({ code: 'CORS_FORBIDDEN', message: '当前来源未被允许访问 API' }));
      return;
    }
    next(error);
  });

  app.use(errorHandler);

  return app;
}
