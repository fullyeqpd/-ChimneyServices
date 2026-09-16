export const CATEGORY_LABEL: Record<string, string> = {
  sweep: 'Chimney sweeping',
  'stove-install': 'Stove & insert installation',
  'gas-fireplace-service': 'Gas fireplace service',
  'gas-log-install': 'Gas log installation',
  'chimney-flashing': 'Chimney flashing',
};
export const CATEGORY_ORDER = ['sweep', 'stove-install', 'chimney-flashing', 'gas-fireplace-service', 'gas-log-install'];

export function splitUrls(v: string | undefined | null): string[] {
  if (!v) return [];
  return [...new Set(v.match(/https?:\/\/[^\s;,]+/g) ?? [])].map((u) => u.replace(/[.)]+$/, ''));
}
export function urlLabel(u: string): string {
  try {
    const url = new URL(u);
    const p = url.pathname.replace(/\/$/, '');
    return `${url.hostname.replace(/^www\./, '')}${p ? (p.length > 30 ? `${p.slice(0, 28)}…` : p) : ''}`;
  } catch {
    return u;
  }
}
export function srcClass(u: string): 'GOV' | 'DOC' | 'REF' {
  try {
    const url = new URL(u);
    if (/\.gov$|\.us$/.test(url.hostname)) return 'GOV';
    if (/\.pdf$/i.test(url.pathname)) return 'DOC';
  } catch {
    /* ignore */
  }
  return 'REF';
}
export const credentialLabel = (v: string) => (v ? v.toUpperCase() : '—');
