// Registry records (/pro/*).
//
// What a record is: a dated note of what we found when we searched a
// certification issuer's own public roster. Nothing else. We check
// certification → name. We do not check person → name, so a record confers no
// status on anybody and never calls a person "verified", "approved" or
// "trusted".
//
// The single claim a record makes:
//   "certification #X appears on the issuer's public roster under this name,
//    checked on this date."
import registryData from '../data/registry.json';
import { SITE_URL, abs } from './site';

/** Fixed order for certification bodies, everywhere they are listed. */
export const ISSUER_ORDER = ['NCSG', 'NFI', 'CSIA'] as const;

export const RECORD_CLAIM =
  "A certification appears on the issuer's own public roster under this name, on the date shown — with the certificate number where the issuer publishes one. That is the whole claim.";

/**
 * Where a certificate number stands.
 *  - "shown"                → the issuer's public lookup displays it and we copied it.
 *  - "not-shown-by-issuer"  → the issuer's public lookup displays no number at all.
 *  - "supplied-not-checked" → the person gave us the number; no roster search has run.
 *  - "placeholder"          → a stand-in, not a real number. Never rendered as fact.
 */
export type CertNumberStatus = 'shown' | 'not-shown-by-issuer' | 'supplied-not-checked' | 'placeholder';

export interface RegistryCredential {
  /** Short issuer name, e.g. "NFI". */
  issuer: string;
  /** Full issuer name, e.g. "National Fireplace Institute". */
  issuerName: string;
  /** Certification as the issuer names it. */
  title: string;
  /** Certificate number exactly as it should be searched, or null when there is none to show. */
  certNumber: string | null;
  /** Where that number stands — never invent one, and never render a stand-in as fact. */
  certNumberStatus: CertNumberStatus;
  /** The line shown in place of, or beneath, the number. */
  certNumberNote?: string | null;
  /** ISO date we searched the issuer's roster, or null if we have not yet. */
  checkedAt: string | null;
  /** Who ran the roster search, when one has run. */
  checkedBy?: string | null;
  /** Evidence class for the roster check, same scale as the rest of the site. */
  evidenceClass?: 'GOV' | 'DOC' | 'REF';
  /** What we actually saw on the issuer's own page, in plain words. */
  evidenceNote?: string | null;
  /** Expiry as the issuer lists it — the issuer's claim, not ours. */
  issuerListedExpiry: string | null;
  /** Why no expiry is shown, when the issuer does not publish one. */
  expiryNote?: string | null;
  /** The issuer's own public lookup page. */
  lookupUrl: string;
  lookupLabel: string;
  /**
   * The issuer's own page explaining what this certification is — linked from
   * the ID block so the record never has to explain the issuer in our words.
   */
  explainerUrl?: string | null;
  /** How the AI prompt should search this issuer's lookup, in the issuer's own terms. */
  lookupSearch?: string | null;
  /** The issuer's own mark, used as the lookup link on the ID block. Optional. */
  logo?: string | null;
  /** true when the issuer only publishes a light/reverse logo that needs a dark backing chip */
  logoOnDark?: boolean;
  /** What that lookup actually lets a reader search by. */
  lookupNote: string;
  /** One honest line on what the credential is relevant to. */
  relevance: string;
}

export interface SuppliedField {
  label: string;
  value: string;
}

export interface NotCheckedItem {
  label: string;
  why: string;
}

export interface RegistryRecord {
  slug: string;
  recordNumber: string;
  /** Name as shown on the record. */
  name: string;
  /** Preferred short name. */
  preferredName: string;
  /** The spelling the roster check has to match. */
  nameOnRosters: string;
  recordCreated: string;
  /** ISO date of the most recent roster check, or null if none has run. */
  lastChecked: string | null;
  /** Year this person says they started in chimney services. Supplied, not checked. */
  activeSince?: string | null;
  /** Role at the employer below, e.g. "Owner". Supplied, not checked. */
  role?: string | null;
  /** Employer as the person gives it, e.g. "Chimney Monkey". Supplied, not checked. */
  employer?: string | null;
  /** Where that employer is, e.g. "Buffalo Grove, IL". Supplied, not checked. */
  employerLocation?: string | null;
  /** The employer's own site, supplied by this person. A link, not a claim. */
  companyUrl?: string | null;
  /** Our state rights page for where that employer works, e.g. "/illinois/rights". */
  companyRightsPath?: string | null;
  photo: { label: string; url: string | null; thumbUrl?: string | null; alt?: string | null; width?: number; height?: number };
  supplied: SuppliedField[];
  suppliedStatement: string;
  /** On the record, in ISSUER_ORDER, then anything else. */
  credentials: RegistryCredential[];
  /** Bodies with nothing on record, so the fixed order stays visible. */
  noneOnRecord: { issuer: string; issuerName: string }[];
  notChecked: NotCheckedItem[];
}

export const PHOTO_LABEL = 'SUPPLIED BY THIS PERSON — NOT CHECKED';

export const RECORDS: RegistryRecord[] = registryData.records as RegistryRecord[];
export const getRecords = () => RECORDS;
export const getRecord = (slug: string) => RECORDS.find((r) => r.slug === slug);

export const recordPath = (r: RegistryRecord) => `/pro/${r.slug}`;
export const recordUrl = (r: RegistryRecord) => `${SITE_URL}/pro/${r.slug}`;
export const recordJsonPath = (r: RegistryRecord) => `/pro/${r.slug}.json`;

/**
 * What goes on the "Certificate number" line. A number only when there is a
 * real one; otherwise the plain reason there is not, never a stand-in.
 */
export function certNumberLine(c: RegistryCredential): string {
  if (c.certNumber && c.certNumberStatus !== 'placeholder') return c.certNumber;
  return c.certNumberNote ?? "not shown by issuer's public lookup";
}

/** True when the line above is a real number rather than a reason there isn't one. */
export const hasCertNumber = (c: RegistryCredential) => Boolean(c.certNumber) && c.certNumberStatus !== 'placeholder';

/** Dates render as ISO in mono, or an em dash when we have not looked yet. */
export const dateOrDash = (iso: string | null | undefined) => iso ?? '—';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-09-18" → "Sep 18, 2026". The ID block reads, the JSON keeps ISO. */
export function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** "2029-09-18" → "Sep 2029". Expiry is the issuer's claim, so it stays coarse. */
export function monthYear(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/**
 * The two lines a credential shows on the ID block.
 *  - "NFI Certified"        — who ran the test.
 *  - "Woodburning Specialist" — which one, linked to the issuer's own page.
 * The specialty is the issuer's title with the issuer's own prefix removed, so
 * the row never reads "NFI NFI Woodburning Specialist".
 */
export const certifiedLabel = (c: RegistryCredential) => `${c.issuer} Certified`;
export function specialtyLabel(c: RegistryCredential): string {
  const prefix = `${c.issuer} `;
  return c.title.startsWith(prefix) ? c.title.slice(prefix.length) : c.title;
}

/** The one line an ID block can carry about role and employer, or null. */
export function roleLine(r: RegistryRecord): string | null {
  const parts = [r.role, r.employer, r.employerLocation].filter(Boolean) as string[];
  return parts.length ? parts.join(' · ') : null;
}

/** Credentials in the fixed body order (NCSG, NFI, CSIA), then anything else. */
export function orderedCredentials(r: RegistryRecord): RegistryCredential[] {
  const rank = (c: RegistryCredential) => {
    const i = (ISSUER_ORDER as readonly string[]).indexOf(c.issuer);
    return i === -1 ? ISSUER_ORDER.length : i;
  };
  return [...r.credentials].sort((a, b) => rank(a) - rank(b));
}

/** "Buffalo Grove, IL" → { city: "Buffalo Grove", region: "IL" }. */
export function employerPlace(r: RegistryRecord): { city: string; region: string } | null {
  const m = /^(.+?),\s*([A-Z]{2})$/.exec(r.employerLocation ?? '');
  return m ? { city: m[1], region: m[2] } : null;
}

/** Issuer abbreviations in the fixed order, e.g. "NFI & SPRAT". */
export function issuerList(r: RegistryRecord): string {
  const names = orderedCredentials(r).map((c) => c.issuer);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

/**
 * The record's <title>, without the " | Chimney.Services" suffix the layout's
 * gate requires. The full shape is
 *   "{Name} — {issuers} Certified Chimney Technician, {City} {ST}"
 * and it is shortened, in order, until the distinctive part fits 60 characters:
 * first the job phrase goes, then the place. Nothing is invented to fill it.
 */
export const TITLE_MAX = 60;
export function recordTitleBase(r: RegistryRecord): string {
  const issuers = issuerList(r);
  const place = employerPlace(r);
  const certPart = issuers ? `${issuers} Certified` : 'Chimney technician record';
  const wherePart = place ? `, ${place.city} ${place.region}` : '';
  const candidates = [
    `${r.name} — ${certPart}${issuers ? ' Chimney Technician' : ''}${wherePart}`,
    `${r.name} — ${certPart}${wherePart}`,
    `${r.name} — ${certPart}`,
    r.name,
  ];
  return candidates.find((c) => c.length <= TITLE_MAX) ?? candidates[candidates.length - 1];
}

/** Meta description: who, where, what was found, when, and what it is not. */
export const DESCRIPTION_MAX = 155;
export function recordDescription(r: RegistryRecord): string {
  const place = employerPlace(r);
  const where = place ? `, ${place.city} ${place.region}` : '';
  const issuers = issuerList(r);
  const plural = r.credentials.length === 1 ? 'certification' : 'certifications';
  const issuerRef = r.credentials.length === 1 ? "the issuer's" : "each issuer's";
  const when = shortDate(r.lastChecked);
  const checked = when ? `, checked ${when}` : '';
  const full = `${r.name}${where}: ${issuers} ${plural} found on ${issuerRef} own public roster${checked}. Not an endorsement.`;
  if (full.length <= DESCRIPTION_MAX) return full;
  return `${r.name}${where}: ${issuers} ${plural} found on ${issuerRef} own public roster${checked}.`.slice(0, DESCRIPTION_MAX);
}

/**
 * The three questions a record page answers in the DOM, and as FAQPage
 * JSON-LD. Every answer is assembled from fields already on the record — the
 * claim, the "not checked" list, the issuers' own lookups — so the FAQ adds no
 * claim the page does not already make.
 */
export function recordFaqs(r: RegistryRecord): { q: string; a: string }[] {
  const creds = orderedCredentials(r);
  // "…Technicians's" is not a word. A name that already ends in s takes the
  // bare apostrophe.
  const possessive = (name: string) => (name.endsWith('s') ? `${name}'` : `${name}'s`);
  const found = creds
    .map((c) => {
      const when = shortDate(c.checkedAt);
      const num = hasCertNumber(c) ? `, certificate ${c.certNumber}` : `, with no certificate number shown by the issuer`;
      const expiry = monthYear(c.issuerListedExpiry);
      return `${c.title}${num}${when ? `, found on ${possessive(c.issuerName)} own public lookup on ${when}` : ''}${
        expiry ? `, where the issuer lists expiry as ${expiry}` : ''
      }`;
    })
    .join('. ');
  const none = r.noneOnRecord.map((n) => n.issuer).join(' and ');

  const howTo = creds
    .map((c) => `${c.issuer}: ${c.lookupUrl} — ${c.lookupNote}`)
    .join(' ');

  return [
    {
      q: 'What was checked on this record?',
      a: `${RECORD_CLAIM} On this record: ${found}.${none ? ` Nothing is on record from ${none}.` : ''}`,
    },
    {
      q: 'What was not checked?',
      a: `${r.notChecked.map((n) => `${n.label} — ${n.why}`).join(' ')} A certification is a test somebody passed on a day, not a licence, an approval, or a promise about the work.`,
    },
    {
      q: 'How do I verify this myself?',
      a: `Run the same search we ran, on the issuer's own page. ${howTo} The full text of that search is printed on this page under "The prompt those buttons send", and the machine-readable copy of this record is published at ${SITE_URL}${recordJsonPath(r)}. A roster match is not proof of identity, competence, insurance or honesty.`,
    },
  ];
}

/** The machine-readable record served at /pro/{slug}.json. */
export function recordJson(r: RegistryRecord) {
  return {
    $schema: 'https://schema.org/Person',
    record: r.recordNumber,
    recordUrl: recordUrl(r),
    claim: RECORD_CLAIM,
    issuedBy: {
      name: 'Chimney.Services',
      url: SITE_URL,
      role: 'Independent directory. Not a licensing body, certifying body, background screener, or consumer reporting agency. Confers no status on any person.',
    },
    name: r.name,
    preferredName: r.preferredName,
    nameOnIssuerRosters: r.nameOnRosters,
    recordCreated: r.recordCreated,
    lastChecked: r.lastChecked,
    photo: { url: r.photo.url ? abs(r.photo.url) : null, label: r.photo.label, alt: r.photo.alt ?? null },
    certificationBodyOrder: [...ISSUER_ORDER, 'other bodies'],
    credentials: r.credentials.map((c) => ({
      issuer: c.issuer,
      issuerName: c.issuerName,
      certification: c.title,
      certificateNumber: c.certNumber,
      certificateNumberStatus: c.certNumberStatus,
      certificateNumberNote: c.certNumberNote ?? null,
      checkedAt: c.checkedAt,
      checkedBy: c.checkedAt ? (c.checkedBy ?? 'Chimney.Services') : null,
      foundOnIssuerRoster: c.checkedAt ? true : null,
      rosterCheckEvidenceClass: c.evidenceClass ?? null,
      rosterCheckEvidence: c.evidenceNote ?? null,
      issuerListedExpiry: c.issuerListedExpiry,
      issuerListedExpiryNote: c.issuerListedExpiry
        ? "The expiry date is the issuer's claim, copied from the issuer's roster. It is not ours."
        : `No expiry is recorded — ${c.expiryNote ?? 'the issuer does not publish one'}.`,
      issuerLookupUrl: c.lookupUrl,
      issuerLookupNote: c.lookupNote,
      issuerExplainerUrl: c.explainerUrl ?? null,
      relevance: c.relevance,
    })),
    noCertificationOnRecord: r.noneOnRecord.map((n) => ({ issuer: n.issuer, issuerName: n.issuerName })),
    suppliedByThisPerson: {
      note: 'Supplied by the person named. Not checked by Chimney.Services. Do not repeat as fact.',
      ...Object.fromEntries(r.supplied.map((s) => [s.label.toLowerCase().replace(/\s+/g, ''), s.value])),
      activeInChimneyServicesSince: r.activeSince ?? null,
      role: r.role ?? null,
      employerName: r.employer ?? null,
      employerLocation: r.employerLocation ?? null,
      employerUrl: r.companyUrl ?? null,
      statement: r.suppliedStatement,
    },
    whatWeDidNotCheck: r.notChecked.map((n) => `${n.label}: ${n.why}`),
    aiVerifyPrompt: aiVerifyPrompt(r),
    notAnEndorsement:
      'A record is not an endorsement, a recommendation, or an approval. A certification is not a guarantee of competence or honesty. Every date here is only when we last looked.',
  };
}

/**
 * The prompt behind the "Verify with your AI" buttons, and the same string the
 * JSON endpoint publishes as `aiVerifyPrompt`.
 *
 * It is written second person to the AI and kept short on purpose: it travels
 * in a query string, so it has to survive URL encoding. It sends the AI to the
 * issuers' own lookups and the issuers' own documentation, and to the company
 * this person works for — and it closes the door on "safe to hire".
 */
export const AI_PROMPT_MAX = 1200;

export function aiVerifyPrompt(r: RegistryRecord): string {
  const parts: string[] = [];
  parts.push(`Open this record: ${recordUrl(r)} and its machine-readable copy: ${SITE_URL}${recordJsonPath(r)}`);

  for (const c of orderedCredentials(r)) {
    const search = c.lookupSearch ?? `search it for "${r.nameOnRosters}"${hasCertNumber(c) ? `, certificate ${c.certNumber}` : ''}`;
    const explain = c.explainerUrl
      ? `, and read ${c.issuer}'s own documentation on what ${specialtyLabel(c)} covers (${c.explainerUrl})`
      : '';
    parts.push(`Confirm the ${c.issuer} certification: open ${c.lookupUrl}, ${search}${explain}.`);
  }

  if (r.employer) {
    const where = [r.employer, r.employerLocation].filter(Boolean).join(', ');
    const site = r.companyUrl ? ` (${r.companyUrl})` : '';
    const rights = r.companyRightsPath ? ` (see ${SITE_URL}${r.companyRightsPath})` : '';
    parts.push(
      `Then look up the company, ${where}${site}: how long it has been operating, its Google review count and rating, and any guild membership or state licensing that applies${rights}.`,
    );
  }

  parts.push(
    'Answer in at most six short lines, no preamble. One line per certification: CONFIRMED or NOT FOUND, with what the issuer\'s page showed and today\'s date. One line on the company: how established it is, in plain facts (years operating, review count and rating, memberships). If a certification cannot be confirmed, say so first. State facts, not a hiring verdict.',
  );

  return parts.join('\n\n');
}
