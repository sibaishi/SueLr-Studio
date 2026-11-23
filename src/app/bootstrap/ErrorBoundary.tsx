import { ErrorPanel } from '@/ui/FeedbackPrimitives';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorPanel title="页面出现错误" onRetry={() => this.setState({ hasError: false, error: null })}>
          {this.state.error?.message || '未知错误'}
        </ErrorPanel>
      );
    }
    return this.props.children;
  }
}
