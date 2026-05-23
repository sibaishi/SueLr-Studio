import React, { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useT } from '@/providers/ThemeContext';

interface DropdownOption {
  label: string;
  value: string;
  group?: string;
}

export function CustomDropdown({
  options,
  value,
  onChange,
  placeholder = '请选择',
  style = {},
}: {
  options: DropdownOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const T = useT();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  const label = selected?.label || placeholder;

  const groups: { name?: string; items: DropdownOption[] }[] = [];
  let currentGroup: { name?: string; items: DropdownOption[] } | null = null;

  for (const option of options) {
    if (!currentGroup || currentGroup.name !== option.group) {
      currentGroup = { name: option.group, items: [] };
      groups.push(currentGroup);
    }
    currentGroup.items.push(option);
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', ...style }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 12px',
          borderRadius: 10,
          background: T.menuBg,
          color: T.text,
          fontSize: 13,
          border: `1px solid ${T.border}`,
          cursor: 'pointer',
          minWidth: 0,
          flex: 1,
          outline: 'none',
          transition: 'all 0.15s',
          boxShadow: open ? `0 0 0 2px ${T.blue}40` : 'none',
        }}
      >
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <ChevronDown size={12} color={T.text3} style={{ flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0)' }} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9980 }} />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: 4,
              zIndex: 9981,
              background: T.menuBg,
              borderRadius: 12,
              padding: 4,
              border: `1px solid ${T.border}`,
              boxShadow: `0 8px 24px rgba(15,23,42,0.14), 0 1px 2px rgba(15,23,42,0.08)`,
              maxHeight: 280,
              overflowY: 'auto',
            }}
          >
            {groups.map((group, groupIndex) => (
              <React.Fragment key={groupIndex}>
                {group.name && (
                  <div style={{ padding: '8px 12px 4px', fontSize: 11, color: T.text3, fontWeight: 600, letterSpacing: 0.5 }}>
                    {group.name}
                  </div>
                )}
                {group.items.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: 13,
                      background: option.value === value ? `${T.blue}18` : 'transparent',
                      color: option.value === value ? T.blue : T.text,
                      fontWeight: option.value === value ? 600 : 400,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(event) => {
                      if (option.value !== value) event.currentTarget.style.background = `${T.blue}08`;
                    }}
                    onMouseLeave={(event) => {
                      if (option.value !== value) event.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {option.label}
                  </button>
                ))}
                {groupIndex < groups.length - 1 && <div style={{ height: 1, background: T.border, margin: '4px 8px' }} />}
              </React.Fragment>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
