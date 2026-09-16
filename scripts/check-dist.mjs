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

// ---- Learn hubs (/learn/*)
const learnPages = htmlFiles.filter((f) => /^learn\/[a-z0-9-]+\.html$/.test(path.relative(DIST, f).split(path.sep).join('/')));
for (const f of learnPages) {
  const rel = '/' + path.relative(DIST, f).split(path.sep).join('/');
  const slug = rel.replace(/^\/learn\//, '').replace(/\.html$/, '');
  const html = fs.readFileSync(f, 'utf8');
  const text = stripTags(html);
  const ids = idsByFile.get(rel);

  if (!html.includes(`<link rel="canonical" href="https://www.chimney.services/learn/${slug}"`)) err(f, `canonical is not https://www.chimney.services/learn/${slug}`);
  if (/\bundefined\b|\bNaN\b|\[object Object\]/.test(text)) err(f, 'visible text contains "undefined", "NaN" or "[object Object]"');

  const types = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const obj = JSON.parse(m[1]);
      types.push(obj['@type']);
      if (obj['@type'] === 'Article') {
        if (obj.author?.name !== 'Chimney.Services' || obj.author?.['@type'] !== 'Organization') err(f, 'Article author must be Organization Chimney.Services');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(obj.dateModified ?? '')) err(f, `Article dateModified invalid: ${obj.dateModified}`);
        for (const part of obj.hasPart ?? []) {
          const frag = String(part.url).split('#')[1];
          if (!frag || !ids.has(frag)) err(f, `Article hasPart anchor does not resolve: ${part.url}`);
        }
      }
      if (obj['@type'] === 'FAQPage') {
        for (const q of obj.mainEntity ?? []) if (!q.name || !q.acceptedAnswer?.text) err(f, 'FAQPage question missing name or answer text');
      }
    } catch {
      /* parse errors already reported above */
    }
  }
  for (const t of ['BreadcrumbList', 'Article']) if (!types.includes(t)) err(f, `missing ${t} JSON-LD`);
  const detailsCount = (html.match(/<details id="/g) ?? []).length;
  if (detailsCount > 0 && !types.includes('FAQPage')) err(f, 'FAQ rendered but no FAQPage JSON-LD');

  const reads = [...html.matchAll(/<article class="read learn-read" id="([^"]+)"[\s\S]*?<\/article>/g)];
  if (reads.length === 0) err(f, 'no reads rendered');
  for (const [block, anchor] of reads) {
    if (!block.includes(`<h2 id="${anchor}-title"`)) err(f, `read #${anchor}: missing H2`);
    if (!block.includes(`class="anchor-mark" href="#${anchor}"`)) err(f, `read #${anchor}: missing anchor mark`);
    if (!/class="sources"[\s\S]*?<a href="https?:\/\//.test(block)) err(f, `read #${anchor}: no external source link`);
    if (!/class="jump"/.test(html) || !html.includes(`href="#${anchor}" title=`)) err(f, `read #${anchor}: no jump chip`);
    if (block.includes('VARIES BY STATE') && !block.includes('class="state-line"')) err(f, `read #${anchor}: VARIES BY STATE without the /rights line`);
    const outsidePrices = stripTags(block.replace(/<figure class="price-block"[\s\S]*?<\/figure>/g, ''));
    if (/\$\s?\d/.test(outsidePrices)) warnings.push(`${rel}#${anchor}: dollar figure outside a price block`);
  }
  const blockSlugs = new Map();
  for (const pb of html.matchAll(/<figure class="price-block"([^>]*)>[\s\S]*?<\/figure>/g)) {
    const b = pb[0];
    const slugM = pb[1].match(/data-price-slug="([^"]+)"/);
    const idM = pb[1].match(/\bid="([^"]+)"/);
    if (!slugM || !idM) err(f, 'price block missing id or data-price-slug');
    else if (blockSlugs.has(slugM[1])) err(f, `price block "${slugM[1]}" rendered more than once`);
    else blockSlugs.set(slugM[1], idM[1]);
    if (!b.includes('NATIONAL RANGE · RESEARCHED')) err(f, 'price block missing NATIONAL RANGE · RESEARCHED chip');
    const quote = b.includes('Quote after inspection');
    if (quote && /\$\d/.test(stripTags(b))) err(f, 'quote-only price block shows a dollar figure');
    if (!quote && (b.match(/<dd>\$[\d,]+<\/dd>/g) ?? []).length !== 3) err(f, 'price block does not show low/median/high');
  }
  for (const m of html.matchAll(/<p class="price-ref" data-price-slug="([^"]+)">[\s\S]*?href="#([^"]+)"[\s\S]*?<\/p>/g)) {
    const at = m.index ?? 0;
    const blockAt = html.indexOf(`id="${m[2]}"`);
    if (blockSlugs.get(m[1]) !== m[2]) err(f, `price link for "${m[1]}" does not point at its rendered block`);
    else if (blockAt === -1 || blockAt > at) err(f, `price link for "${m[1]}" points at a block that is not above it`);
    if (!m[0].includes('See the researched range above')) err(f, `price link for "${m[1]}" has the wrong text`);
  }
}
const learnIndex = path.join(DIST, 'learn.html');
if (fs.existsSync(learnIndex)) {
  const idx = fs.readFileSync(learnIndex, 'utf8');
  for (const f of learnPages) {
    const slug = path.basename(f, '.html');
    if (!idx.includes(`href="/learn/${slug}"`)) errors.push(`learn.html: does not list /learn/${slug}`);
  }
  if (/\bplanned\b/i.test(stripTags(idx)) && learnPages.length) errors.push('learn.html: still calls published guides "planned"');
}
const llmsText = fs.readFileSync(path.join(DIST, 'llms.txt'), 'utf8');
for (const f of learnPages) {
  const slug = path.basename(f, '.html');
  if (!llmsText.includes(`/learn/${slug})`)) errors.push(`llms.txt: missing /learn/${slug}`);
}
const learnSitemap = files.find((f) => /sitemap-learn-\d+\.xml$/.test(f));
if (learnPages.length) {
  const xml = learnSitemap ? fs.readFileSync(learnSitemap, 'utf8') : '';
  for (const f of learnPages) {
    const slug = path.basename(f, '.html');
    if (!xml.includes(`<loc>https://www.chimney.services/learn/${slug}</loc>`)) errors.push(`learn sitemap: missing /learn/${slug}`);
  }
}
console.log(`Checked ${learnPages.length} Learn hub page(s).`);

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
