export function ArrangeNodesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <rect x="3.5" y="8.5" width="6" height="7" rx="1.2" />
      <rect x="15" y="3.5" width="5.5" height="6" rx="1.2" />
      <rect x="15" y="14.5" width="5.5" height="6" rx="1.2" />
      <path d="M9.5 12h2.75V6.5H15m-2.75 5.5v5.5H15" strokeLinejoin="round" />
    </svg>
  );
}

export function ResultsSidebarIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {open && (
        <path d="M15.5 5H19a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 19 19h-3.5Z" fill="currentColor" opacity=".24" />
      )}
      <rect x="3.5" y="5" width="17" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M15.5 5v14" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
