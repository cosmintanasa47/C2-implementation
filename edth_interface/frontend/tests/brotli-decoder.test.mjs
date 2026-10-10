import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { brotliCompressSync } from 'node:zlib';
import { initSync, decompress } from 'brotli-dec-wasm/web';

test('local WASM decoder preserves packed binary data including zero bytes', async () => {
  const wasm = await readFile(new URL('../node_modules/brotli-dec-wasm/pkg/brotli_dec_wasm_bg.wasm', import.meta.url));
  initSync({ module: wasm });
  const raw = Buffer.alloc(256 * 1024);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 31 + (i >>> 8)) % 256;
  const decoded = decompress(brotliCompressSync(raw));
  assert.deepEqual(Buffer.from(decoded), raw);
});
