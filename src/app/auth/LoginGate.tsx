import { login, register } from '@/shared/api/auth';
import type { RuntimeCapabilities } from '@/shared/runtime';
import { LoaderCircle, LogIn, UserPlus } from 'lucide-react';
import { type FormEvent, useState } from 'react';

type LoginGateProps = {
  runtime: RuntimeCapabilities;
  onAuthenticated: () => Promise<unknown> | unknown;
};

type AuthMode = 'login' | 'register';

const ERROR_MESSAGES: Record<string, string> = {
  AUTH_USER_PENDING: '账号正在等待管理员审核，通过后即可登录。',
  AUTH_USER_REJECTED: '账号申请已被拒绝，请联系管理员。',
  AUTH_USER_DISABLED: '账号已被停用，请联系管理员。',
  AUTH_INVALID_CREDENTIALS: '用户名或密码无效。',
  AUTH_USERNAME_TAKEN: '用户名已被占用。',
  AUTH_EMAIL_TAKEN: '邮箱已被占用。',
  VALIDATION_ERROR: '请检查输入内容。',
};

function getErrorMessage(error: unknown): string {
  const apiError = error as { code?: string; message?: string };
  if (apiError?.code && ERROR_MESSAGES[apiError.code]) return ERROR_MESSAGES[apiError.code];
  return error instanceof Error ? error.message : '请求失败，请稍后重试。';
}

export function LoginGate({ runtime, onAuthenticated }: LoginGateProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setMessage('');
    setSubmitting(true);
    try {
      if (mode === 'register') {
        await register(username, password, email);
        setMessage('注册申请已提交，请等待管理员审核。');
        setMode('login');
        setPassword('');
        return;
      }

      await login(username, password);
      await onAuthenticated();
    } catch (nextError) {
      setMessage(getErrorMessage(nextError));
    } finally {
      setSubmitting(false);
    }
  };

  const isRegister = mode === 'register';

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
          width: 'min(440px, calc(100vw - 32px))',
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

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
            padding: 4,
            borderRadius: 8,
            background: 'rgba(0,0,0,0.22)',
          }}
        >
          <button
            type="button"
            data-testid="auth-login-mode"
            onClick={() => {
              setMode('login');
              setMessage('');
            }}
            style={{
              height: 34,
              border: 0,
              borderRadius: 6,
              background: mode === 'login' ? '#f7fafc' : 'transparent',
              color: mode === 'login' ? '#111827' : 'rgba(247,250,252,0.72)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            登录
          </button>
          <button
            type="button"
            data-testid="auth-register-mode"
            onClick={() => {
              setMode('register');
              setMessage('');
            }}
            style={{
              height: 34,
              border: 0,
              borderRadius: 6,
              background: mode === 'register' ? '#f7fafc' : 'transparent',
              color: mode === 'register' ? '#111827' : 'rgba(247,250,252,0.72)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            注册申请
          </button>
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

        {isRegister ? (
          <label style={{ display: 'grid', gap: 8, fontSize: 13, color: 'rgba(247,250,252,0.78)' }}>
            邮箱（可选）
            <input
              data-testid="auth-register-email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
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
        ) : null}

        <label style={{ display: 'grid', gap: 8, fontSize: 13, color: 'rgba(247,250,252,0.78)' }}>
          密码
          <input
            data-testid="auth-login-password"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
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

        {message && (
          <div data-testid="auth-login-error" style={{ color: '#ffcf9f', fontSize: 13 }}>
            {message}
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
          {submitting ? (
            <LoaderCircle size={16} aria-hidden="true" />
          ) : isRegister ? (
            <UserPlus size={16} aria-hidden="true" />
          ) : (
            <LogIn size={16} aria-hidden="true" />
          )}
          {isRegister ? '提交注册申请' : '登录'}
        </button>
      </form>
    </div>
  );
}
