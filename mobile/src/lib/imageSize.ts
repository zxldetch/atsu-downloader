/**
 * Pixel dimensions from an image header.
 *
 * The reader lays a page out at `width / aspect`, so an *offline* page needs its
 * real aspect ratio — a downloaded chapter has no API payload to take it from.
 * Guessing (0.7 for everything) meant a tall page was drawn into a box 40% too
 * short and cropped by `contentFit="cover"`: pages with their top and bottom cut
 * off. These functions read only the header, so a page costs a few dozen bytes to
 * measure, not a decode.
 *
 * Supports what atsu serves and what CBZ readers contain: WebP (VP8, VP8L, VP8X),
 * JPEG, PNG and GIF. Anything else returns null and the reader falls back to a
 * letterboxed `contain` rather than cropping.
 */

export interface ImageDimensions {
  width: number;
  height: number;
}

const ascii = (bytes: Uint8Array, offset: number, length: number): string => {
  let text = '';
  for (let i = 0; i < length; i += 1) {
    const byte = bytes[offset + i];
    if (byte === undefined) return '';
    text += String.fromCharCode(byte);
  }
  return text;
};

const u16be = (bytes: Uint8Array, at: number) => (bytes[at] << 8) | bytes[at + 1];
const u16le = (bytes: Uint8Array, at: number) => bytes[at] | (bytes[at + 1] << 8);
const u24le = (bytes: Uint8Array, at: number) =>
  bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
const u32be = (bytes: Uint8Array, at: number) =>
  ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;

function pngSize(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 24) return null;
  // The IHDR chunk always comes first: width and height are big-endian at 16/20.
  const width = u32be(bytes, 16);
  const height = u32be(bytes, 20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function gifSize(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 10) return null;
  const width = u16le(bytes, 6);
  const height = u16le(bytes, 8);
  return width > 0 && height > 0 ? { width, height } : null;
}

function jpegSize(bytes: Uint8Array): ImageDimensions | null {
  // Walk the segment chain until a start-of-frame marker: they are the only ones
  // that carry the dimensions.
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    // Standalone markers have no payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = u16be(bytes, offset + 2);
    if (length < 2) return null;

    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 && // DHT
      marker !== 0xc8 && // JPG
      marker !== 0xcc; // DAC
    if (isStartOfFrame) {
      const height = u16be(bytes, offset + 5);
      const width = u16be(bytes, offset + 7);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += 2 + length;
  }
  return null;
}

function webpSize(bytes: Uint8Array): ImageDimensions | null {
  const chunk = ascii(bytes, 12, 4);

  if (chunk === 'VP8 ') {
    // Lossy: a 3-byte start code then two 14-bit dimensions (little-endian).
    const start = 20 + 6;
    if (bytes[start - 3] !== 0x9d || bytes[start - 2] !== 0x01 || bytes[start - 1] !== 0x2a) {
      return null;
    }
    const width = u16le(bytes, start) & 0x3fff;
    const height = u16le(bytes, start + 2) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (chunk === 'VP8L') {
    // Lossless: 0x2f signature, then 14 bits of (width - 1), 14 bits of (height - 1).
    const at = 21;
    if (bytes[at - 1] !== 0x2f) return null;
    const bits = bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (chunk === 'VP8X') {
    // Extended: 24-bit canvas dimensions minus one.
    const width = u24le(bytes, 24) + 1;
    const height = u24le(bytes, 27) + 1;
    return { width, height };
  }

  return null;
}

/** Dimensions from image bytes, or null when the format is not recognised. */
export function imageSize(bytes: Uint8Array | null | undefined): ImageDimensions | null {
  if (!bytes || bytes.length < 16) return null;

  try {
    if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') return pngSize(bytes);
    if (ascii(bytes, 0, 3) === 'GIF') return gifSize(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegSize(bytes);
    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return webpSize(bytes);
  } catch {
    // A header that runs off the end of a truncated file is not a crash.
    return null;
  }

  return null;
}

/** The reader wants width/height; unknown stays null so it can letterbox instead. */
export function aspectFromBytes(bytes: Uint8Array | null | undefined): number | null {
  const size = imageSize(bytes);
  if (!size) return null;
  return size.width / size.height;
}
