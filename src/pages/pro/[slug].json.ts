// Machine-readable copy of a registry record, linked from the record page's
// "verify this with your own AI" block. Same fields as the page, plus the
// issuer lookup URLs and what we did not check.
import type { APIRoute } from 'astro';
import { getRecords, getRecord, recordJson } from '../../lib/registry';

export function getStaticPaths() {
  return getRecords().map((record) => ({ params: { slug: record.slug } }));
}

export const GET: APIRoute = ({ params }) => {
  const record = getRecord(String(params.slug));
  if (!record) return new Response('Not found', { status: 404 });
  return new Response(`${JSON.stringify(recordJson(record), null, 2)}\n`, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
