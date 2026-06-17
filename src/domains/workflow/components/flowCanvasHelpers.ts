import { getNodeDef, getNodeDefaultSize } from '@/domains/workflow/lib/constants';

/** 从 Blob 生成缩略图（128px JPEG），用于上传前的即时预览 */
export function createThumbnailFromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 128;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('load'));
    };
    img.src = url;
  });
}

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

  if (
    mime.startsWith('image/') ||
    mime.startsWith('video/') ||
    mime.startsWith('audio/') ||
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    /\.(txt|md|markdown|json|csv|tsv|log|xml|html|css|js|ts|tsx|jsx|py|java|c|cpp|h|hpp|cs|go|rs|php|rb|sh|bat|ps1|yaml|yml|png|jpg|jpeg|gif|webp|avif|bmp|svg|mp4|webm|mov|mkv|mp3|wav|ogg|aac|flac)$/i.test(name)
  ) {
    return 'io';
  }

  return null;
}
