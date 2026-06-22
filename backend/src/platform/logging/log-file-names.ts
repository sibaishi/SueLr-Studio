export function sanitizeLogFilePart(value: unknown, fallback: string): string {
  return String(value || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

export function logDatePart(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function logTimePart(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}
