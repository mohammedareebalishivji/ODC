#!/usr/bin/env node
/**
 * Generate the whole documentation image set in one pass.
 *
 *   node scripts/gen-brand-images.mjs            # everything missing
 *   node scripts/gen-brand-images.mjs hero og    # only these ids
 *   node scripts/gen-brand-images.mjs --force    # regenerate even if present
 *
 * Needs GEMINI_API_KEY (see scripts/gen-image.mjs). The outputs are committed,
 * so this only ever runs when the artwork itself needs to change.
 *
 * Every prompt forbids lettering on purpose: image models reliably garble text,
 * and a banner with misspelt UI labels is worse than one with none. Anything
 * that has to read as words is done in HTML/Markdown around the image.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

// Shared so the nine images read as one set rather than nine separate pictures.
const STYLE = [
  'Flat vector editorial illustration, isometric three-quarter view, clean geometric shapes,',
  'subtle long shadows, generous negative space, no gradients harsher than a soft two-tone blend.',
  'Strict palette: deep teal #006162 and #2c7a7b, warm coral #fe9569, rust #994621,',
  'warm off-white #faf9f6 background, charcoal #1a1c1a for fine linework.',
  'Setting is contemporary urban India (Mumbai restaurant and bar scene).',
  'ABSOLUTELY NO text, letters, numbers, words, signage or UI labels anywhere in the image.',
  'No photorealism, no 3D render, no stock-photo look, no watermark.',
].join(' ');

const IMAGES = [
  {
    id: 'hero',
    out: 'docs/images/hero.png',
    prompt: `A wide 3:1 banner illustration. Left side: a busy restaurant kitchen pass with a chef in whites plating food. Right side: a confident freelance cook walking in with a knife roll over the shoulder, arriving for a shift. Between them a stylised connecting arc made of small dots, suggesting a request travelling and being answered. Balanced, optimistic, hospitality-industry feel. ${STYLE}`,
  },
  {
    id: 'og',
    out: 'client/public/og.png',
    prompt: `A 1.91:1 social preview card illustration. Centre: a simple bold emblem of a chef's toque merging into a location pin, rendered in deep teal on a warm off-white field, with a thin coral accent ring. Minimal, high contrast, reads clearly at small size. Large clear margins, nothing near the edges. ${STYLE}`,
  },
  {
    id: 'dispatch',
    out: 'docs/images/dispatch-desk.png',
    prompt: `A venue manager at a counter reviewing a queue of incoming applicants, shown as a vertical stack of abstract candidate cards floating beside them, one card highlighted as the chosen one. Conveys triage and choosing. ${STYLE}`,
  },
  {
    id: 'marketplace',
    out: 'docs/images/marketplace.png',
    prompt: `A cook holding a phone, with a stylised map behind showing several nearby venue pins at different distances, and abstract cards showing take-home pay as simple coin shapes rather than digits. Conveys browsing nearby work. ${STYLE}`,
  },
  {
    id: 'escrow',
    out: 'docs/images/escrow.png',
    prompt: `A stylised strongbox or vault sitting exactly midway between a restaurant building on the left and a worker on the right, with coin shapes flowing in from the venue and held safely inside, and a smaller flow continuing to the worker. Conveys money held safely in the middle, then released. ${STYLE}`,
  },
  {
    id: 'treasury',
    out: 'docs/images/treasury.png',
    prompt: `An operations control desk seen isometrically, with abstract bar and line shapes floating above it representing a ledger position, and a balance scale motif to one side suggesting reconciliation. Calm, administrative, trustworthy. ${STYLE}`,
  },
  {
    id: 'guide-venue',
    out: 'docs/images/guide-venue.png',
    prompt: `A square illustration: a restaurant owner pinning up a stylised notice representing a shift request, with a clock motif beside it showing a window of time. Conveys posting a shift. ${STYLE}`,
  },
  {
    id: 'guide-worker',
    out: 'docs/images/guide-worker.png',
    prompt: `A square illustration: a waiter in an apron checking in at a venue doorway, with a small shield-and-tick motif floating nearby representing a proximity check-in code. Conveys arriving for a shift. ${STYLE}`,
  },
  {
    id: 'guide-money',
    out: 'docs/images/guide-money.png',
    prompt: `A square illustration: a pair of hands receiving coin shapes from a stylised vault, with a simple upward arrow beside it. Conveys getting paid out after a completed shift. ${STYLE}`,
  },
];

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));
const wanted = only.length ? IMAGES.filter((i) => only.includes(i.id)) : IMAGES;

if (!wanted.length) {
  console.error(`Unknown id. Known: ${IMAGES.map((i) => i.id).join(', ')}`);
  process.exit(2);
}

let made = 0;
let skipped = 0;
for (const img of wanted) {
  const abs = path.join(ROOT, img.out);
  if (!force && fs.existsSync(abs)) {
    console.log(`skip   ${img.id.padEnd(14)} ${img.out} (exists; --force to redo)`);
    skipped++;
    continue;
  }
  process.stdout.write(`make   ${img.id.padEnd(14)} `);
  try {
    execFileSync(process.execPath, [
      path.join(HERE, 'gen-image.mjs'), '--out', abs, '--prompt', img.prompt,
    ], { stdio: 'inherit' });
    made++;
  } catch {
    console.error(`FAILED ${img.id} -- see the error above`);
    process.exitCode = 1;
  }
}
console.log(`\n${made} generated, ${skipped} skipped.`);
