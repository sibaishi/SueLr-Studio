import path from 'node:path';
import { isServerRuntimeMode } from '../../platform/runtime/mode.ts';
import { saveContentByType } from '../helpers/saveHelper.ts';
import type { DynamicValue, NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.ts';

export async function execute(
  node: WorkflowNode,
  inputs: NodeInputs,
  apiConfig: RuntimeApiConfig,
  sendProgress: ProgressCallback,
) {
  const content = inputs.content;
  if (content === undefined || content === null || content === '') {
    throw new Error('保存节点缺少输入内容');
  }

  const outputPath = String(node.data?.outputPath || '').trim();
  if (!outputPath) {
    sendProgress?.('未设置保存路径，跳过文件保存...');
    return {
      content,
      savedFiles: [],
      savedPaths: [],
    };
  }

  sendProgress?.('正在保存输入内容...');
  const savedFiles = await saveContentByType(content, {
    outputPath,
    prefix: node.data?.filenamePrefix || 'saved',
    scope: apiConfig.scope,
  });
  const exposeHostPaths = !isServerRuntimeMode();

  return {
    content,
    savedFiles: savedFiles.map((file) => ({
      type: file.type,
      name: path.basename(file.path),
      url: '',
    })),
    ...(exposeHostPaths ? { savedPaths: savedFiles.map((file) => file.path) } : {}),
  };
}
