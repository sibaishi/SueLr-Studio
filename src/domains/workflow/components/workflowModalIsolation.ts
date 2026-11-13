import { type KeyboardEvent, type RefObject, useLayoutEffect } from 'react';

const inertCounts = new Map<HTMLElement, number>();

export function isWorkflowModalOpen() {
  return document.querySelector('[data-workflow-modal-overlay]') !== null;
}

export function useWorkflowModalIsolation(
  dialogRef: RefObject<HTMLElement | null>,
  initialFocus?: () => HTMLElement | null | undefined,
) {
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.activeElement;
    const overlay = dialog.closest('[data-workflow-modal-overlay]');
    // Each portal is a sibling of the app root and any underlying modal.
    if (!overlay || overlay.parentElement !== document.body) return;
    const changed = Array.from(document.body.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        element !== overlay &&
        (!element.inert || inertCounts.has(element)) &&
        !['SCRIPT', 'STYLE', 'LINK'].includes(element.tagName),
    );
    for (const element of changed) {
      inertCounts.set(element, (inertCounts.get(element) ?? 0) + 1);
      element.inert = true;
    }
    (initialFocus?.() ?? dialog).focus({ preventScroll: true });
    return () => {
      for (const element of changed) {
        const count = inertCounts.get(element) ?? 0;
        if (count > 1) inertCounts.set(element, count - 1);
        else {
          inertCounts.delete(element);
          element.inert = false;
        }
      }
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
    // The initial focus target is chosen only when this dialog opens.
    // biome-ignore lint/correctness/useExhaustiveDependencies: focus follows the dialog lifetime
  }, [dialogRef]);
}

export function isolateWorkflowModalKey(event: KeyboardEvent<HTMLElement>) {
  event.stopPropagation();
  if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return;
  const dialog = event.currentTarget;
  const controls = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button, input, textarea, select, a[href], [tabindex], [contenteditable="true"]',
    ),
  ).filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
  const first = controls[0];
  const last = controls.at(-1);
  if (
    !first ||
    (event.shiftKey && (event.target === first || event.target === dialog)) ||
    (!event.shiftKey && (event.target === last || event.target === dialog))
  ) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  }
}

export function stopWorkflowModalEvent(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

export const workflowModalPointerBoundary = {
  onMouseMove: stopWorkflowModalEvent,
  onPointerMove: stopWorkflowModalEvent,
  onPointerDown: stopWorkflowModalEvent,
  onPointerUp: stopWorkflowModalEvent,
  onDoubleClick: stopWorkflowModalEvent,
  onContextMenu: stopWorkflowModalEvent,
  onDragOver: stopWorkflowModalEvent,
  onDrop: stopWorkflowModalEvent,
  onWheel: stopWorkflowModalEvent,
};
