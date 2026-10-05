import { parseVideoUrl, videoWatchUrl, youtubePosterUrls, type ResourceVideoPoster, type VideoSource } from 'postext';
import { putBlob } from '../../storage/blobStore';

/** Video files a book may carry (#454). */
export const VIDEO_ACCEPT = 'video/mp4,video/webm,video/ogg,video/quicktime,.mp4,.m4v,.webm,.ogv,.mov';

const VIDEO_FORMATS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
  'video/quicktime': 'mov',
};

const VIDEO_EXT: Record<string, string> = { mp4: 'mp4', m4v: 'mp4', webm: 'webm', ogv: 'ogv', mov: 'mov' };

/** The format of a video file (`mp4`, `webm`…), by its type or its
 *  extension; undefined when it is no video. */
export function videoFormatOf(file: File): string | undefined {
  const byType = VIDEO_FORMATS[file.type];
  if (byType) return byType;
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  return VIDEO_EXT[ext];
}

/** What a YouTube or Vimeo page tells about its video. */
export interface StreamInfo {
  poster?: ResourceVideoPoster;
  title?: string;
  width?: number;
  height?: number;
}

const POSTER_QUALITY = 0.9;

async function storeBlob(blob: Blob, width: number, height: number): Promise<ResourceVideoPoster> {
  const type = blob.type || 'image/jpeg';
  const fileId = await putBlob(await blob.arrayBuffer(), type);
  const format = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpeg';
  return { fileId, format, width, height };
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', POSTER_QUALITY);
  });
}

/** Fetch a picture and store it as a poster. `ratio` (width / height) crops
 *  a letterboxed frame (YouTube's 4:3 fallbacks) to the video's own ratio. */
async function posterFromUrl(url: string, ratio?: number): Promise<ResourceVideoPoster | undefined> {
  const res = await fetch(url);
  if (!res.ok) return undefined;
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const { width, height } = bitmap;
    if (!ratio || Math.abs(width / height - ratio) < 0.02) return await storeBlob(blob, width, height);
    // Keep the middle band of the video's ratio.
    const h = Math.round(Math.min(height, width / ratio));
    const w = Math.round(Math.min(width, h * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bitmap, (width - w) / 2, (height - h) / 2, w, h, 0, 0, w, h);
    return await storeBlob(await canvasBlob(canvas), w, h);
  } finally {
    bitmap.close();
  }
}

/** The poster, title and frame size of a YouTube or Vimeo video, read from
 *  the platforms' public oEmbed endpoints and thumbnails (both answer
 *  cross-origin requests). Undefined fields could not be read. */
export async function fetchStreamInfo(source: Exclude<VideoSource, 'file'>, url: string): Promise<StreamInfo> {
  const parsed = parseVideoUrl(url);
  if (!parsed || parsed.source !== source) return {};
  const page = videoWatchUrl(parsed, 0);
  const info: StreamInfo = {};
  const endpoint = source === 'youtube'
    ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(page)}`
    : `https://vimeo.com/api/oembed.json?width=1280&url=${encodeURIComponent(page)}`;
  let thumbnail: string | undefined;
  try {
    const res = await fetch(endpoint);
    if (res.ok) {
      const data = (await res.json()) as { title?: string; width?: number; height?: number; thumbnail_url?: string };
      if (data.title) info.title = data.title;
      if (data.width && data.height) {
        info.width = data.width;
        info.height = data.height;
      }
      thumbnail = data.thumbnail_url;
    }
  } catch {
    // The poster may still come from the thumbnail address.
  }
  // YouTube's largest frame is 16:9; its smaller ones are 4:3 with the
  // picture letterboxed, cropped back to the video's ratio. Vimeo's
  // thumbnail has the video's own ratio.
  const ratio = info.width && info.height ? info.width / info.height : 16 / 9;
  const candidates: { url: string; crop?: number }[] = source === 'youtube'
    ? youtubePosterUrls(parsed.id).map((url, i) => (i === 0 ? { url } : { url, crop: ratio }))
    : thumbnail ? [{ url: thumbnail }] : [];
  for (const candidate of candidates) {
    try {
      const poster = await posterFromUrl(candidate.url, candidate.crop);
      if (poster) {
        info.poster = poster;
        break;
      }
    } catch {
      // Try the next size.
    }
  }
  return info;
}

/** Frame size and length of a video, read from its metadata. */
export function readVideoMetadata(src: string): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight, duration: Number.isFinite(video.duration) ? video.duration : 0 });
    video.onerror = () => reject(new Error('Unreadable video'));
    video.src = src;
  });
}

/** Wait until `video` shows the frame at `time` seconds. */
export function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.001 && video.readyState >= 2) {
      resolve();
      return;
    }
    const done = () => {
      video.removeEventListener('seeked', done);
      resolve();
    };
    video.addEventListener('seeked', done);
    video.currentTime = time;
  });
}

/** The frame a video element shows, stored as a JPEG poster at the video's
 *  own size (at most 1920 px wide). */
export async function captureFrame(video: HTMLVideoElement): Promise<ResourceVideoPoster> {
  const scale = Math.min(1, 1920 / Math.max(1, video.videoWidth));
  const w = Math.max(1, Math.round(video.videoWidth * scale));
  const h = Math.max(1, Math.round(video.videoHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(video, 0, 0, w, h);
  return storeBlob(await canvasBlob(canvas), w, h);
}

/** A first poster for an uploaded video: the frame a tenth of the way in
 *  (at most a second), past a black opening frame. */
export async function defaultPoster(src: string): Promise<{ poster: ResourceVideoPoster; time: number } | undefined> {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('Unreadable video'));
      video.src = src;
    });
    const time = Math.min(1, (Number.isFinite(video.duration) ? video.duration : 0) * 0.1);
    await seekVideo(video, time);
    return { poster: await captureFrame(video), time };
  } catch {
    return undefined;
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

/** Seconds as `m:ss` (or `h:mm:ss`). */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
