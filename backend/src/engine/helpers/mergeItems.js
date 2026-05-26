function sortInputHandles(keys) {
  return [...keys].sort((keyA, keyB) => {
    const idxA = Number.parseInt(String(keyA).replace('item', ''), 10);
    const idxB = Number.parseInt(String(keyB).replace('item', ''), 10);
    return idxA - idxB;
  });
}

function flattenMergeItems(value, normalizeItem) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenMergeItems(item, normalizeItem));
  }
  return normalizeItem(value);
}

export function collectMergedTextValues(inputs) {
  return sortInputHandles(Object.keys(inputs || {})).flatMap((key) =>
    flattenMergeItems(inputs[key], (value) => {
      const text = String(value ?? '').trim();
      return text ? [text] : [];
    }),
  );
}

export function collectMergedMediaValues(inputs) {
  return sortInputHandles(Object.keys(inputs || {})).flatMap((key) =>
    flattenMergeItems(inputs[key], (value) => {
      if (value === undefined || value === null) return [];
      if (typeof value === 'string') {
        const item = value.trim();
        return item ? [item] : [];
      }
      return [value];
    }),
  );
}
