#!/usr/bin/env node
/**
 * Fail the build if a credential is about to be published.
 *
 * This exists because a database password for this project's Supabase
 * instance was once committed to a public repository inside a .env.example
 * file. A new commit that deletes the line does not help — the old commit
 * still serves it — so the cheapest defence is never letting it land.
 *
 * Deliberately tuned for high-confidence secrets rather than "anything that
 * looks like a password". Documented demo logins (Test@1234) are not flagged:
 * a scanner that cries wolf gets switched off.
 *
 * Usage:
 *   node scripts/check-secrets.mjs             # working tree (tracked files)
 *   node scripts/check-secrets.mjs --history   # every commit as well
 *   node scripts/check-secrets.mjs --staged    # pre-commit use
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RULES = [
  {
    id: 'postgres-url-with-password',
    // postgres://user:something@host — the exact shape that leaked before.
    // Placeholders in .env.example (<password>, $VAR, ***) must not trip it.
    re: /postgres(?:ql)?:\/\/[^\s:'"@]+:(?!<|\$|\*|\[|%s|password@|\{)[^\s:'"@]{3,}@/gi,
    hint: 'Postgres connection string with an inline password. Put it in server/.env (gitignored) and use a placeholder here.',
  },
  { id: 'supabase-secret-key', re: /\bsb_secret_[A-Za-z0-9_-]{10,}/g,
    hint: 'Supabase secret key — server-side only, never commit.' },
  { id: 'supabase-service-role-jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,
    hint: 'JWT. If this is a service_role key it grants full database access.' },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    hint: 'Google API key.' },
  { id: 'google-oauth-key', re: /\bAQ\.Ab8[0-9A-Za-z_-]{20,}/g,
    hint: 'Google Cloud API key (AQ. format).' },
  { id: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
    hint: 'Private key material.' },
  { id: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/g,
    hint: 'AWS access key id.' },
  { id: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}/g,
    hint: 'GitHub token.' },
];

// This file necessarily contains the patterns it looks for.
const SKIP_FILES = new Set(['scripts/check-secrets.mjs']);
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf',
  '.zip', '.woff', '.woff2', '.ttf', '.mp4', '.db', '.wal']);

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

const findings = [];
function scan(text, where) {
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(text)) !== null) {
      const snippet = m[0].length > 48 ? `${m[0].slice(0, 45)}...` : m[0];
      findings.push({ where, id: rule.id, hint: rule.hint, snippet });
      if (findings.length > 200) return;
    }
  }
}

const mode = process.argv.slice(2);
const wantHistory = mode.includes('--history');
const wantStaged = mode.includes('--staged');

// 1. Any committed .env file (an .env.example of placeholders is fine).
const tracked = git(['ls-files']).split('\n').filter(Boolean);
for (const f of tracked) {
  const base = path.basename(f);
  if (base === '.env' || (base.startsWith('.env.') && !base.endsWith('.example') && !base.endsWith('.sample'))) {
    findings.push({
      where: f, id: 'committed-env-file', snippet: base,
      hint: 'A .env file is tracked by git. Remove it with `git rm --cached` and confirm .gitignore covers it.',
    });
  }
}

// 2. Contents of the working tree (or the staged changes).
// Both paths go file by file so SKIP_FILES/SKIP_EXT apply consistently —
// scanning a raw combined diff would re-flag this file's own rule patterns.
const files = wantStaged
  ? git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']).split('\n').filter(Boolean)
  : tracked;

for (const f of files) {
  if (SKIP_FILES.has(f) || SKIP_EXT.has(path.extname(f).toLowerCase())) continue;
  let text;
  if (wantStaged) {
    // Read the staged blob, not the working copy — they can differ.
    try { text = git(['show', `:${f}`]); } catch { continue; }
  } else {
    const abs = path.join(ROOT, f);
    try {
      if (fs.statSync(abs).size > 2 * 1024 * 1024) continue;
      text = fs.readFileSync(abs, 'utf8');
    } catch { continue; }
  }
  scan(text, f);
}

// 3. History: a secret deleted later is still public in the commit that added it.
//
// Walk each patch per-file so SKIP_FILES applies here too. Scanning the whole
// patch as one blob made this script flag its own rule patterns in the commit
// that introduced it — a permanent false positive, which is the fastest way to
// get a secret scanner switched off.
if (wantHistory) {
  const commits = git(['rev-list', '--all']).split('\n').filter(Boolean);
  for (const sha of commits) {
    let patch = '';
    try {
      patch = git(['show', '--format=', '--unified=0', '--no-color', sha]);
    } catch { continue; }

    let file = null;
    let skip = false;
    let added = [];
    const flush = () => {
      if (!skip && added.length) scan(added.join('\n'), `commit ${sha.slice(0, 8)} — ${file}`);
      added = [];
    };

    for (const line of patch.split('\n')) {
      if (line.startsWith('diff --git ')) {
        flush();
        file = null;
        skip = false;
      } else if (line.startsWith('+++ ')) {
        // "+++ b/path/to/file"  (or /dev/null for a deletion)
        const p = line.slice(4).replace(/^b\//, '');
        file = p === '/dev/null' ? null : p;
        skip = !file || SKIP_FILES.has(file) || SKIP_EXT.has(path.extname(file).toLowerCase());
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        if (!skip) added.push(line.slice(1));
      }
    }
    flush();
  }
}

if (findings.length === 0) {
  console.log('secret scan: clean');
  process.exit(0);
}

const seen = new Set();
console.error(`\nsecret scan: ${findings.length} finding(s)\n`);
for (const f of findings) {
  const key = `${f.where}|${f.id}|${f.snippet}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.error(`  [${f.id}] ${f.where}`);
  console.error(`      ${f.snippet}`);
  console.error(`      ${f.hint}\n`);
}
console.error('If a match is a placeholder or false positive, adjust scripts/check-secrets.mjs.');
console.error('If it is real: rotate the credential first — deleting the line does not un-publish it.\n');
process.exit(1);
