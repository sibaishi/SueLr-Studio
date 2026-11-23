/** CSS color references for inline styles and components that take a color prop. */
export const themeColors = {
  bg: 'var(--t-bg)',
  card: 'var(--t-card)',
  card2: 'var(--t-card2)',
  menuBg: 'var(--t-menu-bg)',
  border: 'var(--t-border)',
  text: 'var(--t-text)',
  text2: 'var(--t-text2)',
  text3: 'var(--t-text3)',
  blue: 'var(--t-blue)',
  green: 'var(--t-green)',
  red: 'var(--t-red)',
  orange: 'var(--t-orange)',
  purple: 'var(--t-purple)',
  neutral: 'var(--t-neutral)',
};

export function themeTint(color: string, percent: number) {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}
