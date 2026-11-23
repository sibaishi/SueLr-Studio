import { StatusNotice } from '@/ui/FeedbackPrimitives';

export type ConnectionTestState = 'idle' | 'testing' | 'success' | 'error';

export function ConnectionTestStatus({ status, result }: { status: ConnectionTestState; result: string }) {
  if (status === 'idle') return null;
  return (
    <StatusNotice
      tone={status === 'testing' ? 'info' : status}
      className="ui-status-notice--compact"
      role={status === 'error' ? 'alert' : 'status'}
    >
      {status === 'testing' ? '检测中…' : result}
    </StatusNotice>
  );
}
