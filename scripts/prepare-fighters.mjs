// Turn character art into the files the app ships.
//
//   node scripts/prepare-fighters.mjs <dir-with-source-pngs>
//
// Expects six transparent PNGs named after the archetypes in lib/fighters.ts —
// captain.png, speedster.png and so on — and writes trimmed, downscaled copies
// into public/fighters/.
//
// Here rather than done once by hand because the art will be regenerated: a new
// roster, a recoloured set, a seventh player. A step that exists only in
// somebody's shell history is a step that gets done differently next time.
//
// Three things it does.
//
// Trims fully transparent margins, so a figure fills its box and two fighters
// standing side by side are the same height on screen rather than the same
// height including whitespace.
//
// Downscales to DELIVERY_HEIGHT. The largest place one of these appears is the
// challenge screen at about 180 CSS pixels, so 400 covers a 3x display with a
// little room, and the source files are twice the size they need to be.
//
// Averages in premultiplied alpha. Scaling straight RGB drags the colour of
// fully transparent pixels — which is usually black or white — into every edge
// pixel, and rings the figure in a halo that only shows up once it is on a
// coloured background.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import zlib from 'node:zlib';

const DELIVERY_HEIGHT = 400;

// Built up here, not beside crc32: the body of this script runs at module top
// level, so a `let` further down is still in its temporal dead zone by the time
// the first PNG is written.
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
const NAMES = ['captain', 'speedster', 'playmaker', 'bruiser', 'enforcer', 'juggernaut'];

const source = process.argv[2];
if (!source) {
  console.error('Usage: node scripts/prepare-fighters.mjs <dir-with-source-pngs>');
  process.exit(1);
}

const outDir = join(process.cwd(), 'public', 'fighters');
mkdirSync(outDir, { recursive: true });

for (const name of NAMES) {
  const file = join(source, `${name}.png`);
  if (!existsSync(file)) {
    console.warn(`  ${name}: no ${name}.png in ${source}, skipped`);
    continue;
  }

  const { width, height, pixels } = decode(readFileSync(file));
  const box = trim(width, height, pixels);
  const scale = Math.min(1, DELIVERY_HEIGHT / box.h);
  const out = resample(pixels, width, box, Math.max(1, Math.round(box.w * scale)), Math.max(1, Math.round(box.h * scale)));

  const png = encode(out.w, out.h, out.pixels);
  writeFileSync(join(outDir, `${name}.png`), png);
  console.log(
    `  ${name}: ${width}x${height} -> ${out.w}x${out.h}  ${(png.length / 1024).toFixed(0)}KB`,
  );
}

console.log(`\nWrote to public/fighters/`);

// --- PNG ---------------------------------------------------------------------

function decode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let pos = 8;
  let width = 0, height = 0, depth = 0, colour = 0, interlace = 0;
  const idat = [];

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const tag = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (tag === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colour = body[9];
      interlace = body[12];
    } else if (tag === 'IDAT') idat.push(body);
    pos += 12 + len;
  }

  if (depth !== 8) throw new Error(`bit depth ${depth} unsupported`);
  if (interlace !== 0) throw new Error('interlaced png unsupported');
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colour];
  if (!channels) throw new Error(`colour type ${colour} unsupported`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const flat = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  let at = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[at];
    at += 1;
    const line = Buffer.from(raw.subarray(at, at + stride));
    at += stride;

    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      if (filter === 1) line[x] = (line[x] + a) & 255;
      else if (filter === 2) line[x] = (line[x] + b) & 255;
      else if (filter === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    line.copy(flat, y * stride);
    prev = line;
  }

  // Everything becomes RGBA, so the rest of this file has one case to handle.
  const pixels = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    if (colour === 6) flat.copy(pixels, p * 4, p * 4, p * 4 + 4);
    else if (colour === 2) {
      flat.copy(pixels, p * 4, p * 3, p * 3 + 3);
      pixels[p * 4 + 3] = 255;
    } else if (colour === 4) {
      pixels.fill(flat[p * 2], p * 4, p * 4 + 3);
      pixels[p * 4 + 3] = flat[p * 2 + 1];
    } else {
      pixels.fill(flat[p], p * 4, p * 4 + 3);
      pixels[p * 4 + 3] = 255;
    }
  }

  return { width, height, pixels };
}

function encode(width, height, pixels) {
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    rows[y * (width * 4 + 1)] = 0;
    pixels.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const chunk = (tag, body) => {
    const out = Buffer.alloc(body.length + 12);
    out.writeUInt32BE(body.length, 0);
    out.write(tag, 4, 'ascii');
    body.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// --- Pixels ------------------------------------------------------------------

/** The box that actually holds something, ignoring near-transparent dust. */
function trim(width, height, pixels) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w: width, h: height };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Area average in premultiplied alpha. */
function resample(pixels, srcWidth, box, w, h) {
  const out = Buffer.alloc(w * h * 4);
  const sx = box.w / w;
  const sy = box.h / h;

  for (let y = 0; y < h; y += 1) {
    const y0 = box.y + Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, box.y + Math.floor((y + 1) * sy));
    for (let x = 0; x < w; x += 1) {
      const x0 = box.x + Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, box.x + Math.floor((x + 1) * sx));

      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy += 1) {
        for (let xx = x0; xx < x1; xx += 1) {
          const i = (yy * srcWidth + xx) * 4;
          const al = pixels[i + 3];
          r += pixels[i] * al;
          g += pixels[i + 1] * al;
          b += pixels[i + 2] * al;
          a += al;
          n += 1;
        }
      }

      const o = (y * w + x) * 4;
      if (a === 0) {
        out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
      } else {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
        out[o + 3] = Math.round(a / n);
      }
    }
  }

  return { w, h, pixels: out };
}
