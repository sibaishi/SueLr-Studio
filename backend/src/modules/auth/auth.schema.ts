import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(1, '用户名不能为空').max(120, '用户名不能超过 120 个字符'),
  password: z.string().min(1, '密码不能为空').max(500, '密码不能超过 500 个字符'),
});

export type LoginInput = z.infer<typeof loginSchema>;
