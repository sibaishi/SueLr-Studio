import { Component, type ReactNode, type ErrorInfo } from 'react';
import { DARK, LIGHT } from '../lib/constants';

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

  getTheme() {
    const theme = document.documentElement.getAttribute('data-theme');
    return theme === 'light' ? LIGHT : DARK;
  }

  render() {
    if (this.state.hasError) {
      const T = this.getTheme();
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100%', padding: 32, background: T.bg, color: T.text,
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💥</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: T.red }}>页面出现错误</div>
          <div style={{ fontSize: 13, color: T.text2, marginBottom: 20, textAlign: 'center', maxWidth: 400, lineHeight: 1.5 }}>
            {this.state.error?.message || '未知错误'}
          </div>
          <button onClick={() => this.setState({ hasError: false, error: null })} style={{
            padding: '10px 24px', borderRadius: 10, border: 'none', background: T.blue,
            color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>重试</button>
        </div>
      );
    }
    return this.props.children;
  }
}
