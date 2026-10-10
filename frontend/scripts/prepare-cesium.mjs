import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('../node_modules/cesium/Build/Cesium/', import.meta.url));
const target = fileURLToPath(new URL('../dist/vendor/cesium/', import.meta.url));
await mkdir(target, { recursive: true });
for (const name of ['Cesium.js', 'Assets', 'ThirdParty', 'Widgets', 'Workers']) {
  await cp(`${source}/${name}`, `${target}/${name}`, { recursive: true });
}
// Cesium 1.146 bundles Knockout with an eval-based global lookup. Replace only
// that lookup with its standard equivalent so strict CSP remains enabled.
const bundle = await readFile(`${target}/Cesium.js`, 'utf8');
const lookup = '(0,eval)("this")';
if (bundle.split(lookup).length !== 2) throw new Error('Cesium global lookup changed; review the CSP-compatible preparation step.');
await writeFile(`${target}/Cesium.js`, bundle.replace(lookup, 'globalThis'));
await cp(new URL('../node_modules/cesium/LICENSE.md', import.meta.url), `${target}/LICENSE.md`);
const pkg = JSON.parse(await readFile(new URL('../node_modules/cesium/package.json', import.meta.url), 'utf8'));
await writeFile(`${target}/version.json`, JSON.stringify({ version: pkg.version }));
console.log(`Cesium ${pkg.version}: bibliotecă, workers, widgets și tile-uri Natural Earth copiate local.`);
