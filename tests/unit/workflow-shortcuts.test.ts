import { describe, expect, it } from 'vitest';
import { resolveWorkflowShortcutAction } from '@/domains/workflow/lib/hotkeys';

describe('workflow keyboard shortcuts', () => {
  it('maps Alt+G to group creation', () => {
    expect(resolveWorkflowShortcutAction({
      key: 'g',
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    })).toBe('group');
  });

  it('maps Ctrl+Shift+Enter to workflow execution', () => {
    expect(resolveWorkflowShortcutAction({
      key: 'Enter',
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
    })).toBe('run');
  });

  it('keeps undo and redo shortcuts intact', () => {
    expect(resolveWorkflowShortcutAction({
      key: 'z',
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
    })).toBe('undo');

    expect(resolveWorkflowShortcutAction({
      key: 'z',
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
    })).toBe('redo');
  });
});
