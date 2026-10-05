// Reading an uploaded image's real type and size from its bytes.
//
// Two reasons this does not simply trust the upload.
//
// The declared Content-Type is supplied by whoever is posting. A file named
// .png and labelled image/png can be anything at all, and the bucket would
// happily serve it back under that type — so the format is decided by the
// magic bytes, and a mismatch is a rejection.
//
// The dimensions are read for layout. Chat with images whose size is unknown
// until they load reflows every time one arrives, which on a phone means the
// message you were reading jumps off screen. Knowing the aspect ratio up front
// lets the bubble reserve exactly the right box.

export type ImageFormat = 'png' | 'jpeg' | 'gif' | 'webp';

export interface ImageInfo {
  format: ImageFormat;
  mimeType: string;
  width: number | null;
  height: number | null;
  animated: boolean;
}

const MIME: Record<ImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

export const EXTENSION: Record<ImageFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
  gif: 'gif',
  webp: 'webp',
};

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

/** The format these bytes actually are, or null if it is not an image we take. */
export function sniffFormat(bytes: Uint8Array): ImageFormat | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'gif'; // GIF87a and GIF89a
  // RIFF....WEBP
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'webp';
  }
  return null;
}

/**
 * Type and dimensions, read from the bytes.
 *
 * Returns null when the bytes are not an accepted image. Dimensions may be
 * null for a file whose header is truncated or in a WebP variant not covered
 * here; that is a layout hint, not a reason to reject an upload.
 */
export function inspectImage(bytes: Uint8Array): ImageInfo | null {
  const format = sniffFormat(bytes);
  if (!format) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width: number | null = null;
  let height: number | null = null;
  let animated = false;

  try {
    if (format === 'png') {
      // IHDR is always the first chunk: 8 byte signature, 4 length, 4 type.
      if (bytes.length >= 24) {
        width = view.getUint32(16, false);
        height = view.getUint32(20, false);
      }
      animated = containsAscii(bytes, 'acTL', 8, 200); // APNG
    } else if (format === 'gif') {
      if (bytes.length >= 10) {
        width = view.getUint16(6, true);
        height = view.getUint16(8, true);
      }
      animated = countGifFrames(bytes) > 1;
    } else if (format === 'webp') {
      const chunk = readAscii(bytes, 12, 4);
      if (chunk === 'VP8X' && bytes.length >= 30) {
        // Canvas size is stored minus one, as 24-bit little endian.
        width = 1 + (view.getUint8(24) | (view.getUint8(25) << 8) | (view.getUint8(26) << 16));
        height = 1 + (view.getUint8(27) | (view.getUint8(28) << 8) | (view.getUint8(29) << 16));
        animated = (view.getUint8(20) & 0x02) !== 0;
      } else if (chunk === 'VP8 ' && bytes.length >= 30) {
        width = view.getUint16(26, true) & 0x3fff;
        height = view.getUint16(28, true) & 0x3fff;
      } else if (chunk === 'VP8L' && bytes.length >= 25) {
        const bits =
          view.getUint8(21) |
          (view.getUint8(22) << 8) |
          (view.getUint8(23) << 16) |
          (view.getUint8(24) << 24);
        width = (bits & 0x3fff) + 1;
        height = ((bits >> 14) & 0x3fff) + 1;
      }
    } else {
      const size = readJpegSize(bytes, view);
      width = size?.width ?? null;
      height = size?.height ?? null;
    }
  } catch {
    // A malformed header is not worth failing an upload over; the image just
    // loads without a reserved box.
    width = null;
    height = null;
  }

  const sane = (value: number | null) =>
    value !== null && Number.isInteger(value) && value > 0 && value <= 20000 ? value : null;

  return { format, mimeType: MIME[format], width: sane(width), height: sane(height), animated };
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = offset; i < offset + length && i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[i]!);
  }
  return out;
}

function containsAscii(bytes: Uint8Array, needle: string, from: number, within: number): boolean {
  const end = Math.min(bytes.length - needle.length, from + within);
  for (let i = from; i <= end; i += 1) {
    if (readAscii(bytes, i, needle.length) === needle) return true;
  }
  return false;
}

/**
 * Enough GIF frames to know whether it moves.
 *
 * Stops at two: the question is "animated or not", and walking every block of a
 * long GIF to answer it would be work for nothing.
 */
function countGifFrames(bytes: Uint8Array): number {
  let frames = 0;
  for (let i = 10; i < bytes.length - 1 && frames < 2; i += 1) {
    // An image descriptor block starts 0x2C; a graphic control extension
    // 0x21 0xF9. Either appearing twice means more than one frame.
    if (bytes[i] === 0x2c) frames += 1;
  }
  return frames;
}

/** JPEG size, from the first start-of-frame marker. */
function readJpegSize(bytes: Uint8Array, view: DataView): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1]!;
    // Standalone markers carry no length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    // Any SOFn except the four that are not frame headers.
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return {
        height: view.getUint16(offset + 5, false),
        width: view.getUint16(offset + 7, false),
      };
    }

    const length = view.getUint16(offset + 2, false);
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}
