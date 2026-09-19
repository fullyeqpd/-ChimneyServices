// CR80 registry card (85.6 × 53.98 mm) as standalone, print-ready SVG.
//
// Shared by the /pro/{slug}/card page and scripts/gen-cards.mjs so the page
// preview and the files a print shop gets are the same artwork.
//
// The card's only job is to carry an address. No expiry date appears on it,
// and it makes no claim about the person named.
import QRCode from 'qrcode';

export const CARD_W = 85.6;
export const CARD_H = 53.98;

const INK = '#111111';
const PAPER = '#fafaf7';
const MUTED = '#5c5a55';
const RULE = '#d9d6cf';
const EMBER = '#ea1818';

const SERIF = "'Zilla Slab', 'Zilla Slab Medium', Georgia, 'Times New Roman', serif";
const SANS = "'Archivo', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "'IBM Plex Mono', 'Courier New', ui-monospace, monospace";

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The Chimney.Services mark (fireplace + stack + flame), as a nested svg. */
function mark(x, y, h) {
  const w = (h * 212) / 318;
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="112 -4 212 318">
    <g transform="translate(-336.89 -118.28)">
      <path fill="${EMBER}" d="M585,386.73c-.52,5.55-2.41,9.9-5.32,12.43l0-1.29c.18-9-2.83-17.15-8.45-24.63-2.06-2.76-11.88-13.95-11.67-26.15.06-3.91,1.13-7.78,1.71-11.6-17.35,16.37-18.57,26.81-23,40.46-3.59-4.51-9.11-6.6-15-9.14,3.44,4.2,6.79,6.9,3.47,28-1.27,8.06-1.32,15.88,2.72,23.23,2.56,4.66,8.59,9.56,14.87,11.52h.27A20,20,0,0,1,539,426l5.6,3.58h20.58l1.76-.65a31.72,31.72,0,0,0,13.34-8.46,35.53,35.53,0,0,0,7.79-15C589.63,399.69,588.69,391.33,585,386.73Zm-14.32,39.52,2.17-1.61C572.17,425.2,571.45,425.74,570.69,426.25Z"/>
      <path fill="${INK}" d="M614.07,202.33h-118L456.7,279.68V429.57h33.53V333.74s59.68-74.92,129.67,0v95.83h33.51V279.68Z"/>
    </g>
    <rect fill="${INK}" x="181.39" y="0" width="73.57" height="86.25"/>
  </svg>`;
}

const text = (x, y, s, { font = SANS, size = 2.4, fill = INK, weight = 400, track = 0, anchor = 'start' } = {}) =>
  `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${fill}"${
    track ? ` letter-spacing="${track}"` : ''
  }${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}>${esc(s)}</text>`;

const rule = (x1, x2, y, stroke = INK, w = 0.25) =>
  `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${stroke}" stroke-width="${w}"/>`;

const shell = (id, title, desc, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}mm" height="${CARD_H}mm" viewBox="0 0 ${CARD_W} ${CARD_H}" role="img" aria-labelledby="${id}-t ${id}-d">
  <title id="${id}-t">${esc(title)}</title>
  <desc id="${id}-d">${esc(desc)}</desc>
  <rect width="${CARD_W}" height="${CARD_H}" fill="${PAPER}"/>
${body}
</svg>`;

/** FRONT: mark, wordmark, what the card is, the name, the record number. */
export function frontSvg(record) {
  const M = 5;
  const R = CARD_W - M;
  const body = [
    mark(M, 3.6, 6.6),
    text(M + 5.6, 9.1, 'Chimney.Services', { font: SERIF, size: 4.3, weight: 700 }),
    rule(M, R, 12.4, RULE, 0.3),
    rule(M, M + 7, 12.4, EMBER, 0.6),
    text(M, 17.6, 'REGISTRY RECORD', { font: MONO, size: 2.6, fill: MUTED, weight: 500, track: 0.5 }),
    text(M, 26.8, record.name, { font: SERIF, size: 7, weight: 700 }),
    text(M, 33.4, record.recordNumber, { font: MONO, size: 3.6, weight: 500, track: 0.3 }),
    text(M, 39.2, 'Certifications checked against issuer rosters — see record', {
      font: SANS,
      size: 2.3,
      fill: MUTED,
    }),
    rule(M, R, 43.6, RULE, 0.3),
    text(M, 47.9, 'Not an ID. Not an endorsement. Not proof of anything.', {
      font: MONO,
      size: 2.2,
      weight: 500,
    }),
  ].join('\n');
  return shell(
    'card-front',
    `Chimney.Services registry card, front — ${record.recordNumber}`,
    `Front of the Chimney.Services registry card for ${record.name}, record ${record.recordNumber}. Not an ID, not an endorsement, not proof of anything.`,
    body,
  );
}

/** QR modules drawn as one path, scaled into a size×size box at (x, y). */
function qrPath(data, x, y, size) {
  const qr = QRCode.create(data, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const bits = qr.modules.data;
  const s = size / n;
  let d = '';
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (bits[row * n + col]) d += `M${col} ${row}h1v1h-1z`;
    }
  }
  return `<g transform="translate(${x} ${y}) scale(${s})"><path d="${d}" fill="${INK}"/></g>`;
}

/** BACK: the QR, the address it carries, and what to ask an AI to do with it. */
export function backSvg(record, url) {
  const M = 5;
  const R = CARD_W - M;
  const QR = 24;
  const printed = url.replace(/^https?:\/\//, '');
  const cut = printed.lastIndexOf('/');
  const urlLine1 = printed.slice(0, cut + 1);
  const urlLine2 = printed.slice(cut + 1);
  const col = 33.5;
  const body = [
    qrPath(url, M, 5.4, QR),
    text(col, 12.2, 'SCAN WITH THE AI', { font: MONO, size: 3.1, weight: 600, track: 0.15 }),
    text(col, 16.5, 'OF YOUR CHOICE.', { font: MONO, size: 3.1, weight: 600, track: 0.15 }),
    text(col, 22.4, 'Ask it to check this record', { font: SANS, size: 2.35, fill: MUTED }),
    text(col, 25.6, 'against the issuer rosters.', { font: SANS, size: 2.35, fill: MUTED }),
    text(M, 34.2, urlLine1, { font: MONO, size: 2.4, weight: 500 }),
    text(M, 37.6, urlLine2, { font: MONO, size: 2.4, weight: 500 }),
    rule(M, R, 42.6, RULE, 0.3),
    rule(M, M + 7, 42.6, EMBER, 0.6),
    mark(M, 44.6, 5.6),
    text(M + 4.8, 48.9, 'Chimney.Services', { font: SERIF, size: 3.4, weight: 700 }),
    text(R, 48.9, record.recordNumber, { font: MONO, size: 2.6, fill: MUTED, weight: 500, anchor: 'end' }),
  ].join('\n');
  return shell(
    'card-back',
    `Chimney.Services registry card, back — ${record.recordNumber}`,
    `Back of the Chimney.Services registry card for record ${record.recordNumber}: a QR code for ${url}, with the address printed beneath it.`,
    body,
  );
}
