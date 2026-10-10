import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
const source = new URL('../node_modules/xz-decompress/', import.meta.url);
const destination = new URL('../dist/vendor/xz/', import.meta.url);
await mkdir(destination, { recursive: true });
const code = await readFile(new URL('dist/package/xz-decompress.js', source), 'utf8');
// The pinned UMD bundle uses top-level `this`, which is undefined in modules.
const entry = '})(this, (';
if (code.split(entry).length !== 2) throw new Error('Unexpected XZ bundle entrypoint.');
await writeFile(new URL('xz-decompress.js', destination), code.replace(entry, '})(globalThis, ('));
await copyFile(new URL('README.md', source), new URL('README.md', destination));
await copyFile(new URL('package.json', source), new URL('package.json', destination));
console.log('Local XZ decoder prepared; embedded WASM and license notices retained.');
