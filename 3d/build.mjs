// Builds one self-contained index.html: game code + renderer + the bits of three.js it uses. No outside scripts.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
const three = await build({ entryPoints: ['src/three-entry.js'], bundle: true, minify: true, format: 'iife', globalName: 'THREE', write: false, legalComments: 'none', target: 'es2019' });
const js = three.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const html = readFileSync('src/game.src.html', 'utf8');
const r3d = readFileSync('src/render3d.js', 'utf8');
const out = html
  .replace('/*__THREE__*/', () => '/* three.js, MIT licence, Copyright 2010-2024 three.js authors */\n' + js)
  .replace('/*__RENDERER__*/', () => r3d);
writeFileSync('index.html', out);
console.log('index.html', Math.round(out.length / 1024) + ' KB');
