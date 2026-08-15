#!/usr/bin/env node
import { deflateSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'public');

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function png(size, draw) {
  const px = Buffer.alloc(size * size * 4);
  draw(px, size);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function fill(px, size, x, y, w, h, [r, g, b, a = 255]) {
  for (let j = Math.max(0, Math.floor(y)); j < Math.min(size, Math.ceil(y + h)); j++) {
    for (let i = Math.max(0, Math.floor(x)); i < Math.min(size, Math.ceil(x + w)); i++) {
      const o = (j * size + i) * 4;
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = a;
    }
  }
}

function circle(px, size, cx, cy, radius, color) {
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const dx = i - cx, dy = j - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        const o = (j * size + i) * 4;
        px[o] = color[0]; px[o + 1] = color[1]; px[o + 2] = color[2]; px[o + 3] = 255;
      }
    }
  }
}

function rr(px, size, x, y, w, h, r, color) {
  circle(px, size, x + r, y + r, r, color);
  circle(px, size, x + w - r, y + r, r, color);
  circle(px, size, x + r, y + h - r, r, color);
  circle(px, size, x + w - r, y + h - r, r, color);
  fill(px, size, x, y + r, w, h - 2 * r, color);
  fill(px, size, x + r, y, w - 2 * r, h, color);
}

function chefHat(px, size, cx, cy, s, color) {
  const bandW = s * 1.7, bandH = s * 0.34;
  fill(px, size, cx - bandW / 2, cy + s * 0.35, bandW, bandH, color);
  fill(px, size, cx - bandW / 2.4, cy + s * 0.16, bandW / 1.2, s * 0.2, color);
  circle(px, size, cx - s * 0.62, cy - s * 0.02, s * 0.3, color);
  circle(px, size, cx, cy - s * 0.18, s * 0.38, color);
  circle(px, size, cx + s * 0.62, cy - s * 0.02, s * 0.3, color);
  rr(px, size, cx - s * 0.85, cy - s * 0.34, s * 1.7, s * 0.68, s * 0.3, color);
}

function forkKnife(px, size, cx, cy, s, color) {
  const kx = cx + s * 0.3, fx = cx - s * 0.32;
  fill(px, size, kx, cy - s, s * 0.16, s * 1.9, color);
  circle(px, size, kx + s * 0.08, cy - s * 0.55, s * 0.1, color);
  fill(px, size, kx - s * 0.18, cy - s * 0.95, s * 0.52, s * 0.34, [0, 0, 0, 0]);
  // fork tines
  for (const t of [-1, 0, 1]) {
    fill(px, size, fx + t * s * 0.09, cy - s, s * 0.09, s * 0.9, color);
  }
  fill(px, size, fx - s * 0.12, cy - s * 0.1, s * 0.44, s * 0.2, color);
  fill(px, size, fx - s * 0.08, cy + s * 0.1, s * 0.14, s * 0.8, color);
}

const CREAM = [250, 246, 239];
const ORANGE = [232, 93, 31];
const WHITE = [255, 255, 255];

function drawIcon(px, size) {
  const s = size / 512;
  rr(px, size, 0, 0, 512, 512, 112, CREAM); // rounded cream card
  circle(px, size, 256, 256, 216, ORANGE); // orange disc
  chefHat(px, size, 256 - 90 * s * 1, 250, 150, WHITE);
  circle(px, size, 256, 426, 78, WHITE); // tray
  fill(px, size, 256 - 118, 360, 236, 20, WHITE); // tray line
  fill(px, size, 256 - 118, 416, 236, 12, WHITE);
}

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512]]) {
  fs.writeFileSync(path.join(out, name), png(size, drawIcon));
  console.log('wrote', path.join(out, name));
}