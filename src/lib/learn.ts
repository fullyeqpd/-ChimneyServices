// Learn guide loader. Reads src/content/learn/*.md (files starting with "_" are skipped),
// parses the format defined in LEARN-GUIDE-CONTRACT.md, validates it, and renders bodies
// with the site's markdown renderer. Any contract violation throws a build error that
// names the file and the read.
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { parse as parseCsv } from 'csv-parse/sync';
import { renderMd, renderInline, plain } from './markdown';

const LEARN_DIR = path.resolve(process.cwd(), 'src/content/learn');
const PRICES_CSV = path.resolve(process.cwd(), 'src/data/prices-national.csv');

/** The six planned hubs, in site order. Used for related-guide lists and the /learn index. */
export const LEARN_TOPICS = [
  { slug: 'chimney-inspection', name: 'Chimney inspections', blurb: 'What NFPA 211 Level 1, 2 and 3 inspections cover, when each is appropriate, and how to read a report.' },
  { slug: 'chimney-sweeping', name: 'Chimney sweeping', blurb: 'What a sweep visit includes, how often to schedule one, and what to expect to be shown.' },
  { slug: 'rain-caps', name: 'Rain caps', blurb: 'Types, materials, and when a cap needs replacing rather than repair.' },
  { slug: 'chimney-crown', name: 'Chimney crowns', blurb: 'What a crown does, how cracks are diagnosed, and repair versus rebuild.' },
  { slug: 'flue-liners', name: 'Flue liners', blurb: 'Clay, stainless and cast-in-place liners, and when relining is actually needed.' },
  { slug: 'creosote', name: 'Creosote', blurb: 'How creosote builds up, the stages, and how it is removed.' },
] as const;

export const KNOWN_TAGS = [
  'NATIONAL · NFPA 211',
  'NATIONAL · IRC',
  'NATIONAL · MANUFACTURER INSTRUCTIONS',
  'APPLIES: FREEZE-THAW CLIMATES',
  'APPLIES: MILD CLIMATES',
  'APPLIES: OLDER MASONRY HOUSING',
  'APPLIES: WOOD-BURNING',
  'APPLIES: GAS APPLIANCES',
  'APPLIES: FACTORY-BUILT SYSTEMS',
  'VARIES BY STATE',
];
export const VARIES_BY_STATE = 'VARIES BY STATE';

/** ids the hub template itself renders; read anchors and FAQ ids may not use them. */
const RESERVED_IDS = new Set(['main', 'intro', 'jump', 'reads', 'faq', 'related', 'before-you-rely', 'before-you-rely-box', 'sources', 'price', 'rail']);

/** `LEARN_FIXTURES=1` also loads `_*.md` files (test fixtures); normal builds skip them. */
export const INCLUDE_FIXTURES = process.env.LEARN_FIXTURES === '1';
/** `LEARN_ONLY=_fixture.md,creosote.md` restricts the build to those files (debugging one guide). */
const ONLY = process.env.LEARN_ONLY ? new Set(process.env.LEARN_ONLY.split(',').map((x) => x.trim())) : null;

const BODY_MIN = 400;
const BODY_MAX = 2000;
const ANCHOR_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type EvidenceClass = 'GOV' | 'DOC' | 'REF';
export interface LearnSource { cls: EvidenceClass; label: string; url: string }
export interface LearnRead {
  title: string;
  anchor: string;
  tags: string[];
  prices: string[];
  /** Price slugs in render order: `first` renders the block (id `blockId`); repeats render a link to it. */
  priceItems: { slug: string; blockId: string; first: boolean }[];
  markdown: string;
  html: string;
  sources: LearnSource[];
}
export interface LearnFaq { id: string; q: string; a: string; html: string; text: string }
export interface LearnHub {
  file: string;
  slug: string;
  title: string;
  seoTitle: string;
  /** Full frontmatter description (used on /learn and in llms.txt). */
  description: string;
  /** ≤155 chars for <meta name="description">: the description, clipped at a sentence or word boundary if longer. */
  metaDescription: string;
  updated: string; // YYYY-MM-DD
  published: string; // YYYY-MM-DD (frontmatter `published`, defaults to `updated`)
  intro: string;
  introHtml: string;
  tags: string[];
  faq: LearnFaq[];
  reads: LearnRead[];
  topicName: string;
}

export interface PriceRow {
  slug: string;
  name: string;
  unit: string;
  unitLabel: string;
  low: number | null;
  median: number | null;
  high: number | null;
  /** true when the row is quote-only or has no usable numbers: render without figures. */
  quoteOnly: boolean;
  sourceCount: number;
  sourceTypes: Record<string, number>;
  confidence: string;
  checked: string;
}

class LearnError extends Error {
  constructor(file: string, where: string | null, msg: string) {
    super(`[learn] ${file}${where ? ` › ${where}` : ''}: ${msg}`);
    this.name = 'LearnContractError';
  }
}

// ---------------------------------------------------------------- prices
let priceCache: Map<string, PriceRow> | null = null;

const PRICE_NAMES: Record<string, string> = {
  'chimney-sweep-flat': 'Chimney sweep (standard flue)',
  'level-1-inspection': 'Level 1 inspection',
  'level-2-inspection': 'Level 2 inspection',
  'level-3-inspection': 'Level 3 inspection',
  'cap-single-flue': 'Chimney cap, single flue',
  'cap-multi-flue': 'Chimney cap, multi-flue',
  'cap-full-coverage': 'Full-coverage chimney cap',
  'damper-throat': 'Throat damper replacement',
  'damper-top-sealing': 'Top-sealing damper',
  'liner-stainless-install': 'Stainless steel liner, installed',
  'liner-cast-in-place': 'Cast-in-place liner',
  'dryer-vent-cleaning': 'Dryer vent cleaning',
  'gas-fireplace-annual-service': 'Gas fireplace annual service',
  'insert-install': 'Fireplace insert installation',
  'wood-stove-install': 'Wood stove installation',
};
const UNIT_LABELS: Record<string, string> = { 'flat-job': 'per job', 'per-sq-ft': 'per sq ft', 'quote-only': 'quoted per job' };
const SOURCE_TYPE_LABELS: Record<string, [string, string]> = {
  guide: ['published cost guide', 'published cost guides'],
  company: ['company price page', 'company price pages'],
};

export function humanizeSlug(slug: string): string {
  if (PRICE_NAMES[slug]) return PRICE_NAMES[slug];
  const s = slug.replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const num = (v: string | undefined): number | null => {
  if (v == null || !/^\s*\d+(\.\d+)?\s*$/.test(v)) return null;
  return Number(v);
};

export function getPrices(): Map<string, PriceRow> {
  if (priceCache) return priceCache;
  if (!fs.existsSync(PRICES_CSV)) throw new Error(`[learn] ${path.relative(process.cwd(), PRICES_CSV)} is missing — run \`npm run ingest\` (scripts/copy-prices.mjs).`);
  const rows = parseCsv(fs.readFileSync(PRICES_CSV, 'utf8'), { columns: true, skip_empty_lines: true, relax_quotes: true, trim: true }) as Record<string, string>[];
  priceCache = new Map();
  for (const r of rows) {
    const low = num(r.low);
    const median = num(r.median);
    const high = num(r.high);
    const insufficient = [r.low, r.median, r.high, r.confidence].some((v) => /insufficient/i.test(v ?? ''));
    // unit quote-only, confidence quote-only-confirmed (research found companies price case by case) or insufficient data → no figures.
    const quoteOnly = r.unit === 'quote-only' || /^quote-only/i.test(r.confidence ?? '') || insufficient || low == null || median == null || high == null;
    const types: Record<string, number> = {};
    for (const t of (r.source_types ?? '').split(';').map((x) => x.trim()).filter(Boolean)) types[t] = (types[t] ?? 0) + 1;
    priceCache.set(r.service_slug, {
      slug: r.service_slug,
      name: humanizeSlug(r.service_slug),
      unit: r.unit,
      unitLabel: UNIT_LABELS[r.unit] ?? r.unit.replace(/-/g, ' '),
      low: quoteOnly ? null : low,
      median: quoteOnly ? null : median,
      high: quoteOnly ? null : high,
      quoteOnly,
      sourceCount: (r.source_urls ?? '').split(';').map((x) => x.trim()).filter(Boolean).length,
      sourceTypes: types,
      confidence: r.confidence ?? '',
      checked: r.checked_date ?? '',
    });
  }
  return priceCache;
}

export function describeSourceTypes(types: Record<string, number>): string {
  return Object.entries(types)
    .map(([t, n]) => {
      const [one, many] = SOURCE_TYPE_LABELS[t] ?? [`${t} source`, `${t} sources`];
      return `${n} ${n === 1 ? one : many}`;
    })
    .join(', ');
}

// ---------------------------------------------------------------- parsing
const toIsoDate = (v: unknown): string | null => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim();
  return null;
};

/** YAML turns `[APPLIES: FREEZE-THAW CLIMATES]` into a mapping; fold it back into chip text. */
const normalizeTag = (t: unknown): string[] => {
  if (typeof t === 'string') return [t.trim()];
  if (t && typeof t === 'object') return Object.entries(t as Record<string, unknown>).map(([k, v]) => `${k}: ${String(v ?? '')}`.trim());
  return [String(t)];
};
const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

export function clipDescription(text: string, max: number): string {
  if (text.length <= max) return text;
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [];
  let out = '';
  for (const sn of sentences) {
    if ((out + sn).trim().length > max) break;
    out += sn;
  }
  if (out.trim().length >= 80) return out.trim();
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:—-]+$/, '')}…`;
}

function reqString(fm: Record<string, unknown>, key: string, file: string): string {
  const v = fm[key];
  if (typeof v !== 'string' || !v.trim()) throw new LearnError(file, 'frontmatter', `"${key}" is required and must be a non-empty string`);
  return v.trim();
}

function parseFile(file: string, raw: string, warn: (m: string) => void): LearnHub {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(raw);
  } catch (e) {
    throw new LearnError(file, 'frontmatter', `YAML does not parse: ${(e as Error).message}`);
  }
  const fm = parsed.data as Record<string, unknown>;
  const slug = reqString(fm, 'slug', file);
  const expected = path.basename(file, '.md').replace(/^_/, '');
  if (slug !== expected) throw new LearnError(file, 'frontmatter', `slug "${slug}" must match the filename "${expected}"`);
  const title = reqString(fm, 'title', file);
  const seoTitle = reqString(fm, 'seoTitle', file);
  if (!seoTitle.endsWith('| Chimney.Services')) throw new LearnError(file, 'frontmatter', 'seoTitle must end with "| Chimney.Services"');
  const description = reqString(fm, 'description', file);
  let metaDescription = description;
  if (description.length > 155) {
    metaDescription = clipDescription(description, 155);
    warn(`${file} › frontmatter: description is ${description.length} chars (meta max 155) — meta tag clipped to "${metaDescription}"`);
  }
  const updated = toIsoDate(fm.updated);
  if (!updated) throw new LearnError(file, 'frontmatter', '"updated" must be a date YYYY-MM-DD');
  const published = fm.published == null ? updated : toIsoDate(fm.published);
  if (!published) throw new LearnError(file, 'frontmatter', '"published" must be a date YYYY-MM-DD when present');
  const intro = reqString(fm, 'intro', file);
  const tagsRaw = fm.tags == null ? [] : Array.isArray(fm.tags) ? fm.tags : typeof fm.tags === 'string' ? splitList(fm.tags) : [fm.tags];
  const tags = tagsRaw.flatMap(normalizeTag).filter(Boolean);

  const faqRaw = fm.faq == null ? [] : fm.faq;
  if (!Array.isArray(faqRaw)) throw new LearnError(file, 'frontmatter', '"faq" must be a list of {id, q, a}');
  const faq: LearnFaq[] = faqRaw.map((f, i) => {
    const item = (f ?? {}) as Record<string, unknown>;
    const where = `faq[${i}]`;
    for (const k of ['id', 'q', 'a']) if (typeof item[k] !== 'string' || !(item[k] as string).trim()) throw new LearnError(file, where, `"${k}" is required`);
    const id = (item.id as string).trim();
    if (!ANCHOR_RE.test(id)) throw new LearnError(file, where, `id "${id}" must be kebab-case`);
    if (!id.startsWith('faq-')) warn(`${file} › ${where}: id "${id}" should start with "faq-"`);
    const a = (item.a as string).trim();
    return { id, q: (item.q as string).trim(), a, html: renderMd(a), text: plain(a) };
  });

  // ---- reads
  const lines = parsed.content.replace(/\r\n?/g, '\n').split('\n');
  const reads: LearnRead[] = [];
  type Draft = { title: string; anchor: string; line: number; tags: string[]; prices: string[]; body: string[]; sources: LearnSource[]; state: 'meta' | 'body' | 'sources' };
  let cur: Draft | null = null;

  const finish = (d: Draft) => {
    const where = `read "${d.title}" {#${d.anchor}}`;
    if (d.state !== 'sources') throw new LearnError(file, where, 'missing "SOURCES:" line');
    if (d.sources.length === 0) throw new LearnError(file, where, 'needs at least one source line "- GOV|DOC|REF | label | https://…"');
    const markdown = d.body.join('\n').trim();
    if (markdown.length < BODY_MIN || markdown.length > BODY_MAX) {
      throw new LearnError(file, where, `body is ${markdown.length} chars; must be ${BODY_MIN}–${BODY_MAX}`);
    }
    if (d.title.length > 60) warn(`${file} › ${where}: title is ${d.title.length} chars (contract max 60)`);
    if (/\$\s?\d/.test(markdown)) warn(`${file} › ${where}: body contains a dollar figure — prices belong on the PRICE: line`);
    for (const t of d.tags) if (!KNOWN_TAGS.includes(t)) warn(`${file} › ${where}: tag "${t}" is not in the contract's chip list`);
    reads.push({ title: d.title, anchor: d.anchor, tags: d.tags, prices: d.prices, priceItems: [], markdown, html: renderMd(markdown), sources: d.sources });
  };

  lines.forEach((line, idx) => {
    const n = idx + 1;
    if (/^#\s/.test(line)) throw new LearnError(file, `line ${n}`, 'H1 ("# ") is not allowed in the body — the template renders `title` as the H1');
    if (/^##\s/.test(line)) {
      const m = line.match(/^##\s+(.+?)\s*\{#([^}\s]+)\}\s*$/);
      if (!m) throw new LearnError(file, `line ${n}`, `read heading must be "## Title {#anchor}", got: ${line.trim()}`);
      if (!ANCHOR_RE.test(m[2])) throw new LearnError(file, `line ${n}`, `anchor "#${m[2]}" must be kebab-case (a-z, 0-9, hyphens)`);
      if (cur) finish(cur);
      cur = { title: m[1], anchor: m[2], line: n, tags: [], prices: [], body: [], sources: [], state: 'meta' };
      return;
    }
    if (!cur) {
      if (line.trim()) throw new LearnError(file, `line ${n}`, 'text before the first "## Title {#anchor}" read (the intro belongs in frontmatter)');
      return;
    }
    const d: Draft = cur;
    const where = `read "${d.title}" {#${d.anchor}}, line ${n}`;
    if (d.state === 'sources') {
      if (!line.trim()) return;
      const s = line.match(/^\s*[-*]\s*(GOV|DOC|REF)\s*\|\s*(.+?)\s*\|\s*(https?:\/\/\S+)\s*$/);
      if (!s) throw new LearnError(file, where, `after SOURCES: every line must be "- CLASS | label | url" with CLASS GOV, DOC or REF; got: ${line.trim()}`);
      d.sources.push({ cls: s[1] as EvidenceClass, label: s[2], url: s[3] });
      return;
    }
    if (/^SOURCES:\s*$/.test(line)) {
      d.state = 'sources';
      return;
    }
    if (/^SOURCES:/.test(line)) throw new LearnError(file, where, '"SOURCES:" must be alone on its line, with sources on the following lines');
    if (d.state === 'meta') {
      if (!line.trim()) return;
      const tm = line.match(/^TAGS:\s*(.*)$/);
      if (tm) {
        d.tags.push(...splitList(tm[1]));
        return;
      }
      const pm = line.match(/^PRICE:\s*(.*)$/);
      if (pm) {
        d.prices.push(...splitList(pm[1]));
        return;
      }
      d.state = 'body';
    }
    if (/^(TAGS|PRICE):/.test(line)) throw new LearnError(file, where, `"${line.split(':')[0]}:" must come directly after the heading, before the body`);
    d.body.push(line);
  });
  if (cur) finish(cur);
  if (reads.length === 0) throw new LearnError(file, null, 'no reads found (expected "## Title {#anchor}" blocks)');

  // ---- ids: unique, not reserved, no read/FAQ collisions
  const seen = new Map<string, string>();
  for (const [id, label] of [...reads.map((r) => [r.anchor, `read "${r.title}"`]), ...faq.map((f) => [f.id, `FAQ "${f.q}"`])]) {
    if (id.endsWith('-title')) throw new LearnError(file, label, `anchor "#${id}" may not end in "-title" (the template uses <anchor>-title for headings)`);
    if (RESERVED_IDS.has(id) || id.startsWith('capture-') || id.startsWith('price-')) throw new LearnError(file, label, `anchor "#${id}" is reserved by the page template`);
    if (seen.has(id)) throw new LearnError(file, label, `anchor "#${id}" is already used by ${seen.get(id)}`);
    seen.set(id, label);
  }

  // ---- price slugs exist
  const prices = getPrices();
  for (const r of reads) for (const p of r.prices) {
    if (!prices.has(p)) throw new LearnError(file, `read "${r.title}" {#${r.anchor}}`, `PRICE slug "${p}" is not in PRICES-NATIONAL.csv`);
  }

  // ---- each price slug renders once per page; later mentions link back to the first block
  const rendered = new Set<string>();
  for (const r of reads) {
    r.priceItems = [...new Set(r.prices)].map((slug) => {
      const first = !rendered.has(slug);
      rendered.add(slug);
      return { slug, blockId: `price-${slug}`, first };
    });
  }

  if (reads.length < 6 || reads.length > 9) warn(`${file}: ${reads.length} reads (contract asks for 6–9)`);
  if (faq.length < 3 || faq.length > 5) warn(`${file}: ${faq.length} FAQ entries (contract asks for 3–5)`);

  const topic = LEARN_TOPICS.find((t) => t.slug === slug);
  if (!topic) warn(`${file}: slug "${slug}" is not one of the six planned hubs`);
  return {
    file,
    slug,
    title,
    seoTitle,
    description,
    metaDescription,
    updated,
    published,
    intro,
    introHtml: renderInline(intro),
    tags,
    faq,
    reads,
    topicName: topic?.name ?? title,
  };
}

// ---------------------------------------------------------------- cross-hub links
/** Links to /learn/{slug} for hubs that are not published yet are unlinked (text kept);
 *  links to a published hub's anchor that does not exist are a build error. */
function resolveLearnLinks(hubs: LearnHub[], warn: (m: string) => void) {
  const anchors = new Map(hubs.map((h) => [h.slug, new Set([...h.reads.map((r) => r.anchor), ...h.faq.map((f) => f.id)])]));
  const fix = (hub: LearnHub, where: string, html: string) =>
    html.replace(/<a href="\/learn\/([a-z0-9-]+)(?:#([^"]*))?"([^>]*)>([\s\S]*?)<\/a>/g, (whole, slug: string, frag: string | undefined, _rest, text: string) => {
      const target = anchors.get(slug);
      if (!target) {
        warn(`${hub.file} › ${where}: links to unpublished guide /learn/${slug} — rendered as plain text until it exists`);
        return text;
      }
      if (frag && !target.has(frag)) throw new LearnError(hub.file, where, `link /learn/${slug}#${frag} points at an anchor that guide does not have`);
      return whole;
    });
  for (const h of hubs) {
    h.introHtml = fix(h, 'intro', h.introHtml);
    for (const r of h.reads) r.html = fix(h, `read {#${r.anchor}}`, r.html);
    for (const f of h.faq) f.html = fix(h, `FAQ ${f.id}`, f.html);
  }
}

// ---------------------------------------------------------------- public API
let hubCache: LearnHub[] | null = null;

export function getLearnHubs(): LearnHub[] {
  if (hubCache) return hubCache;
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);
  const files = fs.existsSync(LEARN_DIR)
    ? fs.readdirSync(LEARN_DIR).filter((f) => f.endsWith('.md') && !f.startsWith('.') && (INCLUDE_FIXTURES || !f.startsWith('_')) && (!ONLY || ONLY.has(f))).sort()
    : [];
  const hubs = files.map((f) => parseFile(`src/content/learn/${f}`, fs.readFileSync(path.join(LEARN_DIR, f), 'utf8'), warn));
  const order = (slug: string) => {
    const i = LEARN_TOPICS.findIndex((t) => t.slug === slug);
    return i === -1 ? 99 : i;
  };
  hubs.sort((a, b) => order(a.slug) - order(b.slug) || a.slug.localeCompare(b.slug));
  resolveLearnLinks(hubs, warn);
  if (warnings.length) console.warn(`[learn] ${warnings.length} warning(s):\n  ${[...new Set(warnings)].join('\n  ')}`);
  hubCache = hubs;
  return hubs;
}
