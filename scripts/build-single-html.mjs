import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const distHtmlPath = resolve('dist/index.html');
const docsHtmlPath = resolve('docs/index.html');
const distAssetsPath = resolve('dist/assets');
const docsAssetsPath = resolve('docs/assets');
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

let transformed = html;
const versionMeta = `<meta name="windy-build-version" content="${version}" />`;
if (/<meta\s+name=["']windy-build-version["']/i.test(transformed)) {
  transformed = transformed.replace(
    /<meta\s+name=["']windy-build-version["'][^>]*>/i,
    versionMeta,
  );
} else {
  transformed = transformed.replace('</head>', `    ${versionMeta}\n  </head>`);
}

// Make docs/index.html explicitly resolve to the Windy Pages base path.
transformed = transformed.replace(
  /(href|src)=["']\/assets\/([^"']+)["']/g,
  (_full, attr, fileName) => `${attr}="/Windy/assets/${fileName}?v=${version}"`,
);

mkdirSync(dirname(docsHtmlPath), { recursive: true });
writeFileSync(docsHtmlPath, transformed, 'utf8');

console.log(`[build-single-html] Wrote docs/index.html and docs/assets (v=${version})`);
