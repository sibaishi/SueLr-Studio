import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReactFlowProvider } from '@xyflow/react';
import {
  WorkflowCardPresentation,
  WorkflowCardToolbar,
} from '@/domains/workflow/components/nodes/WorkflowCardPresentation';
import {
  WorkflowGroupSurface,
  WorkflowGroupHeader,
  WorkflowNodeFrame,
} from '@/domains/workflow/components/nodes/WorkflowGroupPresentation';
import { describe, expect, it } from 'vitest';
import { WorkflowNodeStatus, WorkflowNodeSurface } from '@/domains/workflow/components/nodes/WorkflowNodePrimitives';

describe('shared workflow node presentation', () => {
  it('keeps a previous execution result visible when a node is disabled or locked', () => {
    const markup = renderToStaticMarkup(
      createElement(WorkflowNodeSurface, {
        color: '#007aff',
        status: 'error',
        disabled: true,
        locked: true,
        selected: true,
        children: createElement(WorkflowNodeStatus, {
          status: 'error',
          disabled: true,
          duration: '0.0s',
          error: '模型未配置',
        }),
      }),
    );
    expect(markup).toContain('data-status="error"');
    expect(markup).toContain('data-disabled="true"');
    expect(markup).toContain('data-locked="true"');
    expect(markup).toContain('data-selected="true"');
    expect(markup).toContain('已禁用');
    expect(markup).toContain('出错 0.0s');
    expect(markup).toContain('title="出错：模型未配置"');
  });

  it('shows execution errors instead of a stale warning', () => {
    const markup = renderToStaticMarkup(
      createElement(WorkflowNodeStatus, {
        status: 'error',
        warning: '之前的警告',
        error: '请求失败',
        duration: '1.2s',
      }),
    );
    expect(markup).toContain('请求失败');
    expect(markup).not.toContain('之前的警告');
  });

  it('keeps warning text readable and safely escapes content', () => {
    const markup = renderToStaticMarkup(
      createElement(WorkflowNodeStatus, {
        status: 'idle',
        warning: '请检查 <模型> & 参数',
      }),
    );
    expect(markup).toContain('请检查 &lt;模型&gt; &amp; 参数');
    expect(markup).not.toContain('data-state="idle"');
  });

  it('does not add an execution badge before a node has run', () => {
    expect(renderToStaticMarkup(createElement(WorkflowNodeStatus, { status: 'idle' }))).toBe('');
  });
});

describe('current registered node structures', () => {
  const noop = () => {};
  it('keeps card actions and execution status outside the content frame, without a generic internal header', () => {
    const markup = renderToStaticMarkup(
      createElement(ReactFlowProvider, {
        children: createElement(WorkflowCardPresentation, {
          color: '#0A84FF',
          status: 'error',
          duration: '1.2s',
          error: '演示错误',
          toolbar: createElement(WorkflowCardToolbar, {
            onToggleDisabled: noop,
            onToggleLocked: noop,
            onDuplicate: noop,
            onExecute: noop,
            children: 'AI',
          }),
          children: '内容区',
        }),
      }),
    );
    expect(markup).toContain('node-v2-appendix-bar');
    expect(markup).toContain('执行到此节点');
    expect(markup).not.toContain('workflow-node-header');
    const content = markup.indexOf('flow-node-v2__frame');
    expect(markup.indexOf('node-v2-appendix-bar')).toBeLessThan(content);
    expect(markup.indexOf('workflow-node-status')).toBeLessThan(content);
  });

  it.each([false, true])('uses the current group header and exposes collapsed=%s accessibly', (collapsed) => {
    const markup = renderToStaticMarkup(
      createElement(WorkflowGroupSurface, {
        color: '#8E8E93',
        collapsed,
        locked: true,
        children: createElement(WorkflowNodeFrame, {
          children: createElement(WorkflowGroupHeader, {
            title: '节点组',
            icon: 'merge',
            collapsed,
            locked: true,
            directlyLocked: true,
            onToggleLocked: noop,
            onToggleCollapsed: noop,
          }),
        }),
      }),
    );
    expect(markup).toContain('data-variant="group"');
    expect(markup).toContain(`aria-expanded="${!collapsed}"`);
    expect(markup).toContain(collapsed ? '展开节点组' : '折叠节点组');
    expect(markup).toContain('解锁节点');
    expect(markup).not.toContain('workflow-node-status');
  });
});
