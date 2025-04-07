export function Sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    function done() {
      resolve();
      signal?.removeEventListener('abort', stop);
    }
    function stop() {
      reject(new Error('Aborted'));
      clearTimeout(handle);
    }
    signal?.throwIfAborted();
    const handle = setTimeout(done, ms);
    signal?.addEventListener('abort', stop);
  });
}
