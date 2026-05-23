import { useState } from 'react';
import { useT } from '@/providers/ThemeContext';
import type { AgentRole } from '@/shared/types';
import { RoleIcon } from './RoleIcon';

export function RoleSelector({
  roles,
  activeRoleId,
  onSelect,
}: {
  roles: AgentRole[];
  activeRoleId: string;
  onSelect: (id: string) => void;
}) {
  const T = useT();
  const [open, setOpen] = useState(false);
  const activeRole = roles.find((role) => role.id === activeRoleId);

  return (
    <div style={{ position: 'relative', zIndex: 100 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: 34,
          height: 34,
          borderRadius: 12,
          background: T.menuBg,
          border: `1px solid ${T.border}`,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: T.blue,
          transition: 'all 0.15s',
          boxShadow: open ? `0 0 0 2px ${T.blue}40` : 'none',
        }}
      >
        <RoleIcon icon={activeRole?.icon || 'bot'} size={16} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9980 }} />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              zIndex: 9981,
              background: T.menuBg,
              borderRadius: 12,
              padding: 4,
              border: `1px solid ${T.border}`,
              boxShadow: '0 8px 24px rgba(15,23,42,0.14), 0 1px 2px rgba(15,23,42,0.08)',
              minWidth: 160,
            }}
          >
            {roles.map((role) => (
              <button
                key={role.id}
                onClick={() => {
                  onSelect(role.id);
                  setOpen(false);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  background: role.id === activeRoleId ? `${T.blue}18` : 'transparent',
                  color: role.id === activeRoleId ? T.blue : T.text,
                  fontSize: 13,
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontWeight: role.id === activeRoleId ? 600 : 400,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(event) => {
                  if (role.id !== activeRoleId) event.currentTarget.style.background = `${T.blue}08`;
                }}
                onMouseLeave={(event) => {
                  if (role.id !== activeRoleId) event.currentTarget.style.background = 'transparent';
                }}
              >
                <RoleIcon icon={role.icon} size={14} />
                {role.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
