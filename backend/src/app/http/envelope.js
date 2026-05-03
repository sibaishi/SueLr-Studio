export function successEnvelope(data) {
  return {
    success: true,
    data,
  };
}

export function errorEnvelope(error) {
  return {
    success: false,
    error: {
      code: error?.code || 'INTERNAL_ERROR',
      message: error?.message || '请求处理失败',
      ...(error?.details !== undefined ? { details: error.details } : {}),
    },
  };
}
