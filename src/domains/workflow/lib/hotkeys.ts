export type WorkflowShortcutAction = 'undo' | 'redo' | 'run' | 'group' | null;

export function resolveWorkflowShortcutAction(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): WorkflowShortcutAction {
  const key = event.key.toLowerCase();

  if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && key === 'g') {
    return 'group';
  }

  const hasPrimaryModifier = event.ctrlKey || event.metaKey;
  if (!hasPrimaryModifier) return null;

  if (event.shiftKey && key === 'enter') {
    return 'run';
  }

  if (key === 'z' && !event.shiftKey) {
    return 'undo';
  }

  if ((key === 'z' && event.shiftKey) || key === 'y') {
    return 'redo';
  }

  return null;
}
