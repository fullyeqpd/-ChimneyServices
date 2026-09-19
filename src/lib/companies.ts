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
  /**
   * The company's own mark, served from /public. Shown to identify the company
   * and nothing else: a trademark is not evidence, and it is never a badge this
   * site awarded. Null for a company that has given us no logo.
   */
  logo: string | null;
  logoAlt: string | null;
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
    `Open the ${r.platform} Maps listing for ${where}: ${r.url}. Note the review count and rating, and read the most recent reviews and the lowest-rated ones.`,
    `Check the company's own site (${c.website}) and this page (${companyUrl(c)}) for how long it has been operating and any guild membership. Read ${abs(c.statePath)} for what ${c.address.regionName} law does and does not require of a chimney contractor.`,
    'Answer in at most five short lines, no preamble. Line 1: how established this company is, in plain facts — years operating, review count and rating as of today, memberships. Line 2: the strongest pattern in recent positive reviews. Line 3: the most common complaint, if any, and how the owner responds to it. Line 4: anything you could not check. Do not invent numbers; if a figure is not on the page, say so. State facts, not a hiring verdict.',
  ].join('\n\n');
}
