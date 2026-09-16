#!/usr/bin/env node
/**
 * Generate an image with Gemini ("Nano Banana") and write it to a file.
 *
 *   node scripts/gen-image.mjs --out client/public/og.png --prompt "..."
 *   node scripts/gen-image.mjs --list-models
 *
 * The key is read from GEMINI_API_KEY, or from a GEMINI_API_KEY= line in
 * ~/.gemini/.env. It is never logged and never written into the repo.
 *
 * Note that image generation is not on the Gemini free tier: without billing
 * enabled on the key's project, every image model answers 429 with
 * "limit: 0" rather than a quota that refills. Text models still work on a
 * free key, so a 429 here means billing, not rate limiting.
 *
 * The documentation artwork is NOT produced by this -- see gen-brand-svg.mjs.
 * This stays for one-off images.
 *
 * This is a local authoring tool, not part of the build or CI -- the images it
 * produces are committed, so nobody else needs a key to check the repo out.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOST = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-3-pro-image';

function apiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  const envFile = path.join(os.homedir(), '.gemini', '.env');
  if (fs.existsSync(envFile)) {
    const m = fs.readFileSync(envFile, 'utf8').match(/^\s*GEMINI_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  console.error('No GEMINI_API_KEY found (checked $GEMINI_API_KEY and ~/.gemini/.env).');
  process.exit(2);
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

async function listModels() {
  const res = await fetch(`${HOST}/models?key=${apiKey()}&pageSize=200`);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const { models = [] } = await res.json();
  for (const m of models) {
    const name = m.name.replace('models/', '');
    if (/image/i.test(name)) console.log(`${name.padEnd(42)} ${m.description ?? ''}`.trim());
  }
}

async function generate() {
  const out = arg('out');
  const prompt = arg('prompt');
  if (!out || !prompt) {
    console.error('Usage: gen-image.mjs --out <file> --prompt "<text>" [--model <id>]');
    process.exit(2);
  }
  const model = arg('model', DEFAULT_MODEL);

  const res = await fetch(`${HOST}/models/${model}:generateContent?key=${apiKey()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);

  const body = await res.json();
  const parts = body.candidates?.[0]?.content?.parts ?? [];
  const image = parts.find((p) => p.inlineData?.data);
  if (!image) {
    // A refusal or a text-only reply lands here; surface it rather than writing an empty file.
    const text = parts.map((p) => p.text).filter(Boolean).join('\n');
    throw new Error(`No image in response.${text ? ` Model said: ${text}` : ''}`);
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const buf = Buffer.from(image.inlineData.data, 'base64');
  fs.writeFileSync(out, buf);
  console.log(`${out}  ${(buf.length / 1024).toFixed(0)}KB  ${image.inlineData.mimeType}`);
}

await (process.argv.includes('--list-models') ? listModels() : generate());
