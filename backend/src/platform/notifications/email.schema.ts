import { z } from 'zod';

export const emailProviderSchema = z.enum(['none', 'smtp']);

export const emailConfigSchema = z
  .object({
    provider: emailProviderSchema.default('none'),
    from: z.string().trim().max(320).optional(),
    smtp: z
      .object({
        host: z.string().trim().max(320).optional(),
        port: z.number().int().min(1).max(65535).default(587),
        secure: z.boolean().default(false),
        user: z.string().trim().max(320).optional(),
        pass: z.string().max(4000).optional(),
      })
      .strict()
      .partial()
      .optional(),
  })
  .strict();

export const testEmailSchema = z
  .object({
    to: z.string().trim().email('测试邮箱格式无效').max(320),
  })
  .strict();

export type EmailConfigInput = z.infer<typeof emailConfigSchema>;
export type TestEmailInput = z.infer<typeof testEmailSchema>;
