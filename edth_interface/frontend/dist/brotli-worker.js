import init, { decompress } from './vendor/brotli/brotli_dec_wasm.js';

let ready;
let xzReady;
async function decompressXZ(buffer) {
  xzReady ??= import('./vendor/xz/xz-decompress.js');
  await xzReady;
  const stream = new globalThis['xz-decompress'].XzReadableStream(new Blob([buffer]).stream());
  const reader = stream.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 32 * 1024 * 1024) throw new Error('Pachetul depășește limita de memorie.');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

async function decodeRequest({ id, buffer, compression }) {
  try {
    let bytes;
    if (compression === 'xz') bytes = await decompressXZ(buffer);
    else if (compression === 'brotli') {
      ready ??= init({ module_or_path: new URL('./vendor/brotli/brotli_dec_wasm_bg.wasm', import.meta.url) });
      await ready;
      bytes = decompress(new Uint8Array(buffer));
    } else throw new Error('Formatul pachetului nu este acceptat.');
    if (bytes.byteLength > 32 * 1024 * 1024) throw new Error('Pachetul depășește limita de memorie.');
    self.postMessage({ id, buffer: bytes.buffer }, [bytes.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error?.message || 'Pachetul hărții nu poate fi decomprimat.' });
  }
}

// A single in-flight decode bounds dictionary and output memory during navigation.
let queue = Promise.resolve();
self.onmessage = ({ data }) => { queue = queue.then(() => decodeRequest(data)); };
