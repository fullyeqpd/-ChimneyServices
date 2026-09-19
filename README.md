# Chimney.Services laws site

A static Astro site: `/`, `/rights`, `/{state}/rights`, `/licensing`, `/{state}/licensing`, `/about`, `/learn`, `/chicago`, `/pro/{slug}`, `/companies`, `/professionals`, plus `llms.txt`, segmented sitemaps (rights / states / licensing / learn / pro / pages) and CSV downloads. One Cloudflare Pages Function, `functions/api/waitlist.ts`, backs the two waiting lists.

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

## Waitlist storage

`/companies` and `/professionals` post JSON to `/api/waitlist`, answered by the Cloudflare Pages Function in `functions/api/waitlist.ts`. Pages picks `functions/` up automatically — it is never built into `dist/`. Two dashboard steps make it store anything:

1. **Workers & Pages → KV → Create a namespace**, named `chimney-services-waitlist`.
2. **Pages → the site → Settings → Bindings → KV namespace**: add binding **`WAITLIST`** → that namespace, for **Production and Preview** both.

Optional environment variables (Settings → Environment variables, same two environments):

| Variable | Effect |
|---|---|
| `ADMIN_KEY` | Enables the CSV export. Without it, `GET /api/waitlist` is a 404. |
| `WAITLIST_SALT` | Salt for the stored IP hash. Falls back to `cs`. |

Export: `https://www.chimney.services/api/waitlist?key=$ADMIN_KEY` returns every entry as CSV. Entries are stored one per KV key, `waitlist:{type}:{ISO timestamp}:{uuid}`, holding the submitted fields plus a SHA-256 hash of the IP, the user agent and the timestamp. Raw IPs are never stored.

Until the `WAITLIST` binding exists the endpoint answers `503 {"ok":false,"error":"storage not configured"}` and both pages show: *The list isn't open yet — email hello@chimney.services and we'll add you by hand.*

Validation lives in the function, not in the browser: list type, email shape, required fields per list, an empty `website2` honeypot, a render-to-submit gap of at least 3 seconds, a body under 8 KB, and 5 posts per IP per minute. Requests are same-origin only and every response is `Cache-Control: no-store`.

## DNS cutover

Only the web record changes. Point `www` (and the apex, with a redirect to `www`) at Pages using the A/CNAME target Cloudflare gives you. Leave everything else alone:

- **MX**: keep the Google Workspace records.
- **TXT**: keep the Brevo SPF record, plus any Google or Brevo verification/DKIM records.

## Before launch

- The email forms post to the placeholder `/__placeholder/subscribe`. Set `FORM_ACTION` in `src/lib/site.ts` to the Brevo form endpoint.
- Add official profile URLs to `SAME_AS` in `src/lib/site.ts`. Organization JSON-LD omits `sameAs` until then.
- To move content to Sanity, see `sanity/README.md`.
