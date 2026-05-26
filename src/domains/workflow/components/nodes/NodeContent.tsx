import type { CSSProperties } from 'react';
import type { NodeContentProps } from './nodeContentTypes';
import { resolveNodeContentRenderer } from './registry';

export function NodeContent(props: Omit<NodeContentProps, 'outerStyle'>) {
  const outerStyle: CSSProperties = {
    flex: '1 1 auto',
    minHeight: 0,
    minWidth: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  };
  const Content = resolveNodeContentRenderer(props.type);
  return Content ? <Content {...props} outerStyle={outerStyle} /> : null;
}
