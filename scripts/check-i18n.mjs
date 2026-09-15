#!/usr/bin/env node
/**
 * Keep the English and Hindi catalogues honest.
 *
 * Three ways the bilingual UI silently breaks:
 *   1. a key is used in code but missing from en.js  -> the raw key renders
 *   2. a key exists in en.js but not hi.js           -> Hindi falls back to English
 *   3. an interpolation placeholder is dropped in a translation -> "{amount}" vanishes
 *
 * None of these fail the build on their own, so check them explicitly.
 *
 * Usage: node scripts/check-i18n.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'client', 'src');

function keysOf(file) {
  const text = fs.readFileSync(file, 'utf8');
  const out = new Map();
  // Matches:  'some.key': 'value',   including multi-line values.
  const re = /^\s{2}'([^']+)':\s*([\s\S]*?),\s*$/gm;
  let m;
  while ((m = re.exec(text)) !== null) out.set(m[1], m[2]);
  return out;
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(jsx?|tsx?)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const en = keysOf(path.join(SRC, 'i18n', 'en.js'));
const hi = keysOf(path.join(SRC, 'i18n', 'hi.js'));

const used = new Set();
for (const file of walk(SRC)) {
  if (file.includes(`${path.sep}i18n${path.sep}`)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/\bt\(\s*'([a-z][\w.]*)'/g)) used.add(m[1]);
  // Keys passed as data rather than called directly.
  for (const m of text.matchAll(/(?:labelKey|titleKey|descKey|subKey)\s*:\s*'([\w.]+)'/g)) used.add(m[1]);
}

const problems = [];

for (const k of [...used].sort()) {
  if (!en.has(k)) problems.push(`missing from en.js, but used in code: ${k}`);
}
for (const k of [...en.keys()].sort()) {
  if (!hi.has(k)) problems.push(`missing from hi.js (would fall back to English): ${k}`);
}
for (const k of [...hi.keys()].sort()) {
  if (!en.has(k)) problems.push(`present in hi.js but not en.js (dead key): ${k}`);
}

// Placeholder parity: {amount} in English must survive translation.
const ph = (s) => new Set([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
for (const [k, enVal] of en) {
  if (!hi.has(k)) continue;
  const a = ph(enVal);
  const b = ph(hi.get(k));
  for (const p of a) if (!b.has(p)) problems.push(`hi.js "${k}" drops the {${p}} placeholder`);
  for (const p of b) if (!a.has(p)) problems.push(`hi.js "${k}" adds an unknown {${p}} placeholder`);
}

if (problems.length) {
  console.error(`\ni18n check: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('');
  process.exit(1);
}

console.log(`i18n check: ok — ${en.size} keys, en/hi in sync, ${used.size} referenced in code`);
