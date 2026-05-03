// ============================================================
// Flow Studio - 视频输入节点执行器
// 返回服务器文件 URL
// ============================================================

export async function execute(node, inputs, apiConfig, sendProgress) {
  const fileUrl = node.data?.fileUrl || '';
  const fileName = node.data?.fileName || '';

  if (!fileUrl) {
    throw new Error('未选择视频文件');
  }

  sendProgress?.('读取视频文件...');
  return { video: fileUrl };
}
