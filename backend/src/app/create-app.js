import express from 'express';
import cors from 'cors';
import executeRoutes from '../modules/execution/execution.routes.js';
import workflowRoutes from '../modules/workflows/workflows.routes.js';
import assistantRoutes from '../modules/assistant/assistant.routes.js';
import imageRoutes from '../modules/images/images.routes.js';
import capabilitiesRoutes from '../modules/capabilities/capabilities.routes.js';
import settingsRoutes from '../modules/settings/settings.routes.js';
import storageRoutes from '../modules/files/files.routes.js';
import { errorEnvelope, successEnvelope } from './http/envelope.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestContextMiddleware } from './middleware/request-context.js';
import { requestLoggerMiddleware } from './middleware/request-logger.js';
import { STORAGE_PATHS, ensureStorageDirectories, migrateLegacyStorageIfNeeded } from '../platform/storage/index.js';
import { ensureLogDirectories } from '../platform/logging/workflow-run-logger.js';
import { getProcessInstanceId } from '../platform/logging/runtime-observability.js';

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

  const app = express();
  const allowedOrigins = buildAllowedOrigins();

  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS origin not allowed'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestContextMiddleware);
  app.use(requestLoggerMiddleware);

  app.use('/api/outputs', express.static(STORAGE_PATHS.generatedDir));
  app.use('/api/files', express.static(STORAGE_PATHS.uploadsDir));

  app.use('/api/workflows', workflowRoutes);
  app.use('/api/execute', executeRoutes);
  app.use('/api/assistant', assistantRoutes);
  app.use('/api/images', imageRoutes);
  app.use('/api/capabilities', capabilitiesRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api', storageRoutes);

  app.get('/api/health', (_req, res) => {
    res.json(successEnvelope({ status: 'ok', version: '0.1.0', timestamp: Date.now() }));
  });

  app.get('/api/status', (_req, res) => {
    res.json(successEnvelope({ ok: true, version: '1.0.0', processInstanceId: getProcessInstanceId() }));
  });

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
