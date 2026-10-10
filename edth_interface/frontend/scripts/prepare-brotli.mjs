import { mkdir, copyFile } from 'node:fs/promises';
const source = new URL('../node_modules/brotli-dec-wasm/', import.meta.url);
const destination = new URL('../dist/vendor/brotli/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const [from, to] of [
  ['pkg/brotli_dec_wasm.js', 'brotli_dec_wasm.js'],
  ['pkg/brotli_dec_wasm_bg.wasm', 'brotli_dec_wasm_bg.wasm'],
  ['LICENSE-MIT.txt', 'LICENSE-MIT.txt'],
  ['LICENSE-Apache.txt', 'LICENSE-Apache.txt'],
]) await copyFile(new URL(from, source), new URL(to, destination));
console.log('Local Brotli decoder prepared.');
