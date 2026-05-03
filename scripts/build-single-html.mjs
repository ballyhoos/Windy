import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const distHtmlPath = resolve('dist/index.html');
const docsHtmlPath = resolve('docs/index.html');
const distAssetsPath = resolve('dist/assets');
const docsAssetsPath = resolve('docs/assets');
const publicDataPath = resolve('public/data');
const docsDataPath = resolve('docs/data');
const buildInfoPath = resolve('public/build-info.json');

const html = readFileSync(distHtmlPath, 'utf8');
const buildInfoRaw = existsSync(buildInfoPath)
  ? readFileSync(buildInfoPath, 'utf8')
  : '{"version":"dev"}';
const buildInfo = JSON.parse(buildInfoRaw);
const version = String(buildInfo.version ?? 'dev');

if (existsSync(docsAssetsPath)) {
  rmSync(docsAssetsPath, { recursive: true, force: true });
}
cpSync(distAssetsPath, docsAssetsPath, { recursive: true });

if (existsSync(docsDataPath)) {
  rmSync(docsDataPath, { recursive: true, force: true });
}
if (existsSync(publicDataPath)) {
  cpSync(publicDataPath, docsDataPath, { recursive: true });
}

let transformed = html;
const versionMeta = `<meta name="windy-build-version" content="${version}" />`;
const cacheMetaBlock = [
  '<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />',
  '<meta http-equiv="Pragma" content="no-cache" />',
  '<meta http-equiv="Expires" content="0" />',
].join('\n    ');
if (/<meta\s+name=["']windy-build-version["']/i.test(transformed)) {
  transformed = transformed.replace(
    /<meta\s+name=["']windy-build-version["'][^>]*>/i,
    versionMeta,
  );
} else {
  transformed = transformed.replace('</head>', `    ${versionMeta}\n  </head>`);
}

if (!/<meta\s+http-equiv=["']Cache-Control["']/i.test(transformed)) {
  transformed = transformed.replace('</head>', `    ${cacheMetaBlock}\n  </head>`);
}

// Make docs/index.html explicitly resolve to the Windy Pages base path.
transformed = transformed.replace(
  /(href|src)=["']\/assets\/([^"']+)["']/g,
  (_full, attr, fileName) => `${attr}="/Windy/assets/${fileName}?v=${version}"`,
);

mkdirSync(dirname(docsHtmlPath), { recursive: true });
writeFileSync(docsHtmlPath, transformed, 'utf8');

console.log(`[build-single-html] Wrote docs/index.html, docs/assets, docs/data (v=${version})`);
