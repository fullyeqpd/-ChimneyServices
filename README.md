# Chimney.Services laws site

A static Astro site: `/`, `/rights`, `/{state}/rights`, `/licensing`, `/{state}/licensing`, `/about`, `/learn`, plus `llms.txt`, segmented sitemaps and CSV downloads.

## Commands

```bash
npm install
npm run ingest      # re-read ../rights-research and ../licensing-research → src/content/states/*.json, src/data/*.json, public/data/*.csv
npm run build       # astro build → dist/ (never reads the research folders)
npm run check:dist  # post-build gate: one H1, titles, JSON-LD, anchors, internal links, banned strings, cert order
npm run preview
```

- The ingest only reads the research folders, never writes to them. You can rerun it any time a state file changes.
- To point it at other folders, set `RIGHTS_DIR=/path LICENSING_DIR=/path npm run ingest`.
- `src/data/ingest-report.json` records every verdict-grid rule that fired and any CSV problems.
- Commit the generated JSON and CSV. Cloudflare builds from those files, because it has no copy of the research folders.

## Cloudflare Pages

| Setting | Value |
|---|---|
| Framework preset | Astro (or None) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | `NODE_VERSION=22` (Astro 7 needs Node ≥ 22.12) |

URLs have no trailing slash: `build.format: 'file'` outputs `missouri/rights.html`, which Pages serves at `/missouri/rights`. Every canonical URL is `https://www.chimney.services/...`.

## DNS cutover

Only the web record changes. Point `www` (and the apex, with a redirect to `www`) at Pages using the A/CNAME target Cloudflare gives you. Leave everything else alone:

- **MX**: keep the Google Workspace records.
- **TXT**: keep the Brevo SPF record, plus any Google or Brevo verification/DKIM records.

## Before launch

- The email forms post to the placeholder `/__placeholder/subscribe`. Set `FORM_ACTION` in `src/lib/site.ts` to the Brevo form endpoint.
- Add official profile URLs to `SAME_AS` in `src/lib/site.ts`. Organization JSON-LD omits `sameAs` until then.
- To move content to Sanity, see `sanity/README.md`.
