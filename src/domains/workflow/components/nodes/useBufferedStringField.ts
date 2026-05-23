import { useCallback, useEffect, useRef, useState } from 'react';

export function useBufferedStringField(
  value: string,
  onCommit: (value: string) => void,
  delay = 180,
) {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  const composingRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);
  const commitRef = useRef(onCommit);

  useEffect(() => {
    commitRef.current = onCommit;
  }, [onCommit]);

  const clearPending = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const flush = useCallback((nextValue?: string) => {
    clearPending();
    commitRef.current(nextValue ?? draft);
  }, [clearPending, draft]);

  const scheduleCommit = useCallback((nextValue: string) => {
    clearPending();
    if (composingRef.current) return;
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      commitRef.current(nextValue);
    }, delay);
  }, [clearPending, delay]);

  useEffect(() => {
    if (!focusedRef.current && !composingRef.current) {
      setDraft(value);
    }
  }, [value]);

  useEffect(() => clearPending, [clearPending]);

  return {
    value: draft,
    setValue: (nextValue: string) => {
      clearPending();
      setDraft(nextValue);
    },
    onChange: (nextValue: string) => {
      setDraft(nextValue);
      scheduleCommit(nextValue);
    },
    onFocus: () => {
      focusedRef.current = true;
    },
    onBlur: (nextValue: string) => {
      focusedRef.current = false;
      composingRef.current = false;
      flush(nextValue);
    },
    onCompositionStart: () => {
      composingRef.current = true;
      clearPending();
    },
    onCompositionEnd: (nextValue: string) => {
      composingRef.current = false;
      setDraft(nextValue);
      scheduleCommit(nextValue);
    },
  };
}
