interface RequestAbortEmitter {
  on(event: 'aborted', listener: () => void): unknown;
  off?: (event: 'aborted', listener: () => void) => unknown;
}

interface ResponseAbortEmitter {
  on(event: 'close' | 'finish', listener: () => void): unknown;
  off?: (event: 'close', listener: () => void) => unknown;
}

export function createRequestAbortSignal(req: RequestAbortEmitter, res: ResponseAbortEmitter): AbortSignal {
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
    res.off?.('close', abortIfOpen);
  };

  req.on('aborted', abortIfOpen);
  res.on('close', abortIfOpen);
  res.on('finish', cleanup);

  return controller.signal;
}
