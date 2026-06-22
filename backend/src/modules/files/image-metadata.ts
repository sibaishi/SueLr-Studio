import sharp from 'sharp';

export async function readImageDimensions(filePath: string) {
  try {
    const metadata = await sharp(filePath, { failOn: 'none' }).metadata();
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);
    if (!width || !height) return null;
    return { width, height };
  } catch {
    return null;
  }
}
