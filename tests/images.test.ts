import { describe, it, expect } from 'vitest';
import { sniffFormat, inspectImage, EXTENSION } from '../lib/images';

// Minimal but genuine headers. The point of these tests is that the format and
// the dimensions come from the bytes, so invented-but-wrong bytes would make
// them meaningless.

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13); // IHDR length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function gif(width: number, height: number, frames = 1): Uint8Array {
  const bytes = new Uint8Array(10 + frames * 4);
  bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // "GIF89a"
  const view = new DataView(bytes.buffer);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  // One image descriptor block per frame.
  for (let i = 0; i < frames; i += 1) bytes[10 + i * 4] = 0x2c;
  return bytes;
}

function jpeg(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(13);
  bytes.set([0xff, 0xd8], 0);
  bytes.set([0xff, 0xc0], 2); // SOF0
  const view = new DataView(bytes.buffer);
  view.setUint16(4, 11); // segment length
  bytes[6] = 8; // sample precision
  view.setUint16(7, height);
  view.setUint16(9, width);
  return bytes;
}

function webpVp8x(width: number, height: number, animated = false): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  bytes.set([0x56, 0x50, 0x38, 0x58], 12); // "VP8X"
  bytes[20] = animated ? 0x02 : 0x00;
  // Canvas dimensions are stored minus one, 24-bit little endian.
  const write24 = (offset: number, value: number) => {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >> 8) & 0xff;
    bytes[offset + 2] = (value >> 16) & 0xff;
  };
  write24(24, width - 1);
  write24(27, height - 1);
  return bytes;
}

describe('sniffFormat', () => {
  it('recognises each accepted format from its signature', () => {
    expect(sniffFormat(png(1, 1))).toBe('png');
    expect(sniffFormat(gif(1, 1))).toBe('gif');
    expect(sniffFormat(jpeg(1, 1))).toBe('jpeg');
    expect(sniffFormat(webpVp8x(1, 1))).toBe('webp');
  });

  it('accepts GIF87a as well as GIF89a', () => {
    const bytes = gif(4, 4);
    bytes.set([0x47, 0x49, 0x46, 0x38, 0x37, 0x61], 0);
    expect(sniffFormat(bytes)).toBe('gif');
  });

  it('rejects something that is not an image', () => {
    expect(sniffFormat(new TextEncoder().encode('<html><body>hi'))).toBeNull();
    expect(sniffFormat(new Uint8Array(0))).toBeNull();
  });

  it('rejects a RIFF container that is not WebP', () => {
    // A .wav is RIFF too, and labelling it image/webp would have it served as one.
    const bytes = new Uint8Array(16);
    bytes.set([0x52, 0x49, 0x46, 0x46], 0);
    bytes.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
    expect(sniffFormat(bytes)).toBeNull();
  });

  it('is not fooled by a signature that appears later in the file', () => {
    const bytes = new Uint8Array(40);
    bytes.set(png(2, 2), 4);
    expect(sniffFormat(bytes)).toBeNull();
  });
});

describe('inspectImage', () => {
  it('reads PNG dimensions from IHDR', () => {
    expect(inspectImage(png(1290, 2796))).toMatchObject({
      format: 'png',
      mimeType: 'image/png',
      width: 1290,
      height: 2796,
    });
  });

  it('reads GIF dimensions little-endian', () => {
    expect(inspectImage(gif(498, 280))).toMatchObject({ width: 498, height: 280 });
  });

  it('reads JPEG dimensions from the start-of-frame marker', () => {
    expect(inspectImage(jpeg(4032, 3024))).toMatchObject({
      format: 'jpeg',
      width: 4032,
      height: 3024,
    });
  });

  it('reads WebP canvas dimensions, which are stored minus one', () => {
    expect(inspectImage(webpVp8x(800, 600))).toMatchObject({ width: 800, height: 600 });
  });

  it('spots an animated GIF and a still one', () => {
    expect(inspectImage(gif(10, 10, 1))?.animated).toBe(false);
    expect(inspectImage(gif(10, 10, 4))?.animated).toBe(true);
  });

  it('spots an animated WebP from its flags', () => {
    expect(inspectImage(webpVp8x(10, 10, true))?.animated).toBe(true);
    expect(inspectImage(webpVp8x(10, 10, false))?.animated).toBe(false);
  });

  it('returns null for bytes that are not an accepted image', () => {
    expect(inspectImage(new TextEncoder().encode('not an image'))).toBeNull();
  });

  it('still reports the format when the header is truncated', () => {
    // A short file is a bad upload, not an attack; it loses its reserved box
    // rather than being rejected.
    const truncated = png(100, 100).slice(0, 12);
    expect(inspectImage(truncated)).toMatchObject({ format: 'png', width: null, height: null });
  });

  it('discards a dimension outside any plausible range', () => {
    expect(inspectImage(png(0, 0))).toMatchObject({ width: null, height: null });
    expect(inspectImage(png(50_000, 50_000))).toMatchObject({ width: null, height: null });
  });

  it('gives every format a file extension', () => {
    expect(EXTENSION).toEqual({ png: 'png', jpeg: 'jpg', gif: 'gif', webp: 'webp' });
  });
});
