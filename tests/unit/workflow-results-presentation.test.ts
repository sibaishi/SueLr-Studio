import { describe, expect, it } from 'vitest';
import { buildReadableLogs } from '@/domains/workflow/components/ResultsPresentation';
import type { ExecutionLogEntry } from '@/domains/workflow/lib/store/types';

describe('结果记录归并', () => {
  it('折叠节点进度时保留错误正文、诊断和完整时间范围', () => {
    const logs: ExecutionLogEntry[] = [
      { id: 'start', timestamp: 1, level: 'info', message: '开始执行' },
      { id: 'node-start', timestamp: 2, level: 'info', message: '正在请求', nodeId: 'ai' },
      { id: 'failure', timestamp: 3, level: 'error', message: '模型请求失败', nodeId: 'ai', details: '超时诊断' },
      { id: 'cleanup', timestamp: 4, level: 'info', message: '清理结束', nodeId: 'ai' },
      { id: 'end', timestamp: 5, level: 'error', message: '执行失败' },
    ];
    const snapshot = structuredClone(logs);
    const readable = buildReadableLogs(logs);
    expect(readable.map((entry) => entry.message)).toEqual(['开始执行', '模型请求失败', '执行失败']);
    expect(readable[1]).toMatchObject({ count: 3, compactedCount: 2, startedAt: 2, endedAt: 4 });
    expect(readable[1].detailSource?.details).toBe('超时诊断');
    expect(logs).toEqual(snapshot);
  });

  it('按节点隔离进度，保留流程边界及独立错误', () => {
    const readable = buildReadableLogs([
      { id: 'start', timestamp: 1, level: 'info', message: '开始执行' },
      { id: 'a', timestamp: 2, level: 'success', message: '图片已生成', nodeId: 'image' },
      { id: 'heartbeat', timestamp: 3, level: 'info', message: '处理中' },
      { id: 'b', timestamp: 4, level: 'error', message: '输出失败', nodeId: 'output' },
      { id: 'global-error', timestamp: 5, level: 'error', message: '连接中断' },
      { id: 'end', timestamp: 6, level: 'info', message: '执行结束' },
    ]);
    expect(readable.map((entry) => entry.message)).toEqual([
      '开始执行',
      '图片已生成',
      '输出失败',
      '连接中断',
      '执行结束',
    ]);
  });
});
