// FuelUp PWA icon generator (Node built-ins only: no new dependencies).
// Usage: node scripts/generate-pwa-icons.mjs
// Draws the FuelUp mark (amber bolt on dark rounded square) and writes:
//   public/icons/icon-192.png, icon-512.png, maskable-512.png,
//   apple-touch-icon.png (180), plus public/favicon.svg (kept in sync).
// Re-run after any brand change; PNGs are committed build artifacts.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

// ---------- minimal PNG encoder (RGBA, 8-bit) ----------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- tiny raster helpers ----------
function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function makeCanvas(size) {
  return { size, px: new Uint8ClampedArray(size * size * 4) };
}

function fillRoundedRect(cv, x0, y0, x1, y1, radius, [r, g, b, a = 255]) {
  const { size, px } = cv;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(size, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(size, Math.ceil(x1)); x++) {
      const cx = Math.min(Math.max(x, x0 + radius), x1 - radius);
      const cy = Math.min(Math.max(y, y0 + radius), y1 - radius);
      if ((x - cx) ** 2 + (y - cy) ** 2 > radius * radius) continue;
      const i = (y * size + x) * 4;
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
    }
  }
}

function fillPolygon(cv, points, [r, g, b]) {
  const { size, px } = cv;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const yMin = Math.max(0, Math.floor(Math.min(...ys)));
  const yMax = Math.min(size - 1, Math.ceil(Math.max(...ys)));
  for (let y = yMin; y <= yMax; y++) {
    const intersections = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if ((y1 <= y && y < y2) || (y2 <= y && y < y1)) {
        intersections.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    intersections.sort((a, b) => a - b);
    for (let k = 0; k + 1 < intersections.length; k += 2) {
      const xStart = Math.max(0, Math.floor(intersections[k]));
      const xEnd = Math.min(size - 1, Math.ceil(intersections[k + 1]));
      for (let x = xStart; x <= xEnd; x++) {
        const pxIdx = (y * size + x) * 4;
        // simple source-over onto dark bg (bg is opaque → replace)
        px[pxIdx] = r; px[pxIdx + 1] = g; px[pxIdx + 2] = b; px[pxIdx + 3] = 255;
      }
    }
  }
}

// FuelUp mark: dark rounded square + amber bolt (matches #f59e0b brand).
const BG = hex('#0b0b0c');
const AMBER = hex('#f59e0b');
const AMBER_LIGHT = hex('#fbbf24');

function drawMark(size, { padding = 0, rounded = true } = {}) {
  const cv = makeCanvas(size);
  const s = size / 512; // design grid
  const m = padding * s;
  if (rounded) {
    fillRoundedRect(cv, m, m, size - m, size - m, 112 * s, [...BG]);
  } else {
    fillRoundedRect(cv, 0, 0, size, size, 0, [...BG]);
  }
  const bolt = [
    [302, 66], [158, 296], [238, 296], [206, 446],
    [358, 224], [268, 224],
  ].map(([x, y]) => [x * s + m * 0, y * s + m * 0]);
  // For padded (maskable) art, scale bolt into the safe zone instead.
  const pts = padding > 0
    ? bolt.map(([x, y]) => [m + ((x / size) * (size - 2 * m)), m + ((y / size) * (size - 2 * m))])
    : bolt;
  fillPolygon(cv, pts, AMBER);
  // highlight facet (upper-left edge of the bolt)
  const facet = padding > 0
    ? [[302, 66], [158, 296], [238, 296], [262, 200]].map(([x, y]) => [m + ((x * s) / size) * (size - 2 * m), m + ((y * s) / size) * (size - 2 * m)])
    : [[302 * s, 66 * s], [158 * s, 296 * s], [238 * s, 296 * s], [262 * s, 200 * s]];
  fillPolygon(cv, facet, AMBER_LIGHT);
  return cv;
}

const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['maskable-512.png', 512, { padding: 56, rounded: false }],
  ['apple-touch-icon.png', 180, { rounded: false }],
];

for (const [file, size, opts] of targets) {
  const cv = drawMark(size, opts);
  writeFileSync(join(outDir, file), encodePng(size, size, cv.px));
  console.log(`wrote public/icons/${file} (${size}x${size})`);
}
