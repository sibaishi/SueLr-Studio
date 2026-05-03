import type React from 'react';
function panelStyle(): React.CSSProperties {
  return {
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    borderRadius: 24,
    backdropFilter: 'var(--glass-blur)',
    WebkitBackdropFilter: 'var(--glass-blur)',
    boxShadow: 'var(--glass-shadow)',
  };
}

function chipStyle(accent?: string): React.CSSProperties {
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

function eyebrowStyle(): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)',
  };
}

export function MediaWorkbench({
  eyebrow,
  title,
  description,
  icon,
  toolbarTitle,
  toolbarMeta,
  toolbarChips,
  sidebar,
  main,
  insight,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  toolbarTitle: string;
  toolbarMeta?: React.ReactNode;
  toolbarChips?: React.ReactNode;
  sidebar: React.ReactNode;
  main: React.ReactNode;
  insight?: React.ReactNode;
}) {
  return (
    <div className="workflow-page" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minWidth: 0, overflow: 'hidden' }}>
      <div className="workflow-toolbar glass" style={{ marginBottom: 0 }}>
        <div className="workflow-toolbar__frame" style={{ alignItems: 'stretch', flexWrap: 'wrap', rowGap: 12 }}>
          <div className="workflow-toolbar__identity" style={{ minWidth: 220, alignItems: 'flex-start' }}>
            <div className="workflow-toolbar__badge">{icon}</div>
            <div>
              <div style={eyebrowStyle()}>{eyebrow}</div>
              <div className="workflow-toolbar__title" style={{ fontSize: 18 }}>{title}</div>
              <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-secondary)', marginTop: 4 }}>{description}</div>
            </div>
          </div>

          <div className="workflow-toolbar__status" style={{ minWidth: 260, flex: 1, justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{toolbarTitle}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 4 }}>{toolbarMeta}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{toolbarChips}</div>
          </div>
        </div>
      </div>

      <div className="workflow-shell" style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr) 320px', minHeight: 0, flex: 1, overflow: 'hidden' }}>
        <aside style={{ ...panelStyle(), overflow: 'hidden', minWidth: 0 }}>{sidebar}</aside>
        <section style={{ ...panelStyle(), minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>{main}</section>
        {insight && <aside style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, overflow: 'auto' }}>{insight}</aside>}
      </div>
    </div>
  );
}

export { chipStyle, eyebrowStyle, panelStyle };
