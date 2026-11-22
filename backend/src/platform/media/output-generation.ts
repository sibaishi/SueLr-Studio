import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { GenerationRecord } from '../../../../src/shared/types/generation.ts';
import type { RequestScope } from '../runtime/request-scope.ts';
import { getScopedStoragePaths, safeResolveWithin } from '../storage/index.ts';
import { readJsonFile, writeJsonFile } from '../storage/json-store.ts';

const generationSchema = z.object({
  version: z.literal(1),
  runId: z.string(),
  workflowId: z.string(),
  nodeId: z.string(),
  createdAt: z.number().finite(),
  prompt: z.string(),
  references: z.array(
    z.object({
      url: z.string(),
      kind: z.enum(['image', 'video', 'audio']),
      role: z.enum(['reference', 'mask']).optional(),
    }),
  ),
  parameters: z.record(z.string(), z.union([z.string(), z.number().finite(), z.boolean()])),
});

export type GenerationRecords = Map<string, GenerationRecord | null>;
export function generationValueKey(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
function recordPath(relativePath: string, scope?: RequestScope) {
  if (!safeResolveWithin(getScopedStoragePaths(scope).generatedDir, relativePath)) return null;
  return path.join(
    getScopedStoragePaths(scope).logsDir,
    'output-generation',
    `${generationValueKey(relativePath)}.json`,
  );
}
export function writeOutputGeneration(relativePath: string, record: GenerationRecord, scope?: RequestScope) {
  const target = recordPath(relativePath, scope);
  if (target) writeJsonFile(target, record);
}
export function readOutputGeneration(relativePath: string, scope?: RequestScope) {
  const target = recordPath(relativePath, scope);
  if (!target) return null;
  const parsed = generationSchema.safeParse(readJsonFile<unknown>(target, null));
  return parsed.success ? parsed.data : null;
}
export function deleteOutputGeneration(relativePath: string, scope?: RequestScope) {
  const target = recordPath(relativePath, scope);
  if (target) fs.rmSync(target, { force: true });
}
