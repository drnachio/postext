import type { ColorValue, Dimension } from '../page.js';

/** Where a video resource plays from (#454): a YouTube or Vimeo page, or a
 *  self-hosted file (an uploaded MP4 or WebM, or one at a web address: a
 *  file on a server or an HLS stream, #476). */
export type VideoSource = 'youtube' | 'vimeo' | 'file';

/** What a video's player offers in the interactive outputs (the HTML viewer,
 *  EPUB). Set for the whole book in `videoStyle.player`, and per video in
 *  `Resource.video.player` (only the fields set there). The HTML5 player of
 *  a self-hosted file honours them all; the YouTube and Vimeo players honour
 *  what their embed parameters allow (see each field). */
export interface VideoPlayerOptions {
  /** Show the player's controls. Default `true`. YouTube, Vimeo and
   *  HTML5. */
  controls?: boolean;
  /** Offer the browser's download button (HTML5 only: `controlslist=
   *  "nodownload"` when off). Default `true`. It hides the button; it is
   *  not copy protection. YouTube and Vimeo never offer a download. */
  download?: boolean;
  /** Offer full screen. Default `true`. YouTube (`fs=0`), Vimeo and HTML5
   *  (`nofullscreen`). */
  fullscreen?: boolean;
  /** Offer the playback speed menu. Default `true`. Vimeo (`speed=0`) and
   *  HTML5 (`noplaybackrate`, Chromium). */
  playbackRate?: boolean;
  /** Offer picture-in-picture. Default `true`. Vimeo (`pip=0`) and HTML5
   *  (`disablepictureinpicture`). */
  pictureInPicture?: boolean;
  /** Offer casting to another screen. Default `true`. HTML5
   *  (`disableremoteplayback`). */
  remotePlayback?: boolean;
  /** Start playing on its own (always muted, as browsers require). Default
   *  `false`. */
  autoplay?: boolean;
  /** Start muted. Default `false`. */
  muted?: boolean;
  /** Play again from the start at the end. Default `false`. */
  loop?: boolean;
  /** Starting this video pauses the others on show, so one plays at a
   *  time. Default `true`. `false` lets it play alongside the others: the
   *  silent looping clips of a "living" page, several running at once
   *  (#507). Folio (which also starts an autoplaying, non-exclusive video
   *  each time its page comes into view and stops it when the page is
   *  turned away), the HTML5 player of the HTML viewer, and EPUB where the
   *  reading system runs scripts (a page or chapter with videos to
   *  coordinate links a small playback script; the videos of one content
   *  document are kept to the rule, not those of a facing page). The
   *  YouTube and Vimeo embeds play each video on its own terms. */
  exclusive?: boolean;
  /** How much of a self-hosted file the browser loads before play:
   *  `'none'`, `'metadata'` (the default) or `'auto'`. HTML5 only. */
  preload?: 'none' | 'metadata' | 'auto';
  /** Privacy-enhanced embeds: YouTube from `youtube-nocookie.com`, Vimeo
   *  with `dnt=1` (no tracking cookies). Default `true`. */
  privacy?: boolean;
}

export type ResolvedVideoPlayerOptions = Required<VideoPlayerOptions>;

/** The picture printed for a video: a frame of it (the platform's poster
 *  for YouTube and Vimeo, a chosen frame of a self-hosted file), stored
 *  out-of-band like a bitmap. */
export interface ResourceVideoPoster {
  fileId: string;
  format: string;
  width: number;
  height: number;
}

/** The payload of a `kind: 'video'` resource (#454). */
export interface ResourceVideo {
  source: VideoSource;
  /** YouTube or Vimeo: the video's address (any watch, short, Shorts or
   *  embed link). A self-hosted file: its production address, where the
   *  published book finds it — printed in the QR code, linked from the PDF,
   *  and played by the HTML and EPUB outputs and on Folio's pages when the
   *  file itself is not available to them. It may be the only source: an
   *  MP4 or WebM on a server, or an HLS stream (`.m3u8`). */
  url?: string;
  /** A self-hosted file: the uploaded video, stored out-of-band like a
   *  bitmap (part of a `.postext` bundle). */
  fileId?: string;
  /** A self-hosted file's format: `'mp4'`, `'webm'`, `'ogv'`, `'mov'`, or
   *  `'hls'` for an HLS stream (an `.m3u8` playlist, #476). Unset: the one
   *  the address's extension tells, else `'mp4'`. */
  format?: string;
  /** Frame size of the video in px, for its aspect ratio when there is no
   *  poster. */
  width?: number;
  height?: number;
  /** Length in seconds (informative). */
  duration?: number;
  /** The poster frame. Without one a video is printed as a placeholder box
   *  in the video's aspect ratio (16:9 when unknown). */
  poster?: ResourceVideoPoster;
  /** The time in seconds of a self-hosted file's frame used as the poster
   *  (informative, kept so the frame can be picked again). */
  posterTime?: number;
  /** Play from `start` to `end` seconds. The printed link starts at
   *  `start` too. */
  start?: number;
  end?: number;
  /** Player options of this video, laid over `videoStyle.player`. */
  player?: VideoPlayerOptions;
}

/** Where an overlay sits on a video's poster: the centre, a corner or the
 *  middle of a side. The positions are physical: `top-right` is the top
 *  right corner in a right-to-left book too. */
export type VideoOverlayPosition =
  | 'center'
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

/** The mark printed on a video's poster to say it plays. */
export interface VideoPlayMarkConfig {
  /** Print it. Default `true`. */
  enabled?: boolean;
  /** `'circle'` (a disc with a triangle, the default), `'rounded'` (a
   *  rounded rectangle with a triangle) or `'triangle'` (the triangle
   *  alone, outlined in the background colour). */
  shape?: 'circle' | 'rounded' | 'triangle';
  /** Default `'center'`. */
  position?: VideoOverlayPosition;
  /** Height of the mark (the disc's diameter). Default `12mm`; never more
   *  than 40 % of the poster's shorter side. */
  size?: Dimension;
  /** Distance from the poster's edges when the mark sits at a side or a
   *  corner. Default `4mm`. */
  inset?: Dimension;
  /** The triangle. Default white. */
  color?: ColorValue;
  /** The disc or rectangle behind it. Default the main palette colour. */
  background?: ColorValue;
  /** Opacity of the background, 0–1. Default `0.9`. */
  backgroundOpacity?: number;
}

/** The QR code printed on a video's poster, opening the video (its YouTube
 *  or Vimeo page, or a self-hosted file's production address). */
export interface VideoQrConfig {
  /** Print it. Default `true`. A video with no address (a self-hosted file
   *  without `url`) prints none and raises `videoWithoutUrl`. */
  enabled?: boolean;
  /** Default `'bottom-right'`. */
  position?: VideoOverlayPosition;
  /** Side of the code with its quiet zone. Default `18mm`; never more than
   *  45 % of the poster's shorter side. Keep each module at least a third of
   *  a millimetre for phone cameras. */
  size?: Dimension;
  /** Distance from the poster's edges. Default `3mm`. */
  inset?: Dimension;
  /** Error-correction level `'L'`, `'M'` (the default), `'Q'` or `'H'`;
   *  raised automatically while the code stays the same size. */
  errorCorrection?: 'L' | 'M' | 'Q' | 'H';
  /** Light modules around the code, in modules. Default `2`. */
  quietZone?: number;
  /** Dark modules. Default black. */
  color?: ColorValue;
  /** The plate behind the code. Default white. */
  background?: ColorValue;
  /** Corner radius of the plate. Default `1mm`. */
  radius?: Dimension;
}

/** How video resources are printed and played (#454). */
export interface VideoStyleConfig {
  playMark?: VideoPlayMarkConfig;
  qr?: VideoQrConfig;
  /** Make the poster a link to the video: a link annotation in the PDF, an
   *  `<a>` around the poster in HTML and EPUB when they show the poster.
   *  Default `true`. */
  linkPoster?: boolean;
  /** What the HTML output sets for a video: its player (`'player'`, the
   *  default) or the printed poster with its overlays (`'poster'`). */
  html?: 'player' | 'poster';
  /** Player options for every video. */
  player?: VideoPlayerOptions;
}

export interface ResolvedVideoPlayMarkConfig {
  enabled: boolean;
  shape: 'circle' | 'rounded' | 'triangle';
  position: VideoOverlayPosition;
  size: Dimension;
  inset: Dimension;
  color: ColorValue;
  background: ColorValue;
  backgroundOpacity: number;
}

export interface ResolvedVideoQrConfig {
  enabled: boolean;
  position: VideoOverlayPosition;
  size: Dimension;
  inset: Dimension;
  errorCorrection: 'L' | 'M' | 'Q' | 'H';
  quietZone: number;
  color: ColorValue;
  background: ColorValue;
  radius: Dimension;
}

export interface ResolvedVideoStyleConfig {
  playMark: ResolvedVideoPlayMarkConfig;
  qr: ResolvedVideoQrConfig;
  linkPoster: boolean;
  html: 'player' | 'poster';
  player: ResolvedVideoPlayerOptions;
}
