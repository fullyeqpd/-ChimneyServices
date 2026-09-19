#!/usr/bin/env node
// Post-build quality gate over dist/: one H1, title pattern, JSON-LD parses,
// in-page anchors resolve, internal links resolve, banned strings absent.
// Usage: npm run build && npm run check:dist
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_ORIGIN = 'https://www.chimney.services';
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
  // An email address at the domain is not an entity-spelling slip.
  if (/Chimney Services(?!\.)|chimney\.services(?![/a-z.])/.test(text.replace(/www\.chimney\.services|@chimney\.services/g, ''))) {
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
// ---- Registry records (/pro/*): one H1, indexable, valid Person + FAQPage
// JSON-LD, and never the words "verified professional" — a record confers no
// status on anybody.
const proPages = htmlFiles.filter((f) => path.relative(DIST, f).split(path.sep)[0] === 'pro');
const llmsRaw = fs.readFileSync(path.join(DIST, 'llms.txt'), 'utf8');
for (const f of proPages) {
  const rel = '/' + path.relative(DIST, f).split(path.sep).join('/');
  const html = fs.readFileSync(f, 'utf8');
  const text = stripTags(html);
  if ((html.match(/<h1[\s>]/g) ?? []).length !== 1) err(f, 'registry page: expected exactly 1 <h1>');
  if (/noindex/.test(html)) err(f, 'registry page must be indexable');
  for (const bad of ['verified professional', 'verified pro', 'approved professional', 'trusted professional']) {
    if (text.toLowerCase().includes(bad)) err(f, `registry page contains "${bad}"`);
  }
  const types = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let obj;
    try {
      obj = JSON.parse(m[1]);
    } catch (e) {
      err(f, `registry JSON-LD parse error: ${e.message}`);
      continue;
    }
    types.push(obj['@type']);
    if (obj['@type'] === 'Person') {
      if (!obj['@id']?.startsWith('https://www.chimney.services/pro/')) err(f, 'Person JSON-LD @id is not the record URL');
      if (!Array.isArray(obj.hasCredential) || obj.hasCredential.length === 0) err(f, 'Person JSON-LD has no hasCredential');
      for (const c of obj.hasCredential ?? []) {
        if (c['@type'] !== 'EducationalOccupationalCredential') err(f, 'hasCredential is not an EducationalOccupationalCredential');
        if (c.recognizedBy?.['@type'] !== 'Organization' || !c.recognizedBy?.name) err(f, 'credential recognizedBy is not a named Organization');
      }
    }
  }
  if (!types.includes('Organization')) err(f, 'registry page missing Organization JSON-LD');
  for (const t of ['BreadcrumbList', 'Person', 'FAQPage']) if (!types.includes(t)) err(f, `registry record missing ${t} JSON-LD`);
  const faqQuestions = (html.match(/class="faq__q"/g) ?? []).length;
  if (faqQuestions < 3) err(f, `registry record: expected 3 FAQ questions in the DOM, found ${faqQuestions}`);
  if (!/href="\/professionals"/.test(html)) err(f, 'registry record: missing the /professionals waiting-list link');
}
if (proPages.length) {
  const proSitemap = files.find((x) => /sitemap-pro-\d+\.xml$/.test(x));
  const proXml = proSitemap ? fs.readFileSync(proSitemap, 'utf8') : '';
  if (!proSitemap) errors.push('sitemaps: no sitemap-pro-*.xml segment for registry records');
  const recordPages = proPages.filter((f) => /^pro\/[a-z0-9-]+\.html$/.test(path.relative(DIST, f).split(path.sep).join('/')));
  for (const f of recordPages) {
    const slug = path.basename(f, '.html');
    if (!proXml.includes(`<loc>${SITE_ORIGIN}/pro/${slug}</loc>`)) errors.push(`pro sitemap: missing /pro/${slug}`);
    if (!/<lastmod>/.test(proXml)) errors.push('pro sitemap: entries carry no lastmod');
    if (proXml.includes(`/pro/${slug}.json`)) errors.push(`pro sitemap: ${slug}.json is not a page and must not be listed`);
    if (!fs.existsSync(path.join(DIST, 'pro', `${slug}.json`))) errors.push(`pro/${slug}: machine-readable record /pro/${slug}.json is missing`);
    else {
      const rec = JSON.parse(fs.readFileSync(path.join(DIST, 'pro', `${slug}.json`), 'utf8'));
      if (!Array.isArray(rec.whatWeDidNotCheck) || rec.whatWeDidNotCheck.length === 0) errors.push(`pro/${slug}.json: whatWeDidNotCheck is missing`);
      for (const c of rec.credentials ?? []) if (!c.issuerLookupUrl) errors.push(`pro/${slug}.json: credential ${c.issuer} has no issuerLookupUrl`);
    }
    if (!llmsRaw.includes(`/pro/${slug})`)) errors.push(`llms.txt: missing /pro/${slug}`);
  }
}
console.log(`Checked ${proPages.length} registry page(s).`);

// ---- Redirects (dist/_redirects): the CS-P-00001 record moved to a shorter
// slug, so the old page and its machine-readable twin must still redirect.
{
  const redirectsFile = path.join(DIST, '_redirects');
  if (!fs.existsSync(redirectsFile)) errors.push('_redirects: missing from dist');
  else {
    const rules = fs.readFileSync(redirectsFile, 'utf8');
    const has = (from, to) =>
      rules.split('\n').some((line) => {
        const [f, t, code] = line.trim().split(/\s+/);
        return f === from && t === to && code === '301';
      });
    for (const [from, to] of [
      ['/pro/art-kalinicenko-00001', '/pro/art-kalina'],
      ['/pro/art-kalinicenko-00001.json', '/pro/art-kalina.json'],
    ]) {
      if (!has(from, to)) errors.push(`_redirects: missing 301 ${from} -> ${to}`);
    }
  }
  if (!fs.existsSync(path.join(DIST, 'pro', 'art-kalina.html'))) errors.push('pro/art-kalina.html: renamed record page is missing');
  if (fs.existsSync(path.join(DIST, 'pro', 'art-kalinicenko-00001.html'))) errors.push('pro/art-kalinicenko-00001.html: old record page must no longer be built');
}

// ---- Company summary pages (/chicago): indexable, one H1, JSON-LD parses,
// no status language, and never CSIA in connection with this company.
for (const rel of ['/chicago.html']) {
  const f = path.join(DIST, rel.slice(1));
  if (!fs.existsSync(f)) {
    errors.push(`${rel}: company page is missing from dist`);
    continue;
  }
  const html = fs.readFileSync(f, 'utf8');
  const text = stripTags(html);
  if ((html.match(/<h1[\s>]/g) ?? []).length !== 1) err(f, 'company page: expected exactly 1 <h1>');
  if (/noindex/.test(html)) err(f, 'company page must be indexable');
  if (/verified professional/i.test(text)) err(f, 'company page contains "verified professional"');
  if (/CSIA/.test(text)) err(f, 'company page must not mention CSIA');
  const types = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      types.push(JSON.parse(m[1])['@type']);
    } catch (e) {
      err(f, `company JSON-LD parse error: ${e.message}`);
    }
  }
  for (const t of ['BreadcrumbList', 'LocalBusiness', 'FAQPage']) if (!types.includes(t)) err(f, `company page missing ${t} JSON-LD`);
  const faqQuestions = (html.match(/class="faq__q"/g) ?? []).length;
  if (faqQuestions < 3) err(f, `company page: expected 3 FAQ questions in the DOM, found ${faqQuestions}`);
  if (!/href="\/companies"/.test(html)) err(f, 'company page: missing the /companies waiting-list link');
  // The public rating is quoted once, as a number on a day. Never as markup:
  // this site publishes no review or rating schema anywhere.
  for (const needle of ['1,097', '4.9']) {
    const hits = text.split(needle).length - 1;
    if (hits !== 1) err(f, `company page: expected "${needle}" exactly once in visible text, found ${hits}`);
  }
  if (/AggregateRating|"Review"|"@type"\s*:\s*"Review|ClaimReview|reviewRating|ratingValue/.test(html)) {
    err(f, 'company page: review or rating markup is forbidden');
  }
  if (!llmsRaw.includes(`${SITE_ORIGIN}/chicago)`)) errors.push('llms.txt: missing /chicago');
  const pagesSitemap = files.find((x) => /sitemap-pages-\d+\.xml$/.test(x));
  const xml = pagesSitemap ? fs.readFileSync(pagesSitemap, 'utf8') : '';
  if (!xml.includes(`<loc>${SITE_ORIGIN}/chicago</loc>`)) errors.push('pages sitemap: missing /chicago');
}

// ---- Waiting-list pages (/companies, /professionals): indexable, one H1, a
// real form, and none of the three words this site never uses about itself —
// it is not a directory, it publishes no listings, and nobody here is a
// "verified professional".
const pagesSitemapFile = files.find((x) => /sitemap-pages-\d+\.xml$/.test(x));
const pagesXml = pagesSitemapFile ? fs.readFileSync(pagesSitemapFile, 'utf8') : '';
for (const rel of ['/companies.html', '/professionals.html']) {
  const f = path.join(DIST, rel.slice(1));
  if (!fs.existsSync(f)) {
    errors.push(`${rel}: waiting-list page is missing from dist`);
    continue;
  }
  const slug = rel.replace(/^\//, '').replace(/\.html$/, '');
  const html = fs.readFileSync(f, 'utf8');
  const text = stripTags(html);
  if ((html.match(/<h1[\s>]/g) ?? []).length !== 1) err(f, 'waiting-list page: expected exactly 1 <h1>');
  if (/noindex/.test(html)) err(f, 'waiting-list page must be indexable');
  if (!/<form\b/.test(html)) err(f, 'waiting-list page: no <form>');
  // The form is the point of the page, so it comes before the explanation of
  // what the list is — not after it.
  const formAt = html.search(/<form\b/);
  const whatAt = html.indexOf('id="what-you-get"');
  if (whatAt === -1) err(f, 'waiting-list page: no id="what-you-get" section');
  else if (formAt > whatAt) err(f, 'waiting-list page: the form is below the "what you get" section');
  if (!/name="website2"/.test(html)) err(f, 'waiting-list page: no honeypot field');
  if (!/<noscript>/.test(html)) err(f, 'waiting-list page: no <noscript> note');
  for (const [label, re] of [
    ['directory', /\bdirector(y|ies)\b/i],
    ['listing', /\blistings?\b/i],
    ['verified professional', /verified\s+professional/i],
  ]) {
    if (re.test(text)) err(f, `waiting-list page contains the banned word "${label}"`);
  }
  if (!/placement is never sold/i.test(text)) err(f, 'waiting-list page: does not say placement is never sold');
  const types = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      types.push(JSON.parse(m[1])['@type']);
    } catch (e) {
      err(f, `waiting-list JSON-LD parse error: ${e.message}`);
    }
  }
  for (const t of ['BreadcrumbList', 'WebPage']) if (!types.includes(t)) err(f, `waiting-list page missing ${t} JSON-LD`);
  if (!pagesXml.includes(`<loc>${SITE_ORIGIN}/${slug}</loc>`)) errors.push(`pages sitemap: missing /${slug}`);
  if (!llmsRaw.includes(`${SITE_ORIGIN}/${slug})`)) errors.push(`llms.txt: missing /${slug}`);
}

// ---- Home (/): "go to your state" is the first step. The select and its
// button need JavaScript, so the four-column state index has to stay on the
// page as the no-JS path to every state.
{
  const f = path.join(DIST, 'index.html');
  if (!fs.existsSync(f)) errors.push('index.html: the home page is missing from dist');
  else {
    const html = fs.readFileSync(f, 'utf8');
    if ((html.match(/<h1[\s>]/g) ?? []).length !== 1) err(f, 'home: expected exactly 1 <h1>');
    const select = html.match(/<select[^>]*id="state-go"[\s\S]*?<\/select>/)?.[0];
    if (!select) err(f, 'home: no <select id="state-go"> state picker');
    else {
      const options = [...select.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
      if (options.length !== 51) err(f, `home: state picker has ${options.length} state options, expected 51`);
      for (const slug of options) if (!resolveInternal(`/${slug}/rights`)) err(f, `home: state option "${slug}" has no /${slug}/rights page`);
      if (!/<option value="">Choose your state<\/option>/.test(select)) err(f, 'home: state picker has no "Choose your state" placeholder');
    }
    if (!/<button[^>]*id="state-go-btn"[^>]*>Go to my state<\/button>/.test(html)) err(f, 'home: no "Go to my state" button');
    if (!/class="state-index"/.test(html)) err(f, 'home: the no-JS state index is gone');
    const stateIndexLinks = [...html.matchAll(/<ul class="state-index"[\s\S]*?<\/ul>/g)]
      .flatMap((m) => [...m[0].matchAll(/href="\/([a-z-]+)\/rights"/g)].map((x) => x[1]));
    if (stateIndexLinks.length !== 51) err(f, `home: state index lists ${stateIndexLinks.length} states, expected 51`);
    const types = [];
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try {
        types.push(JSON.parse(m[1])['@type']);
      } catch {
        /* parse errors already reported above */
      }
    }
    for (const t of ['Organization', 'WebSite']) if (!types.includes(t)) err(f, `home: missing ${t} JSON-LD`);
  }
}
// The 50-state comparison keeps its Dataset JSON-LD, wherever it sits in the page order.
for (const rel of ['/rights.html', '/licensing.html']) {
  const f = path.join(DIST, rel.slice(1));
  if (!fs.existsSync(f)) continue;
  const html = fs.readFileSync(f, 'utf8');
  const types = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      types.push(JSON.parse(m[1])['@type']);
    } catch {
      /* parse errors already reported above */
    }
  }
  if (!types.includes('Dataset')) err(f, 'missing Dataset JSON-LD');
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
for (const bot of [
  'GPTBot',
  'ClaudeBot',
  'PerplexityBot',
  'Google-Extended',
  'CCBot',
  'anthropic-ai',
  'Applebot-Extended',
]) {
  if (!new RegExp(`^User-agent: ${bot}\\s*\\nAllow: /`, 'mi').test(robots)) errors.push(`robots.txt: ${bot} is not allowed`);
}
if (!robots.includes('Sitemap: https://www.chimney.services/sitemap-index.xml')) errors.push('robots.txt: missing the sitemap index');
if (/^\s*Disallow:\s*\/\s*$/m.test(robots)) errors.push('robots.txt: a Disallow: / rule is present');
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
