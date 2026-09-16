#!/usr/bin/env node
// Chimney.Services laws site — research ingest.
//
// Reads the research folders (READ ONLY — never writes to them) and produces:
//   src/content/states/{slug}.json   one file per rights-research-{state}.md
//   src/data/rights-table.json       RIGHTS-TABLE.csv rows
//   src/data/licensing.json          LICENSING-MATRIX.csv + INSURANCE-REQUIREMENTS.csv rows
//   src/data/ingest-report.json      what was derived, what fell back, CSV problems
//   public/data/rights-table.csv     CSV copy with attribution comment line
//   public/data/licensing-matrix.csv CSV copy with attribution comment line
//
// Rerun any time: `npm run ingest`. The build never touches the research folders,
// so the generated JSON is what ships (and what Cloudflare Pages builds from).
//
// Research locations default to the sibling folders of this repo and can be
// overridden with RIGHTS_DIR / LICENSING_DIR environment variables.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsv } from './lib/csv.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(here, '..');
const RIGHTS_DIR = path.resolve(process.env.RIGHTS_DIR ?? path.join(SITE, '..', 'rights-research'));
const LICENSING_DIR = path.resolve(process.env.LICENSING_DIR ?? path.join(SITE, '..', 'licensing-research'));
const OUT_STATES = path.join(SITE, 'src', 'content', 'states');
const OUT_DATA = path.join(SITE, 'src', 'data');
const OUT_PUBLIC_DATA = path.join(SITE, 'public', 'data');

const SEE = 'SEE SECTION';

// ---------------------------------------------------------------------------
// Reference data (geography only — no legal facts live in this script)
// ---------------------------------------------------------------------------
export const STATES = {
  alabama: ['Alabama', 'AL'], alaska: ['Alaska', 'AK'], arizona: ['Arizona', 'AZ'], arkansas: ['Arkansas', 'AR'],
  california: ['California', 'CA'], colorado: ['Colorado', 'CO'], connecticut: ['Connecticut', 'CT'],
  delaware: ['Delaware', 'DE'], 'district-of-columbia': ['District of Columbia', 'DC'], florida: ['Florida', 'FL'],
  georgia: ['Georgia', 'GA'], hawaii: ['Hawaii', 'HI'], idaho: ['Idaho', 'ID'], illinois: ['Illinois', 'IL'],
  indiana: ['Indiana', 'IN'], iowa: ['Iowa', 'IA'], kansas: ['Kansas', 'KS'], kentucky: ['Kentucky', 'KY'],
  louisiana: ['Louisiana', 'LA'], maine: ['Maine', 'ME'], maryland: ['Maryland', 'MD'], massachusetts: ['Massachusetts', 'MA'],
  michigan: ['Michigan', 'MI'], minnesota: ['Minnesota', 'MN'], mississippi: ['Mississippi', 'MS'], missouri: ['Missouri', 'MO'],
  montana: ['Montana', 'MT'], nebraska: ['Nebraska', 'NE'], nevada: ['Nevada', 'NV'], 'new-hampshire': ['New Hampshire', 'NH'],
  'new-jersey': ['New Jersey', 'NJ'], 'new-mexico': ['New Mexico', 'NM'], 'new-york': ['New York', 'NY'],
  'north-carolina': ['North Carolina', 'NC'], 'north-dakota': ['North Dakota', 'ND'], ohio: ['Ohio', 'OH'],
  oklahoma: ['Oklahoma', 'OK'], oregon: ['Oregon', 'OR'], pennsylvania: ['Pennsylvania', 'PA'], 'rhode-island': ['Rhode Island', 'RI'],
  'south-carolina': ['South Carolina', 'SC'], 'south-dakota': ['South Dakota', 'SD'], tennessee: ['Tennessee', 'TN'],
  texas: ['Texas', 'TX'], utah: ['Utah', 'UT'], vermont: ['Vermont', 'VT'], virginia: ['Virginia', 'VA'],
  washington: ['Washington', 'WA'], 'west-virginia': ['West Virginia', 'WV'], wisconsin: ['Wisconsin', 'WI'], wyoming: ['Wyoming', 'WY'],
};
const ABBR_TO_SLUG = Object.fromEntries(Object.entries(STATES).map(([slug, [, abbr]]) => [abbr, slug]));
const NAME_TO_SLUG = Object.fromEntries(Object.entries(STATES).map(([slug, [name]]) => [name.toLowerCase(), slug]));

const NEIGHBORS = {
  AL: 'FL GA MS TN', AK: '', AZ: 'CA CO NM NV UT', AR: 'LA MO MS OK TN TX', CA: 'AZ NV OR', CO: 'AZ KS NE NM OK UT WY',
  CT: 'MA NY RI', DE: 'MD NJ PA', DC: 'MD VA', FL: 'AL GA', GA: 'AL FL NC SC TN', HI: '', ID: 'MT NV OR UT WA WY',
  IL: 'IN IA KY MO WI', IN: 'IL KY MI OH', IA: 'IL MN MO NE SD WI', KS: 'CO MO NE OK', KY: 'IL IN MO OH TN VA WV',
  LA: 'AR MS TX', ME: 'NH', MD: 'DE PA VA WV DC', MA: 'CT NH NY RI VT', MI: 'IN OH WI', MN: 'IA ND SD WI',
  MS: 'AL AR LA TN', MO: 'AR IL IA KS KY NE OK TN', MT: 'ID ND SD WY', NE: 'CO IA KS MO SD WY', NV: 'AZ CA ID OR UT',
  NH: 'ME MA VT', NJ: 'DE NY PA', NM: 'AZ CO OK TX UT', NY: 'CT MA NJ PA VT', NC: 'GA SC TN VA', ND: 'MN MT SD',
  OH: 'IN KY MI PA WV', OK: 'AR CO KS MO NM TX', OR: 'CA ID NV WA', PA: 'DE MD NJ NY OH WV', RI: 'CT MA', SC: 'GA NC',
  SD: 'IA MN MT NE ND WY', TN: 'AL AR GA KY MS MO NC VA', TX: 'AR LA NM OK', UT: 'AZ CO ID NV NM WY', VT: 'MA NH NY',
  VA: 'KY MD NC TN WV DC', WA: 'ID OR', WV: 'KY MD OH PA VA', WI: 'IL IA MI MN', WY: 'CO ID MT NE SD UT',
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Section number → page placement. Titles are neutral read titles; the research
// heading's own wording is kept in `rawHeading`.
const SECTION_MAP = {
  '1': { key: 'licensing', anchor: 'license', group: 'licensing', title: 'State licensing and registration' },
  '1a': { key: 'licensing-certificates', anchor: 'sweep-certificates', group: 'licensing', title: null },
  '2': { key: 'qualified-gap', anchor: 'qualified-gap', group: 'licensing', title: 'What the credential does not test' },
  '3': { key: 'home-sale', anchor: 'home-sale', group: 'home-sale', title: 'Seller disclosure when a home sells' },
  '4': { key: 'remedies', anchor: 'remedies', group: 'remedies', title: 'Consumer remedies and cancellation rights' },
  '5': { key: 'permits', anchor: 'permits', group: 'permits', title: 'Permits and building codes' },
  '6': { key: 'co-law', anchor: 'co-law', group: 'co', title: 'Carbon monoxide and smoke alarm law' },
  '7': { key: 'solid-fuel', anchor: 'solid-fuel', group: 'permits', title: 'Solid fuel and environmental rules' },
  '7-8': { key: 'environment-scams', anchor: 'environment-scams', group: 'remedies', title: 'Environmental rules and scam patterns' },
  '8': { key: 'scams', anchor: 'scams', group: 'remedies', title: 'Scam patterns and enforcement' },
  '9': { key: 'season', anchor: 'season', group: 'season', title: 'Season calendar' },
  '10': { key: 'price-seeding', anchor: 'price-seeding', group: null, title: 'Price seeding (internal)' },
  '11': { key: 'table-row', anchor: 'table-row', group: null, title: '/rights table row (internal)' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
const stripMd = (s) =>
  clean(
    (s ?? '')
      .replace(/\*\*|__/g, '')
      .replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|[.,;:)]|$)/g, '$1$2')
      .replace(/`/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'),
  );

function toIsoDate(text) {
  if (!text) return null;
  const t = clean(text.replace(/\*\*/g, ''));
  let m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    return `${m[3]}-${String(mo).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  }
  m = t.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})/);
  if (m && MONTHS.includes(m[2].slice(0, 3).toLowerCase())) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    return `${m[3]}-${String(mo).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  m = t.match(/\b([A-Za-z]{3,9})\.?\s+(\d{4})\b/);
  if (m && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    return `${m[2]}-${String(mo).padStart(2, '0')}-01`;
  }
  return null;
}
const monthLabel = (iso) => (iso ? `${MONTH_LABEL[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : null);

function truncate(s, max) {
  const t = clean(s);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:—–-]+$/, '')}…`;
}

function sentences(text) {
  return clean(text)
    .split(/(?<=[.!?])\s+(?=[A-Z0-9*(“"§])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Split a heading's trailing parenthetical into evidence chips + note. */
function splitHeading(raw) {
  let title = raw.trim();
  let paren = null;
  const m = title.match(/^(.*?)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$/);
  if (m) {
    title = m[1].trim();
    paren = m[2].trim();
  }
  const evidence = [];
  let note = null;
  if (paren) {
    const head = paren.split(/\s+[—–-]\s+|;/)[0];
    for (const cls of ['GOV', 'DOC', 'REF']) if (new RegExp(`\\b${cls}\\b`).test(head)) evidence.push(cls);
    note = clean(
      paren
        .replace(/\b(GOV|DOC|REF)\b\s*(\/\s*(GOV|DOC|REF)\b)*/g, '')
        .replace(/^[\s/—–;,:-]+/, ''),
    );
    if (!note) note = null;
    // A parenthetical with no evidence class is still stripped from the heading
    // (e.g. "(code-based — medium)") and shown as the note.
  }
  return { title, evidence, note };
}

// ---------------------------------------------------------------------------
// Research file parsing
// ---------------------------------------------------------------------------
function parseResearchFile(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const slug = path.basename(file).replace(/^rights-research-/, '').replace(/\.md$/, '');
  const ref = STATES[slug];
  if (!ref) throw new Error(`Unknown state slug from filename: ${slug}`);
  const titleLine = lines.find((l) => /^#\s+/.test(l)) ?? '';
  const nameFromFile = clean(titleLine.replace(/^#\s+/, '').replace(/^Rights Research\s*[—–-]\s*/i, ''));

  // Header = lines between the H1 and the first ## heading.
  const firstSection = lines.findIndex((l, i) => i > 0 && /^##\s/.test(l));
  const headerText = lines.slice(1, firstSection === -1 ? 3 : firstSection).join('\n').trim();
  const researchedMatch = headerText.match(/Researched\s+([A-Za-z]+\.?\s+\d{1,2},?\s+\d{4}|[A-Za-z]+\.?\s+\d{4}|\d{4}-\d{2}-\d{2})/);
  const researched = toIsoDate(researchedMatch?.[1]);
  const citedMatch = headerText.match(/Laws cited as of\s+([A-Za-z]+\.?\s+\d{4}|\d{4}-\d{2}(?:-\d{2})?)/);
  const lawsCitedAs = citedMatch ? clean(citedMatch[1]) : null;
  // Only research corrections are surfaced from the header; other header prose
  // (e.g. internal hypothesis checks) stays in the research file.
  const headerRest = clean(headerText.split('\n')[0].replace(/Researched[^.]*\./, '').replace(/Laws cited as of[^.]*\./, ''));
  const headerNote = /CORRECTED/i.test(headerRest) ? headerRest : null;

  // Split into blocks on ## / ### headings that we recognise as top-level.
  const blocks = [];
  let cur = null;
  const isTop = (l) =>
    /^##\s+\d+[a-z]?\s*([–-]\s*\d+)?\s*·/.test(l) ||
    /^##\s+The story/i.test(l) ||
    /^#{2,3}\s+Publish blockers/i.test(l) ||
    /^#{2,3}\s+Verification pass/i.test(l) ||
    /^#{2,3}\s+FAQ/i.test(l) ||
    /^##\s+/.test(l);
  for (const line of lines.slice(firstSection === -1 ? lines.length : firstSection)) {
    if (isTop(line)) {
      if (cur) blocks.push(cur);
      cur = { heading: line.replace(/^#+\s+/, '').trim(), level: line.match(/^#+/)[0].length, body: [] };
    } else if (cur) {
      cur.body.push(line);
    }
  }
  if (cur) blocks.push(cur);

  const sections = [];
  let story = null;
  let faqSeeds = null;
  const verifications = [];
  const unknownBlocks = [];
  let publishBlockersPresent = false;

  for (const b of blocks) {
    const body = b.body.join('\n').trim();
    const num = b.heading.match(/^(\d+[a-z]?)\s*(?:[–-]\s*(\d+))?\s*·\s*(.*)$/);
    if (num) {
      const number = num[2] ? `${num[1]}-${num[2]}` : num[1];
      const { title: rawTitle, evidence, note } = splitHeading(num[3]);
      const map = SECTION_MAP[number] ?? { key: `section-${number}`, anchor: `section-${number}`, group: null, title: null };
      sections.push({
        number,
        key: map.key,
        anchor: map.anchor,
        group: map.group,
        rawHeading: b.heading,
        researchTitle: rawTitle,
        title: map.title ?? rawTitle,
        evidence,
        confidenceNote: note,
        markdown: body,
      });
    } else if (/^The story/i.test(b.heading)) {
      story = { heading: b.heading, markdown: body };
    } else if (/^Publish blockers/i.test(b.heading)) {
      publishBlockersPresent = true; // never rendered, never copied
    } else if (/^Verification pass/i.test(b.heading)) {
      verifications.push({ heading: b.heading, body });
    } else if (/^FAQ/i.test(b.heading)) {
      faqSeeds = parseFaqSeeds(body);
    } else {
      unknownBlocks.push(b.heading);
    }
  }

  // Verification: the LAST verification pass wins.
  let verified = null;
  let publishVerdict = 'UNVERIFIED';
  let publishVerdictNote = null;
  let verification = null;
  if (verifications.length) {
    const v = verifications[verifications.length - 1];
    const checked = v.body.match(/Checked\s+(?:on\s+)?([^\n]*?)(?:\s+by\b|\.|\n|$)/i);
    verified = toIsoDate(checked?.[1]) ?? toIsoDate(v.heading);
    const verdictLine = v.body
      .split('\n')
      .map((l) => l.replace(/\*\*/g, '').trim())
      .find((l) => /Publish verdict\s*:/i.test(l));
    if (verdictLine) {
      const vm = verdictLine.match(/Publish verdict\s*:\s*(READY WITH CAVEATS|DO NOT PUBLISH|READY)\b\s*(.*)$/i);
      if (vm) {
        publishVerdict = vm[1].toUpperCase();
        let note = clean(vm[2]).replace(/^[\s.;:—–-]+/, '');
        if (/^\(.*\)$/.test(note) && !/^\(\d\)/.test(note)) note = note.slice(1, -1);
        publishVerdictNote = note || null;
      }
    }
    const items = v.body
      .split('\n')
      .filter((l) => !/Publish verdict\s*:/i.test(l.replace(/\*\*/g, '')))
      .join('\n')
      .trim();
    verification = { heading: v.heading, checked: verified, markdown: items };
  }

  return {
    slug,
    name: nameFromFile || ref[0],
    abbr: ref[1],
    sourceFile: path.basename(file),
    researched,
    lawsCitedAs,
    headerNote,
    verified,
    publishVerdict,
    publishVerdictNote,
    verification,
    sections,
    story,
    faqSeeds,
    publishBlockersPresent,
    unknownBlocks,
  };
}

function parseFaqSeeds(body) {
  const out = [];
  // Format A: "**Q: question?**" / "Q: ..." followed by "A: ..." lines.
  const lines = body.split('\n');
  let q = null;
  let a = [];
  const flush = () => {
    if (q && a.join(' ').trim()) out.push({ q: stripMd(q), a: a.join('\n').trim() });
    q = null;
    a = [];
  };
  for (const raw of lines) {
    const l = raw.trim();
    const qm = l.match(/^(?:[-*]\s*)?(?:\*\*)?(?:Q\d*[:.]|###\s+)\s*(.+?)(?:\*\*)?$/);
    if (qm) {
      flush();
      q = qm[1].replace(/\*\*/g, '');
      continue;
    }
    if (q) a.push(l.replace(/^(?:\*\*)?A[:.]\s*(?:\*\*)?/, ''));
  }
  flush();
  return out.length ? out : null;
}

// Parse "License: **...** · Disclosure law: **...**" from §11 when a state has no CSV row.
function parseSection11(sec11) {
  if (!sec11) return {};
  const out = {};
  const text = sec11.markdown.replace(/\n/g, ' ');
  for (const part of text.split(/\s·\s/)) {
    const m = part.match(/^\s*([^:]{2,40}):\s*(.+)$/);
    if (m) out[clean(m[1]).toLowerCase()] = stripMd(m[2]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Verdict grid — conservative derivation. Every rule only fires on explicit
// wording in the CSV row or the state's own section text; otherwise SEE SECTION.
// ---------------------------------------------------------------------------
const OTHER_STATE_NAMES = Object.values(STATES).map(([n]) => n);
function mentionsOtherState(sentence, own) {
  return OTHER_STATE_NAMES.some((n) => {
    if (n === own) return false;
    if (own === 'District of Columbia' && n === 'Washington') return false;
    const re = n === 'Virginia' ? /(?<!West )\bVirginia\b/ : new RegExp(`\\b${n}\\b`);
    if (!re.test(sentence)) return false;
    // "Kansas City" in a Missouri file, "Washington County" etc. are not other states.
    if (new RegExp(`\\b${n} (City|County)\\b`).test(sentence) && !new RegExp(`\\b${n}\\b(?! (City|County))`).test(sentence)) return false;
    return true;
  });
}

function remainderNote(cell) {
  // Drop the leading YES/NO token so the note carries only the qualifier.
  // Only a bare "YES —" / "NO:" lead-in is dropped; "NONE statewide…" keeps its words.
  return truncate(clean(cell).replace(/^(YES|NO|NONE|Yes|No|None)\s*[—–:,-]\s*/, ''), 96);
}

function deriveLicense(regime, sec1) {
  const v = clean(regime);
  const r = { answer: SEE, note: null, rule: null };
  if (!v) return r;
  if (/^YES[- ]?ish/i.test(v)) return { answer: SEE, note: truncate(v, 96), rule: 'license:qualified-yes→see' };
  if (/^YES\b/.test(v)) return { answer: 'YES', note: remainderNote(v), rule: 'license:YES' };
  if (/^THRESHOLD\b|^Threshold-only/i.test(v)) {
    const amt = v.match(/(?:>=|≥|>)\s*\$\s*([\d,]+)|\$([\d,]+)\s*\+/);
    const a = amt ? (amt[1] ?? amt[2]) : null;
    return a
      ? { answer: `ONLY ≥ $${a}`, note: remainderNote(v.replace(/^(THRESHOLD|Threshold-only)\s*[—–-]\s*/i, '')), rule: 'license:THRESHOLD' }
      : { answer: SEE, note: truncate(v, 96), rule: 'license:threshold-no-amount' };
  }
  const regMention = /registration|\bREGISTER/i.test(v);
  const noReg = /no (state )?(license or )?registration|no registry|registration of any kind|nothing statewide/i;
  const noAll = /no state license or registration|nothing statewide|no .*registration of any kind/i;
  if (/^(NO|NONE|None|no)\b/.test(v)) {
    if (noAll.test(v)) return { answer: 'NO', note: remainderNote(v), rule: 'license:NO-nothing' };
    const regContexts = [...v.matchAll(/regist\w*/gi)].map((m) => v.slice(Math.max(0, m.index - 50), m.index + 50));
    const realReg = regContexts.some((c) => !/roof|replaced|former|repealed|tax|city|local|municipal|county/i.test(c));
    if (regMention && realReg && !noReg.test(v)) {
      return { answer: 'REGISTRATION ONLY', note: remainderNote(v), rule: 'license:NO+registration' };
    }
    // "No chimney license; residential license only > $2,500" → the threshold is the answer.
    const thr = v.match(/license[^;.]{0,40}?\bonly\b[^;.$]{0,40}?(>=|≥|>|over|above|exceeds?|at)\s*\$\s*([\d,]+)/i);
    if (thr) {
      const op = /^(>=|≥|at)$/i.test(thr[1]) ? '≥' : '>';
      return { answer: `ONLY ${op} $${thr[2]}`, note: remainderNote(v), rule: 'license:NO+threshold' };
    }
    if (/^NO (state )?competency license/i.test(v) && /\blicen[cs]e\b/i.test(v.replace(/^NO (state )?competency license/i, ''))) {
      return { answer: 'LICENSE, NO EXAM', note: remainderNote(v), rule: 'license:non-competency-license' };
    }
    return { answer: 'NO', note: remainderNote(v), rule: 'license:NO' };
  }
  if (/^registration\b/i.test(v) || /^REGISTRATION\b/.test(v)) {
    return { answer: 'REGISTRATION ONLY', note: remainderNote(v.replace(/^registration\s*/i, '')), rule: 'license:registration' };
  }
  return { answer: SEE, note: truncate(v, 96), rule: 'license:unmatched' };
}

function deriveExam(licenseAnswer, regime, sec1, sec2, stateName) {
  const v = clean(regime);
  if (licenseAnswer === 'NO') {
    return { answer: 'NO STATE EXAM', note: 'No state license covers this work statewide', rule: 'exam:no-license' };
  }
  if (licenseAnswer === 'LICENSE, NO EXAM') {
    return { answer: 'NO STATE EXAM', note: 'The state credential has no competency exam', rule: 'exam:non-competency-license' };
  }
  if (licenseAnswer === 'REGISTRATION ONLY' && /no exam|exam-free|no (state )?competency|without (an )?exam/i.test(v)) {
    return { answer: 'NO STATE EXAM', note: 'Registration without a competency exam', rule: 'exam:registration-no-exam' };
  }
  const gap = sec2 ? stripMd(sec2.markdown) : '';
  const hit = sentences(gap).find(
    (s) =>
      /\b(nothing|not|never|no)\b[^.]{0,90}\b(chimney|flue)/i.test(s) &&
      /\b(exam|test|tests|tested|credential|license)\b/i.test(s) &&
      !mentionsOtherState(s, stateName),
  );
  if (hit && licenseAnswer !== SEE) {
    return { answer: 'NO', note: 'The credential does not test chimney or flue work', rule: 'exam:§2-negative', evidence: truncate(hit, 240) };
  }
  return { answer: SEE, note: null, rule: 'exam:unmatched' };
}

function deriveInspection(sec3, coCell) {
  const t = sec3 ? stripMd(sec3.markdown) : '';
  const hit = sentences(t).find((s) =>
    /no (chimney )?inspection (is )?(mandated|required)|no statute mandates a chimney inspection|no inspection (mandate|requirement)|no (state|statutory) (chimney )?inspection|inspection is not (mandated|required)|does not (require|mandate) (an |a )?(chimney )?inspection|no .{0,25}inspection.{0,25}(mandated|required) at (transfer|sale|closing)/i.test(
      s,
    ),
  );
  if (!hit) return { answer: SEE, note: null, rule: 'inspection:unmatched' };
  const co = coCell ?? '';
  const saleTrigger =
    /pre-sale|at sale|point-of-sale|at closing|sale trigger|sale-triggered|sale\/lease|at transfer/i.test(co) &&
    !/\bno (pre-sale|point-of-sale|at-sale|sale)|none .*sale|\bno [^;.]{0,25}(pre-sale|at-sale|point-of-sale)/i.test(co);
  return {
    answer: 'NO',
    note: saleTrigger ? 'No chimney inspection mandated; a CO/smoke rule applies at sale' : 'No chimney inspection mandated at transfer',
    rule: 'inspection:§3-negative',
    evidence: truncate(hit, 240),
  };
}

function deriveCancel(cell, sec4) {
  const v = clean(cell);
  if (/^yes\b/i.test(v)) return { answer: 'YES', note: remainderNote(v) || null, rule: 'cancel:YES' };
  if (/^no\b/i.test(v)) return { answer: 'NO', note: remainderNote(v) || null, rule: 'cancel:NO' };
  const t = sec4 ? stripMd(sec4.markdown) : '';
  const hit = sentences(t).find(
    (s) =>
      /(cancel|revoke|rescind)[^.]{0,80}\b(\d+|three|five)[- ](business[- ]|calendar[- ])?day|\b(\d+|three|five)[- ](business[- ]|calendar[- ])?days?[^.]{0,80}(cancel|revoke|rescind)/i.test(s) &&
      !/\bno (right to )?cancel/i.test(s),
  );
  if (hit) {
    const d = hit.match(/\b(\d+|three|five)[- ](business[- ]|calendar[- ])?day/i);
    const kind = d[2] ? `${clean(d[2].replace('-', ' '))} ` : '';
    return {
      answer: 'YES',
      note: `${d[1]} ${kind}day window — conditions in the remedies section`,
      rule: 'cancel:§4-sentence',
      evidence: truncate(hit, 240),
    };
  }
  return { answer: SEE, note: null, rule: 'cancel:unmatched' };
}

function deriveCo(cell) {
  const v = clean(cell);
  if (!v) return { answer: SEE, note: null, rule: 'co:empty' };
  if (/^UNVERIFIED/i.test(v)) return { answer: SEE, note: truncate(v, 96), rule: 'co:unverified' };
  if (/^(NONE|None|none statewide|no state statute|no statewide)/i.test(v)) {
    return { answer: 'NO STATE LAW', note: remainderNote(v), rule: 'co:none' };
  }
  if (/^(Broad|Strong|STRONG|YES)\b/i.test(v)) return { answer: 'YES', note: remainderNote(v.replace(/^(Broad|Strong)\s*/i, '')), rule: 'co:yes' };
  if (/^(WEAK|THIN|NARROW|limited|code-only|code-based|new construction only|new-construction code only|rentals only|Code\b)/i.test(v)) {
    return { answer: 'LIMITED', note: remainderNote(v), rule: 'co:limited' };
  }
  return { answer: SEE, note: truncate(v, 96), rule: 'co:unmatched' };
}

function deriveSue(state, texts) {
  const own = state.name;
  const pattern =
    /(cannot|can't|can not|may not|could not|no right to|barred from|unable to|shall not)\s+(even\s+)?(sue|bring (or maintain )?(a |an |any )?(suit|action)|recover|collect|enforce|file a lien)|\bno suit\b|\bcan'?t (even )?sue\b|\bnot (be )?(able to )?sue\b/i;
  const who = /(unlicensed|unregistered|without (a |the )?(license|registration)|not (licensed|registered))/i;
  for (const { ref, text } of texts) {
    for (const s of sentences(stripMd(text))) {
      if (!pattern.test(s) || !who.test(s)) continue;
      if (mentionsOtherState(s, own)) continue;
      // Local-only rules ("where a locality requires a license…") are not a statewide answer.
      if (/\b(locality|localities|municipal|city|cities|county|counties)\b/i.test(s)) continue;
      // Negated or qualified statements are left to the section.
      if (/\b(not true|nuanced|quantum meruit|unverified|unconfirmed)\b/i.test(s)) continue;
      return {
        answer: 'NO',
        note: 'Where a license or registration is required, an unlicensed contractor cannot sue to collect',
        rule: `sue:${ref}-sentence`,
        evidence: truncate(s, 240),
        ref,
      };
    }
  }
  return { answer: SEE, note: null, rule: 'sue:unmatched' };
}

function sectionAnchor(state, number, fallback) {
  const s = state.sections.find((x) => x.number === number);
  return s ? s.anchor : fallback;
}

function caveatDowngrade(state, id) {
  const note = state.publishVerdictNote ?? '';
  if (!note) return false;
  const rules = {
    'verdict-sue': /\bsue\b|can'?t-sue|cannot-sue|suit/i,
    'verdict-cancel': /cancel|cooling-off/i,
    'verdict-co': /\bCO\b|carbon monoxide|detector|smoke/i,
    'verdict-exam': /\bexam\b/i,
    'verdict-sale': /inspection/i,
    'verdict-license': /licens\w*\s+(must|should|described|claim)|licensing described|license described/i,
  };
  return rules[id]?.test(note) ?? false;
}

/**
 * The freshest one-line summary for a state. Verification agents update §11 in
 * the research file but not RIGHTS-TABLE.csv (the coordinator owns it), so for a
 * verified state §11 wins; otherwise the CSV row; otherwise §11 if present.
 */
function pickSummary(state, row, s11) {
  const fromS11 = {
    license_regime: s11.license ?? '',
    registration_name: s11.registration ?? '',
    disclosure_law: s11['disclosure law'] ?? '',
    chimney_item_on_form: s11['chimney item on form'] ?? '',
    three_day_cancel: s11['3-day cancel'] ?? '',
    co_law: s11['co law'] ?? '',
    lookup_url: s11.lookup ?? '',
    source: '§11',
  };
  if (s11.license && (state.verified || !row)) return fromS11;
  if (row) return { ...row, source: 'CSV' };
  return { ...fromS11, source: s11.license ? '§11' : null };
}

function buildVerdictGrid(state, sum, s11) {
  const get = (n) => state.sections.find((x) => x.number === n);
  const row = sum.source === 'CSV' ? sum : null;
  const regime = sum.license_regime ?? '';
  const cancelCell = sum.three_day_cancel ?? '';
  const coCell = sum.co_law ?? '';
  const src = sum.source;

  const lic = deriveLicense(regime, get('1'));
  const exam = deriveExam(lic.answer, regime, get('1'), get('2'), state.name);
  const insp = deriveInspection(get('3'), coCell);
  const canc = deriveCancel(cancelCell, get('4'));
  const co = deriveCo(coCell);
  const sueTexts = [
    get('4') && { ref: '§4', text: get('4').markdown },
    get('1') && { ref: '§1', text: get('1').markdown },
    src && { ref: src, text: `${sum.license_regime}. ${sum.registration_name}.` },
  ].filter(Boolean);
  let sue = deriveSue(state, sueTexts);
  const s11Sue = s11["unlicensed can't sue"] ?? s11['unregistered can\'t sue'];
  if (sue.answer === SEE && s11Sue && /^YES\b/.test(s11Sue)) {
    sue = { answer: 'NO', note: 'Where a license is required, an unlicensed contractor cannot sue to collect', rule: 'sue:§11-field', evidence: s11Sue, ref: '§4' };
  }

  const cell = (id, label, d0, anchor, derivedFrom) => {
    let d = d0;
    if (d.answer !== SEE && caveatDowngrade(state, id)) {
      d = { answer: SEE, note: 'Flagged in the verification caveats — read the section', rule: `${d0.rule}→caveat-downgrade`, evidence: d0.evidence, wasAnswer: d0.answer };
    }
    return {
      id,
      label,
      answer: d.answer,
      note: d.answer === SEE ? d.note ?? 'Not derivable from the summary row — read the section' : d.note,
      anchor,
      rule: d.rule,
      derivedFrom,
      evidence: d.evidence ?? null,
    };
  };
  return [
    cell('verdict-license', 'License required?', lic, sectionAnchor(state, '1', 'license'), src ? `${src}: license_regime` : 'none'),
    cell('verdict-exam', 'Exam tests chimney skill?', exam, sectionAnchor(state, '2', 'license'), exam.rule.startsWith('exam:§2') ? '§2 text' : `${src ?? '—'}: license_regime`),
    cell('verdict-sale', 'Inspection required at sale?', insp, sectionAnchor(state, '3', 'home-sale'), '§3 text'),
    cell('verdict-cancel', 'Right to cancel', canc, sectionAnchor(state, '4', 'remedies'), canc.rule === 'cancel:§4-sentence' ? '§4 text' : `${src ?? '—'}: three_day_cancel`),
    cell('verdict-co', 'CO alarm required in your home?', co, sectionAnchor(state, '6', 'co-law'), `${src ?? '—'}: co_law`),
    cell('verdict-sue', 'Can an unregistered contractor sue you?', sue, sectionAnchor(state, sue.ref === '§1' ? '1' : '4', 'remedies'), sue.ref ? `${sue.ref} text` : '§1/§4 text'),
  ];
}

// ---------------------------------------------------------------------------
// Page copy derived from data
// ---------------------------------------------------------------------------
function buildH1(state, grid) {
  const lic = grid.find((c) => c.id === 'verdict-license').answer;
  const n = state.name;
  const opts = {
    NO: `${n}: no state license covers chimney work. Here's what that means.`,
    'REGISTRATION ONLY': `${n}: contractors register, but no state license tests them. Here's what that means.`,
    YES: `${n}: some chimney work needs a state license. Here's what that means.`,
  };
  let h1 = opts[lic];
  if (!h1 && lic.startsWith('ONLY ≥')) h1 = `${n}: a state license applies only to jobs ${lic.replace('ONLY ', '')}. What that means.`;
  if (!h1 || h1.length > 90) {
    const shortOpts = {
      NO: `${n}: no state license covers chimney work.`,
      'REGISTRATION ONLY': `${n}: registration, not a license, for chimney work.`,
      YES: `${n}: some chimney work needs a state license.`,
    };
    h1 = shortOpts[lic] ?? `${n} chimney & fireplace laws: know your rights`;
  }
  if (h1.length > 90) h1 = `${n} chimney & fireplace laws: know your rights`;
  return h1;
}

function buildMeta(state, grid) {
  const lic = grid.find((c) => c.id === 'verdict-license').answer;
  const phrase =
    lic === 'NO' ? 'no state license' : lic === 'YES' ? 'state licensing' : lic === 'REGISTRATION ONLY' ? 'registration rules' : lic.startsWith('ONLY') ? 'threshold licensing' : 'licensing';
  const d = `${state.name} chimney & fireplace laws: ${phrase}, seller disclosure, right to cancel and CO alarm rules, with statutes cited.`;
  return d.length <= 155 ? d : truncate(d, 155);
}

function buildMunicipal(state, row, sec1) {
  const hay = [row?.license_regime, row?.registration_name].filter(Boolean).join(' ');
  const via = row?.source === '§11' ? '§11 summary' : 'CSV license_regime';
  const m = hay.match(/(?:LOCAL|local|patchwork)[^()]{0,40}\(([^)]+)\)/);
  if (m) {
    const inner = clean(m[1]);
    if (!/^\d|^see\b/i.test(inner)) return { cities: inner, derivedFrom: via };
  }
  return { cities: null, derivedFrom: null };
}

function monthIndex(tok) {
  const i = MONTHS.indexOf(tok.slice(0, 3).toLowerCase());
  return i === -1 ? null : i + 1;
}
function monthRange(a, b) {
  const out = [];
  let m = a;
  for (let guard = 0; guard < 12; guard++) {
    out.push(m);
    if (m === b) break;
    m = (m % 12) + 1;
  }
  return out;
}
function buildSeason(sec9) {
  const text = sec9 ? stripMd(sec9.markdown) : '';
  const MON = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?';
  const range = (label) => {
    const re = new RegExp(`${label}[^A-Za-z]{0,4}(?:(?:late|early|mid)[- ])?${MON}\\s*[–-]\\s*(?:(?:late|early|mid)[- ])?${MON}`, 'i');
    const m = text.match(re);
    if (!m) return null;
    const a = monthIndex(m[1]);
    const b = monthIndex(m[2]);
    return a && b ? monthRange(a, b) : null;
  };
  const rush = range('Rush');
  const best = range('Best booking');
  return {
    rush: rush ?? [9, 10, 11],
    best: best ?? [4, 5, 6],
    rushParsed: Boolean(rush),
    bestParsed: Boolean(best),
    note: text ? truncate(text, 320) : null,
  };
}

function buildFaq(state, row, grid) {
  if (state.faqSeeds?.length) {
    return state.faqSeeds.slice(0, 3).map((f, i) => ({ id: `faq-${i + 1}`, q: f.q, a: f.a, expanded: i === 0, derivedFrom: 'FAQ seeds' }));
  }
  const faq = [];
  const n = state.name;
  if (row) {
    const bits = [
      `State licensing: ${row.license_regime}.`,
      `Registration or credential: ${row.registration_name || 'not stated in the table'}.`,
      `Seller disclosure at sale: ${row.disclosure_law}.`,
      `Right to cancel a sale made at your home: ${row.three_day_cancel || 'see the remedies section'}.`,
      `Carbon monoxide alarm law: ${row.co_law || 'see the carbon monoxide section'}.`,
      `Where to check a contractor: ${row.lookup_url || 'see the licensing section'}.`,
      'Then ask the eight questions below, get the inspection findings in writing with photos, and never sign for "emergency" work on the day of a door-knock.',
    ];
    faq.push({
      id: 'faq-what-to-do',
      q: `What should I check before hiring a chimney company in ${n}?`,
      a: bits.map((b) => b.replace(/\.\.$/, '.')).join(' '),
      expanded: true,
      derivedFrom: row.source === 'CSV' ? 'research table row' : 'verified summary row (§11)',
    });
  } else {
    const lic = state.sections.find((s) => s.number === '1');
    faq.push({
      id: 'faq-what-to-do',
      q: `What should I check before hiring a chimney company in ${n}?`,
      a: `${sentences(stripMd(lic?.markdown ?? '')).slice(0, 5).join(' ')} Then ask the eight questions below and get the inspection findings in writing with photos.`,
      expanded: true,
      derivedFrom: '§1 text',
    });
  }
  const sale = state.sections.find((s) => s.number === '3');
  if (sale) {
    faq.push({
      id: 'faq-home-sale',
      q: `Is a chimney inspection required when a home sells in ${n}?`,
      a: sentences(stripMd(sale.markdown)).slice(0, 4).join(' '),
      expanded: false,
      derivedFrom: '§3 text',
    });
  }
  const rem = state.sections.find((s) => s.number === '4');
  if (rem) {
    faq.push({
      id: 'faq-cancel',
      q: `Can I cancel a chimney contract I signed at my door in ${n}?`,
      a: sentences(stripMd(rem.markdown)).slice(0, 4).join(' '),
      expanded: false,
      derivedFrom: '§4 text',
    });
  }
  return faq;
}

function buildCompare(state, all) {
  const mine = Object.fromEntries(state.verdictGrid.map((c) => [c.id, c]));
  const nbrs = (NEIGHBORS[state.abbr] ?? '').split(' ').filter(Boolean).map((a) => all.get(ABBR_TO_SLUG[a])).filter(Boolean);
  for (const id of ['verdict-license', 'verdict-sue', 'verdict-co', 'verdict-cancel']) {
    for (const nb of nbrs) {
      const theirs = nb.verdictGrid.find((c) => c.id === id);
      const a = mine[id];
      if (!theirs || a.answer === SEE || theirs.answer === SEE || a.answer === theirs.answer) continue;
      return {
        neighborSlug: nb.slug,
        neighborName: nb.name,
        label: a.label,
        verdictId: id,
        a: { answer: a.answer, note: a.note },
        b: { answer: theirs.answer, note: theirs.note },
        neighborPublishVerdict: nb.publishVerdict,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  if (!fs.existsSync(RIGHTS_DIR)) throw new Error(`Rights research folder not found: ${RIGHTS_DIR}`);
  for (const d of [OUT_STATES, OUT_DATA, OUT_PUBLIC_DATA]) fs.mkdirSync(d, { recursive: true });

  const csvPath = path.join(RIGHTS_DIR, 'RIGHTS-TABLE.csv');
  const rights = readCsv(csvPath);
  const rowByName = new Map(rights.rows.map((r) => [r.state.toLowerCase(), r]));

  const files = fs
    .readdirSync(RIGHTS_DIR)
    .filter((f) => /^rights-research-[a-z-]+\.md$/.test(f))
    .sort();

  const report = { generatedAt: new Date().toISOString(), rightsDir: RIGHTS_DIR, states: [], csvProblems: {}, warnings: [] };
  const all = new Map();

  for (const f of files) {
    let st;
    try {
      st = parseResearchFile(path.join(RIGHTS_DIR, f));
    } catch (e) {
      report.warnings.push(`${f}: ${e.message}`);
      continue;
    }
    const row = rowByName.get(st.name.toLowerCase()) ?? rowByName.get(STATES[st.slug][0].toLowerCase()) ?? null;
    const s11 = parseSection11(st.sections.find((s) => s.number === '11'));
    const summary = pickSummary(st, row, s11);
    const verdictGrid = buildVerdictGrid(st, summary, s11);
    const state = {
      ...st,
      table: row
        ? {
            license_regime: row.license_regime,
            registration_name: row.registration_name,
            disclosure_law: row.disclosure_law,
            chimney_item_on_form: row.chimney_item_on_form,
            three_day_cancel: row.three_day_cancel,
            co_law: row.co_law,
            lookup_url: row.lookup_url,
            researched_date: row.researched_date,
          }
        : null,
      tableStatus: row ? 'IN TABLE' : 'NOT YET IN TABLE',
      summary: summary.source
        ? {
            source: summary.source,
            license_regime: summary.license_regime,
            registration_name: summary.registration_name,
            disclosure_law: summary.disclosure_law,
            chimney_item_on_form: summary.chimney_item_on_form ?? '',
            three_day_cancel: summary.three_day_cancel,
            co_law: summary.co_law,
            lookup_url: summary.lookup_url,
          }
        : null,
      tableRowStale: Boolean(row && st.verified && row.researched_date && row.researched_date < st.verified),
      lastVerified: st.verified ?? st.researched,
      provenance: 'PUBLIC RECORD',
      verdictGrid,
    };
    state.h1 = buildH1(state, verdictGrid);
    state.metaDescription = buildMeta(state, verdictGrid);
    state.municipal = buildMunicipal(state, summary, st.sections.find((s) => s.number === '1'));
    state.season = buildSeason(st.sections.find((s) => s.number === '9'));
    state.faq = buildFaq(state, summary.source ? summary : null, verdictGrid);
    delete state.publishBlockersPresent;
    all.set(state.slug, state);
    if (!st.researched) report.warnings.push(`${f}: could not parse researched date`);
    if (st.unknownBlocks.length) report.warnings.push(`${f}: unrecognised headings kept out of page: ${st.unknownBlocks.join(' | ')}`);
  }

  for (const state of all.values()) {
    state.compare = buildCompare(state, all);
    delete state.unknownBlocks;
  }

  // Remove JSON for states whose research file disappeared.
  for (const f of fs.readdirSync(OUT_STATES)) {
    if (f.endsWith('.json') && !all.has(f.replace(/\.json$/, ''))) fs.unlinkSync(path.join(OUT_STATES, f));
  }
  for (const state of all.values()) {
    fs.writeFileSync(path.join(OUT_STATES, `${state.slug}.json`), `${JSON.stringify(state, null, 2)}\n`);
    report.states.push({
      slug: state.slug,
      publishVerdict: state.publishVerdict,
      verified: state.verified,
      tableStatus: state.tableStatus,
      grid: Object.fromEntries(state.verdictGrid.map((c) => [c.id.replace('verdict-', ''), `${c.answer} [${c.rule}]`])),
      compare: state.compare ? `${state.compare.neighborName} on ${state.compare.label}` : null,
    });
  }

  // Rights table (all CSV rows + slug when a state page exists)
  if (rights.problems.length) report.csvProblems['RIGHTS-TABLE.csv'] = rights.problems;
  const tableRows = rights.rows.map((r) => {
    const slug = NAME_TO_SLUG[r.state.toLowerCase()] ?? null;
    const st = slug ? all.get(slug) : null;
    return { ...r, slug, abbr: slug ? STATES[slug][1] : null, hasPage: Boolean(st), stateVerified: st?.verified ?? null, rowStale: Boolean(st?.tableRowStale) };
  });
  for (const st of all.values()) {
    if (!st.table) {
      tableRows.push({
        state: st.name, license_regime: 'NOT YET IN TABLE', registration_name: 'NOT YET IN TABLE', disclosure_law: 'NOT YET IN TABLE',
        chimney_item_on_form: 'NOT YET IN TABLE', three_day_cancel: 'NOT YET IN TABLE', co_law: 'NOT YET IN TABLE', lookup_url: '',
        researched_date: st.researched ?? '', slug: st.slug, abbr: st.abbr, hasPage: true, notInTable: true, stateVerified: st.verified ?? null, rowStale: false,
      });
    }
  }
  tableRows.sort((a, b) => a.state.localeCompare(b.state));
  const csvMtime = fs.statSync(csvPath).mtime.toISOString().slice(0, 10);
  fs.writeFileSync(
    path.join(OUT_DATA, 'rights-table.json'),
    `${JSON.stringify({ header: rights.header, rows: tableRows, csvRowCount: rights.rows.length, csvModified: csvMtime }, null, 2)}\n`,
  );
  const csvText = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '');
  fs.writeFileSync(
    path.join(OUT_PUBLIC_DATA, 'rights-table.csv'),
    `# Source: Chimney.Services — cite as https://www.chimney.services/rights\n${csvText.endsWith('\n') ? csvText : `${csvText}\n`}`,
  );

  // Licensing + insurance
  const licPath = path.join(LICENSING_DIR, 'LICENSING-MATRIX.csv');
  const insPath = path.join(LICENSING_DIR, 'INSURANCE-REQUIREMENTS.csv');
  if (fs.existsSync(licPath) && fs.existsSync(insPath)) {
    const lic = readCsv(licPath);
    const ins = readCsv(insPath);
    if (lic.problems.length) report.csvProblems['LICENSING-MATRIX.csv'] = lic.problems;
    if (ins.problems.length) report.csvProblems['INSURANCE-REQUIREMENTS.csv'] = ins.problems;
    const insKey = ins.header.find((h) => h.startsWith('context')) ?? 'context';
    const bySlug = {};
    for (const r of lic.rows) {
      const slug = NAME_TO_SLUG[r.state.toLowerCase()];
      if (!slug) {
        report.warnings.push(`LICENSING-MATRIX.csv: unknown state "${r.state}"`);
        continue;
      }
      bySlug[slug] ??= { slug, name: STATES[slug][0], abbr: STATES[slug][1], rows: [], insurance: null };
      bySlug[slug].rows.push(r);
    }
    for (const r of ins.rows) {
      const slug = NAME_TO_SLUG[r.state.toLowerCase()];
      if (!slug) {
        report.warnings.push(`INSURANCE-REQUIREMENTS.csv: unknown state "${r.state}"`);
        continue;
      }
      bySlug[slug] ??= { slug, name: STATES[slug][0], abbr: STATES[slug][1], rows: [], insurance: null };
      bySlug[slug].insurance = { ...r, context: r[insKey] };
    }
    for (const s of Object.values(bySlug)) {
      const dates = [...s.rows.map((r) => r.checked_date), s.insurance?.date].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '')).sort();
      s.lastChecked = dates.at(-1) ?? null;
      s.hasRightsPage = all.has(s.slug);
    }
    const summaryPath = path.join(LICENSING_DIR, 'SUMMARY.md');
    fs.writeFileSync(
      path.join(OUT_DATA, 'licensing.json'),
      `${JSON.stringify(
        {
          header: lic.header,
          insuranceHeader: ins.header,
          states: Object.values(bySlug).sort((a, b) => a.name.localeCompare(b.name)),
          rowCount: lic.rows.length,
          summaryModified: fs.existsSync(summaryPath) ? fs.statSync(summaryPath).mtime.toISOString().slice(0, 10) : null,
        },
        null,
        2,
      )}\n`,
    );
    const licText = fs.readFileSync(licPath, 'utf8').replace(/^﻿/, '');
    fs.writeFileSync(
      path.join(OUT_PUBLIC_DATA, 'licensing-matrix.csv'),
      `# Source: Chimney.Services — cite as https://www.chimney.services/licensing\n${licText.endsWith('\n') ? licText : `${licText}\n`}`,
    );
  } else {
    report.warnings.push(`Licensing research not found in ${LICENSING_DIR}; kept previous src/data/licensing.json`);
  }

  fs.writeFileSync(path.join(OUT_DATA, 'ingest-report.json'), `${JSON.stringify(report, null, 2)}\n`);

  // Console summary
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`Ingested ${all.size} state files from ${RIGHTS_DIR}`);
  console.log(`RIGHTS-TABLE.csv rows: ${rights.rows.length}`);
  for (const s of report.states) {
    console.log(`${pad(s.slug, 22)} ${pad(s.publishVerdict, 20)} ${pad(s.tableStatus, 17)} ${Object.values(s.grid).map((g) => g.split(' [')[0]).join(' | ')}`);
  }
  if (Object.keys(report.csvProblems).length) console.log('CSV problems:', JSON.stringify(report.csvProblems, null, 2));
  if (report.warnings.length) console.log(`Warnings:\n  ${report.warnings.join('\n  ')}`);
}

main();
