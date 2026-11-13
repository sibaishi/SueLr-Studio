import { FolderOpen, HardDrive } from '@phosphor-icons/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LibraryAsset } from '../lib/api/assets';
import AssetLibraryModal from './AssetLibraryModal';
import './file-source.css';

export default function FileSourceButton({
  children,
  label = '添加文件',
  className,
  disabled,
  onLocal,
  onAsset,
  assetType,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
  disabled?: boolean;
  onLocal: () => void;
  onAsset: (asset: LibraryAsset) => Promise<void>;
  assetType?: LibraryAsset['type'];
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; above: boolean }>();
  const [library, setLibrary] = useState(false);

  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector('button')?.focus();
    const close = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menu.current?.contains(event.target) &&
        !trigger.current?.contains(event.target)
      ) {
        setPosition(undefined);
      }
    };
    const resize = () => setPosition(undefined);
    document.addEventListener('pointerdown', close);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('resize', resize);
    };
  }, [position]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={className}
        disabled={disabled}
        aria-label={label}
        title={label}
        aria-expanded={Boolean(position)}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          if (position) return setPosition(undefined);
          const rect = event.currentTarget.getBoundingClientRect();
          const above = rect.bottom + 100 > window.innerHeight;
          setPosition({
            left: Math.max(8, Math.min(rect.left, window.innerWidth - 188)),
            top: above ? rect.top - 6 : rect.bottom + 6,
            above,
          });
        }}
      >
        {children}
      </button>
      {position &&
        createPortal(
          <div
            ref={menu}
            role="group"
            aria-label="文件来源"
            className="workflow-file-source glass"
            style={{
              left: position.left,
              top: position.top,
              transform: position.above ? 'translateY(-100%)' : undefined,
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Escape') {
                setPosition(undefined);
                trigger.current?.focus();
              }
            }}
          >
            <button
              type="button"
              onClick={() => {
                setPosition(undefined);
                setLibrary(true);
              }}
            >
              <FolderOpen size={16} /> 从资产库添加文件
            </button>
            <button
              type="button"
              onClick={() => {
                setPosition(undefined);
                trigger.current?.focus();
                onLocal();
              }}
            >
              <HardDrive size={16} /> 从本地添加文件
            </button>
          </div>,
          document.body,
        )}
      {library &&
        createPortal(
          <div
            className="workflow-file-picker-boundary"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <AssetLibraryModal
              position={{ x: 0, y: 0 }}
              pickType={assetType}
              onPick={onAsset}
              onClose={() => {
                setLibrary(false);
                requestAnimationFrame(() => trigger.current?.focus());
              }}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
