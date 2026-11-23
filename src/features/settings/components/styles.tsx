import type { CSSProperties } from 'react';

export type SettingsModuleId = 'overview' | 'connection' | 'models' | 'workspace' | 'diagnostics';

export function fuzzyMatch(text: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  return !normalizedQuery || text.toLowerCase().includes(normalizedQuery);
}

export function panelStyle(): CSSProperties {
  return {
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    borderRadius: 15,
    backdropFilter: 'var(--glass-blur)',
    WebkitBackdropFilter: 'var(--glass-blur)',
    boxShadow: 'var(--glass-shadow)',
  };
}

export function mutedPanelStyle(): CSSProperties {
  return {
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 5,
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
