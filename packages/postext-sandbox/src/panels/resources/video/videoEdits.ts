// What the video editor does to a video resource (#454), as functions of
// the video: each returns the fields that change, which the editor merges
// with `mergeVideo`.

import { parseVideoUrl, videoFormatOfUrl, type Resource, type ResourceVideo, type ResourceVideoPoster, type VideoPlayerOptions, type VideoSource } from 'postext';
import { putBlob } from '../../../storage/blobStore.js';
import { defaultPoster, readVideoMetadata, videoFormatOf, type StreamInfo } from './videoMedia.js';

type PlayerKey = keyof VideoPlayerOptions;

/** Which sources' players honour each per-video player option (the rest
 *  are left to the book's Video style). */
export const VIDEO_PLAYER_SOURCES: Record<PlayerKey, VideoSource[]> = {
  controls: ['youtube', 'vimeo', 'file'],
  download: ['file'],
  fullscreen: ['youtube', 'vimeo', 'file'],
  playbackRate: ['vimeo', 'file'],
  pictureInPicture: ['vimeo', 'file'],
  remotePlayback: ['file'],
  autoplay: ['youtube', 'vimeo', 'file'],
  muted: ['youtube', 'vimeo', 'file'],
  loop: ['youtube', 'vimeo', 'file'],
  exclusive: ['file'],
  preload: ['file'],
  privacy: ['youtube', 'vimeo'],
};

/** `video` with `partial` laid over it; a field set to `undefined` goes. */
export function mergeVideo(video: ResourceVideo, partial: Partial<ResourceVideo>): ResourceVideo {
  const next: ResourceVideo = { ...video, ...partial };
  for (const k of Object.keys(next) as (keyof ResourceVideo)[]) if (next[k] === undefined) delete next[k];
  return next;
}

/** The fields that change when a video moves to another source: a link of
 *  another platform, or a file, does not carry over. */
export function sourceSwitched(next: VideoSource): Partial<ResourceVideo> {
  return { source: next, url: undefined, fileId: undefined, format: undefined, duration: undefined, posterTime: undefined };
}

/** Whether `url` names another video of `source` than `previous` does: a
 *  new video gets its own poster, the same one at another start keeps it. */
export function isNewStreamVideo(source: 'youtube' | 'vimeo', url: string, previous: string | undefined): boolean {
  const next = parseVideoUrl(url);
  const before = parseVideoUrl(previous);
  return !!next && next.source === source && next.id !== before?.id;
}

/** What a platform told of a video (`fetchStreamInfo`), as the fields of
 *  the video and of its resource: its poster and frame size, with `url`
 *  when the link is committed along, and the platform's title as a fair
 *  first alternative text. */
export function streamInfoEdit(info: StreamInfo, url: string | undefined, resource: Pick<Resource, 'altText'> | undefined): { video: Partial<ResourceVideo>; resource: Partial<Resource> } {
  return {
    video: {
      ...(url !== undefined ? { url } : {}),
      ...(info.poster ? { poster: info.poster } : {}),
      ...(info.width && info.height ? { width: info.width, height: info.height } : {}),
    },
    resource: info.title && !resource?.altText ? { altText: info.title } : {},
  };
}

/** A video file stored as the video's own: its bytes, format, frame size,
 *  length and a first poster. Null when the file is no video; rejects when
 *  it cannot be read. */
export async function videoFileEdit(file: File): Promise<Partial<ResourceVideo> | null> {
  const format = videoFormatOf(file);
  if (!format) return null;
  const local = URL.createObjectURL(file);
  try {
    const meta = await readVideoMetadata(local);
    const fileId = await putBlob(await file.arrayBuffer(), file.type || `video/${format}`);
    const first = await defaultPoster(local);
    return {
      source: 'file',
      fileId,
      format,
      width: meta.width || undefined,
      height: meta.height || undefined,
      duration: meta.duration || undefined,
      ...(first ? { poster: first.poster, posterTime: first.time } : {}),
    };
  } finally {
    URL.revokeObjectURL(local);
  }
}

/** The fields that change when the address of a self-hosted video is
 *  typed. With a file it is the production address and nothing else moves;
 *  without one the address is the source: its format comes with it, and its
 *  size and length are read again once it loads. */
export function addressEdit(video: ResourceVideo, url: string): Partial<ResourceVideo> {
  return video.fileId
    ? { url: url || undefined }
    : { url: url || undefined, format: videoFormatOfUrl(url), width: undefined, height: undefined, duration: undefined };
}

/** The fields that change when a picture is uploaded as the poster. */
export function posterEdit(poster: ResourceVideoPoster): Partial<ResourceVideo> {
  return { poster: { fileId: poster.fileId, format: poster.format, width: poster.width, height: poster.height }, posterTime: undefined };
}

/** `player` with one option set, or left to the book's Video style
 *  (`undefined`). Undefined when no option is left. */
export function playerWith<K extends PlayerKey>(player: VideoPlayerOptions | undefined, key: K, value: VideoPlayerOptions[K] | undefined): VideoPlayerOptions | undefined {
  const next: VideoPlayerOptions = { ...player };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return Object.keys(next).length > 0 ? next : undefined;
}

/** Whether `url` is a web address a self-hosted video can play from. */
export const isHttp = (url: string | undefined): url is string => !!url && /^https?:\/\/\S+$/i.test(url.trim());
