const controlSelector =
  'button, input, textarea, select, a[href], video[controls], audio[controls], [tabindex], [contenteditable="true"]';

export function containDialogTab(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'preventDefault'>,
  panel: HTMLElement,
) {
  if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return;
  const controls = Array.from(panel.querySelectorAll<HTMLElement>(controlSelector)).filter(
    (control) =>
      control.tabIndex >= 0 &&
      !control.matches(':disabled') &&
      !control.closest('[inert]') &&
      control.getClientRects().length > 0 &&
      getComputedStyle(control).visibility === 'visible',
  );
  const first = controls[0];
  const last = controls.at(-1);
  const active = document.activeElement;
  const enteredFromOutside = active === panel || !panel.contains(active);
  if (!first || enteredFromOutside || active === (event.shiftKey ? first : last)) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  }
}
