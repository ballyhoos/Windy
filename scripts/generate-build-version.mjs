import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatVersion(date) {
  const yyyy = String(date.getFullYear()).slice(-2);
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${yyyy}${mm}${dd}-${hh}${min}`;
}

const now = new Date();
const version = formatVersion(now);
const generatedAt = now.toISOString();

const tsPath = resolve('src/generated/buildInfo.ts');
const jsonPath = resolve('public/build-info.json');

mkdirSync(dirname(tsPath), { recursive: true });
mkdirSync(dirname(jsonPath), { recursive: true });

writeFileSync(
  tsPath,
  `export const BUILD_VERSION = "${version}";\nexport const BUILD_GENERATED_AT = "${generatedAt}";\n`,
  'utf8',
);

writeFileSync(
  jsonPath,
  `${JSON.stringify({ version, generatedAt }, null, 2)}\n`,
  'utf8',
);

console.log(`[build-version] ${version}`);
