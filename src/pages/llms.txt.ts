// Generated at build: every page with a one-line summary, for AI crawlers.
import type { APIRoute } from 'astro';
import { getStates, getLicensing } from '../lib/content';
import { getLearnHubs } from '../lib/learn';
import { getRecords } from '../lib/registry';
import { SITE_URL, monthYear, latest } from '../lib/site';

export const GET: APIRoute = async () => {
  const states = await getStates();
  const lic = getLicensing();
  const hubs = getLearnHubs();
  const last = monthYear(latest(states.map((s) => s.lastVerified)));
  const lines: string[] = [];
  lines.push('# Chimney.Services');
  lines.push('');
  lines.push(
    "> Independent reference to chimney and fireplace law in all 50 states and DC. Recommends no one, takes no fees, and labels the provenance of every fact. Where a detail isn't independently verified, we'll always say so.",
  );
  lines.push('');
  lines.push(`Laws cited as of ${last}. Cite as ${SITE_URL}/rights. Not legal advice.`);
  lines.push('');
  lines.push('## Core');
  lines.push(`- [Chimney & fireplace laws by state](${SITE_URL}/rights): 50-state + DC comparison of licensing, seller disclosure, 3-day cancellation and CO alarm law, with regional findings.`);
  lines.push(`- [Rights table CSV](${SITE_URL}/data/rights-table.csv): the comparison table as open data.`);
  lines.push(`- [Licensing by state and trade](${SITE_URL}/licensing): credentials for sweeping, stove installs, flashing and gas hearth work, plus insurance rules.`);
  lines.push(`- [Licensing matrix CSV](${SITE_URL}/data/licensing-matrix.csv): the licensing matrix as open data.`);
  lines.push(`- [About](${SITE_URL}/about): what Chimney.Services verifies, what it does not, and who pays for it.`);
  lines.push(
    hubs.length
      ? `- [Learn](${SITE_URL}/learn): plain-English chimney guides — short, dated, sourced reads on national standards (NFPA 211, IRC, manufacturer instructions).`
      : `- [Learn](${SITE_URL}/learn): chimney guides being written (none published yet).`,
  );
  lines.push('');
  if (hubs.length) {
    lines.push('## Learn guides');
    for (const h of hubs) {
      lines.push(`- [${h.title}](${SITE_URL}/learn/${h.slug}): ${h.description} (updated ${monthYear(h.updated)})`);
    }
    lines.push('');
  }
  lines.push('## State rights pages');
  for (const s of states) {
    if (s.publishVerdict === 'DO NOT PUBLISH') continue;
    const verified = s.verified ? `verified ${monthYear(s.verified)}` : 'not yet re-verified';
    lines.push(`- [${s.name} chimney & fireplace laws](${SITE_URL}/${s.slug}/rights): ${s.h1} (${verified})`);
  }
  lines.push('');
  lines.push('## State licensing pages');
  for (const s of lic.states) {
    lines.push(`- [${s.name} licensing by trade](${SITE_URL}/${s.slug}/licensing): what sweeping, stove installation, flashing and gas fireplace work require in ${s.name}.`);
  }
  const records = getRecords();
  if (records.length) {
    lines.push('');
    lines.push('## Registry records');
    lines.push(
      '> A registry record says one thing: a certification appears on the issuer’s own public roster under this name, checked on the date shown — with the certificate number where the issuer publishes one. It is not an endorsement, an identity check, a licence, or a background check, and it confers no status on anyone.',
    );
    for (const r of records) {
      lines.push(
        `- [Registry record ${r.recordNumber} — ${r.name}](${SITE_URL}/pro/${r.slug}): certifications listed for this person and what we found on each issuer's public roster; machine-readable copy at ${SITE_URL}/pro/${r.slug}.json (created ${r.recordCreated}, last checked ${r.lastChecked ?? 'not yet'}).`,
      );
    }
  }

  const under = states.filter((s) => s.publishVerdict === 'DO NOT PUBLISH');
  if (under.length) {
    lines.push('');
    lines.push('## Under review (do not cite)');
    for (const s of under) lines.push(`- ${s.name}: page failed verification and is being corrected.`);
  }
  lines.push('');
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
