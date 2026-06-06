/**
 * Minimal className merge utility.
 * Concatenates truthy class values with a space.
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
