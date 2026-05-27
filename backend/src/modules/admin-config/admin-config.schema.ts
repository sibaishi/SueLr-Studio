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
