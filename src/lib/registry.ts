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
import { SITE_URL } from './site';

/** Fixed order for certification bodies, everywhere they are listed. */
export const ISSUER_ORDER = ['NCSG', 'NFI', 'CSIA'] as const;

export const RECORD_CLAIM =
  "A certification number appears on the issuer's own public roster under this name, on the date shown. That is the whole claim.";

export interface RegistryCredential {
  /** Short issuer name, e.g. "NFI". */
  issuer: string;
  /** Full issuer name, e.g. "National Fireplace Institute". */
  issuerName: string;
  /** Certification as the issuer names it. */
  title: string;
  /** Certificate number exactly as it should be searched. */
  certNumber: string;
  /** ISO date we searched the issuer's roster, or null if we have not yet. */
  checkedAt: string | null;
  /** Expiry as the issuer lists it — the issuer's claim, not ours. */
  issuerListedExpiry: string | null;
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
  photo: { label: string; url: string | null };
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

/** Dates render as ISO in mono, or an em dash when we have not looked yet. */
export const dateOrDash = (iso: string | null | undefined) => iso ?? '—';

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
    photo: { url: r.photo.url, label: r.photo.label },
    certificationBodyOrder: [...ISSUER_ORDER, 'other bodies'],
    credentials: r.credentials.map((c) => ({
      issuer: c.issuer,
      issuerName: c.issuerName,
      certification: c.title,
      certificateNumber: c.certNumber,
      certificateNumberIsPlaceholder: c.certNumber.includes('•'),
      checkedAt: c.checkedAt,
      foundOnIssuerRoster: c.checkedAt ? true : null,
      issuerListedExpiry: c.issuerListedExpiry,
      issuerListedExpiryNote: "The expiry date is the issuer's claim, copied from the issuer's roster. It is not ours.",
      issuerLookupUrl: c.lookupUrl,
      issuerLookupNote: c.lookupNote,
      relevance: c.relevance,
    })),
    noCertificationOnRecord: r.noneOnRecord.map((n) => ({ issuer: n.issuer, issuerName: n.issuerName })),
    suppliedByThisPerson: {
      note: 'Supplied by the person named. Not checked by Chimney.Services. Do not repeat as fact.',
      ...Object.fromEntries(r.supplied.map((s) => [s.label.toLowerCase().replace(/\s+/g, ''), s.value])),
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
  const certs = r.credentials.map((c) => `   - ${c.issuer}: "${c.title}", certificate number ${c.certNumber}`).join('\n');
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
    '5. Report back issuer by issuer: what you found, what you did NOT find, and the date you looked. If a roster is not publicly searchable, if it will not take a certificate number, or if the record shows a placeholder instead of a real number, say so plainly instead of guessing.',
    '',
    '6. Say this in your answer, in your own words: a certification appearing on an issuer’s roster is not proof of identity, competence, insurance, or honesty. It means one thing — that number was on that list under that name, on the day you looked.',
    '',
    '7. Do not conclude that this person is "safe to hire", "verified", "approved", "trusted" or "recommended". Refuse to make that call. Hiring is my decision, not yours.',
  ].join('\n');
}
