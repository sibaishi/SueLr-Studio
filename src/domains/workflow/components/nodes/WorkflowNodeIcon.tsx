import { Cpu, Cube, SpeakerHigh } from '@phosphor-icons/react';

function IoIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <rect x="7.5" y="5" width="9" height="14" rx="2" />
      <path d="M3.5 12h4m9 0h4" strokeLinecap="round" />
      <path d="m10.5 9.5 2.5 2.5-2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GroupIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <rect x="6.5" y="9" width="3.5" height="6" rx="1" />
      <rect x="14" y="9" width="3.5" height="6" rx="1" />
    </svg>
  );
}

export function WorkflowNodeIcon({ name, size }: { name?: string; size: number }) {
  switch (name) {
    case 'layers':
      return <IoIcon size={size} />;
    case 'merge':
      return <GroupIcon size={size} />;
    case 'bot':
      return <Cpu size={size} aria-hidden="true" />;
    case 'audio':
      return <SpeakerHigh size={size} aria-hidden="true" />;
    default:
      return <Cube size={size} aria-hidden="true" />;
  }
}
