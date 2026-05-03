// 图片合并执行器 — 将多个图片输入合并为数组
export async function execute(node, inputs, apiConfig, onProgress) {
  onProgress('合并图片...');
  const values = Object.keys(inputs)
    .sort((a, b) => {
      const idxA = parseInt(a.replace('item', ''));
      const idxB = parseInt(b.replace('item', ''));
      return idxA - idxB;
    })
    .map(key => inputs[key])
    .filter(v => v !== undefined && v !== null);

  return { merged: values };
}
