import type { Tab, ThemeMode } from '@/lib/types';
import { NAV_ITEMS, THEME_LABELS, THEME_ICONS } from '@/lib/constants';
import { useT } from '@/contexts/ThemeContext';
import { Icon } from '@/lib/icons';

const glass = (T: any) => ({
  background: T.card,
  backdropFilter: 'blur(40px) saturate(180%)',
  WebkitBackdropFilter: 'blur(40px) saturate(180%)',
});

export function DesktopSidebar({ tab, setTab, modelCount, themeMode, setThemeMode, collapsed, onToggleCollapse }: { tab: Tab; setTab: (t: Tab) => void; modelCount: number; themeMode: ThemeMode; setThemeMode: (t: ThemeMode) => void; collapsed: boolean; onToggleCollapse: () => void }) {
  const T = useT();
  const cycleTheme = () => { const modes: ThemeMode[] = ['dark', 'light', 'system']; setThemeMode(modes[(modes.indexOf(themeMode) + 1) % 3]); };
  const statusCopy = modelCount > 0 ? `${modelCount} 模型已接入` : '未连接模型';
  const logoSize = collapsed ? 28 : 52;
  const logoRadius = collapsed ? 10 : 18;
  const logoIconSize = collapsed ? 14 : 22;
  const navButtonHeight = collapsed ? 32 : 68;
  const navButtonRadius = collapsed ? 12 : 18;
  const navBadgeSize = collapsed ? 24 : 34;
  const navBadgeRadius = collapsed ? 8 : 12;
  const navIconSize = collapsed ? 14 : 18;
  const themeButtonSize = collapsed ? 30 : 42;
  const themeButtonRadius = collapsed ? 10 : 14;
  const themeIconSize = collapsed ? 14 : 17;

  return (
    <div style={{
      width: collapsed ? 42 : 108,
      ...glass(T),
      borderRight: `1px solid var(--glass-border)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: collapsed ? '14px 4px 12px' : '14px 10px 12px',
      gap: 10, flexShrink: 0,
      boxShadow: 'var(--glass-shadow)',
      transition: 'width 0.24s ease, padding 0.24s ease',
    }}>
      <button
        type="button"
        onClick={onToggleCollapse}
        title={collapsed ? '展开侧栏' : '收起侧栏'}
        style={{
          width: '100%',
          padding: 0,
          border: 0,
          background: 'transparent',
          cursor: 'pointer',
          display: 'block',
        }}
      >
        <div style={{
          width: '100%',
          borderRadius: collapsed ? 18 : 22,
          padding: collapsed ? '8px 0' : '14px 10px 12px',
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          transition: 'border-radius 0.24s ease, padding 0.24s ease',
        }}>
          <div style={{
            width: logoSize, height: logoSize, borderRadius: logoRadius,
            background: 'linear-gradient(135deg, rgba(94, 234, 212, 0.95), rgba(59, 130, 246, 0.92) 52%, rgba(139, 92, 246, 0.92))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(255,255,255,0.22)',
            boxShadow: collapsed ? '0 10px 18px rgba(37, 99, 235, 0.18)' : '0 18px 34px rgba(37, 99, 235, 0.22)',
            transition: 'width 0.24s ease, height 0.24s ease, border-radius 0.24s ease, box-shadow 0.24s ease',
          }}><Icon name="bot" size={logoIconSize} style={{ color: '#fff' }} /></div>

          {!collapsed && <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.text3 }}>
              Studio
            </div>
            <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: T.text }}>
              Workbench
            </div>
          </div>}
        </div>
      </button>

      <div style={{
        width: '100%',
        borderRadius: collapsed ? 18 : 22,
        padding: collapsed ? 4 : 8,
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
        display: 'flex', flexDirection: 'column', gap: 8,
        transition: 'border-radius 0.24s ease, padding 0.24s ease',
      }}>
        {NAV_ITEMS.map(it => {
          const active = tab === it.key;
          return (
            <button key={it.key} onClick={() => setTab(it.key)} title={it.label} data-testid={`nav-tab-${it.key}`} style={{
              width: '100%', minHeight: navButtonHeight, borderRadius: navButtonRadius, border: '1px solid transparent', cursor: 'pointer',
              background: active && !collapsed ? 'var(--glass-bg)' : 'transparent',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: collapsed ? 0 : 5, transition: 'all 0.25s ease',
              boxShadow: active && !collapsed ? 'var(--glass-shadow)' : 'none',
              borderColor: active && !collapsed ? 'var(--color-border)' : 'transparent',
            }}>
              <span style={{
                width: navBadgeSize,
                height: navBadgeSize,
                borderRadius: navBadgeRadius,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: active ? `${T[it.colorKey]}16` : 'var(--color-bg-tertiary)',
                border: `1px solid ${active ? `${T[it.colorKey]}26` : 'transparent'}`,
                transition: 'width 0.24s ease, height 0.24s ease, border-radius 0.24s ease',
              }}>
                <Icon name={it.icon} size={navIconSize} style={{ color: active ? T[it.colorKey] : T.text2 }} />
              </span>
              {!collapsed && <span style={{
                fontSize: 10, fontWeight: active ? 700 : 600,
                color: active ? T.text : T.text2, transition: 'color 0.2s',
                letterSpacing: '0.02em',
              }}>{it.label}</span>}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{
        width: '100%',
        padding: collapsed ? '6px 4px' : '10px 8px 8px', borderRadius: collapsed ? 18 : 20,
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        transition: 'border-radius 0.24s ease, padding 0.24s ease',
      }}>
        <button onClick={cycleTheme} title={THEME_LABELS[themeMode]} style={{
          width: themeButtonSize, height: themeButtonSize, borderRadius: themeButtonRadius, border: `1px solid ${T.border}`,
          background: collapsed ? 'transparent' : 'var(--color-bg-tertiary)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s',
          ...(collapsed ? { borderColor: 'transparent', boxShadow: 'none' } : {}),
        }}><Icon name={THEME_ICONS[themeMode]} size={themeIconSize} style={{ color: T.text2 }} /></button>

        {!collapsed && <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.text3 }}>
            Status
          </div>
          <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.45, color: T.text2 }}>
            {statusCopy}
          </div>
        </div>}
      </div>
    </div>
  );
}
