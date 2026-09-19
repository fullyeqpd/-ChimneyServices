export const SITE_URL = 'https://www.chimney.services';
export const ORG_NAME = 'Chimney.Services';
export const PROJECT_OF = 'A project of Fully EQPD';
export const CLOSING_RULE = "Where a detail isn't independently verified, we'll always say so.";
export const DISCLAIMER =
  'Chimney.Services is not a licensing body, certifying body, background screener, or consumer reporting agency. Information only — not legal or professional advice.';
/** Placeholder until the email provider form endpoint (e.g. Brevo) is created. */
export const FORM_ACTION = '/__placeholder/subscribe';
/** Add official profile URLs here once they exist; empty entries are omitted from JSON-LD. */
export const SAME_AS: string[] = [];
export const RIGHTS_CSV = '/data/rights-table.csv';
export const LICENSING_CSV = '/data/licensing-matrix.csv';

/**
 * Top-level URL namespaces the site owns. Content slugs (states, guides,
 * registry records) may never take one of these, or a data row would silently
 * shadow a page. `pro` is reserved for registry records (/pro/{slug}).
 */
export const RESERVED_SLUGS = new Set([
  'about',
  'api',
  'data',
  'learn',
  'licensing',
  'llms.txt',
  'pro',
  'rights',
  'robots.txt',
  'sitemap-index.xml',
]);

export const abs = (p: string) => `${SITE_URL}${p === '/' ? '' : p}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_ABBR = MONTHS;
export function monthYear(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}/.test(iso)) return null;
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}
export function latest(dates: Array<string | null | undefined>): string | null {
  return dates.filter((d): d is string => Boolean(d)).sort().at(-1) ?? null;
}
