#!/usr/bin/env node
// Writes the CR80 registry cards as standalone SVG files into
// public/pro/cards/, so a print shop can use them without the site.
// Run by `npm run ingest`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontSvg, backSvg } from '../src/lib/card-svg.mjs';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = 'https://www.chimney.services';
const OUT = path.join(SITE, 'public', 'pro', 'cards');

const { records } = JSON.parse(fs.readFileSync(path.join(SITE, 'src', 'data', 'registry.json'), 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

for (const r of records) {
  const url = `${SITE_URL}/pro/${r.slug}`;
  fs.writeFileSync(path.join(OUT, `${r.slug}-front.svg`), frontSvg(r));
  fs.writeFileSync(path.join(OUT, `${r.slug}-back.svg`), backSvg(r, url));
}
console.log(`Wrote ${records.length * 2} registry card SVG(s) to public/pro/cards/.`);
