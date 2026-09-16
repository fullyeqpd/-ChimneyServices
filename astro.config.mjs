// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import fs from 'node:fs';
import path from 'node:path';

const SITE = 'https://www.chimney.services';

// Sitemap metadata comes from the ingested JSON so lastmod = verified date.
const statesDir = path.resolve('./src/content/states');
const states = fs.existsSync(statesDir)
  ? fs.readdirSync(statesDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(statesDir, f), 'utf8')))
  : [];
const licensingFile = path.resolve('./src/data/licensing.json');
const licensing = fs.existsSync(licensingFile) ? JSON.parse(fs.readFileSync(licensingFile, 'utf8')) : { states: [] };

const noindex = new Set(states.filter((s) => s.publishVerdict === 'DO NOT PUBLISH').map((s) => `${SITE}/${s.slug}/rights`));
const stateLastmod = Object.fromEntries(states.map((s) => [`${SITE}/${s.slug}/rights`, s.lastVerified]));
const licLastmod = Object.fromEntries(licensing.states.map((s) => [`${SITE}/${s.slug}/licensing`, s.lastChecked]));
const maxDate = (dates) => dates.filter(Boolean).sort().at(-1);
const rightsLastmod = maxDate(states.map((s) => s.lastVerified));
const licensingLastmod = maxDate(licensing.states.map((s) => s.lastChecked));

const strip = (url) => url.replace(/\/$/, '');
const withLastmod = (item, date) => (date ? { ...item, lastmod: new Date(`${date}T00:00:00Z`).toISOString() } : item);

export default defineConfig({
  site: SITE,
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [
    sitemap({
      filter: (page) => !noindex.has(strip(page)),
      chunks: {
        rights: (item) => (strip(item.url) === `${SITE}/rights` ? withLastmod(item, rightsLastmod) : undefined),
        states: (item) => (/\/[a-z-]+\/rights$/.test(strip(item.url)) ? withLastmod(item, stateLastmod[strip(item.url)]) : undefined),
        licensing: (item) => {
          const u = strip(item.url);
          if (u === `${SITE}/licensing`) return withLastmod(item, licensingLastmod);
          if (/\/[a-z-]+\/licensing$/.test(u)) return withLastmod(item, licLastmod[u]);
          return undefined;
        },
        learn: (item) => (/\/learn(\/|$)/.test(strip(item.url)) ? withLastmod(item, rightsLastmod) : undefined),
      },
    }),
  ],
});
