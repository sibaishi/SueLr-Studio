import type { NodeTypeDef } from '@/shared/workflow/types';

export const WORKFLOW_NODE_REGISTRY: NodeTypeDef[];
export function getNodeDef(type: string): NodeTypeDef | undefined;
export function getNodeTypeLabel(type: string): string;
export function getRegisteredNodeTypes(): string[];
export function getRequiredInputs(type: string): string[];
export function getNodeDataDefaults(type: string): Record<string, unknown>;
export function isExecutableNodeType(type: string): boolean;
export function supportsDisabledPassthrough(type: string): boolean;
export function resolveDynamicPortCount(
  dynamicPort: import('@/shared/workflow/types').DynamicPortDef | undefined,
  data?: Record<string, unknown>,
  fallback?: number,
): number;
