export async function execute(_node, inputs, _apiConfig, sendProgress) {
  const image1 = inputs.image1;
  const image2 = inputs.image2;

  if (!image1) {
    throw new Error('图片对比节点缺少必填输入: image1');
  }
  if (!image2) {
    throw new Error('图片对比节点缺少必填输入: image2');
  }

  sendProgress?.('正在准备图片对比...');
  return {
    image1,
    image2,
  };
}
