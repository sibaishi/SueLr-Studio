export function createRequestAbortSignal(req, res) {
  const controller = new AbortController();
  let completed = false;

  const abortIfOpen = () => {
    if (!completed && !controller.signal.aborted) {
      controller.abort();
    }
  };

  const cleanup = () => {
    completed = true;
    req.off?.('aborted', abortIfOpen);
    req.off?.('close', abortIfOpen);
    res.off?.('close', abortIfOpen);
  };

  req.on('aborted', abortIfOpen);
  req.on('close', abortIfOpen);
  res.on('close', abortIfOpen);
  res.on('finish', cleanup);

  return controller.signal;
}
