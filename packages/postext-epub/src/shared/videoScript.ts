// One video at a time in an EPUB (#507): a content document that holds
// videos to coordinate links the engine's playback script. A reading
// system that runs scripts then pauses the other videos of the document
// when an exclusive one starts, as Folio and the HTML viewer do; one that
// does not run scripts ignores the link. A video that plays alongside
// carries `data-pt-alongside`.

import { VIDEO_PLAYBACK_SCRIPT } from 'postext';
import type { EpubItem } from '../types';

/** The script's place, relative to the package document. */
export const VIDEO_SCRIPT_HREF = 'scripts/videos.js';

/** The script's manifest item. */
export function videoScriptItem(): EpubItem {
  return { id: 'pt-video-script', href: VIDEO_SCRIPT_HREF, mediaType: 'application/javascript', data: VIDEO_PLAYBACK_SCRIPT };
}

/** Whether a content document has videos for the script to coordinate:
 *  two or more, one of them exclusive (videos that all play alongside
 *  never pause one another, and a lone video has nothing to pause). The
 *  other documents stay unscripted. */
export function needsVideoScript(xhtml: string): boolean {
  if (!xhtml.includes('<video')) return false;
  const videos = xhtml.match(/<video\b[^>]*>/g) ?? [];
  return videos.length >= 2 && videos.some((tag) => !/\sdata-pt-alongside[\s=/>]/.test(tag));
}

/** The `<script>` element that links the script from a content document
 *  at `src` (the script's href seen from that document). */
export const videoScriptTag = (src: string): string => `<script src="${src}"></script>\n`;

/** `xhtml` with the script linked at the end of its head when it needs it
 *  (see `needsVideoScript`). The package declares a document that links a
 *  script `scripted` (`itemProperties`); the caller packs `videoScriptItem`
 *  when any document links it. */
export function withVideoScript(xhtml: string, src: string): string {
  if (!needsVideoScript(xhtml)) return xhtml;
  const at = xhtml.indexOf('</head>');
  return at < 0 ? xhtml : xhtml.slice(0, at) + videoScriptTag(src) + xhtml.slice(at);
}
