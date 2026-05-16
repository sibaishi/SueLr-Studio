// ============================================================
// Flow Studio - 图片输入节点执行器
// 返回服务器文件 URL（节点之间传递轻量 URL）
// ============================================================

import sharp from 'sharp';
import { urlToLocalPath } from '../helpers/fileHelper.js';

async function hasMaskPaint(maskUrl) {
  if (!maskUrl) return false;
  const localPath = urlToLocalPath(maskUrl);
  if (!localPath) return true;

  const { data } = await sharp(localPath, { failOn: 'none' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    if (data[index] > 8 || data[index + 1] > 8 || data[index + 2] > 8) return true;
  }
  return false;
}

export async function execute(node, inputs, apiConfig, sendProgress) {
  const fileUrl = node.data?.fileUrl || '';
  const maskFileUrl = node.data?.maskFileUrl || '';
  const maskPreviewUrl = node.data?.maskPreviewUrl || '';

  if (!fileUrl) {
    throw new Error('未选择图片文件');
  }

  sendProgress?.('读取图片文件...');
  const mask = maskFileUrl || maskPreviewUrl || '';
  return {
    image: fileUrl,
    mask: await hasMaskPaint(mask) ? mask : undefined,
  };
}
