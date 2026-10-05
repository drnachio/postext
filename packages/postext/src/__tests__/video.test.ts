import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import {
  createBundle,
  defaultResourceTypes,
  effectiveResourceTypes,
  encodeQr,
  openBundle,
  parseVideoUrl,
  renderToHtml,
  resolveVideoStyleConfig,
  resourceVideoLink,
  stripConfigDefaults,
  videoElementAttributes,
  videoEmbedUrl,
  videoWatchUrl,
  DEFAULT_VIDEO_PLAYER_OPTIONS,
} from '../index';
import { collectContentWarnings } from '../pipeline/contentWarnings';
import { layoutResourceBlock } from '../pipeline/resourceLayout';
import { resolveAllConfig } from '../pipeline/config';
import type { PostextConfig, Resource, VDTBlock, VDTDocument } from '../index';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const px = (value: number) => ({ value, unit: 'px' as const });

/** A screen-like page: 600 × 900 px at 96 dpi, no margins, one column. */
const PAGE: PostextConfig = {
  page: { dpi: 96, width: px(600), height: px(900), margins: { top: px(0), bottom: px(0), left: px(0), right: px(0) } },
  layout: { layoutType: 'single' },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
};

const youtube = (over: Partial<Resource> = {}): Resource => ({
  id: 'talk',
  typeId: 'video',
  kind: 'video',
  caption: 'The talk.',
  createdAt: 0,
  updatedAt: 0,
  video: {
    source: 'youtube',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    poster: { fileId: 'poster', format: 'jpeg', width: 1280, height: 720 },
  },
  placement: { position: 'here' },
  ...over,
});

const ownFile = (over: Partial<Resource['video']> = {}): Resource => ({
  id: 'clip',
  typeId: 'video',
  kind: 'video',
  caption: 'A clip.',
  createdAt: 0,
  updatedAt: 0,
  video: { source: 'file', fileId: 'clip.mp4', format: 'mp4', poster: { fileId: 'clip.jpg', format: 'jpeg', width: 800, height: 600 }, ...over },
  placement: { position: 'here' },
});

const resourceBlocks = (doc: VDTDocument): VDTBlock[] => {
  const out: VDTBlock[] = [];
  for (const page of doc.pages) {
    for (const col of page.columns) for (const b of col.blocks) if (b.type === 'resource') out.push(b);
    for (const f of page.floats ?? []) if (f.resourceBlock) out.push(f);
  }
  return out;
};

// The label and its number are joined by a no-break space.
const captionText = (b: VDTBlock): string => b.resourceBlock!.captionLines.map((l) => l.text).join(' ').replace(/\u00a0/g, ' ');

describe('video addresses', () => {
  it('recognises YouTube links of every shape', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'youtube.com/watch?v=dQw4w9WgXcQ&list=x',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://m.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    ]) {
      expect(parseVideoUrl(url)).toEqual({ source: 'youtube', id: 'dQw4w9WgXcQ' });
    }
    expect(parseVideoUrl('https://youtu.be/dQw4w9WgXcQ?t=1m30s')).toEqual({ source: 'youtube', id: 'dQw4w9WgXcQ', start: 90 });
    expect(parseVideoUrl('https://www.youtube.com/watch?v=short')).toBeUndefined();
  });

  it('recognises Vimeo links, unlisted ones with their hash', () => {
    expect(parseVideoUrl('https://vimeo.com/76979871')).toEqual({ source: 'vimeo', id: '76979871' });
    expect(parseVideoUrl('https://vimeo.com/channels/staffpicks/76979871')).toEqual({ source: 'vimeo', id: '76979871' });
    expect(parseVideoUrl('https://vimeo.com/76979871/abc123def0')).toEqual({ source: 'vimeo', id: '76979871', hash: 'abc123def0' });
    expect(parseVideoUrl('https://player.vimeo.com/video/76979871?h=abc123def0')).toEqual({ source: 'vimeo', id: '76979871', hash: 'abc123def0' });
    expect(parseVideoUrl('https://example.com/76979871')).toBeUndefined();
  });

  it('builds the watch page and the player address with the player options', () => {
    const yt = parseVideoUrl('https://youtu.be/dQw4w9WgXcQ')!;
    expect(videoWatchUrl(yt, 12)).toBe('https://youtu.be/dQw4w9WgXcQ?t=12');
    const embed = videoEmbedUrl(yt, { ...DEFAULT_VIDEO_PLAYER_OPTIONS, controls: false, loop: true, fullscreen: false }, { start: 5, end: 20 });
    expect(embed.startsWith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?')).toBe(true);
    const q = new URL(embed).searchParams;
    expect(q.get('controls')).toBe('0');
    expect(q.get('loop')).toBe('1');
    expect(q.get('playlist')).toBe('dQw4w9WgXcQ');
    expect(q.get('fs')).toBe('0');
    expect(q.get('start')).toBe('5');
    expect(q.get('end')).toBe('20');
    const vimeo = videoEmbedUrl(parseVideoUrl('https://vimeo.com/1/abcdef12')!, { ...DEFAULT_VIDEO_PLAYER_OPTIONS, privacy: true, playbackRate: false });
    expect(vimeo).toContain('player.vimeo.com/video/1?');
    expect(vimeo).toContain('h=abcdef12');
    expect(vimeo).toContain('dnt=1');
    expect(vimeo).toContain('speed=0');
  });

  it('turns the player options into HTML5 video attributes', () => {
    const attrs = Object.fromEntries(videoElementAttributes({ ...DEFAULT_VIDEO_PLAYER_OPTIONS, download: false, pictureInPicture: false }));
    expect(attrs.controls).toBe(true);
    expect(attrs.controlslist).toBe('nodownload');
    expect(attrs.disablepictureinpicture).toBe(true);
    expect(attrs.preload).toBe('metadata');
    expect(attrs.autoplay).toBeUndefined();
  });

  it('links a self-hosted file to its production address only', () => {
    expect(resourceVideoLink(ownFile())).toBeUndefined();
    expect(resourceVideoLink(ownFile({ url: 'https://cdn.example.org/clip.mp4' }))).toBe('https://cdn.example.org/clip.mp4');
    expect(resourceVideoLink(youtube())).toBe('https://youtu.be/dQw4w9WgXcQ');
  });
});

describe('QR codes', () => {
  it('picks the smallest version and is deterministic', () => {
    const a = encodeQr('https://youtu.be/dQw4w9WgXcQ', 'M')!;
    expect(a.size).toBe(29); // version 3: 28 bytes overflow 2-M's 26
    expect(a.rows).toHaveLength(29);
    expect(a.rows.every((r) => r.length === 29 && /^[01]+$/.test(r))).toBe(true);
    expect(encodeQr('https://youtu.be/dQw4w9WgXcQ', 'M')).toEqual(a);
    // Finder pattern in the top-left corner.
    expect(a.rows[0]!.slice(0, 7)).toBe('1111111');
    expect(a.rows[1]!.slice(0, 7)).toBe('1000001');
    expect(a.rows[3]!.slice(0, 7)).toBe('1011101');
  });

  it('grows with the data and gives up past version 40', () => {
    expect(encodeQr('x'.repeat(500), 'L')!.size).toBeGreaterThan(57);
    expect(encodeQr('x'.repeat(4000), 'H')).toBeUndefined();
  });
});

describe('video resources in layout', () => {
  it('numbers videos on their own: Video 1.1 next to Figure 1.1', () => {
    const figure: Resource = {
      id: 'fig', typeId: 'figure', kind: 'bitmap', caption: 'A figure.', createdAt: 0, updatedAt: 0,
      bitmap: { fileId: 'f', format: 'png', width: 600, height: 300 }, placement: { position: 'here' },
    };
    const doc = buildDocument(
      { markdown: '# One\n\n::resource{id="fig"}\n\n::resource{id="talk"}\n\nSee :ref{id="talk"}.', resources: [figure, youtube()] },
      PAGE,
    );
    const [fig, video] = resourceBlocks(doc);
    expect(captionText(fig!)).toContain('Figure 1.1');
    expect(captionText(video!)).toContain('Video 1.1');
    expect(video!.resourceBlock!.kind).toBe('video');
  });

  it('numbers videos in a book whose resource types predate them', () => {
    const config: PostextConfig = { ...PAGE, locale: 'es', resourceTypes: defaultResourceTypes('es').filter((t) => t.id !== 'video') };
    expect(effectiveResourceTypes(config, [youtube()]).map((t) => t.id)).toEqual(['figure', 'table', 'video']);
    expect(effectiveResourceTypes(config, []).map((t) => t.id)).toEqual(['figure', 'table']);
    const doc = buildDocument({ markdown: '# Uno\n\n::resource{id="talk"}', resources: [youtube()] }, config);
    expect(captionText(resourceBlocks(doc)[0]!)).toContain('Vídeo 1.1');
  });

  it('sets the poster at the measure with its ratio, the play mark and the QR code on it', () => {
    const doc = buildDocument({ markdown: '::resource{id="talk"}', resources: [youtube()] }, PAGE);
    const rb = resourceBlocks(doc)[0]!.resourceBlock!;
    expect(rb.fileId).toBe('poster');
    expect(rb.bodyRect.width).toBeCloseTo(600, 3);
    expect(rb.bodyRect.height).toBeCloseTo(337.5, 3);
    const v = rb.video!;
    expect(v.link).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(v.embedUrl).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(v.linkPoster).toBe(true);
    // 12 mm at 96 dpi, centred.
    const mark = v.playMark!;
    expect(mark.rect.height).toBeCloseTo(45.354, 2);
    expect(mark.rect.x + mark.rect.width / 2).toBeCloseTo(300, 3);
    expect(mark.rect.y + mark.rect.height / 2).toBeCloseTo(168.75, 3);
    // 18 mm, 3 mm from the bottom-right corner.
    const qr = v.qr!;
    expect(qr.text).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(qr.rect.width).toBeCloseTo(68.03, 1);
    expect(qr.rect.x + qr.rect.width).toBeCloseTo(600 - 11.339, 2);
    expect(qr.rect.y + qr.rect.height).toBeCloseTo(337.5 - 11.339, 2);
    expect(qr.moduleSize * (qr.size + 2 * qr.quietZone)).toBeCloseTo(qr.rect.width, 6);
  });

  it('follows the video style: positions, sizes, overlays off', () => {
    const config: PostextConfig = {
      ...PAGE,
      videoStyle: {
        playMark: { position: 'top-left', shape: 'rounded', size: px(40), inset: px(10) },
        qr: { enabled: false },
        linkPoster: false,
      },
    };
    const doc = buildDocument({ markdown: '::resource{id="talk"}', resources: [youtube()] }, config);
    const v = resourceBlocks(doc)[0]!.resourceBlock!.video!;
    expect(v.qr).toBeUndefined();
    expect(v.linkPoster).toBe(false);
    expect(v.playMark!.rect).toMatchObject({ x: 10, y: 10, height: 40 });
    expect(v.playMark!.rect.width).toBeCloseTo(58, 6);
  });

  it('prints no QR code for a self-hosted file without a production address', () => {
    const doc = buildDocument({ markdown: '::resource{id="clip"}', resources: [ownFile()] }, PAGE);
    const rb = resourceBlocks(doc)[0]!.resourceBlock!;
    expect(rb.video!.qr).toBeUndefined();
    expect(rb.video!.fileId).toBe('clip.mp4');
    expect(rb.video!.mimeType).toBe('video/mp4');
    expect(rb.bodyRect.height).toBeCloseTo(450, 3);
  });

  it('keeps a 16:9 box for a video without a poster', () => {
    const r = youtube();
    delete r.video!.poster;
    const doc = buildDocument({ markdown: '::resource{id="talk"}', resources: [r] }, PAGE);
    const rb = resourceBlocks(doc)[0]!.resourceBlock!;
    expect(rb.fileId).toBeUndefined();
    expect(rb.bodyRect.height).toBeCloseTo(337.5, 3);
  });

  it('floats a referenced video like a figure', () => {
    const r = youtube({ placement: { position: 'auto' } });
    const doc = buildDocument({ markdown: 'As :ref{id="talk"} shows, the lantern is lit.', resources: [r] }, PAGE);
    const floats = doc.pages.flatMap((p) => p.floats ?? []);
    expect(floats.some((f) => f.resourceBlock?.kind === 'video')).toBe(true);
  });

  it('warns about a missing poster, a missing address and a foreign link', () => {
    const noPoster = youtube({ id: 'a' });
    delete noPoster.video!.poster;
    const badLink = youtube({ id: 'b', video: { source: 'vimeo', url: 'https://youtu.be/dQw4w9WgXcQ' } });
    const file = { ...ownFile(), id: 'c' };
    const warnings = collectContentWarnings(
      '::resource{id="a"}\n\n::resource{id="b"}\n\n::resource{id="c"}',
      PAGE,
      [noPoster, badLink, file],
    );
    const kinds = warnings.map((w) => w.kind);
    expect(kinds).toContain('videoWithoutPoster');
    expect(kinds).toContain('videoUrlInvalid');
    expect(kinds).toContain('videoWithoutUrl');
  });
});

describe('video posters set like pictures', () => {
  it('cites a video as Video 1.1 in the running text', () => {
    const doc = buildDocument(
      { markdown: '# One\n\nThe keeper speaks in :ref{id="talk"}.\n\n::resource{id="talk"}', resources: [youtube()] },
      PAGE,
    );
    const text = doc.pages
      .flatMap((p) => p.columns.flatMap((c) => c.blocks))
      .filter((b) => b.type === 'paragraph')
      .flatMap((b) => (b.lines ?? []).map((l) => l.text))
      .join(' ')
      .replace(/\u00a0/g, ' ');
    expect(text).toContain('Video 1.1');
  });

  it('crops a poster within its safe area to fit the page (fitFiguresToPage)', () => {
    // A 3:2 poster at the 600 px measure stands 400 px: too tall for a 400 px page with its caption.
    const config: PostextConfig = {
      ...PAGE,
      page: { ...PAGE.page, height: px(400) },
      layout: { layoutType: 'single', fitFiguresToPage: true },
    };
    const r = youtube({ safeArea: { x: 0, y: 0.1, width: 1, height: 0.5 } });
    r.video!.poster = { fileId: 'poster', format: 'jpeg', width: 3000, height: 2000 };
    const doc = buildDocument({ markdown: '::resource{id="talk"}', resources: [r] }, config);
    const block = resourceBlocks(doc)[0]!;
    const rb = block.resourceBlock!;
    expect(rb.bodyRect.width).toBeCloseTo(600, 3);
    expect(block.bbox.height).toBeLessThanOrEqual(400);
    expect(rb.bodySource!.height).toBeLessThan(1);
    expect(rb.bodySource!.y).toBeLessThanOrEqual(0.1);
    // The overlays sit on the cropped body.
    const qr = rb.video!.qr!;
    expect(qr.rect.y + qr.rect.height).toBeLessThanOrEqual(rb.bodyRect.height);
  });

  it('turns a poster like a picture of its size, overlays on the turned body', () => {
    const resourceTypes = defaultResourceTypes();
    const turn = (resource: Resource) => layoutResourceBlock({
      resource,
      resourceType: resourceTypes.find((t) => t.id === resource.typeId),
      number: '1.1',
      resolved: resolveAllConfig(PAGE),
      columnWidth: 300,
      resourceNumbering: {},
      resourceTypes,
      resources: [resource],
      rotate: 'ccw',
      rotatedLength: 800,
    }).block;
    const video = turn(youtube());
    const still = turn({
      id: 'still', typeId: 'figure', kind: 'bitmap', caption: 'The talk.', createdAt: 0, updatedAt: 0,
      bitmap: { fileId: 'poster', format: 'jpeg', width: 1280, height: 720 },
    });
    expect(video.rotation?.direction).toBe('ccw');
    expect(video.bodyRect.width).toBeCloseTo(still.bodyRect.width, 6);
    expect(video.bodyRect.height).toBeCloseTo(still.bodyRect.height, 6);
    const { playMark, qr } = video.video!;
    expect(playMark!.rect.x + playMark!.rect.width / 2).toBeCloseTo(video.bodyRect.width / 2, 3);
    expect(qr!.rect.x + qr!.rect.width).toBeLessThanOrEqual(video.bodyRect.width);
    expect(qr!.rect.y + qr!.rect.height).toBeLessThanOrEqual(video.bodyRect.height);
  });
});

describe('video style config', () => {
  it('resolves defaults and strips them again', () => {
    const r = resolveVideoStyleConfig();
    expect(r.playMark.position).toBe('center');
    expect(r.qr.position).toBe('bottom-right');
    expect(r.html).toBe('player');
    expect(r.player.download).toBe(true);
    const stripped = stripConfigDefaults({ videoStyle: { qr: { position: 'bottom-right', size: px(30) }, player: { download: false, controls: true } } });
    expect(stripped.videoStyle).toEqual({ qr: { size: px(30) }, player: { download: false } });
    expect(stripConfigDefaults({ videoStyle: { html: 'player' } }).videoStyle).toBeUndefined();
  });
});

describe('video resources in HTML', () => {
  const html = (resources: Resource[], config: PostextConfig = PAGE, options: Parameters<typeof renderToHtml>[1] = {}) => {
    const doc = buildDocument({ markdown: resources.map((r) => `::resource{id="${r.id}"}`).join('\n\n'), resources }, config);
    return renderToHtml(doc, { resourceImageUrl: (id) => `blob:${id}`, ...options });
  };

  it('embeds the YouTube player', () => {
    const out = html([youtube({ altText: 'A talk on lanterns' })]);
    expect(out).toContain('<iframe class="pt-video" src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?');
    expect(out).toContain('title="A talk on lanterns"');
    expect(out).toContain('allowfullscreen="allowfullscreen"');
  });

  it('plays a self-hosted file in an HTML5 player with its options', () => {
    const config: PostextConfig = { ...PAGE, videoStyle: { player: { download: false } } };
    const out = html([ownFile({ start: 3 })], config, { resourceVideoUrl: (id) => `blob:${id}` });
    expect(out).toContain('<video class="pt-video" src="blob:clip.mp4#t=3" poster="blob:clip.jpg"');
    expect(out).toContain('controls="controls"');
    expect(out).toContain('controlslist="nodownload"');
  });

  it('falls back to the production address, then to the poster', () => {
    expect(html([ownFile({ url: 'https://cdn.example.org/clip.mp4' })])).toContain('src="https://cdn.example.org/clip.mp4"');
    const poster = html([ownFile()]);
    expect(poster).not.toContain('<video');
    expect(poster).toContain('src="blob:clip.jpg"');
  });

  it('sets the poster with its overlays, linked, when asked to', () => {
    const out = html([youtube()], { ...PAGE, videoStyle: { html: 'poster' } });
    expect(out).not.toContain('<iframe');
    expect(out).toContain('<a class="pt-video-link" href="https://youtu.be/dQw4w9WgXcQ"');
    expect(out).toContain('<ellipse');
    expect(out).toContain('shape-rendering="crispEdges"');
    const files = html([youtube()], PAGE, { videos: { streams: 'poster' } });
    expect(files).not.toContain('<iframe');
  });
});

describe('video resources in bundles', () => {
  it('carries the video file and its poster, and reads them back', async () => {
    const r = ownFile({ url: 'https://cdn.example.org/clip.mp4', player: { download: false } });
    const { manifest, files, warnings } = await createBundle({
      name: 'Clips',
      markdown: '::resource{id="clip"}',
      resources: [r],
      files: { 'clip.mp4': new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), 'clip.jpg': new Uint8Array([0xff, 0xd8, 0xff]) },
    });
    expect(warnings).toEqual([]);
    expect(manifest.resources?.[0]).toMatchObject({
      id: 'clip', kind: 'video', file: 'resources/clip.mp4', poster: 'resources/clip.poster.jpg', width: 800, height: 600,
      video: { source: 'file', url: 'https://cdn.example.org/clip.mp4', format: 'mp4', player: { download: false } },
    });
    expect(manifest.resources?.[0]?.video?.fileId).toBeUndefined();
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['resources/clip.mp4', 'resources/clip.poster.jpg']));

    const { bytes } = await createBundle({ name: 'Clips', markdown: '::resource{id="clip"}', resources: [r], files: { 'clip.mp4': new Uint8Array([1]), 'clip.jpg': new Uint8Array([2]) } });
    const opened = await openBundle(bytes);
    const back = opened.resources[0]!;
    expect(back.kind).toBe('video');
    expect(back.video).toMatchObject({
      source: 'file', fileId: 'resources/clip.mp4', format: 'mp4', url: 'https://cdn.example.org/clip.mp4',
      poster: { fileId: 'resources/clip.poster.jpg', format: 'jpeg', width: 800, height: 600 },
    });
    expect(opened.files.get('resources/clip.mp4')).toEqual(new Uint8Array([1]));
  });

  it('keeps a YouTube video with no files, and a video whose file is missing', async () => {
    const { manifest, warnings } = await createBundle({ name: 'x', markdown: '::resource{id="talk"}', resources: [youtube()] });
    expect(warnings).toEqual(['talk: missing file, skipped']);
    expect(manifest.resources?.[0]).toMatchObject({ id: 'talk', kind: 'video', video: { source: 'youtube' } });
    expect(manifest.resources?.[0]?.poster).toBeUndefined();
  });
});
