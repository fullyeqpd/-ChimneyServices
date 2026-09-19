// Waiting lists (/companies, /professionals).
//
// Two short forms, one endpoint. Nothing on either list is for sale: there is
// no ranking to buy, no placement to buy, and no page that can be bought. The
// pages describe concretely what a person is waiting for — a company summary
// like /chicago, or a registry record like /pro/art-kalina — and
// say plainly what is never checked.
import licensingData from '../data/licensing.json';

/** Where the browser posts. A Cloudflare Pages Function answers it. */
export const WAITLIST_ENDPOINT = '/api/waitlist';

/** Rendered-to-submit gap a real person cannot beat, in milliseconds. */
export const MIN_FILL_MS = 3000;

/** Fallback when storage is not configured yet — a human address, by hand. */
export const FALLBACK_EMAIL = 'hello@chimney.services';
export const FALLBACK_LINE = `The list isn't open yet — email ${FALLBACK_EMAIL} and we'll add you by hand.`;

export interface UsState {
  name: string;
  abbr: string;
}

/** 50 states + DC, from the same file the licensing pages are built from. */
export const US_STATES: UsState[] = (licensingData as { states: { name: string; abbr: string }[] }).states
  .map((s) => ({ name: s.name, abbr: s.abbr }))
  .sort((a, b) => a.name.localeCompare(b.name));

/**
 * Credential checkboxes on /professionals. Issuer order is fixed everywhere on
 * this site — NCSG, then NFI, then CSIA, then any other body.
 */
export const CREDENTIAL_OPTIONS: { value: string; label: string }[] = [
  { value: 'NCSG CCP', label: 'NCSG Certified Chimney Professional (CCP)' },
  { value: 'NCSG CCJ', label: 'NCSG Certified Chimney Journeyman (CCJ)' },
  { value: 'NCSG CCR', label: 'NCSG Certified Chimney Reliner (CCR)' },
  { value: 'NFI Gas', label: 'NFI Gas Specialist' },
  { value: 'NFI Wood', label: 'NFI Woodburning Specialist' },
  { value: 'NFI Pellet', label: 'NFI Pellet Specialist' },
  { value: 'SPRAT Level 1', label: 'SPRAT Rope Access Level 1' },
  { value: 'SPRAT Level 2', label: 'SPRAT Rope Access Level 2' },
  { value: 'SPRAT Level 3', label: 'SPRAT Rope Access Level 3' },
  { value: 'CSIA CCS', label: 'CSIA Certified Chimney Sweep (CCS)' },
  { value: 'Other', label: 'Other body' },
];

/** The one line both pages carry about money and order. */
export const NO_FEE_LINE =
  'No fee to join the list. Being on it changes nothing about ranking — there is no ranking.';

/** Placement is never sold. Said plainly, on both pages, in the same words. */
export const NEVER_SOLD_LINE =
  'Placement is never sold. A page here cannot be bought, and nobody can pay to rank higher, to be added, or to be left off.';
