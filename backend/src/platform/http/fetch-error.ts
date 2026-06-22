export function describeFetchError(error: unknown): string {
  const errorRecord = error as {
    message?: unknown;
    code?: unknown;
    cause?: { message?: unknown; code?: unknown };
  } | null;
  const message = errorRecord?.message || String(error);
  const causeMessage = errorRecord?.cause?.message ? `; cause=${errorRecord.cause.message}` : '';
  const code = errorRecord?.cause?.code || errorRecord?.code;
  const codeMessage = code ? `; code=${code}` : '';
  return `${message}${causeMessage}${codeMessage}`;
}
