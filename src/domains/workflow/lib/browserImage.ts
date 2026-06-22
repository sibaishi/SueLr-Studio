export function loadWorkflowImage(src: string, options: { crossOrigin?: 'anonymous'; errorMessage?: string } = {}) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (options.crossOrigin) image.crossOrigin = options.crossOrigin;
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(options.errorMessage || '图片加载失败'));
    image.src = src;
  });
}

export async function readWorkflowImageDimensions(src: string) {
  const image = await loadWorkflowImage(src, { errorMessage: '无法读取图片尺寸' });
  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
}
