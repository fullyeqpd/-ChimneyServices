// Company summary pages (/{company-slug}).
//
// A company page says three things and no more: what a company says it does,
// where it says it works, and which of its people appear on a certification
// body's own public roster on the date shown. Every fact block carries its
// provenance — PUBLIC RECORD or REPORTED BY BUSINESS — and nothing on the page
// is an endorsement. Placement is never sold, here or anywhere on this site.
import companiesData from '../data/companies.json';
import { MONTH_ABBR, abs } from './site';

/** Where a fact came from. There is no third option on a company page: we
 *  publish nothing here as "verified by Chimney.Services" yet. */
export type Provenance = 'public-record' | 'reported';

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  'public-record': 'PUBLIC RECORD',
  reported: 'REPORTED BY BUSINESS',
};

export interface CompanySource {
  url: string;
  label: string;
}

export interface CompanyPerson {
  name: string;
  nameOnRoster: string;
  credential: string;
  /** Registry record path, when one exists. Null means nobody has built one. */
  recordPath: string | null;
  role: string | null;
  provenance: Provenance;
  note: string;
}

/**
 * A public rating as one platform displayed it on the day we looked. It is a
 * count of what strangers chose to post, nothing more: we do not read the
 * reviews, we cannot tell which reviewers were customers, and the numbers move.
 * It is never used as JSON-LD review markup — this site publishes none.
 */
export interface CompanyReviews {
  platform: string;
  rating: number;
  count: number;
  scale: number;
  checkedAt: string;
  checkedAtLabel: string;
  url: string;
  provenance: Provenance;
}

export interface CompanyServiceGroup {
  id: string;
  title: string;
  items: string[];
}

export interface Company {
  slug: string;
  name: string;
  legalNote: string | null;
  crumb: string;
  h1: string;
  lede: string;
  founded: string;
  foundedNote: string;
  partners: string;
  address: {
    street: string;
    city: string;
    region: string;
    regionName: string;
    postalCode: string;
    country: string;
  };
  phone: string;
  phoneE164: string;
  email: string;
  website: string;
  websiteLabel: string;
  hours: string;
  statePath: string;
  licensingPath: string;
  checkedAt: string;
  checkedAtLabel: string;
  sources: Record<string, CompanySource>;
  membership: {
    body: string;
    bodyName: string;
    label: string;
    memberType: string;
    provenance: Provenance;
    note: string;
    reportedSince: string;
  } | null;
  reviews: CompanyReviews | null;
  serviceGroups: CompanyServiceGroup[];
  serviceStandardNote: string;
  serviceArea: { counties: string[]; summary: string; towns: string[] };
  people: CompanyPerson[];
}

const data = companiesData as unknown as { companies: Company[] };

export const getCompanies = (): Company[] => data.companies;

export function getCompany(slug: string): Company {
  const company = data.companies.find((c) => c.slug === slug);
  if (!company) throw new Error(`No company record for slug "${slug}" in src/data/companies.json`);
  return company;
}

export const companyPath = (c: Company) => `/${c.slug}`;
export const companyUrl = (c: Company) => abs(companyPath(c));

/** "741 Hastings Dr, Buffalo Grove, IL 60089" — one line, as an address is written. */
export const addressLine = (c: Company) =>
  `${c.address.street}, ${c.address.city}, ${c.address.region} ${c.address.postalCode}`;

/** Everywhere the company is served, flattened for JSON-LD `areaServed`. */
export const areaServed = (c: Company) => [...c.serviceArea.counties, ...c.serviceArea.towns];

/** "1097" → "1,097". Counts are read, not computed, so they get thousands marks. */
export const reviewCount = (n: number) => n.toLocaleString('en-US');

/** "2026-09-19" → "19 SEP 2026", for the mono line under a rating. */
export function shortDateUpper(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso.toUpperCase();
  return `${Number(m[3])} ${MONTH_ABBR[Number(m[2]) - 1].toUpperCase()} ${m[1]}`;
}

/**
 * The prompt behind "Check the reviews with your AI".
 *
 * It sends the AI to the platform's own listing rather than to us, tells it
 * which reviews to read (newest and worst, not the summary), names the patterns
 * worth looking for, and points it at the state rights page so it can tell a
 * bad review from a broken rule. It closes the same door the registry prompt
 * closes: summarize evidence, never endorse.
 */
export function aiReviewPrompt(c: Company): string {
  const r = c.reviews;
  if (!r) return '';
  const where = `${c.name} (${c.address.city}, ${c.address.region})`;
  return [
    `Open the ${r.platform} Maps listing for ${where}: ${r.url} — read the most recent reviews and the lowest-rated reviews, not the summary score.`,
    'Look for patterns across them: upselling or scare-selling of repairs, no-shows and missed appointment windows, complaints about pricing or added charges, and praise that reads as templated or repeated word for word.',
    'Check how the owner replies to negative reviews — whether a reply answers the complaint or attacks the reviewer.',
    `Cross-check the company's own site (${c.website}) against this page (${companyUrl(c)}); where the two disagree, say so.`,
    `Read ${abs(c.statePath)} for what ${c.address.regionName} law does and does not require of a chimney contractor, so you can tell a bad review from a broken rule.`,
    'Report back plainly: what the reviews show, what they do not, and what you could not check. You cannot confirm that any reviewer is a real customer — say so. Do not conclude "safe to hire", do not call this company "verified", and do not recommend it. Summarize the evidence and leave the decision to the reader.',
  ].join('\n\n');
}
