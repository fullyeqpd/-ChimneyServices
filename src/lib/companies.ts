// Company summary pages (/{company-slug}).
//
// A company page says three things and no more: what a company says it does,
// where it says it works, and which of its people appear on a certification
// body's own public roster on the date shown. Every fact block carries its
// provenance — PUBLIC RECORD or REPORTED BY BUSINESS — and nothing on the page
// is an endorsement. Placement is never sold, here or anywhere on this site.
import companiesData from '../data/companies.json';
import { abs } from './site';

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
