# Sanity-ready content model

Nothing here is wired up yet. No Sanity project exists; don't log in or create one from this repo.

- `schemas/statePage.ts` is the document. It mirrors `src/content/states/{slug}.json` field for field. The Zod twin is `src/content.config.ts`.
- `schemas/read.ts` is one research section (`sections[]`).
- `schemas/source.ts` is a primary source (URL + GOV/DOC/REF).
- `lastVerified` and `provenance` are required on `statePage`, `read` and `source`.

## Switching the site from JSON to Sanity

Every page gets state data through one function, `getStates()` in `src/lib/content.ts`. Once Art has created a Sanity project:

1. Install the client with `npm i @sanity/client`. Create `src/lib/sanity.ts` that exports
   `export const sanity = createClient({ projectId, dataset: 'production', apiVersion: '2026-09-01', useCdn: true })`
   and a GROQ query `export const STATE_PAGES_QUERY = '*[_type=="statePage"]{..., "slug": slug.current}'`.
2. In `src/lib/content.ts`, swap the two lines marked `SANITY SWAP`:
   ```ts
   const entries = await sanity.fetch(STATE_PAGES_QUERY);
   return entries.sort((a, b) => a.name.localeCompare(b.name));
   ```

After the swap, run `npm run build`. Pages, sitemaps (lastmod = `lastVerified`) and `llms.txt` pick up the Sanity data unchanged. `astro.config.mjs` still reads the JSON folder for sitemap lastmod. Either keep exporting JSON with the ingest, or change that block to fetch from Sanity too. To seed Sanity, import the JSON files: each file is one `statePage` document (add `_type: 'statePage'`, `slug: {current}` and `anchor: {current}`).
