// Content collection for state rights pages.
// Source: JSON written by `npm run ingest` (scripts/ingest.mjs) into src/content/states/.
// The Sanity schemas in /sanity mirror this shape — see sanity/README.md for the swap.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const verdictCell = z.object({
  id: z.string(),
  label: z.string(),
  answer: z.string(),
  note: z.string().nullable(),
  anchor: z.string(),
  rule: z.string(),
  derivedFrom: z.string(),
  evidence: z.string().nullable(),
});

const section = z.object({
  number: z.string(),
  key: z.string(),
  anchor: z.string(),
  group: z.string().nullable(),
  rawHeading: z.string(),
  researchTitle: z.string(),
  title: z.string(),
  evidence: z.array(z.enum(['GOV', 'DOC', 'REF'])),
  confidenceNote: z.string().nullable(),
  markdown: z.string(),
});

const states = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/states' }),
  schema: z.object({
    slug: z.string(),
    name: z.string(),
    abbr: z.string().length(2),
    sourceFile: z.string(),
    researched: z.string().nullable(),
    lawsCitedAs: z.string().nullable(),
    headerNote: z.string().nullable(),
    verified: z.string().nullable(),
    lastVerified: z.string().nullable(),
    provenance: z.enum(['PUBLIC RECORD', 'REPORTED BY BUSINESS', 'VERIFIED BY CHIMNEY.SERVICES']),
    publishVerdict: z.enum(['READY', 'READY WITH CAVEATS', 'DO NOT PUBLISH', 'UNVERIFIED']),
    publishVerdictNote: z.string().nullable(),
    verification: z.object({ heading: z.string(), checked: z.string().nullable(), markdown: z.string() }).nullable(),
    sections: z.array(section),
    story: z.object({ heading: z.string(), markdown: z.string() }).nullable(),
    faqSeeds: z.array(z.object({ q: z.string(), a: z.string() })).nullable(),
    table: z.record(z.string(), z.string()).nullable(),
    tableStatus: z.enum(['IN TABLE', 'NOT YET IN TABLE']),
    tableRowStale: z.boolean(),
    summary: z
      .object({
        source: z.string(),
        license_regime: z.string(),
        registration_name: z.string(),
        disclosure_law: z.string(),
        chimney_item_on_form: z.string(),
        three_day_cancel: z.string(),
        co_law: z.string(),
        lookup_url: z.string(),
      })
      .nullable(),
    verdictGrid: z.array(verdictCell),
    h1: z.string().max(90),
    metaDescription: z.string().max(155),
    municipal: z.object({ cities: z.string().nullable(), derivedFrom: z.string().nullable() }),
    season: z.object({
      rush: z.array(z.number()),
      best: z.array(z.number()),
      rushParsed: z.boolean(),
      bestParsed: z.boolean(),
      note: z.string().nullable(),
    }),
    faq: z.array(z.object({ id: z.string(), q: z.string(), a: z.string(), expanded: z.boolean(), derivedFrom: z.string() })),
    compare: z
      .object({
        neighborSlug: z.string(),
        neighborName: z.string(),
        label: z.string(),
        verdictId: z.string(),
        a: z.object({ answer: z.string(), note: z.string().nullable() }),
        b: z.object({ answer: z.string(), note: z.string().nullable() }),
        neighborPublishVerdict: z.string(),
      })
      .nullable(),
  }),
});

export const collections = { states };
