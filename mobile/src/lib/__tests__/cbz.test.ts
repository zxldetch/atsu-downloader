/**
 * Chapters downloaded by older builds exist only as a CBZ. The reader unpacks
 * them once, so this has to find the images, in page order, and ignore the
 * ComicInfo sidecar — otherwise "offline" stays broken for everything already on
 * the phone.
 */

import JSZip from 'jszip';

import { extensionOf, readArchivePages } from '../cbz';

async function archive(files: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, body] of Object.entries(files)) zip.file(name, body);
  return zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
}

describe('CBZ reading', () => {
  it('returns image entries in natural page order', async () => {
    const bytes = await archive({
      '0010.webp': 'ten',
      '0002.webp': 'two',
      '0001.webp': 'one',
    });

    const pages = await readArchivePages(bytes);
    expect(pages.map((page) => page.name)).toEqual(['0001.webp', '0002.webp', '0010.webp']);
    expect(new TextDecoder().decode(pages[0].bytes)).toBe('one');
  });

  it('ignores the ComicInfo sidecar and folders', async () => {
    const bytes = await archive({
      'ComicInfo.xml': '<ComicInfo />',
      'pages/0001.png': 'p1',
      'pages/0002.png': 'p2',
    });

    const pages = await readArchivePages(bytes);
    expect(pages.map((page) => page.name)).toEqual(['pages/0001.png', 'pages/0002.png']);
  });

  it('keeps the extension of each entry so the files stay decodable', () => {
    expect(extensionOf('0001.WebP')).toBe('.webp');
    expect(extensionOf('0002.jpg')).toBe('.jpg');
    expect(extensionOf('no-extension')).toBe('.webp');
  });
});
