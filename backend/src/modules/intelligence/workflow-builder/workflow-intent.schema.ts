import { z } from 'zod';

export const workflowIntentSchema = z.object({
  id: z.string().trim().min(1),
  sourceText: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200),
  goal: z.string().trim().min(1).max(2000),
  domain: z.enum(['ecommerce-image', 'brand-visual', 'social-image', 'generic-image', 'storyboard-image', 'chat-text', 'plain-text', 'video-generation']),
  promptHelperTool: z.enum(['camera', 'lighting', 'storyboard', 'layout']).optional(),
  inputs: z.array(z.object({ id: z.string(), label: z.string(), kind: z.enum(['image', 'text', 'video', 'audio']) })),
  outputCount: z.number().int().min(1).max(8),
  requiresImageInput: z.boolean(),
  requiresTextInput: z.boolean(),
  requiresVideoInput: z.boolean().default(false),
  requiresAudioInput: z.boolean().default(false),
});

export type WorkflowIntent = z.infer<typeof workflowIntentSchema>;
