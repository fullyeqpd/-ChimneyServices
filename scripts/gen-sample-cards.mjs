#!/usr/bin/env node
/**
 * Sample ID cards — public/pro/cards/*.svg and *.png
 *
 * What a card is: the printed version of a record page. It carries the record
 * number, the certifications as their issuers name them, the date the rosters
 * were checked, and a QR code that opens the record. It is not a licence, not
 * an insurance certificate and not a background check, and the back of the
 * card says so in those words.
 *
 * Three designs are drawn:
 *   front / back — the full card: photograph, dates, and the three things the
 *                 card is not, printed on it.
 *   simple      — a name, two certification lines and a QR code, and nothing
 *                 else. Everything the full card prints on itself — the dates,
 *                 the evidence, what was never checked — is on the record page
 *                 the QR code opens, so the card does not repeat it.
 *
 * Two people are drawn:
 *   art-kalina  — a real record, CS-P-00001, with the photograph that record
 *                 already carries. This one also gets the simple design.
 *   sample      — a deliberately fictional one, CS-P-00000 / "Sample
 *                 Technician" / "Example Chimney Co.", drawn with a silhouette
 *                 rather than any real person's face and watermarked SAMPLE, so
 *                 no reader can mistake the layout demo for a person.
 *
 * Geometry: CR80, 3.375in x 2.125in. The design is laid out at 1012 x 638 CSS
 * pixels and rasterized at 2x (2024 x 1276).
 *
 * Fonts: the SVG names the site's own families with system fallbacks, so it is
 * portable. Rasterizing needs the real faces, and Google Fonts is not reachable
 * from the build, so the PNG step declares @font-face against the @fontsource
 * copies in node_modules. If those are missing the PNG still renders, in the
 * fallback serif/sans/mono stacks, and this script says so.
 *
 * Usage: node scripts/gen-sample-cards.mjs [--no-png]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(SITE, 'public', 'pro', 'cards');
const SITE_URL = 'https://www.chimney.services';

// ---- Direction A, on a card ----------------------------------------------
const INK = '#111111';
const PAPER = '#FAFAF7';
const RULE = '#D9D6CF';
const MUTED = '#5C5A55';
const EMBER = '#ea1818';
const PANEL = '#F3F2ED';

const DISPLAY = "'Zilla Slab', Georgia, 'Times New Roman', serif";
const BODY = "'Archivo', 'Helvetica Neue', Arial, sans-serif";
const MONO = "'IBM Plex Mono', 'DejaVu Sans Mono', ui-monospace, Menlo, monospace";

const W = 1012;
const H = 638;
const SCALE = 2;
const PAD = 38;

const CHECKED = 'CHECKED 18 SEP 2026';

/** The site mark from src/components/Logo.astro, at its own viewBox scale. */
const MARK_VIEWBOX = '112 -4 212 318';
const MARK_BODY = `<g transform="translate(-336.89 -118.28)"><path fill="${EMBER}" d="M585,386.73c-.52,5.55-2.41,9.9-5.32,12.43l0-1.29c.18-9-2.83-17.15-8.45-24.63-2.06-2.76-11.88-13.95-11.67-26.15.06-3.91,1.13-7.78,1.71-11.6-17.35,16.37-18.57,26.81-23,40.46-3.59-4.51-9.11-6.6-15-9.14,3.44,4.2,6.79,6.9,3.47,28-1.27,8.06-1.32,15.88,2.72,23.23,2.56,4.66,8.59,9.56,14.87,11.52h.27A20,20,0,0,1,539,426l5.6,3.58h20.58l1.76-.65a31.72,31.72,0,0,0,13.34-8.46,35.53,35.53,0,0,0,7.79-15C589.63,399.69,588.69,391.33,585,386.73Zm-14.32,39.52,2.17-1.61C572.17,425.2,571.45,425.74,570.69,426.25Z"/><path fill="${INK}" d="M614.07,202.33h-118L456.7,279.68V429.57h33.53V333.74s59.68-74.92,129.67,0v95.83h33.51V279.68Z"/></g><rect fill="${INK}" x="181.39" y="0" width="73.57" height="86.25"/>`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The QR, as one path of module squares. Quiet zone is four modules, which is
 * what the spec asks for and what a phone camera needs at card size.
 */
function qrPath(text, x, y, size, margin = 4) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const total = n + margin * 2;
  const unit = size / total;
  const parts = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.modules.get(r, c)) continue;
      const px = x + (c + margin) * unit;
      const py = y + (r + margin) * unit;
      // Half-pixel overlap: adjacent modules must not show a seam once the
      // raster rounds each edge independently.
      parts.push(`M${px.toFixed(3)} ${py.toFixed(3)}h${(unit + 0.04).toFixed(3)}v${(unit + 0.04).toFixed(3)}h${(-unit - 0.04).toFixed(3)}z`);
    }
  }
  return {
    svg: `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${PAPER}"/><path d="${parts.join('')}" fill="${INK}"/>`,
    modules: n,
  };
}

const text = (s, { x, y, font = BODY, size = 16, weight = 400, fill = INK, spacing = 0, anchor = 'start' }) =>
  `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${fill}"${
    spacing ? ` letter-spacing="${spacing}"` : ''
  }${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}>${esc(s)}</text>`;

/** Card stock: paper, a 1px ink border, and the 12px radius of a real card. */
const stock = () =>
  `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" ry="12" fill="${PAPER}" stroke="${INK}" stroke-width="1"/>`;

const masthead = (y = 34) =>
  `<svg x="${PAD}" y="${y}" width="36" height="54" viewBox="${MARK_VIEWBOX}">${MARK_BODY}</svg>` +
  text('Chimney.Services', { x: PAD + 48, y: y + 38, font: DISPLAY, size: 27, weight: 700 });

const sampleWatermark = () =>
  `<g opacity="0.07"><text x="${W / 2}" y="${H / 2 + 60}" font-family="${DISPLAY}" font-size="190" font-weight="700" fill="${INK}" text-anchor="middle" letter-spacing="16" transform="rotate(-21 ${W / 2} ${H / 2})">SAMPLE</text></g>`;

/** A person-shaped block where a photograph would go. Nobody's face. */
const silhouette = (x, y, size) =>
  `<g><rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${PANEL}" stroke="${INK}" stroke-width="1"/>` +
  `<circle cx="${x + size / 2}" cy="${y + size * 0.36}" r="${size * 0.17}" fill="${MUTED}" opacity="0.45"/>` +
  `<path d="M${x + size * 0.18} ${y + size} a${size * 0.32} ${size * 0.3} 0 0 1 ${size * 0.64} 0z" fill="${MUTED}" opacity="0.45"/></g>`;

const photo = (dataUri, x, y, size) =>
  `<g><image x="${x}" y="${y}" width="${size}" height="${size}" href="${dataUri}" preserveAspectRatio="xMidYMid slice"/>` +
  `<rect x="${x + 0.5}" y="${y + 0.5}" width="${size - 1}" height="${size - 1}" fill="none" stroke="${INK}" stroke-width="1"/></g>`;

// ---- Front ----------------------------------------------------------------
function front(card) {
  const PHOTO = 176;
  const px = PAD;
  const py = 196;
  const col = px + PHOTO + 30; // text column
  const out = [stock()];
  if (card.sample) out.push(sampleWatermark());
  out.push(masthead());

  // One thin ember rule under the masthead, and nothing else in ember.
  out.push(`<rect x="${PAD}" y="106" width="${W - PAD * 2}" height="1" fill="${EMBER}"/>`);
  out.push(
    text(`REGISTRY RECORD · ${card.recordNumber}`, {
      x: PAD,
      y: 140,
      font: MONO,
      size: 16,
      weight: 500,
      fill: MUTED,
      spacing: 2.4,
    }),
  );

  out.push(card.photoDataUri ? photo(card.photoDataUri, px, py, PHOTO) : silhouette(px, py, PHOTO));
  out.push(
    text(card.photoLabel, { x: px, y: py + PHOTO + 22, font: MONO, size: 10.5, fill: MUTED, spacing: 1.2 }),
  );

  out.push(text(card.name, { x: col, y: py + 44, font: DISPLAY, size: 48, weight: 700 }));
  if (card.roleLine) out.push(text(card.roleLine, { x: col, y: py + 74, font: BODY, size: 17, fill: MUTED }));

  // Certifications, in the site's fixed body order, issuer abbreviation in
  // mono so the eye can find the body before it reads the specialty.
  let y = py + 118;
  for (const c of card.credentials) {
    out.push(text(c.issuer, { x: col, y, font: MONO, size: 15, weight: 500, fill: MUTED, spacing: 1.4 }));
    out.push(text(c.line, { x: col + 84, y, font: BODY, size: 18, weight: 500 }));
    y += 32;
  }

  // The footing: the date the rosters were checked, and the three things the
  // card is not — said on the front, where somebody reads it at a doorstep.
  const qrSize = 186;
  const footRule = H - PAD - 74;
  out.push(`<rect x="${PAD}" y="${footRule}" width="${W - PAD * 2 - qrSize - 30}" height="1" fill="${RULE}"/>`);
  out.push(text(CHECKED, { x: PAD, y: footRule + 34, font: MONO, size: 14, weight: 500, spacing: 1.6 }));
  out.push(
    text('NOT A LICENCE · NOT AN INSURANCE CERTIFICATE · NOT A BACKGROUND CHECK', {
      x: PAD,
      y: footRule + 60,
      font: MONO,
      size: 11,
      fill: MUTED,
      spacing: 1,
    }),
  );

  const qx = W - PAD - qrSize;
  const qy = H - PAD - qrSize;
  out.push(qrPath(card.url, qx, qy, qrSize).svg);
  out.push(
    text('SCAN TO CHECK', {
      x: qx + qrSize / 2,
      y: qy - 12,
      font: MONO,
      size: 10.5,
      fill: MUTED,
      spacing: 1.6,
      anchor: 'middle',
    }),
  );
  return out.join('');
}

// ---- Simple front ---------------------------------------------------------
//
// The card a person actually hands over. Who, what two bodies say, and a code
// that opens the record. No photograph, no dates, no disclaimer strip: those
// live on the page the code opens, where a reader has room to read them, and
// repeating them here would only make a small card harder to take in.
function simple(card) {
  const out = [stock(), masthead()];
  out.push(`<rect x="${PAD}" y="106" width="${W - PAD * 2}" height="1" fill="${EMBER}"/>`);

  const qrSize = 220;
  const qx = W - PAD - qrSize;
  const qy = 238;
  out.push(qrPath(card.url, qx, qy, qrSize).svg);
  out.push(
    text(`SCAN TO CHECK · ${card.recordNumber}`, {
      x: qx + qrSize / 2,
      y: qy + qrSize + 30,
      font: MONO,
      size: 13,
      weight: 500,
      fill: MUTED,
      spacing: 1.6,
      anchor: 'middle',
    }),
  );

  out.push(text(card.name, { x: PAD, y: 308, font: DISPLAY, size: 60, weight: 700 }));
  if (card.roleLine) out.push(text(card.roleLine, { x: PAD, y: 348, font: BODY, size: 19, fill: MUTED }));

  let y = 412;
  for (const c of card.simpleCredentials ?? card.credentials) {
    out.push(text(c.issuer, { x: PAD, y, font: MONO, size: 17, weight: 500, fill: MUTED, spacing: 1.4 }));
    out.push(text(c.line, { x: PAD + 104, y, font: BODY, size: 20, weight: 500 }));
    y += 44;
  }
  return out.join('');
}

// ---- Back -----------------------------------------------------------------
function back(card) {
  const out = [stock()];
  if (card.sample) out.push(sampleWatermark());
  const qrSize = 300;
  const qx = PAD + 14;
  const qy = (H - qrSize) / 2;
  out.push(qrPath(card.url, qx, qy, qrSize).svg);

  const tx = qx + qrSize + 40;
  out.push(`<svg x="${tx}" y="${PAD + 28}" width="30" height="45" viewBox="${MARK_VIEWBOX}">${MARK_BODY}</svg>`);
  out.push(text('Chimney.Services', { x: tx + 40, y: PAD + 60, font: DISPLAY, size: 23, weight: 700 }));
  out.push(`<rect x="${tx}" y="${PAD + 84}" width="${W - tx - PAD}" height="1" fill="${EMBER}"/>`);

  out.push(
    text(card.recordNumber, { x: tx, y: PAD + 136, font: MONO, size: 30, weight: 500, spacing: 2.4 }),
  );
  out.push(text('Scan to check this record on Chimney.Services', { x: tx, y: PAD + 172, font: BODY, size: 17 }));

  const lines = [
    'This card confirms a roster check on the date',
    'shown. It is not a licence, an insurance',
    'certificate or a background check.',
  ];
  lines.forEach((l, i) => out.push(text(l, { x: tx, y: PAD + 236 + i * 26, font: BODY, size: 15.5, fill: MUTED })));
  out.push(text(CHECKED, { x: tx, y: H - PAD - 6, font: MONO, size: 13, weight: 500, fill: MUTED, spacing: 1.6 }));
  return out.join('');
}

const document_ = (title, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">` +
  `<title>${esc(title)}</title>` +
  `<style>@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&amp;family=IBM+Plex+Mono:wght@400;500&amp;family=Zilla+Slab:wght@600;700&amp;display=swap');text{dominant-baseline:auto}</style>` +
  `${body}</svg>`;

// ---- The two cards --------------------------------------------------------
const photoFile = path.join(SITE, 'public', 'pro', 'photos', 'art-kalinicenko-00001-160.jpg');
const photoDataUri = fs.existsSync(photoFile)
  ? `data:image/jpeg;base64,${fs.readFileSync(photoFile).toString('base64')}`
  : null;
if (!photoDataUri) console.warn('warning: no photograph at public/pro/photos/art-kalinicenko-00001-160.jpg');

const CARDS = [
  {
    key: 'art-kalina',
    sample: false,
    recordNumber: 'CS-P-00001',
    name: 'Art Kalina',
    roleLine: 'Chimney Monkey · Buffalo Grove, IL',
    credentials: [
      { issuer: 'NFI', line: 'Certified · Woodburning Specialist' },
      { issuer: 'SPRAT', line: 'Certified · Level 1 #2602623' },
    ],
    // Shorter on the simple card, where there is nothing else to read.
    simpleCredentials: [
      { issuer: 'NFI', line: 'Woodburning Specialist' },
      { issuer: 'SPRAT', line: 'Level 1 · #2602623' },
    ],
    faces: ['front', 'back', 'simple'],
    url: `${SITE_URL}/pro/art-kalina`,
    photoDataUri,
    photoLabel: 'SUPPLIED — NOT CHECKED',
    title: 'Chimney.Services registry record card CS-P-00001, Art Kalina',
  },
  {
    key: 'sample',
    sample: true,
    recordNumber: 'CS-P-00000',
    name: 'Sample Technician',
    roleLine: 'Example Chimney Co. · Anytown, ST',
    credentials: [
      { issuer: 'NCSG', line: 'Certified Chimney Professional (CCP)' },
      { issuer: 'NFI', line: 'Certified · Gas Specialist' },
      { issuer: 'CSIA', line: 'Certified Chimney Sweep (CCS)' },
    ],
    faces: ['front', 'back'],
    url: `${SITE_URL}/professionals#order`,
    photoDataUri: null,
    photoLabel: 'SAMPLE — NOT A REAL PERSON',
    title: 'Sample Chimney.Services registry record card, CS-P-00000',
  },
];

// ---- Rasterize ------------------------------------------------------------
const CHROMES = [
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
];
const chrome = CHROMES.find((c) => fs.existsSync(c));

const FONT_FACES = [
  ['Zilla Slab', 700, '@fontsource/zilla-slab/files/zilla-slab-latin-700-normal.woff2'],
  ['Zilla Slab', 600, '@fontsource/zilla-slab/files/zilla-slab-latin-600-normal.woff2'],
  ['Archivo', 400, '@fontsource/archivo/files/archivo-latin-400-normal.woff2'],
  ['Archivo', 500, '@fontsource/archivo/files/archivo-latin-500-normal.woff2'],
  ['Archivo', 600, '@fontsource/archivo/files/archivo-latin-600-normal.woff2'],
  ['IBM Plex Mono', 400, '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2'],
  ['IBM Plex Mono', 500, '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2'],
];

function fontCss() {
  const faces = [];
  let missing = 0;
  for (const [family, weight, rel] of FONT_FACES) {
    const file = path.join(SITE, 'node_modules', rel);
    if (!fs.existsSync(file)) {
      missing++;
      continue;
    }
    const b64 = fs.readFileSync(file).toString('base64');
    faces.push(
      `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2')}`,
    );
  }
  return { css: faces.join(''), ok: faces.length, missing };
}

const fonts = fontCss();

function rasterize(svg, outFile) {
  if (!chrome) throw new Error('no chromium binary found for rasterizing');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-cards-'));
  const page = path.join(tmp, 'card.html');
  // The SVG is inlined, so the fonts declared here apply to its <text>. Sized
  // at 2x, with the design's own coordinates kept in the viewBox.
  const sized = svg.replace(`width="${W}" height="${H}"`, `width="${W * SCALE}" height="${H * SCALE}"`);
  fs.writeFileSync(
    page,
    `<!doctype html><meta charset="utf-8"><style>${fonts.css}html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>${sized}`,
  );
  execFileSync(
    chrome,
    [
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      '--default-background-color=00000000',
      '--force-device-scale-factor=1',
      `--window-size=${W * SCALE},${H * SCALE}`,
      `--screenshot=${outFile}`,
      `file://${page}`,
    ],
    { stdio: ['ignore', 'ignore', 'ignore'] },
  );
  fs.rmSync(tmp, { recursive: true, force: true });
}

/** Read the QR back out of the rendered PNG, which is the only honest check. */
function decode(file, expected) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const found = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  if (!found) return { ok: false, reason: 'no QR found in the PNG' };
  if (found.data !== expected) return { ok: false, reason: `QR decodes to ${found.data}` };
  return { ok: true };
}

// ---- Run ------------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true });
const wantPng = !process.argv.includes('--no-png');
const results = [];
const DESIGNS = { front, back, simple };
let written = 0;

for (const card of CARDS) {
  for (const face of card.faces) {
    const draw = DESIGNS[face];
    const name = `${card.key}-${face}`;
    const svg = document_(`${card.title} — ${face}`, draw(card));
    fs.writeFileSync(path.join(OUT, `${name}.svg`), `${svg}\n`);
    written++;
    if (!wantPng) continue;
    const pngFile = path.join(OUT, `${name}.png`);
    rasterize(svg, pngFile);
    results.push([name, decode(pngFile, card.url)]);
  }
}

console.log(
  fonts.missing === 0
    ? `Fonts: ${fonts.ok} local faces embedded (Zilla Slab, Archivo, IBM Plex Mono).`
    : `Fonts: ${fonts.ok} embedded, ${fonts.missing} missing — those fall back to the serif/sans/mono stacks.`,
);
let bad = 0;
for (const [name, r] of results) {
  console.log(`${r.ok ? 'QR OK  ' : 'QR FAIL'}  ${name}.png${r.ok ? '' : ` — ${r.reason}`}`);
  if (!r.ok) bad++;
}
console.log(`Wrote ${written} SVG${wantPng ? ` and ${written} PNG` : ''} file(s) to public/pro/cards/.`);
if (bad) process.exit(1);
