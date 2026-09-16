import { Marked } from 'marked';

// Certification order on this site is always NCSG → NFI → CSIA. The research
// files often list CSIA first; these rewrites only reorder the list, never the facts.
const CERT_ORDER_FIXES: Array<[RegExp, string]> = [
  [/CSIA CCS, C-DET; NCSG (CC[A-Z/]+)/g, 'NCSG $1; CSIA CCS, C-DET'],
  [/CSIA CCS\/C-DET; NCSG (CC[A-Z/]+)/g, 'NCSG $1; CSIA CCS/C-DET'],
  [/CSIA\/NCSG\/NFI/g, 'NCSG/NFI/CSIA'],
  [/CSIA\/NCSG/g, 'NCSG/CSIA'],
  [/CSIA CCS \/ NCSG/g, 'NCSG / CSIA CCS'],
  [/CSIA or NCSG/g, 'NCSG or CSIA'],
  [/CSIA, NCSG, (?:and |or )?NFI/g, 'NCSG, NFI, CSIA'],
  [/CSIA\/CCP\/NCSG/g, 'NCSG/CCP/CSIA'],
  [/CSIA, CCP, OR NCSG/g, 'NCSG, CCP, OR CSIA'],
  [/CSIA or CCP or NCSG/gi, 'NCSG, CCP or CSIA'],
  [/CSIA\/NFI/g, 'NFI/CSIA'],
  [/NFI\/NCSG/g, 'NCSG/NFI'],
  [/NFI or NCSG/g, 'NCSG or NFI'],
  [/NFI, CSIA,? (?:and |or )?NCSG/g, 'NCSG, NFI, CSIA'],
];

export function fixCertOrder(text: string): string {
  return CERT_ORDER_FIXES.reduce((t, [re, rep]) => t.replace(re, rep), text);
}

// Research-voice "confirm before publish" parentheticals are kept (honesty) but labeled.
function flagOpenNotes(md: string): string {
  return md.replace(/\*\(([^*]*?(?:before publish|UNVERIFIED|NOT VERIFIED|confirm)[^*]*?)\)\*/gi, (_m, inner: string) => {
    return `<span class="open-note"><span class="open-note__flag">NOT YET CONFIRMED</span> ${escapeHtml(inner)}</span>`;
  });
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const md = new Marked({ gfm: true, breaks: false });
md.use({
  renderer: {
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const external = /^https?:\/\//.test(href);
      const t = title ? ` title="${escapeHtml(title)}"` : '';
      return `<a href="${escapeHtml(href)}"${t}${external ? ' rel="noopener" target="_blank"' : ''}>${text}</a>`;
    },
    heading({ tokens, depth }) {
      // Research bodies never get to emit H1/H2 — the page owns those levels.
      const level = Math.max(depth, 4);
      return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`;
    },
  },
});

// The "Publish blockers" list is never rendered, so prose pointers to it are reworded.
function dropBlockerPointers(md: string): string {
  return md
    .replace(/[;,]?\s*see (the )?(publish )?blockers\b/gi, '')
    .replace(/\b(see|per|in|listed in|under) (the )?Publish blockers\b/gi, 'still open in our research').replace(/\bPublish blockers\b/g, 'open research items');
}

export function renderMd(markdown: string | null | undefined): string {
  if (!markdown) return '';
  return md.parse(flagOpenNotes(fixCertOrder(dropBlockerPointers(markdown))), { async: false }) as string;
}

export function renderInline(markdown: string | null | undefined): string {
  if (!markdown) return '';
  return md.parseInline(fixCertOrder(markdown), { async: false }) as string;
}

export function plain(markdown: string | null | undefined): string {
  if (!markdown) return '';
  return fixCertOrder(markdown)
    .replace(/<[^>]+>/g, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|[.,;:)]|$)/g, '$1$2')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function firstSentences(markdown: string, n: number): string {
  const parts = plain(markdown).split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/);
  return parts.slice(0, n).join(' ');
}
