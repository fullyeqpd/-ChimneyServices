export type SourceLink = { href: string; label: string; cls: 'GOV' | 'DOC' | 'REF' };

// Pulls outbound primary-source links out of a read's text. Evidence class is
// assigned conservatively from the address alone: government domains → GOV,
// PDFs elsewhere → DOC, everything else → REF. A .com is never labeled GOV.
const URL_RE =
  /\b(?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:gov|us|org|com|net|edu|law|info)(?:\/[^\s,;)\]"'<>*]*)?/gi;

function isGov(host: string) {
  return /\.gov$|\.us$|\.mil$/.test(host) || /(^|\.)state\.[a-z]{2}\.us$/.test(host);
}

export function extractSources(text: string, extra: string[] = []): SourceLink[] {
  const found = new Map<string, SourceLink>();
  const candidates = [...(text.match(URL_RE) ?? []), ...extra.flatMap((e) => e.match(URL_RE) ?? [])];
  for (let raw of candidates) {
    if (/@/.test(raw)) continue;
    raw = raw.replace(/[.…:]+$/, '');
    // Partial URLs truncated with an ellipsis in the research text fall back to the host.
    const truncated = /…/.test(raw);
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      continue;
    }
    const host = url.hostname.toLowerCase();
    if (!host.includes('.') || /^(e\.g|i\.e)$/.test(host)) continue;
    if (/\.(md|csv)$/.test(host)) continue;
    const href = truncated ? `https://${host}/` : url.href;
    const key = href.replace(/\/$/, '');
    if (found.has(key)) continue;
    const cls: SourceLink['cls'] = isGov(host) ? 'GOV' : /\.pdf$/i.test(url.pathname) ? 'DOC' : 'REF';
    const path = truncated ? '' : url.pathname.replace(/\/$/, '');
    const label = `${host.replace(/^www\./, '')}${path ? (path.length > 28 ? `${path.slice(0, 26)}…` : path) : ''}`;
    found.set(key, { href, label, cls });
  }
  return [...found.values()];
}
