#!/usr/bin/env node
// Copies the national price research CSV into the site (READ ONLY on the research folder).
//   ../price-research/PRICES-NATIONAL.csv  →  src/data/prices-national.csv
// Commit the copy: Cloudflare builds without the research folders.
// Override the source folder with PRICES_DIR=/path.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRICES_DIR = path.resolve(process.env.PRICES_DIR ?? path.join(SITE, '..', 'price-research'));
const src = path.join(PRICES_DIR, 'PRICES-NATIONAL.csv');
const dest = path.join(SITE, 'src', 'data', 'prices-national.csv');

if (!fs.existsSync(src)) {
  if (fs.existsSync(dest)) {
    console.warn(`copy-prices: ${src} not found — keeping the committed ${path.relative(SITE, dest)}.`);
    process.exit(0);
  }
  console.error(`copy-prices: ${src} not found and no committed copy exists.`);
  process.exit(1);
}
const text = fs.readFileSync(src, 'utf8');
const header = text.split(/\r?\n/, 1)[0];
for (const col of ['service_slug', 'unit', 'low', 'median', 'high', 'source_urls', 'confidence', 'checked_date']) {
  if (!header.split(',').includes(col)) {
    console.error(`copy-prices: PRICES-NATIONAL.csv header is missing "${col}".`);
    process.exit(1);
  }
}
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, text);
const rows = text.trim().split(/\r?\n/).length - 1;
console.log(`copy-prices: ${rows} rows → ${path.relative(SITE, dest)}`);
