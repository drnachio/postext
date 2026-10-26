// A video resource as a tool edits it: the steps of the video editor of the
// Resources panel — its source, its link or its file, its poster, the part
// that plays, its player — taken in one call and applied with the editor's
// own functions.

import {
  parseVideoUrl,
  videoFormatOfUrl,
  type Resource,
  type ResourceVideo,
  type VideoPlayerOptions,
  type VideoSource,
} from 'postext';
import { getBlob } from '../storage/blobStore.js';
import { resourceFromFile } from '../panels/resources/uploads/uploadFiles.js';
import {
  VIDEO_PLAYER_SOURCES,
  addressEdit,
  isHttp,
  isNewStreamVideo,
  mergeVideo,
  playerWith,
  posterEdit,
  sourceSwitched,
  streamInfoEdit,
  videoFileEdit,
} from '../panels/resources/video/videoEdits.js';
import { addressMetadata, fetchStreamInfo, posterAt } from '../panels/resources/video/videoMedia.js';
import { FILE_PARAM, readFileInput, type FileInput } from './fileInput.js';
import { ToolError, type JsonSchema } from './modelContext.js';

type PlayerKey = keyof VideoPlayerOptions;

/** The `video` parameter of the resource tool. */
export interface VideoInput {
  source?: VideoSource;
  url?: string | null;
  file?: FileInput;
  poster?: FileInput;
  posterTime?: number;
  fetchPoster?: boolean;
  start?: number | null;
  end?: number | null;
  player?: Partial<Record<PlayerKey, boolean | string | null>>;
}

const SWITCH = { type: ['boolean', 'null'] } as const;

export const VIDEO_SCHEMA: JsonSchema = {
  type: 'object',
  description: 'A video: a new video resource, or changes to the one named by id. It is printed as its poster (with a QR code or a link, as the book\'s Video style says) and played by the HTML, EPUB and Folio outputs.',
  properties: {
    source: { type: 'string', enum: ['youtube', 'vimeo', 'file'], description: 'Where it plays from: a YouTube or Vimeo page, or a self-hosted file (an uploaded file, or one at a web address). Read from url or file when left out. Changing it drops the link or the file of the other source.' },
    url: { type: ['string', 'null'], description: 'YouTube or Vimeo: the video\'s link (a watch, short or embed link); a new video\'s poster, frame size and title are fetched from the platform. A self-hosted file: its production address, where the published book finds it; without a file it is the source itself (an MP4 or WebM on a server, or an .m3u8 HLS stream). null removes it.' },
    file: { ...FILE_PARAM, description: 'A video file (MP4, WebM, OGV or MOV) stored in the book, by url or base64: its frame size, length and a first poster are read from it.' },
    poster: { ...FILE_PARAM, description: 'A picture (PNG, JPEG, WebP or GIF) to print as the poster in place of a frame.' },
    posterTime: { type: 'number', minimum: 0, description: 'A self-hosted video: take the frame at this second as the poster.' },
    fetchPoster: { type: 'boolean', description: 'YouTube or Vimeo: fetch the poster and frame size from the platform again.' },
    start: { type: ['number', 'null'], minimum: 0, maximum: 86400, description: 'Play from this second (the printed link starts there too). null or 0: from the beginning.' },
    end: { type: ['number', 'null'], minimum: 0, maximum: 86400, description: 'Play up to this second. null or 0: to the end.' },
    player: {
      type: 'object',
      description: 'This video\'s player options, over the book\'s Video style; null leaves an option to the style. A YouTube player honours controls, fullscreen, autoplay, muted, loop and privacy; Vimeo those and playbackRate and pictureInPicture; a self-hosted file all but privacy.',
      properties: {
        controls: SWITCH, download: SWITCH, fullscreen: SWITCH, playbackRate: SWITCH, pictureInPicture: SWITCH, remotePlayback: SWITCH,
        autoplay: SWITCH, muted: SWITCH, loop: SWITCH, privacy: SWITCH,
        exclusive: { ...SWITCH, description: 'false lets it play alongside the other videos on show.' },
        preload: { type: ['string', 'null'], enum: ['none', 'metadata', 'auto', null] },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

const PLATFORM: Record<'youtube' | 'vimeo', string> = { youtube: 'YouTube', vimeo: 'Vimeo' };
const POSTER_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * `resource` (of kind `video`) after the edits of `input`, and what its
 * author would be told along the way (a poster the platform did not give).
 * The steps run in the editor's order: source, file, link or address,
 * poster, range, player. `fresh`: the video was just made and has nothing
 * to lose, so its source follows the link or the file it is given.
 */
export async function withVideoEdits(resource: Resource, input: VideoInput, options: { fresh?: boolean; signal?: AbortSignal } = {}): Promise<{ resource: Resource; notes: string[] }> {
  const { fresh = false, signal } = options;
  const notes: string[] = [];
  let video: ResourceVideo = resource.video ?? { source: 'youtube' };
  let extra: Partial<Resource> = {};
  const url = input.url === undefined ? undefined : (input.url ?? '').trim();

  // The source: named, or the one the file or the link speaks for.
  const linked = url ? parseVideoUrl(url)?.source : undefined;
  if (input.file !== undefined && input.source !== undefined && input.source !== 'file') {
    throw new ToolError(`A video file makes the video a self-hosted one; it cannot go with source "${input.source}".`);
  }
  // A link speaks for a new video, and moves one between the platforms; a
  // self-hosted video keeps its file unless the source is named.
  const spoken = fresh ? linked ?? (url && isHttp(url) ? 'file' : undefined) : video.source !== 'file' ? linked : undefined;
  const source: VideoSource = input.source ?? (input.file !== undefined ? 'file' : undefined) ?? spoken ?? video.source;
  if (source !== video.source) video = mergeVideo(video, sourceSwitched(source));

  if (input.file !== undefined) {
    const file = await readFileInput(input.file, signal);
    let edit: Partial<ResourceVideo> | null;
    try {
      edit = await videoFileEdit(file);
    } catch (err) {
      throw new ToolError(`"${file.name}" could not be read as a video (${reason(err)}).`);
    }
    if (!edit) throw new ToolError(`"${file.name}" is not a video file the Sandbox takes (${file.type || 'unknown type'}): MP4, WebM, OGV or MOV. Give fileName or mimeType when the URL tells neither.`);
    video = mergeVideo(video, edit);
  }

  if (video.source === 'file') {
    if (url !== undefined) {
      if (url !== '' && !isHttp(url)) throw new ToolError(`"${url}" is not a web address: a self-hosted video's url starts with http:// or https://.`);
      if (url !== (video.url ?? '')) {
        video = mergeVideo(video, addressEdit(video, url));
        // Without a file the address is the source: its size and length
        // are read from it once it loads, as the editor's player does.
        if (!video.fileId && url) {
          try {
            video = mergeVideo(video, await addressMetadata(url, (video.format ?? videoFormatOfUrl(url)) === 'hls'));
          } catch (err) {
            notes.push(`The video at ${url} could not be loaded to read its frame size and length (${reason(err)}); it is stored as given.`);
          }
        }
      }
    }
    if (input.fetchPoster) throw new ToolError('fetchPoster asks YouTube or Vimeo for a poster. A self-hosted video takes a frame of itself (posterTime) or a picture (poster).');
  } else {
    const platform = video.source;
    if (url !== undefined && url !== '' && linked !== platform) {
      throw new ToolError(`"${url}" is not a ${PLATFORM[platform]} link${linked ? ` (it is a ${PLATFORM[linked as 'youtube' | 'vimeo']} one: leave source out, or name that one)` : ''}.`);
    }
    const link = url ?? video.url ?? '';
    if (input.fetchPoster && !link) throw new ToolError('fetchPoster needs the video\'s link (url).');
    const changed = url !== undefined && url !== (video.url ?? '');
    if (link && (input.fetchPoster || (changed && isNewStreamVideo(platform, link, video.url)))) {
      // A new video: its own poster. The same video at another start keeps it.
      try {
        const info = await fetchStreamInfo(platform, link);
        if (!info.poster) notes.push(`${PLATFORM[platform]} gave no poster for this video: it prints as an empty frame until it has one (video.poster).`);
        const edit = streamInfoEdit(info, changed ? link : undefined, resource);
        video = mergeVideo(video, edit.video);
        extra = edit.resource;
      } catch (err) {
        notes.push(`The poster could not be fetched from ${PLATFORM[platform]} (${reason(err)}).`);
        if (changed) video = mergeVideo(video, { url: link });
      }
    } else if (changed) video = mergeVideo(video, { url: url || undefined });
    if (input.posterTime !== undefined) throw new ToolError(`posterTime takes a frame of a self-hosted video; a ${PLATFORM[platform]} video's poster comes from the platform (fetchPoster) or from a picture (poster).`);
  }

  if (input.poster !== undefined && input.posterTime !== undefined) throw new ToolError('Give the poster as a picture (poster) or as a frame (posterTime), not both.');
  if (input.poster !== undefined) {
    const file = await readFileInput(input.poster, signal);
    const made = POSTER_TYPES.includes(file.type) ? await resourceFromFile(file, '', new Set()) : null;
    if (!made?.bitmap) throw new ToolError(`"${file.name}" is not a picture a poster can be (${file.type || 'unknown type'}): PNG, JPEG, WebP or GIF.`);
    video = mergeVideo(video, posterEdit(made.bitmap));
  }
  if (input.posterTime !== undefined) {
    const address = !video.fileId && isHttp(video.url) ? video.url.trim() : undefined;
    if (!video.fileId && !address) throw new ToolError('posterTime needs the video: its file (video.file) or its address (video.url).');
    let local: string | undefined;
    try {
      if (video.fileId) {
        const record = await getBlob(video.fileId);
        if (!record) throw new Error('its file is missing from the book');
        local = URL.createObjectURL(new Blob([record.bytes], { type: record.contentType }));
      }
      const taken = address
        ? await posterAt(address, input.posterTime, { address: true, hls: (video.format ?? videoFormatOfUrl(address)) === 'hls' })
        : await posterAt(local!, input.posterTime);
      video = mergeVideo(video, { poster: taken.poster, posterTime: taken.time });
    } catch (err) {
      // A frame from a server that refuses cross-origin reads taints the
      // canvas.
      throw new ToolError(`The frame at ${input.posterTime} s could not be taken (${reason(err)}).${address ? ' A video on another server must allow cross-origin reads for a frame of it to be captured; otherwise give the poster as a picture (video.poster).' : ''}`);
    } finally {
      if (local) URL.revokeObjectURL(local);
    }
  }

  for (const key of ['start', 'end'] as const) {
    const value = input[key];
    if (value !== undefined) video = mergeVideo(video, { [key]: value !== null && value > 0 ? value : undefined });
  }

  for (const [name, value] of Object.entries(input.player ?? {})) {
    const key = name as PlayerKey;
    if (value === undefined) continue;
    if (value !== null && !VIDEO_PLAYER_SOURCES[key].includes(video.source)) {
      const honoured = (Object.keys(VIDEO_PLAYER_SOURCES) as PlayerKey[]).filter((k) => VIDEO_PLAYER_SOURCES[k].includes(video.source));
      throw new ToolError(`video.player.${key} is not an option of a ${video.source === 'file' ? 'self-hosted' : PLATFORM[video.source]} video's player. Its options: ${honoured.join(', ')}.`);
    }
    video = mergeVideo(video, { player: playerWith(video.player, key, (value ?? undefined) as VideoPlayerOptions[PlayerKey]) });
  }

  return { resource: { ...resource, ...extra, kind: 'video', video }, notes };
}
