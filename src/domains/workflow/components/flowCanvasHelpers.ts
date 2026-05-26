import { getNodeDef, getNodeDefaultSize } from '@/domains/workflow/lib/constants';

export function buildDefaultData(nodeType: string) {
  const def = getNodeDef(nodeType);
  if (!def) return {};

  const defaultData: Record<string, unknown> = {};
  for (const param of def.params) {
    if (param.default !== undefined) {
      defaultData[param.id] = param.default;
    }
  }
  if (def.maxInputs) {
    defaultData.inputCount = 1;
  }
  return defaultData;
}

export function getDefaultNodeSize(nodeType: string) {
  return getNodeDefaultSize(nodeType);
}

export function getCenteredPosition(nodeType: string, flowPosition: { x: number; y: number }) {
  const size = getDefaultNodeSize(nodeType);
  return {
    x: flowPosition.x - size.w / 2,
    y: flowPosition.y - size.h / 2,
  };
}

export function getDroppedFileNodeType(file: File) {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  if (mime.startsWith('image/')) return 'imageInput';
  if (mime.startsWith('video/')) return 'videoInput';
  if (mime.startsWith('audio/')) return 'audioInput';
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    /\.(txt|md|markdown|json|csv|tsv|log|xml|html|css|js|ts|tsx|jsx|py|java|c|cpp|h|hpp|cs|go|rs|php|rb|sh|bat|ps1|yaml|yml)$/i.test(
      name,
    )
  ) {
    return 'textInput';
  }

  return null;
}
