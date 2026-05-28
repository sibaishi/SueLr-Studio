import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(1, '用户名不能为空').max(120, '用户名不能超过 120 个字符'),
  password: z.string().min(1, '密码不能为空').max(500, '密码不能超过 500 个字符'),
});

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, '用户名至少需要 3 个字符')
    .max(120, '用户名不能超过 120 个字符')
    .regex(/^[A-Za-z0-9_-]+$/, '用户名只能包含字母、数字、下划线和短横线'),
  password: z.string().min(8, '密码至少需要 8 个字符').max(500, '密码不能超过 500 个字符'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('邮箱格式无效')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
