declare global {
  interface Map<K, V> {
    getOrInsert(key: K, defaultValue: V): V;
    getOrInsertComputed(key: K, callback: (key: K) => V): V;
  }
}

if (typeof Map.prototype.getOrInsert !== "function") {
  Map.prototype.getOrInsert = function <K, V>(this: Map<K, V>, key: K, defaultValue: V): V {
    if (this.has(key)) return this.get(key) as V;
    this.set(key, defaultValue);
    return defaultValue;
  };
}

if (typeof Map.prototype.getOrInsertComputed !== "function") {
  Map.prototype.getOrInsertComputed = function <K, V>(
    this: Map<K, V>,
    key: K,
    callback: (key: K) => V,
  ): V {
    if (this.has(key)) return this.get(key) as V;
    const value = callback(key);
    this.set(key, value);
    return value;
  };
}

/*
 * pdf.js 6 reads page text with `for await (… of readableStream)`. Safari
 * (at least up to 18) can't loop over a ReadableStream, so getTextContent
 * failed there: Read PDF, Compare, PDF to Excel and Redact's search broke.
 */
if (typeof ReadableStream !== "undefined" && !(Symbol.asyncIterator in ReadableStream.prototype)) {
  const values = function (this: ReadableStream, { preventCancel = false } = {}) {
    const reader = this.getReader();
    return {
      next: () => reader.read(),
      async return(value?: unknown) {
        if (!preventCancel) {
          const done = reader.cancel(value);
          reader.releaseLock();
          await done;
        } else {
          reader.releaseLock();
        }
        return { done: true as const, value };
      },
      [Symbol.asyncIterator]() { return this; },
    };
  };
  Object.defineProperty(ReadableStream.prototype, "values", { value: values, writable: true, configurable: true });
  Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, { value: values, writable: true, configurable: true });
}

export {};