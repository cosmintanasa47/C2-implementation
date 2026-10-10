// Keep decompression off the render thread; all code and WASM are served locally.
let worker;
let nextId = 0;
const pending = new Map();

function reset(error) {
  worker?.terminate();
  worker = undefined;
  for (const request of pending.values()) request.reject(error);
  pending.clear();
}

export function decompressMapPack(bytes, compression = 'brotli') {
  if (!(bytes instanceof Uint8Array)) return Promise.reject(new TypeError('Expected Uint8Array'));
  if (!['brotli', 'xz'].includes(compression)) return Promise.reject(new TypeError('Unknown pack compression'));
  if (!worker) {
    worker = new Worker(new URL('./brotli-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      if (data.error) request.reject(new Error(data.error));
      else request.resolve(new Uint8Array(data.buffer));
    };
    worker.onerror = () => reset(new Error('Decodorul local al hărții nu a putut fi încărcat.'));
    worker.onmessageerror = () => reset(new Error('Răspuns invalid de la decodorul hărții.'));
  }
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const copy = bytes.slice();
    pending.set(id, { resolve, reject });
    try { worker.postMessage({ id, buffer: copy.buffer, compression }, [copy.buffer]); }
    catch (error) { pending.delete(id); reject(error); }
  });
}

export const decompressBrotli = bytes => decompressMapPack(bytes, 'brotli');

globalThis.addEventListener?.('pagehide', ({ persisted }) => {
  if (!persisted) reset(new Error('Pagina a fost închisă.'));
});
