// Single data-access seam for state pages.
// Today: the JSON content collection written by `npm run ingest`.
// Sanity swap (see sanity/README.md): replace the two marked lines with a Sanity client fetch.
import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import rightsTable from '../data/rights-table.json';
import licensing from '../data/licensing.json';

export type StatePage = CollectionEntry<'states'>['data'];

export async function getStates(): Promise<StatePage[]> {
  const entries = await getCollection('states'); // SANITY SWAP line 1: const entries = await sanity.fetch(STATE_PAGES_QUERY)
  return entries.map((e) => e.data).sort((a, b) => a.name.localeCompare(b.name)); // SANITY SWAP line 2: return entries.sort(...)
}

export type RightsRow = (typeof rightsTable.rows)[number] & { notInTable?: boolean };
export const getRightsTable = () => rightsTable as { header: string[]; rows: RightsRow[]; csvRowCount: number; csvModified: string };

export type LicensingState = (typeof licensing.states)[number];
export const getLicensing = () => licensing;
