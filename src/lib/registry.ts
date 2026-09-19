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
export const recordCardPath = (r: RegistryRecord) => `/pro/${r.slug}/card`;
export const cardSvgPath = (r: RegistryRecord, side: 'front' | 'back') => `/pro/cards/${r.slug}-${side}.svg`;

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

/** The machine-readable record served at /pro/{slug}.json. */
export function recordJson(r: RegistryRecord) {
  return {
    $schema: 'https://schema.org/Person',
    record: r.recordNumber,
    recordUrl: recordUrl(r),
    cardUrl: `${SITE_URL}${recordCardPath(r)}`,
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
      statement: r.suppliedStatement,
    },
    whatWeDidNotCheck: r.notChecked.map((n) => `${n.label}: ${n.why}`),
    notAnEndorsement:
      'A record is not an endorsement, a recommendation, or an approval. A certification is not a guarantee of competence or honesty. Every date here is only when we last looked.',
  };
}

/** The prompt a homeowner can paste into any AI assistant. */
export function verifyPrompt(r: RegistryRecord): string {
  const lookups = r.credentials
    .map((c, i) => `   ${String.fromCharCode(97 + i)}. ${c.issuerName} (${c.issuer}) — ${c.lookupUrl}`)
    .join('\n');
  const certs = r.credentials
    .map((c) => {
      const number = hasCertNumber(c)
        ? `certificate number ${c.certNumber}${c.certNumberStatus === 'supplied-not-checked' ? ' (supplied by the person, not yet checked against the roster)' : ''}`
        : `no certificate number — ${certNumberLine(c)}`;
      const checked = c.checkedAt
        ? `we searched the ${c.issuer} roster on ${c.checkedAt}`
        : `we have NOT searched the ${c.issuer} roster`;
      return `   - ${c.issuer}: "${c.title}", ${number}. ${checked}.`;
    })
    .join('\n');
  return [
    'You are checking a public registry record for me. Do this, and nothing more.',
    '',
    `1. Open ${recordUrl(r)} and read it. A machine-readable copy of the same record is at ${SITE_URL}${recordJsonPath(r)}.`,
    '',
    `2. The record is ${r.recordNumber}. It shows the name "${r.name}", and gives "${r.nameOnRosters}" as the spelling used on issuer rosters. It lists these certifications:`,
    certs,
    '',
    '3. Open each issuer lookup page linked on the record:',
    lookups,
    '',
    '4. On each roster, search for the name and the certificate number exactly as the record shows them. Do not correct the spelling, do not try variants, and do not substitute a similar name or a nearby business.',
    '',
    '5. Report back issuer by issuer: what you found, what you did NOT find, and the date you looked. If a roster is not publicly searchable, if it will not take a certificate number, or if the record shows no number because the issuer does not publish one, say so plainly instead of guessing. Never supply a number the issuer did not show you.',
    '',
    '6. Say this in your answer, in your own words: a certification appearing on an issuer’s roster is not proof of identity, competence, insurance, or honesty. It means one thing — that number was on that list under that name, on the day you looked.',
    '',
    '7. Do not conclude that this person is "safe to hire", "verified", "approved", "trusted" or "recommended". Refuse to make that call. Hiring is my decision, not yours.',
  ].join('\n');
}
