/**
 * Archive builders — the mobile equivalent of converters/cbz.py and
 * converters/pdf.py, including the ComicInfo.xml sidecar.
 *
 * On the desktop, Pillow writes the PDF. On a phone there is no Pillow, so
 * pages are normalised to JPEG with expo-image-manipulator and embedded with
 * pdf-lib. CBZ needs no conversion at all: it is a stored (uncompressed) zip of
 * the numbered page files, exactly like the desktop version.
 */

import JSZip from 'jszip';

import { formatChapterNumber } from '../api/parse';
import type { Chapter, MangaInfo } from '../types';

export interface PageEntry {
  name: string;
  bytes: Uint8Array;
}

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** Port of converters/comicinfo.py::generate_comicinfo. */
export function comicInfoXml(
  manga: MangaInfo,
  chapter: Chapter,
  options: { writer?: string; genre?: string } = {},
): string {
  const writer = options.writer ?? manga.authors.join(', ');
  const genre = options.genre ?? manga.genres.join(', ');

  const fields: [string, string][] = [
    ['Title', chapter.title],
    ['Series', manga.title],
    ['Number', formatChapterNumber(chapter.number)],
    ['Count', String(manga.chapters.length)],
    ['PageCount', String(chapter.pageCount)],
    ['Format', manga.mangaType],
    ['Manga', manga.mangaType === 'Manga' ? 'YesAndRightToLeft' : 'No'],
  ];
  if (writer) fields.push(['Writer', writer]);
  if (genre) fields.push(['Genre', genre]);
  fields.push(['Notes', 'Downloaded from atsu.moe using Atsu Downloader']);
  fields.push(['Web', `https://atsu.moe/manga/${manga.id}`]);

  const body = fields
    .map(([tag, value]) => `  <${tag}>${escapeXml(value)}</${tag}>`)
    .join('\n');

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<ComicInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">`,
    body,
    '</ComicInfo>',
    '',
  ].join('\n');
}

export async function buildCbz(
  pages: PageEntry[],
  comicInfo?: string,
): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const page of pages) zip.file(page.name, page.bytes);
  if (comicInfo) zip.file('ComicInfo.xml', comicInfo);

  return zip.generateAsync({
    type: 'uint8array',
    // Pages are already compressed; storing avoids a pointless CPU burn on device.
    compression: 'STORE',
    platform: 'UNIX',
  });
}

function base64ToBytes(base64: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const output = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let index = 0;

  for (const char of clean) {
    buffer = (buffer << 6) | alphabet.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[index] = (buffer >> bits) & 0xff;
      index += 1;
    }
  }

  return output.subarray(0, index);
}

/**
 * pdf-lib ships both an ESM and a CJS build. The ESM build's `tslib` interop
 * breaks under Metro (`Cannot destructure property '__extends'`), so we require
 * the CJS entry explicitly. Types still come from the package root.
 */
type PdfLib = typeof import('pdf-lib');
let pdfLibModule: PdfLib | null = null;
function pdfLib(): PdfLib {
  if (!pdfLibModule) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    pdfLibModule = require('pdf-lib/cjs/index.js') as PdfLib;
  }
  return pdfLibModule;
}

let manipulator: typeof import('expo-image-manipulator') | null = null;
function imageManipulator() {
  if (!manipulator) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    manipulator = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
  }
  return manipulator;
}

/** Normalise any page format (webp/avif/…) to JPEG bytes for PDF embedding. */
async function toJpeg(uri: string): Promise<Uint8Array> {
  const { manipulateAsync, SaveFormat } = imageManipulator();
  const result = await manipulateAsync(uri, [], {
    compress: 0.86,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (!result.base64) throw new Error('Could not encode page as JPEG');
  return base64ToBytes(result.base64);
}

/**
 * Build a chapter PDF.
 *
 * `resolveUri` maps a page path to something the image loader understands
 * (file:// on device, object URL on web).
 */
export async function buildPdf(
  pages: PageEntry[],
  resolveUri: (name: string) => Promise<string>,
  options: { title?: string; author?: string } = {},
): Promise<Uint8Array> {
  const { PDFDocument } = pdfLib();
  const pdf = await PDFDocument.create();
  if (options.title) pdf.setTitle(options.title);
  if (options.author) pdf.setAuthor(options.author);
  pdf.setCreator('Atsu Mobile');
  pdf.setProducer('Atsu Mobile');

  for (const page of pages) {
    const uri = await resolveUri(page.name);
    const jpeg = await toJpeg(uri);
    const image = await pdf.embedJpg(jpeg);
    const width = 720;
    const height = Math.round((image.height / image.width) * width);
    const embedded = pdf.addPage([width, height]);
    embedded.drawImage(image, { x: 0, y: 0, width, height });
  }

  return pdf.save();
}
