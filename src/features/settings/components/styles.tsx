import type { CSSProperties, ReactNode } from 'react';

export type SettingsModuleId = 'overview' | 'connection' | 'models' | 'agent' | 'workspace' | 'diagnostics';

export function fuzzyMatch(text: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  return !normalizedQuery || text.toLowerCase().includes(normalizedQuery);
}

export function panelStyle(): CSSProperties {
  return {
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    borderRadius: 24,
    backdropFilter: 'var(--glass-blur)',
    WebkitBackdropFilter: 'var(--glass-blur)',
    boxShadow: 'var(--glass-shadow)',
  };
}

export function mutedPanelStyle(): CSSProperties {
  return {
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 18,
  };
}

export function chipStyle(accent?: string): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 10px',
    borderRadius: 999,
    border: '1px solid var(--color-border)',
    background: accent ? `${accent}18` : 'var(--color-bg-secondary)',
    color: accent || 'var(--color-text-secondary)',
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  };
}

export function sectionTitleStyle(): CSSProperties {
  return {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    margin: 0,
  };
}

export function eyebrowStyle(): CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)',
  };
}

export function SectionCard({
  title,
  description,
  children,
  action,
}: { title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section style={{ ...mutedPanelStyle(), padding: 18 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>{title}</h3>
          {description && (
            <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)', margin: '6px 0 0' }}>
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyStateCard({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: string;
}) {
  return (
    <div style={{ ...mutedPanelStyle(), padding: 18, textAlign: 'center' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>{title}</div>
      <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>{body}</div>
      {action && (
        <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-tertiary)' }}>{action}</div>
      )}
    </div>
  );
}
