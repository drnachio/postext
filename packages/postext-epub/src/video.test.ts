import { describe, it, expect } from 'vitest';
import { renderToEpub, readEpub } from './index';
import type { ReadEpubResult, RenderToEpubOptions } from './types';
import { MP4, PNG, sampleBook, videoSampleBook } from './__tests__/sampleBook';
import { needsVideoScript, VIDEO_SCRIPT_HREF } from './shared/videoScript';
import { VIDEO_PLAYBACK_SCRIPT } from 'postext';

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

  it('prints an HLS stream as its linked poster, no remote item (#476)', async () => {
    const book = readEpub(await renderToEpub(videoSampleBook(), options(layout)));
    const reel = 'https://media.example.org/reel/master.m3u8';
    expect([...book.manifest.values()].some((i) => i.path.includes('m3u8') || i.mediaType.includes('mpegurl'))).toBe(false);
    const [page] = pagesWith(book, reel);
    expect(page).toBeDefined();
    const xhtml = text(book, page!);
    expect(xhtml).not.toMatch(/<video\b[^>]*m3u8/);
    expect(xhtml).toMatch(/<a\b[^>]*href="https:\/\/media\.example\.org\/reel\/master\.m3u8"/);
  });

  it('leaves the poster unlinked when videoStyle.linkPoster is off', async () => {
    const book = readEpub(await renderToEpub(videoSampleBook({ videoStyle: { linkPoster: false } }), options(layout)));
    const pages = book.spine.map((s) => text(book, s.path)).join('\n');
    expect(pages).toMatch(/<img\b[^>]*f1\.png/);
    expect(pages).not.toMatch(/href="https:\/\/(www\.)?youtu/);
  });
});

// One video at a time (#507): the documents with videos to coordinate link
// the engine's playback script and are declared `scripted`; a video that
// plays alongside the others carries `data-pt-alongside`.
describe.each(['fixed', 'reflowable'] as const)('video playback in a %s EPUB (#507)', (layout) => {
  const scriptItem = (book: ReadEpubResult) => [...book.manifest.values()].find((i) => i.path === `${book.root}${VIDEO_SCRIPT_HREF}`);
  const scripted = (book: ReadEpubResult) => [...book.manifest.values()].filter((i) => i.properties.includes('scripted')).map((i) => i.path);

  it('links the playback script from the document whose videos it coordinates', async () => {
    const book = readEpub(await renderToEpub(videoSampleBook(), options(layout)));
    const item = scriptItem(book);
    expect(item?.mediaType).toBe('application/javascript');
    expect(text(book, item!.path)).toBe(VIDEO_PLAYBACK_SCRIPT);

    // The two players share a document, which links the script and is the
    // only one declared scripted.
    const withVideos = pagesWith(book, '<video');
    expect(withVideos).toHaveLength(1);
    expect(text(book, withVideos[0]!)).toMatch(/<head>[\s\S]*<script src="\.\.\/scripts\/videos\.js"><\/script>\s*<\/head>/);
    expect(text(book, withVideos[0]!)).not.toMatch(/data-pt-alongside/);
    expect(scripted(book)).toEqual(withVideos);
    expect(pagesWith(book, '<script')).toEqual(withVideos);
  });

  it('marks the videos that play alongside, and needs no script when all do', async () => {
    const book = readEpub(await renderToEpub(videoSampleBook({ videoStyle: { player: { exclusive: false } } }), options(layout)));
    const [page] = pagesWith(book, '<video');
    const players = text(book, page!).match(/<video\b[^>]*>/g) ?? [];
    expect(players).toHaveLength(2);
    for (const tag of players) expect(tag).toMatch(/\sdata-pt-alongside="[^"]*"/);
    expect(scriptItem(book)).toBeUndefined();
    expect(scripted(book)).toEqual([]);
  });

  it('keeps a book without videos unscripted', async () => {
    const book = readEpub(await renderToEpub(sampleBook(), options(layout)));
    expect(scriptItem(book)).toBeUndefined();
    expect(scripted(book)).toEqual([]);
    expect(pagesWith(book, '<script')).toEqual([]);
  });
});

describe('needsVideoScript (#507)', () => {
  const exclusive = '<video src="a.mp4"></video>';
  const alongside = '<video src="b.mp4" data-pt-alongside="data-pt-alongside"></video>';
  it('wants two videos, one of them exclusive', () => {
    expect(needsVideoScript('<p>No video</p>')).toBe(false);
    expect(needsVideoScript(exclusive)).toBe(false);
    expect(needsVideoScript(alongside + alongside)).toBe(false);
    expect(needsVideoScript(exclusive + alongside)).toBe(true);
    expect(needsVideoScript(exclusive + exclusive)).toBe(true);
  });
});
