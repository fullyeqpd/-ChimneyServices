// Services catalogue (/services). One entry per job a chimney or hearth company
// sells, loaded from src/data/services.json so the list can grow without the
// template changing.
//
// The rules this file enforces, because the page is worthless if they slip:
//   - slugs are unique, kebab-case, and become the page's stable anchors;
//   - a priceSlug must exist in the researched national price file, and may be
//     used by only one service, so a range is rendered once per page;
//   - a learn path must point at a published guide hub;
//   - every entry carries what it is, when it is needed, and what to ask for.
// Any violation throws at build time, naming the entry.
import raw from '../data/services.json';
import { getPrices, LEARN_TOPICS } from './learn';

export type ServiceGroupId =
  | 'inspection'
  | 'cleaning'
  | 'masonry'
  | 'metal'
  | 'weather'
  | 'installation'
  | 'diagnostics'
  | 'related';

export interface ServiceEntry {
  slug: string;
  name: string;
  group: ServiceGroupId;
  /** 2–4 plain sentences: what the work is and what it is for. */
  what: string;
  /** When it is actually needed, or what triggers it. */
  when: string;
  /** Standard named, never a section number we are not certain of. */
  standard: string | null;
  /** What to ask for in writing, or what evidence to expect. */
  askFor: string;
  /** A slug from the researched national price file, or null. */
  priceSlug: string | null;
  /** Path to the matching guide hub, or null. */
  learn: string | null;
  /** The known scare-sell around this job and how to check it. Null elsewhere. */
  upsellNote: string | null;
  /** Licensing, permits or what is allowed differ by state: link /rights and /licensing. */
  variesByState: boolean;
}

export interface ServiceGroup {
  id: ServiceGroupId;
  /** Short label, used in the jump chips. */
  label: string;
  /** Question-phrased H2 for the group. */
  heading: string;
  /** One sentence under the heading. */
  blurb: string;
}

/** Group order is the page order. */
export const SERVICE_GROUPS: ServiceGroup[] = [
  {
    id: 'inspection',
    label: 'Inspection',
    heading: 'What do chimney inspections cover?',
    blurb:
      'NFPA 211 sorts inspections into three levels by how much access they need. The level you are buying should be named before the work, not after it.',
  },
  {
    id: 'cleaning',
    label: 'Cleaning',
    heading: 'What does a chimney cleaning actually include?',
    blurb:
      'Cleaning removes what has built up. It is a separate job from inspecting, even when one visit covers both, and it is priced by what is being cleaned.',
  },
  {
    id: 'masonry',
    label: 'Repair — masonry',
    heading: 'Which chimney repairs are masonry work?',
    blurb:
      'Brick, mortar, firebrick and concrete: the parts of a chimney that fail slowly, mostly because of water, and get repaired in the same order every time.',
  },
  {
    id: 'metal',
    label: 'Repair — metal & components',
    heading: 'Which chimney parts are metal, and what happens when they fail?',
    blurb:
      'Caps, covers, dampers, flashing and liners are manufactured components. Each one is listed for a purpose, and each has a failure you can be shown.',
  },
  {
    id: 'weather',
    label: 'Waterproofing & weather',
    heading: 'What keeps water out of a chimney?',
    blurb:
      'Most chimney repair is really about water, so several jobs exist only to keep it out of the masonry or to undo what it already did.',
  },
  {
    id: 'installation',
    label: 'Installation',
    heading: 'What does a chimney company install?',
    blurb:
      'Appliances, venting and the structure around them. Manufacturer instructions are the specification here, and permits and licensing vary by state.',
  },
  {
    id: 'diagnostics',
    label: 'Diagnostics & problems',
    heading: 'What gets diagnosed when something is wrong?',
    blurb:
      'Smoke, smells, water and carbon monoxide are symptoms. These are the jobs that find the cause before anyone sells you the cure.',
  },
  {
    id: 'related',
    label: 'Related work',
    heading: 'What else gets sold alongside chimney work?',
    blurb:
      'Work chimney companies often do because they are already there. It is useful, it is not chimney work, and it belongs on its own line of the invoice.',
  },
];

const GROUP_IDS = new Set(SERVICE_GROUPS.map((g) => g.id));
const LEARN_PATHS = new Set(LEARN_TOPICS.map((t) => `/learn/${t.slug}`));
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** ids the page template renders itself; a service slug may never take one. */
const RESERVED_IDS = new Set(['main', 'intro', 'jump', 'faq', 'before-you-rely', 'before-you-rely-box', 'services']);

class ServicesError extends Error {
  constructor(where: string, msg: string) {
    super(`[services] ${where}: ${msg}`);
    this.name = 'ServicesContractError';
  }
}

let cache: ServiceEntry[] | null = null;

export function getServices(): ServiceEntry[] {
  if (cache) return cache;
  const rows = (raw as { services: unknown[] }).services;
  if (!Array.isArray(rows) || rows.length === 0) throw new ServicesError('src/data/services.json', 'no services');

  const prices = getPrices();
  const seen = new Set<string>();
  const pricesUsed = new Map<string, string>();
  const out: ServiceEntry[] = [];

  rows.forEach((r, i) => {
    const s = (r ?? {}) as Record<string, unknown>;
    const where = typeof s.slug === 'string' ? `"${s.slug}"` : `entry ${i + 1}`;
    for (const key of ['slug', 'name', 'group', 'what', 'when', 'askFor']) {
      if (typeof s[key] !== 'string' || !(s[key] as string).trim()) throw new ServicesError(where, `"${key}" is required`);
    }
    const slug = (s.slug as string).trim();
    if (!SLUG_RE.test(slug)) throw new ServicesError(where, `slug "${slug}" must be kebab-case`);
    if (RESERVED_IDS.has(slug)) throw new ServicesError(where, `slug "${slug}" is reserved by the page template`);
    if (seen.has(slug)) throw new ServicesError(where, `slug "${slug}" is used twice`);
    seen.add(slug);

    const group = s.group as ServiceGroupId;
    if (!GROUP_IDS.has(group)) throw new ServicesError(where, `group "${String(s.group)}" is not one of ${[...GROUP_IDS].join(', ')}`);

    const priceSlug = s.priceSlug == null ? null : String(s.priceSlug);
    if (priceSlug) {
      if (!prices.has(priceSlug)) throw new ServicesError(where, `priceSlug "${priceSlug}" is not in the national price file`);
      if (pricesUsed.has(priceSlug)) throw new ServicesError(where, `priceSlug "${priceSlug}" is already used by "${pricesUsed.get(priceSlug)}" — a range renders once per page`);
      pricesUsed.set(priceSlug, slug);
    }

    const learn = s.learn == null ? null : String(s.learn);
    if (learn && !LEARN_PATHS.has(learn)) throw new ServicesError(where, `learn "${learn}" is not a guide hub`);

    const what = (s.what as string).trim();
    if (/\$\s?\d/.test(what) || /\$\s?\d/.test((s.when as string) ?? '')) throw new ServicesError(where, 'no dollar figures in prose — that is what priceSlug is for');

    out.push({
      slug,
      name: (s.name as string).trim(),
      group,
      what,
      when: (s.when as string).trim(),
      standard: s.standard == null ? null : String(s.standard).trim(),
      askFor: (s.askFor as string).trim(),
      priceSlug,
      learn,
      upsellNote: s.upsellNote == null ? null : String(s.upsellNote).trim(),
      variesByState: s.variesByState === true,
    });
  });

  cache = out;
  return out;
}

/** Services in page order: group order first, then the order of the data file. */
export function getServiceGroups(): { group: ServiceGroup; services: ServiceEntry[] }[] {
  const all = getServices();
  return SERVICE_GROUPS.map((group) => ({ group, services: all.filter((s) => s.group === group.id) })).filter(
    (g) => g.services.length > 0,
  );
}

/** The chips over a service: the standards it answers to, plus the state caveat. */
export function serviceTags(s: ServiceEntry): string[] {
  const tags: string[] = [];
  const standard = (s.standard ?? '').toLowerCase();
  if (standard.includes('nfpa 211')) tags.push('NATIONAL · NFPA 211');
  if (standard.includes('irc')) tags.push('NATIONAL · IRC');
  if (standard.includes('manufacturer')) tags.push('NATIONAL · MANUFACTURER INSTRUCTIONS');
  if (s.variesByState) tags.push('VARIES BY STATE');
  return tags;
}

/** The guide hub's own name, for the "more on this" link. */
export function learnName(path: string): string {
  const slug = path.replace(/^\/learn\//, '');
  return LEARN_TOPICS.find((t) => t.slug === slug)?.name ?? 'the guide';
}

export const SERVICES_UPDATED: string = String((raw as { updated?: string }).updated ?? '');
