/**
 * Reading pages back out of a CBZ.
 *
 * Downloads used to be packaged into a `.cbz` and the loose page files deleted
 * to save space — which left the reader with nothing to show offline, because
 * the reader reads pages, not archives. New downloads keep their pages, and this
 * module exists so chapters packed by an older build (or shared in as a CBZ) can
 * still be opened: the archive is unpacked into the chapter folder once, then the
 * normal page path takes over.
 *
 * CBZ is a stored (uncompressed) zip by convention here, and JSZip already ships
 * with the app for writing them, so read support costs no extra dependency.
 */

import JSZip from 'jszip';

export interface ArchivePage {
  name: string;
  bytes: Uint8Array;
}

const IMAGE = /\.(webp|jpe?g|png|gif|avif)$/i;

/** Image entries of a CBZ, in natural page order (1, 2, 10 — not 1, 10, 2). */
export async function readArchivePages(bytes: Uint8Array): Promise<ArchivePage[]> {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files)
    .filter((name) => !zip.files[name].dir && IMAGE.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  const pages: ArchivePage[] = [];
  for (const name of names) {
    pages.push({ name, bytes: await zip.files[name].async('uint8array') });
  }
  return pages;
}

/** File extension of an archive entry, with the dot, defaulting to `.webp`. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '.webp';
}
