import { login } from '@/shared/api/auth';
import type { RuntimeCapabilities } from '@/shared/runtime';
import { LoaderCircle, LogIn } from 'lucide-react';
import { type FormEvent, useState } from 'react';

type LoginGateProps = {
  runtime: RuntimeCapabilities;
  onAuthenticated: () => Promise<unknown> | unknown;
};

export function LoginGate({ runtime, onAuthenticated }: LoginGateProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      await login(username, password);
      await onAuthenticated();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '登录失败，请检查用户名和密码');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="auth-login-gate"
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#0f141b',
        color: '#f7fafc',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: 'min(420px, calc(100vw - 32px))',
          display: 'grid',
          gap: 16,
          padding: 24,
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.06)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.32)',
        }}
      >
        <div style={{ display: 'grid', gap: 6 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: 0 }}>SueLr Studio</h1>
          <p style={{ margin: 0, color: 'rgba(247,250,252,0.68)', fontSize: 13 }}>
            {runtime.mode === 'server-multi-user' ? '服务器多用户模式' : '登录'}
          </p>
        </div>

        <label style={{ display: 'grid', gap: 8, fontSize: 13, color: 'rgba(247,250,252,0.78)' }}>
          用户名
          <input
            data-testid="auth-login-username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            style={{
              height: 40,
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(0,0,0,0.24)',
              color: '#f7fafc',
              padding: '0 12px',
              outline: 'none',
            }}
          />
        </label>

        <label style={{ display: 'grid', gap: 8, fontSize: 13, color: 'rgba(247,250,252,0.78)' }}>
          密码
          <input
            data-testid="auth-login-password"
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={{
              height: 40,
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(0,0,0,0.24)',
              color: '#f7fafc',
              padding: '0 12px',
              outline: 'none',
            }}
          />
        </label>

        {error && (
          <div data-testid="auth-login-error" style={{ color: '#ffb4a8', fontSize: 13 }}>
            {error}
          </div>
        )}

        <button
          data-testid="auth-login-submit"
          type="submit"
          disabled={submitting}
          style={{
            height: 42,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            border: 0,
            borderRadius: 6,
            background: submitting ? 'rgba(255,255,255,0.2)' : '#f7fafc',
            color: '#111827',
            fontWeight: 700,
            cursor: submitting ? 'default' : 'pointer',
          }}
        >
          {submitting ? <LoaderCircle size={16} aria-hidden="true" /> : <LogIn size={16} aria-hidden="true" />}
          登录
        </button>
      </form>
    </div>
  );
}
