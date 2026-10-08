import {copyFile, mkdir} from 'node:fs/promises';
import {build} from 'esbuild';

await mkdir('renderer/vendor', {recursive: true});
await build({
  entryPoints: ['renderer/js/material-entry.js'],
  outfile: 'renderer/vendor/material-web.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  legalComments: 'inline',
});
await copyFile('node_modules/@material/web/LICENSE', 'renderer/vendor/MATERIAL-WEB-LICENSE.txt');
console.log('Built Google Material Web components for MetroBox.');
