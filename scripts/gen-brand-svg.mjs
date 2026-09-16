#!/usr/bin/env node
/**
 * Generate the documentation artwork as SVG.
 *
 *   node scripts/gen-brand-svg.mjs
 *
 * Why hand-authored vector rather than a generated raster: this artwork is
 * mostly diagrams of how the product actually works, and a diagram has to stay
 * true as the product moves. Keeping it as code means a lifecycle step can be
 * renamed in a one-line diff, it stays crisp at any size, it weighs a few KB,
 * and the palette below is the single source of truth shared with
 * client/src/index.css.
 *
 * Each file carries its own opaque background on purpose, so one asset reads
 * correctly on both light and dark GitHub themes without needing a <picture>
 * swap per image.
 *
 * Text is drawn with presentation attributes and no <style> block, because
 * GitHub sanitises SVG embedded in Markdown and strips stylesheets.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Mirrors the @theme tokens in client/src/index.css. */
const C = {
  teal: '#006162',
  tealMid: '#2c7a7b',
  tealSoft: '#d3ecec',
  coral: '#fe9569',
  rust: '#994621',
  bg: '#faf9f6',
  card: '#ffffff',
  ink: '#1a1c1a',
  muted: '#3f4949',
  border: '#bec9c8',
  white: '#ffffff',
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function text(x, y, body, o = {}) {
  const {
    size = 16, weight = 400, fill = C.ink, anchor = 'start',
    ls = 0, opacity = 1, font = FONT,
  } = o;
  return `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" `
    + `font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" `
    + `letter-spacing="${ls}" opacity="${opacity}">${body}</text>`;
}

/** Greedy word wrap, rendered as one <text> per line. */
function wrap(x, y, body, max, o = {}) {
  const lines = [];
  let cur = '';
  for (const w of String(body).split(' ')) {
    if (cur && `${cur} ${w}`.length > max) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  const lh = o.lh ?? 14;
  return lines.map((l, i) => text(x, y + i * lh, esc(l), o)).join('');
}

/** The brand tile from client/src/components/Logo.jsx, drawn at any size. */
function mark(x, y, size, o = {}) {
  const { tile = C.white, cloche = C.teal, tray = C.coral } = o;
  const k = size / 48;
  return `<g transform="translate(${x} ${y}) scale(${k.toFixed(4)})">`
    + `<rect width="48" height="48" rx="12" fill="${tile}"/>`
    + `<circle cx="24" cy="15.5" r="2.6" fill="${cloche}"/>`
    + `<path d="M11 31c0-7.2 5.8-13 13-13s13 5.8 13 13H11z" fill="${cloche}"/>`
    + `<rect x="9" y="33" width="30" height="4.2" rx="2.1" fill="${tray}"/>`
    + `</g>`;
}

function wordmark(x, y, size, o = {}) {
  const { fill = C.white, dot = C.coral } = o;
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" `
    + `font-weight="700" fill="${fill}" letter-spacing="${(size * 0.01).toFixed(2)}">`
    + `O<tspan fill="${dot}">.</tspan>D<tspan fill="${dot}">.</tspan>C</text>`;
}

function svg(w, h, body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" `
    + `width="${w}" height="${h}" role="img">\n${defs}\n${body}\n</svg>\n`;
}

const tealGradient = (id) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">`
  + `<stop offset="0" stop-color="${C.tealMid}"/><stop offset="1" stop-color="${C.teal}"/>`
  + `</linearGradient>`
  + `<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">`
  + `<path d="M0 0 L10 5 L0 10 z" fill="${C.border}"/></marker></defs>`;

/* ----------------------------- glyphs ---------------------------------- */

/*
 * Icons are drawn from 24x24 path data and centred on (cx, cy) by transform, so
 * one definition stays legible at both the 9px hero size and the 8px strip size.
 * Hand-rolled arcs were tried first and read as blobs below ~12px.
 */
const ICON = {
  plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  check: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  lock: 'M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zm-6 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm3.1-9H8.9V6a3.1 3.1 0 0 1 6.2 0v2z',
  pin: 'M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z',
  bell: 'M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.64 5.36 6 7.93 6 11v5l-2 2v1h16v-1l-2-2z',
  coin: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16z',
};

/** Centre a 24x24 icon on (cx, cy) at a given visual radius. */
function icon(name, cx, cy, r, fill) {
  const k = (r * 2) / 20;
  return `<g transform="translate(${cx} ${cy}) scale(${k.toFixed(4)}) translate(-12 -12)">`
    + `<path d="${ICON[name]}" fill="${fill}"/></g>`;
}

const glyph = Object.fromEntries(
  Object.keys(ICON).map((k) => [k, (cx, cy, r, f) => icon(k, cx, cy, r, f)]),
);

/* Drawn rather than taken from the icon set, which only ships a dollar coin. */
glyph.coin = (cx, cy, r, f) =>
  `<circle cx="${cx}" cy="${cy}" r="${(r * 0.98).toFixed(2)}" fill="none" stroke="${f}" stroke-width="${(r * 0.17).toFixed(2)}"/>`
  + `<text x="${cx}" y="${(cy + r * 0.42).toFixed(2)}" text-anchor="middle" font-family="${FONT}" `
  + `font-size="${(r * 1.24).toFixed(2)}" font-weight="700" fill="${f}">\u20b9</text>`;


/* ------------------------------- hero ---------------------------------- */

function hero() {
  const W = 1200; const H = 340;
  const steps = [
    ['plus', 'Post'],
    ['bell', 'Ping'],
    ['check', 'Accept'],
    ['lock', 'Escrow'],
    ['pin', 'Check-in'],
    ['coin', 'Payout'],
  ];
  let right = '';
  const n = steps.length;
  const x0 = 636; const gap = 92; const cy = 150;
  steps.forEach(([g, label], i) => {
    const cx = x0 + i * gap;
    if (i < n - 1) {
      right += `<path d="M${cx + 26} ${cy} H${cx + gap - 26}" stroke="${C.tealSoft}" `
        + `stroke-width="2" stroke-dasharray="3 5" opacity="0.65"/>`;
    }
    right += `<circle cx="${cx}" cy="${cy}" r="24" fill="${C.white}" fill-opacity="0.1" `
      + `stroke="${C.tealSoft}" stroke-opacity="0.55" stroke-width="1.5"/>`;
    right += glyph[g](cx, cy, 9, C.tealSoft);
    right += text(cx, cy + 46, esc(label), {
      size: 12.5, fill: C.tealSoft, anchor: 'middle', weight: 600, ls: 0.4, opacity: 0.92,
    });
  });

  const body = `
  <rect width="${W}" height="${H}" rx="22" fill="url(#g)"/>
  <circle cx="1130" cy="-40" r="190" fill="${C.white}" fill-opacity="0.04"/>
  <circle cx="60" cy="360" r="150" fill="${C.white}" fill-opacity="0.04"/>
  ${mark(64, 58, 88)}
  ${wordmark(176, 130, 64)}
  <rect x="178" y="150" width="152" height="2" rx="1" fill="${C.coral}" opacity="0.85"/>
  ${text(178, 176, 'ON-DEMAND CREW', { size: 13, weight: 700, fill: C.tealSoft, ls: 2.6 })}
  ${text(178, 196, 'HOSPITALITY LOGISTICS', { size: 13, weight: 700, fill: C.tealSoft, ls: 2.6, opacity: 0.75 })}
  ${text(64, 250, 'Single-shift hiring for restaurants, bars and hotels.', { size: 19, fill: C.white, opacity: 0.95 })}
  ${text(64, 276, 'Money sits in escrow until the work is done.', { size: 19, fill: C.white, opacity: 0.95 })}
  <rect x="62" y="294" width="252" height="26" rx="13" fill="${C.white}" fill-opacity="0.12"/>
  <circle cx="80" cy="307" r="4" fill="${C.coral}"/>
  ${text(92, 311, 'Verified · 100% escrow network', { size: 12.5, fill: C.tealSoft, weight: 600, ls: 0.3 })}
  ${right}`;
  return svg(W, H, body, tealGradient('g'));
}

/* ------------------------------- og card -------------------------------- */

function og() {
  const W = 1200; const H = 630;
  const body = `
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <circle cx="1080" cy="80" r="260" fill="${C.white}" fill-opacity="0.05"/>
  <circle cx="120" cy="580" r="200" fill="${C.white}" fill-opacity="0.05"/>
  ${mark(510, 150, 180)}
  ${wordmark(600, 430, 118, {})}
  <rect x="420" y="462" width="360" height="3" rx="1.5" fill="${C.coral}"/>
  ${text(600, 506, 'ON-DEMAND CREW', { size: 21, weight: 700, fill: C.tealSoft, ls: 5.5, anchor: 'middle' })}
  ${text(600, 556, 'Single-shift hiring for restaurants, bars and hotels — with escrow.', { size: 22, fill: C.white, anchor: 'middle', opacity: 0.92 })}`;
  // The wordmark is centred by anchoring the text element itself.
  return svg(W, H, body.replace(
    `<text x="600" y="430" font-family="${FONT}" font-size="118"`,
    `<text x="600" y="430" text-anchor="middle" font-family="${FONT}" font-size="118"`,
  ), tealGradient('g'));
}

/* ---------------------------- lifecycle --------------------------------- */

function lifecycle() {
  const W = 1200; const H = 300;
  const steps = [
    ['1', 'Post a shift', 'Role, time, pay range,', 'GPS location'],
    ['2', 'Crew pinged', 'Nearby available crew', 'see it at once'],
    ['3', 'Accept or counter', 'Counters bounded to', 'your pay range'],
    ['4', 'Matched', 'Escrow hold opens,', 'split shown to both'],
    ['5', 'Check in', '4-digit proximity code', 'shown to both parties'],
    ['6', 'Approved', 'Hold releases,', 'payout requested'],
  ];
  const w = 176; const gap = 14; const y = 62; const h = 138;
  const x0 = (W - (steps.length * w + (steps.length - 1) * gap)) / 2;
  let body = `<rect width="${W}" height="${H}" rx="18" fill="${C.bg}" stroke="${C.border}"/>`;
  body += text(W / 2, 38, 'The shift lifecycle', { size: 17, weight: 700, fill: C.ink, anchor: 'middle', ls: 0.2 });

  steps.forEach(([n, title, l1, l2], i) => {
    const x = x0 + i * (w + gap);
    const last = i === steps.length - 1;
    body += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${C.card}" stroke="${last ? C.coral : C.border}" stroke-width="${last ? 2 : 1}"/>`;
    body += `<circle cx="${x + 28}" cy="${y + 30}" r="14" fill="${last ? C.coral : C.tealSoft}"/>`;
    body += text(x + 28, y + 35, n, { size: 13, weight: 700, fill: last ? C.rust : C.teal, anchor: 'middle' });
    body += text(x + 52, y + 35, esc(title), { size: 13.5, weight: 700, fill: C.ink });
    body += text(x + 18, y + 72, esc(l1), { size: 11.5, fill: C.muted });
    body += text(x + 18, y + 90, esc(l2), { size: 11.5, fill: C.muted });
    if (!last) {
      const ax = x + w + 1;
      body += `<path d="M${ax} ${y + h / 2} H${ax + gap - 2}" stroke="${C.border}" stroke-width="1.6" marker-end="url(#a)"/>`;
    }
  });
  body += text(W / 2, 246, 'Unclaimed requests auto-expire after 12 hours · the escrow hold freezes if either side raises a dispute',
    { size: 12.5, fill: C.muted, anchor: 'middle' });
  return svg(W, H, body, tealGradient('g'));
}

/* ------------------------------ escrow ---------------------------------- */

function escrow() {
  const W = 1000; const H = 340;
  let body = `<rect width="${W}" height="${H}" rx="18" fill="${C.bg}" stroke="${C.border}"/>`;
  body += text(W / 2, 38, 'Where the money sits', { size: 17, weight: 700, anchor: 'middle' });

  const box = (x, y, w, h, fill, stroke) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${fill}" stroke="${stroke}"/>`;

  // Venue -> hold -> worker
  body += box(50, 88, 180, 96, C.card, C.border);
  body += glyph.pin(84, 126, 14, C.tealMid);
  body += text(112, 124, 'Venue', { size: 14, weight: 700 });
  body += text(112, 144, 'commits on match', { size: 11.5, fill: C.muted });

  body += box(410, 76, 180, 120, C.card, C.teal);
  body += glyph.lock(500, 116, 18, C.teal);
  body += text(500, 162, 'Escrow hold', { size: 14, weight: 700, anchor: 'middle' });
  body += text(500, 181, 'frozen while disputed', { size: 11, fill: C.muted, anchor: 'middle' });

  body += box(770, 88, 180, 96, C.card, C.border);
  body += glyph.coin(804, 126, 14, C.rust);
  body += text(832, 124, 'Crew', { size: 14, weight: 700 });
  body += text(832, 144, 'paid on approval', { size: 11.5, fill: C.muted });

  body += `<path d="M236 136 H402" stroke="${C.tealMid}" stroke-width="2" marker-end="url(#a)"/>`;
  body += `<path d="M596 136 H762" stroke="${C.tealMid}" stroke-width="2" marker-end="url(#a)"/>`;
  body += text(319, 126, 'hold', { size: 11.5, fill: C.muted, anchor: 'middle' });
  body += text(679, 126, 'release', { size: 11.5, fill: C.muted, anchor: 'middle' });

  // Platform fee branch
  body += `<path d="M500 200 V236" stroke="${C.coral}" stroke-width="2" marker-end="url(#a)"/>`;
  body += `<rect x="404" y="240" width="192" height="40" rx="12" fill="${C.card}" stroke="${C.coral}"/>`;
  body += text(500, 265, 'Platform fee · default 10%', { size: 12, fill: C.rust, anchor: 'middle', weight: 600 });

  // Ledger note
  body += `<rect x="50" y="236" width="300" height="48" rx="12" fill="${C.tealSoft}" fill-opacity="0.55"/>`;
  body += text(66, 258, 'balance = SUM(ledger_entries)', { size: 12.5, font: MONO, fill: C.teal, weight: 600 });
  body += text(66, 274, 'append-only — no mutable balance column', { size: 10.5, fill: C.muted });
  return svg(W, H, body, tealGradient('g'));
}

/* ----------------------------- realtime --------------------------------- */

function realtime() {
  const W = 1000; const H = 320;
  let body = `<rect width="${W}" height="${H}" rx="18" fill="${C.bg}" stroke="${C.border}"/>`;
  body += text(W / 2, 38, 'How an event reaches a browser', { size: 17, weight: 700, anchor: 'middle' });

  const node = (x, y, w, h, title, sub, stroke = C.border) => {
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${C.card}" stroke="${stroke}"/>`;
    s += text(x + w / 2, y + 30, esc(title), { size: 13.5, weight: 700, anchor: 'middle' });
    s += text(x + w / 2, y + 50, esc(sub), { size: 11, fill: C.muted, anchor: 'middle' });
    return s;
  };

  body += node(48, 96, 190, 74, 'A write happens', 'message, response, presence');
  body += node(300, 96, 190, 74, 'In-process bus', 'audience named per event', C.teal);
  body += node(552, 96, 190, 74, 'SSE stream', 'one per browser tab', C.teal);
  body += node(804, 96, 150, 74, 'The tab', 'renders instantly');

  body += `<path d="M242 133 H292" stroke="${C.tealMid}" stroke-width="2" marker-end="url(#a)"/>`;
  body += `<path d="M494 133 H544" stroke="${C.tealMid}" stroke-width="2" marker-end="url(#a)"/>`;
  body += `<path d="M746 133 H796" stroke="${C.tealMid}" stroke-width="2" marker-end="url(#a)"/>`;

  // Filtering note
  body += `<rect x="300" y="196" width="442" height="42" rx="12" fill="${C.tealSoft}" fill-opacity="0.5"/>`;
  body += text(521, 222, 'Every event names its audience — nothing is broadcast to all listeners',
    { size: 12, fill: C.teal, anchor: 'middle', weight: 600 });

  // Optional fan-out
  body += `<path d="M395 170 V278 H382" fill="none" stroke="${C.coral}" stroke-width="2" stroke-dasharray="4 4"/>`;
  body += `<rect x="48" y="258" width="330" height="40" rx="12" fill="${C.card}" stroke="${C.coral}" stroke-dasharray="4 4"/>`;
  body += text(213, 283, 'Supabase Realtime — optional, multi-instance', { size: 11.5, fill: C.rust, anchor: 'middle', weight: 600 });
  body += text(770, 285, 'Polling remains only as a slow safety net', { size: 11, fill: C.muted, anchor: 'middle' });
  return svg(W, H, body, tealGradient('g'));
}

/* ------------------------- user-guide strips ---------------------------- */

function strip(title, steps, accent) {
  const W = 900; const H = 200;
  let body = `<rect width="${W}" height="${H}" rx="16" fill="${C.bg}" stroke="${C.border}"/>`;
  body += text(32, 40, esc(title), { size: 15, weight: 700 });
  body += `<rect x="32" y="52" width="46" height="3" rx="1.5" fill="${accent}"/>`;
  const w = 188; const gap = 24; const y = 78; const h = 100;
  const x0 = 32;
  steps.forEach(([g, t1, t2], i) => {
    const x = x0 + i * (w + gap);
    body += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="13" fill="${C.card}" stroke="${C.border}"/>`;
    body += `<circle cx="${x + 30}" cy="${y + 32}" r="16" fill="${C.tealSoft}"/>`;
    body += glyph[g](x + 30, y + 32, 8, C.teal);
    body += text(x + 56, y + 30, esc(t1), { size: 12.5, weight: 700 });
    body += wrap(x + 16, y + 64, t2, 27, { size: 11, fill: C.muted, lh: 15 });
    if (i < steps.length - 1) {
      body += `<path d="M${x + w + 3} ${y + h / 2} H${x + w + gap - 5}" stroke="${C.border}" stroke-width="1.6" marker-end="url(#a)"/>`;
    }
  });
  return svg(W, H, body, tealGradient('g'));
}

const FILES = {
  'docs/images/hero.svg': hero(),
  'client/public/og.svg': og(),
  'docs/images/lifecycle.svg': lifecycle(),
  'docs/images/escrow.svg': escrow(),
  'docs/images/realtime.svg': realtime(),
  'docs/images/guide-venue.svg': strip('If you run a venue', [
    ['plus', 'Post a shift', 'Role, specialty, time, pay range'],
    ['bell', 'Watch the desk', 'Applicants queue with their split'],
    ['check', 'Lock one in', 'Escrow opens the moment you accept'],
    ['coin', 'Approve', 'Release the payout after the shift'],
  ], C.teal),
  'docs/images/guide-worker.svg': strip('If you work shifts', [
    ['pin', 'Find work nearby', 'Sorted by take-home, not headline rate'],
    ['check', 'Accept or counter', 'Counters stay inside the range'],
    ['pin', 'Check in on site', 'Share the 4-digit proximity code'],
    ['coin', 'Get paid', 'Payout once the venue approves'],
  ], C.rust),
  'docs/images/guide-money.svg': strip('Money and escrow', [
    ['lock', 'Committed', 'Funds held the moment you match'],
    ['pin', 'Worked', 'Check-in and completion recorded'],
    ['check', 'Approved', 'Venue signs the shift off'],
    ['coin', 'Paid out', 'UPI or bank, last four digits only'],
  ], C.coral),
};

/*
 * The social card additionally needs a raster twin: X, LinkedIn and Slack all
 * refuse an SVG og:image. Rendered through headless Chrome because it is the
 * one SVG renderer this project can assume is present -- and if it is not, the
 * committed PNG simply stays as it is rather than the build failing.
 */
const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((c) => fs.existsSync(c));

function rasterise(srcRel, outRel, w, h) {
  if (!CHROME) {
    console.log(`\nskip   ${outRel} -- no Chrome found; the committed PNG is unchanged`);
    return;
  }
  const src = path.join(ROOT, srcRel);
  const out = path.join(ROOT, outRel);
  execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--screenshot=${out}`, `--window-size=${w},${h}`, `file://${src}`,
  ], { stdio: 'ignore' });
  console.log(`\n${outRel.padEnd(34)} ${(fs.statSync(out).size / 1024).toFixed(1)}KB  (rasterised for og:image)`);
}

let n = 0;
for (const [rel, content] of Object.entries(FILES)) {
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  console.log(`${rel.padEnd(34)} ${(content.length / 1024).toFixed(1)}KB`);
  n++;
}
rasterise('client/public/og.svg', 'client/public/og.png', 1200, 630);
console.log(`\n${n} SVG files written.`);
