export interface MaterialProcessNodeLike {
  id?: string;
  type?: string;
  data?: Record<string, unknown>;
}

export interface MaterialProcessEdgeLike {
  source?: string;
  target?: string;
}

export const MATERIAL_PROCESS_NODE_TYPE: 'materialProcess';

export function isIteratingMaterialProcessNode(node?: MaterialProcessNodeLike): boolean;

export function findNestedMaterialProcessPath(
  nodes: MaterialProcessNodeLike[],
  edges: MaterialProcessEdgeLike[],
): { sourceId: string; targetId: string } | null;

export function wouldCreateNestedMaterialProcessPath(
  nodes: MaterialProcessNodeLike[],
  edges: MaterialProcessEdgeLike[],
  edge: MaterialProcessEdgeLike,
): boolean;
