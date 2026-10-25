export const withAbort = <T,>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const cancelled = () => reject(new DOMException("Conversion cancelled", "AbortError"));
    if (signal.aborted) { cancelled(); return; }
    signal.addEventListener("abort", cancelled, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", cancelled));
  });
};
