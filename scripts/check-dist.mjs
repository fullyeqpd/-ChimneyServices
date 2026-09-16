#!/usr/bin/env node
// Post-build quality gate over dist/: one H1, title pattern, JSON-LD parses,
// in-page anchors resolve, internal links resolve, banned strings absent.
// Usage: npm run build && npm run check:dist
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(SITE, 'dist');
const errors = [];
const warnings = [];
const err = (f, m) => errors.push(`${path.relative(DIST, f)}: ${m}`);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}
const files = walk(DIST);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const fileSet = new Set(files.map((f) => '/' + path.relative(DIST, f).split(path.sep).join('/')));

function resolveInternal(href) {
  const clean = href.split('#')[0].split('?')[0];
  if (clean === '' || clean === '/') return fileSet.has('/index.html') ? '/index.html' : null;
  for (const cand of [clean, `${clean}.html`, `${clean.replace(/\/$/, '')}/index.html`]) if (fileSet.has(cand)) return cand;
  return null;
}

const stripTags = (h) =>
  h
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const idsByFile = new Map();
for (const f of htmlFiles) {
  const html = fs.readFileSync(f, 'utf8');
  idsByFile.set('/' + path.relative(DIST, f).split(path.sep).join('/'), new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
}

let internalLinks = 0;
let externalLinks = 0;
for (const f of htmlFiles) {
  const rel = '/' + path.relative(DIST, f).split(path.sep).join('/');
  const html = fs.readFileSync(f, 'utf8');
  const text = stripTags(html);

  const h1s = html.match(/<h1[\s>]/g) ?? [];
  if (h1s.length !== 1) err(f, `expected 1 <h1>, found ${h1s.length}`);

  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
  if (!title.endsWith('| Chimney.Services')) err(f, `title does not end with "| Chimney.Services": ${title}`);
  if (/^\/[a-z-]+\/rights\.html$/.test(rel) && !/^.+ Chimney &amp; Fireplace Laws — Know Your Rights \(\d{4}\) \| Chimney\.Services$/.test(title)) {
    err(f, `state title pattern mismatch: ${title}`);
  }
  if (rel === '/rights.html' && title !== 'Chimney &amp; Fireplace Laws by State — 50-State Comparison (2026) | Chimney.Services') {
    err(f, `national title pattern mismatch: ${title}`);
  }
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  if (!desc) err(f, 'missing meta description');
  else if (desc.replace(/&amp;/g, '&').length > 155) err(f, `meta description ${desc.length} chars`);
  if (!/<link rel="canonical" href="https:\/\/www\.chimney\.services[^"]*"/.test(html)) err(f, 'missing canonical');
  for (const tag of ['og:title', 'og:description', 'og:url', 'twitter:card']) if (!html.includes(tag)) err(f, `missing ${tag}`);

  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const obj = JSON.parse(m[1]);
      if (!obj['@type']) err(f, 'JSON-LD block without @type');
      if (/ClaimReview|Review"|AggregateRating/.test(m[1])) err(f, 'forbidden review markup in JSON-LD');
    } catch (e) {
      err(f, `JSON-LD parse error: ${e.message}`);
    }
  }

  // Rendering artefacts (the research prose legitimately uses the word "undefined").
  for (const bad of [/>\s*(undefined|NaN|null)\s*</, /="(undefined|NaN)"/, /\b(undefined|NaN) ·|· (undefined|NaN)\b/, /\$NaN|NaN%/]) if (bad.test(html)) err(f, `rendering artefact ${bad}`);
  for (const bad of [/lorem ipsum/i, /\[object Object\]/]) if (bad.test(text)) err(f, `banned string ${bad}`);
  if (/verified professional/i.test(text)) err(f, 'contains "verified professional"');
  if (/Chimney Services(?!\.)|chimney\.services(?![/a-z.])/.test(text.replace(/www\.chimney\.services/g, ''))) {
    warnings.push(`${rel}: possible entity spelling variant`);
  }
  if (/CSIA\s*(\/|,|\bor\b|\band\b)\s*(CC[A-Z]+\s*(\/|,|\bor\b|\band\b)\s*)?(OR\s+)?NCSG|CSIA[^.;()]{0,25}; NCSG/i.test(text)) err(f, 'certification order: CSIA listed before NCSG');
  if (/CSIA\s*(\/|,)\s*NFI|NFI\s*(\/|,|\bor\b|\band\b)\s*NCSG/.test(text)) err(f, 'certification order: expected NCSG → NFI → CSIA');
  if (/<h[1-6][^>]*>[^<]*Publish blockers/i.test(html)) err(f, 'Publish blockers section rendered');
  if (/Publish blockers/i.test(text)) warnings.push(`${rel}: prose mentions "Publish blockers"`);

  // ids unique
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dup.length) err(f, `duplicate ids: ${[...new Set(dup)].join(', ')}`);

  for (const m of html.matchAll(/<a\s[^>]*href="([^"]+)"/g)) {
    const href = m[1].replace(/&amp;/g, '&');
    if (/^(mailto:|tel:)/.test(href)) continue;
    if (/^https?:\/\//.test(href)) {
      externalLinks++;
      if (/^https:\/\/www\.chimney\.services/.test(href)) err(f, `absolute self link ${href}`);
      continue;
    }
    if (href.startsWith('#')) {
      if (!idsByFile.get(rel).has(decodeURIComponent(href.slice(1)))) err(f, `broken anchor ${href}`);
      continue;
    }
    internalLinks++;
    const target = resolveInternal(href);
    if (!target) err(f, `broken internal link ${href}`);
    else if (href.includes('#')) {
      const frag = href.split('#')[1];
      if (frag && !idsByFile.get(target)?.has(frag)) err(f, `broken cross-page anchor ${href}`);
    }
  }
}

// JSON / txt artifacts
const llms = fs.readFileSync(path.join(DIST, 'llms.txt'), 'utf8');
for (const m of llms.matchAll(/\]\(https:\/\/www\.chimney\.services([^)]*)\)/g)) {
  if (!resolveInternal(m[1] || '/')) errors.push(`llms.txt: link does not resolve ${m[1]}`);
}
const csv = fs.readFileSync(path.join(DIST, 'data', 'rights-table.csv'), 'utf8');
if (!csv.startsWith('# Source: Chimney.Services — cite as https://www.chimney.services/rights')) errors.push('rights-table.csv: missing attribution line');
const robots = fs.readFileSync(path.join(DIST, 'robots.txt'), 'utf8');
for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) if (!robots.includes(bot)) errors.push(`robots.txt: missing ${bot}`);
for (const sm of files.filter((f) => /sitemap-.*\.xml$/.test(f))) {
  const xml = fs.readFileSync(sm, 'utf8');
  for (const m of xml.matchAll(/<loc>https:\/\/www\.chimney\.services([^<]*)<\/loc>/g)) {
    if (m[1].endsWith('.xml')) continue;
    if (!resolveInternal(m[1] || '/')) errors.push(`${path.basename(sm)}: loc does not resolve ${m[1]}`);
  }
}

console.log(`Checked ${htmlFiles.length} HTML files, ${internalLinks} internal links, ${externalLinks} external links (not fetched).`);
if (warnings.length) console.log(`Warnings (${warnings.length}):\n  ${warnings.slice(0, 20).join('\n  ')}`);
if (errors.length) {
  console.log(`ERRORS (${errors.length}):\n  ${errors.slice(0, 80).join('\n  ')}`);
  process.exit(1);
}
console.log('dist check passed.');
