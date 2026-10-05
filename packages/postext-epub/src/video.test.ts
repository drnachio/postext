import { describe, it, expect } from 'vitest';
import { renderToEpub, readEpub } from './index';
import type { ReadEpubResult, RenderToEpubOptions } from './types';
import { MP4, PNG, videoSampleBook } from './__tests__/sampleBook';

// Videos in both renditions (#456): the book carries a self-hosted file
// (stored, not deflated) and plays it in <video>; a file that only has a
// production address plays from it (remote-resources); a YouTube video is
// its poster, linked to the video unless videoStyle.linkPoster is off.

const options = (layout: RenderToEpubOptions['layout']): RenderToEpubOptions => ({
  layout,
  metadata: { title: 'Videos', creators: ['Ada Lovelace'], language: 'en-US', modified: new Date(Date.UTC(2026, 9, 5)) },
  resourceBytes: (fileId) => fileId === 'f1.png'
    ? { bytes: PNG, mediaType: 'image/png' }
    : fileId === 'clip.mp4' ? { bytes: MP4, mediaType: 'video/mp4' } : undefined,
});

/** Compression method of each zip entry, from its local file header. */
function zipMethods(bytes: Uint8Array): Map<string, number> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Map<string, number>();
  let at = 0;
  while (at + 30 <= bytes.length && view.getUint32(at, true) === 0x04034b50) {
    const method = view.getUint16(at + 8, true);
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const extraLength = view.getUint16(at + 28, true);
    out.set(new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLength)), method);
    at += 30 + nameLength + extraLength + size;
  }
  return out;
}

const text = (book: ReadEpubResult, path: string): string => new TextDecoder().decode(book.files.get(path)!);
const pagesWith = (book: ReadEpubResult, needle: string): string[] =>
  book.spine.map((s) => s.path).filter((p) => text(book, p).includes(needle));

describe.each(['fixed', 'reflowable'] as const)('videos in a %s EPUB', (layout) => {
  it('packs the file, plays it, and links a YouTube poster', async () => {
    const bytes = await renderToEpub(videoSampleBook(), options(layout));
    const book = readEpub(bytes);
    const items = [...book.manifest.values()];

    // The book's own clip: a video/mp4 item, stored uncompressed.
    const clip = items.find((i) => i.mediaType === 'video/mp4' && i.path.startsWith(book.root));
    expect(clip?.path).toMatch(/media\/.+\.mp4$/);
    expect(zipMethods(bytes).get(clip!.path)).toBe(0);

    // Played with <video>, its poster beside it.
    const own = clip!.path.slice(clip!.path.lastIndexOf('/') + 1);
    const [playing] = pagesWith(book, own);
    expect(playing).toBeDefined();
    expect(text(book, playing!)).toMatch(/<video\b[^>]*\bposter="[^"]+"/);

    // The remote file plays from its address, and its page says so.
    const [remote] = pagesWith(book, 'https://cdn.example.org/keeper.mp4');
    expect(remote).toBeDefined();
    const remoteItem = items.find((i) => i.path === remote);
    expect(remoteItem?.properties).toContain('remote-resources');

    // YouTube: no player, the poster linked to the video.
    const [talk] = pagesWith(book, 'youtu');
    const page = text(book, talk!);
    expect(page).not.toMatch(/<iframe/);
    expect(page).toMatch(/<a\b[^>]*href="https:\/\/(www\.)?youtu[^"]*"[^>]*>\s*(<[^>]+>\s*)*<img\b/);
  });

  it('leaves the poster unlinked when videoStyle.linkPoster is off', async () => {
    const book = readEpub(await renderToEpub(videoSampleBook({ videoStyle: { linkPoster: false } }), options(layout)));
    const pages = book.spine.map((s) => text(book, s.path)).join('\n');
    expect(pages).toMatch(/<img\b[^>]*f1\.png/);
    expect(pages).not.toMatch(/href="https:\/\/(www\.)?youtu/);
  });
});
