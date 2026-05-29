import { z } from 'zod';

const outboundProxySchema = z
  .object({
    mode: z.enum(['system', 'direct', 'custom']).optional(),
    httpProxy: z.string().max(2000).optional(),
    httpsProxy: z.string().max(2000).optional(),
    noProxy: z.string().max(4000).optional(),
  })
  .strict()
  .partial();

export const adminConfigPatchSchema = z
  .object({
    search: z
      .object({
        enabled: z.boolean().optional(),
        provider: z.string().min(1).max(40).optional(),
        providerConfig: z
          .object({
            tavilyApiKey: z.string().max(4000).optional(),
          })
          .strict()
          .partial()
          .optional(),
      })
      .strict()
      .partial()
      .optional(),
    network: z
      .object({
        outboundProxy: outboundProxySchema.optional(),
      })
      .strict()
      .partial()
      .optional(),
    features: z
      .object({
        adminConsoleEnabled: z.boolean().optional(),
      })
      .strict()
      .partial()
      .optional(),
    email: z
      .object({
        provider: z.enum(['none', 'smtp']).optional(),
        from: z.string().trim().max(320).optional(),
        smtp: z
          .object({
            host: z.string().trim().max(320).optional(),
            port: z.number().int().min(1).max(65535).optional(),
            secure: z.boolean().optional(),
            user: z.string().trim().max(320).optional(),
            pass: z.string().max(4000).optional(),
          })
          .strict()
          .partial()
          .optional(),
      })
      .strict()
      .partial()
      .optional(),
  })
  .strict();

export const adminSearchTestSchema = z
  .object({
    query: z.string().trim().min(1, 'query 不能为空').max(1000).optional(),
    maxResults: z.number().int().min(1).max(10).optional(),
    tavilyApiKey: z.string().max(4000).optional(),
  })
  .strict();

export const adminAccessSchema = z
  .object({
    accessKey: z.string().max(4000).optional(),
  })
  .strict();

export const adminDeleteUserSchema = z
  .object({
    confirmAccessKey: z.string().trim().min(1, 'confirmAccessKey is required').max(4000),
  })
  .strict();

export const adminEmailTestSchema = z
  .object({
    to: z.string().trim().email('测试邮箱格式无效').max(320),
  })
  .strict();

export const legacyMigrationSchema = z
  .object({
    targetUserId: z.string().trim().min(1, 'targetUserId is required').max(160),
  })
  .strict();
