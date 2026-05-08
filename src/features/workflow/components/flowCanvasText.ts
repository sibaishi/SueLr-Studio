export function formatCanvasUploadError(message?: string | null) {
  const detail = String(message || '').trim();
  return detail
    ? `上传没有完成，请检查文件格式、大小或稍后重试。${detail}`
    : '上传没有完成，请检查文件格式、大小或稍后重试。';
}

export function isEditableElement(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tagName = element.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || element.isContentEditable;
}
