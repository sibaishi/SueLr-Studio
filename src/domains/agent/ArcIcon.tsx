export function ArcIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 16.5a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="5" cy="16.5" r="1.65" fill="currentColor" />
      <circle cx="19" cy="16.5" r="1.65" fill="currentColor" />
    </svg>
  );
}
