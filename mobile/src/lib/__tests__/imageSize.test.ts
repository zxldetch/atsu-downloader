import { aspectFromBytes, imageSize } from '../imageSize';

/**
 * The reader lays a page out at `width / aspect`, so these numbers decide whether
 * a downloaded page is drawn at its true height or cropped. Every format atsu
 * serves gets a case here.
 */

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(40);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function jpeg(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x10, // APP0, length 16
    0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x00, 0x00, 0x00, 0x03, 0x01, 0x11, 0x00, 0x02,
    0x11, 0x01, 0x03, 0x11, 0x01,
  ]);
  const view = new DataView(bytes.buffer);
  // SOF0 starts at byte 20: marker, length, precision, then height, then width.
  view.setUint16(25, height);
  view.setUint16(27, width);
  return bytes;
}

function gif(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(20);
  bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // GIF89a
  const view = new DataView(bytes.buffer);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  return bytes;
}

/** Extended WebP: canvas dimensions are 24-bit little-endian, minus one. */
function webpExtended(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(40);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  bytes.set([0x56, 0x50, 0x38, 0x58], 12); // VP8X
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 10, true);
  view.setUint8(24, (width - 1) & 0xff);
  view.setUint8(25, ((width - 1) >> 8) & 0xff);
  view.setUint8(26, ((width - 1) >> 16) & 0xff);
  view.setUint8(27, (height - 1) & 0xff);
  view.setUint8(28, ((height - 1) >> 8) & 0xff);
  view.setUint8(29, ((height - 1) >> 16) & 0xff);
  return bytes;
}

/** Lossless WebP: 0x2f, then 14 bits (width-1) and 14 bits (height-1). */
function webpLossless(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(40);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x4c], 12); // VP8L
  bytes[20] = 0x2f;
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  new DataView(bytes.buffer).setUint32(21, bits >>> 0, true);
  return bytes;
}

/** Lossy WebP: a 3-byte start code then two 14-bit dimensions. */
function webpLossy(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(40);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x20], 12); // 'VP8 '
  bytes.set([0x9d, 0x01, 0x2a], 23);
  const view = new DataView(bytes.buffer);
  view.setUint16(26, width, true);
  view.setUint16(28, height, true);
  return bytes;
}

describe('imageSize', () => {
  it('reads a PNG', () => {
    expect(imageSize(png(1000, 1500))).toEqual({ width: 1000, height: 1500 });
  });

  it('reads a JPEG after its metadata segments', () => {
    expect(imageSize(jpeg(800, 1200))).toEqual({ width: 800, height: 1200 });
  });

  it('reads a GIF', () => {
    expect(imageSize(gif(640, 480))).toEqual({ width: 640, height: 480 });
  });

  it('reads every WebP flavour', () => {
    expect(imageSize(webpExtended(1200, 1800))).toEqual({ width: 1200, height: 1800 });
    expect(imageSize(webpLossless(720, 1080))).toEqual({ width: 720, height: 1080 });
    expect(imageSize(webpLossy(760, 1000))).toEqual({ width: 760, height: 1000 });
  });

  it('gives the reader an aspect ratio, which is what it lays pages out with', () => {
    // A tall webtoon strip: the fixed 0.7 guess used to crop these.
    expect(aspectFromBytes(png(800, 2000))).toBeCloseTo(0.4, 5);
  });

  it('returns null for data it cannot read instead of guessing', () => {
    expect(imageSize(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(imageSize(null)).toBeNull();
    expect(aspectFromBytes(new Uint8Array(64))).toBeNull();
    // A truncated header must not throw its way out of a download.
    expect(imageSize(png(10, 10).slice(0, 20))).toBeNull();
  });
});
