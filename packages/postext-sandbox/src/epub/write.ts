// What the EPUB writer is told besides the laid-out chapters: the package
// metadata, the fonts, the pictures' bytes, the cover, and where its
// warnings go. The EPUB tab and the Books panel's compiler (#1526) build
// them here, so a book downloaded from its row is the file the EPUB tab
// writes.

import type { PostextConfig, VDTDocument } from 'postext';
import type { EpubCover, EpubLayout, EpubMetadata, EpubWarning, RenderToEpubOptions } from 'postext-epub';
import { composeBookMemo } from '../book/compose.js';
import type { Chapter } from '../book/types.js';
import { collectEpubFonts, epubResourceBytes, epubSvgFonts } from './inputs.js';
import { epubMetadataOf, type EpubBookIdentity } from './metadata.js';

/** A warning of a generation: the writer's, or a family the Sandbox left
 *  out of the file. */
export type EpubNotice = EpubWarning
  | { kind: 'fontWithheld'; family: string }
  /** A family the book may not hand on is set in its `fallback` under the
   *  same name (#993). */
  | { kind: 'fontStoodIn'; family: string; standIn: string };

const noticeKey = (n: EpubNotice): string =>
  n.kind === 'missingImage' ? `img:${n.fileId}`
    : n.kind === 'unsupported' ? `x:${n.detail}`
      : n.kind === 'missingFont' ? `font:${n.family}:${n.weight ?? ''}:${n.style ?? ''}`
        : n.kind === 'svgFontUnavailable' ? `svgfont:${n.fileId}:${n.family}:${n.weight}:${n.style}`
          : n.kind === 'svgFontsTooLarge' ? `svgsize:${n.fileId}`
            : n.kind === 'fontStoodIn' ? `stood:${n.family}`
              : `withheld:${n.family}`;

/** The warnings of one generation, each said once; a family left out is
 *  not said again for each face it lacks. */
export function epubNotices(): { note: (n: EpubNotice) => void; notices: EpubNotice[] } {
  const notices: EpubNotice[] = [];
  const seen = new Set<string>();
  const withheldFamilies = new Set<string>();
  const note = (n: EpubNotice) => {
    const key = noticeKey(n);
    if (n.kind === 'fontWithheld') withheldFamilies.add(n.family);
    if (seen.has(key) || (n.kind === 'missingFont' && withheldFamilies.has(n.family))) return;
    seen.add(key);
    notices.push(n);
    console.warn('[epub]', n);
  };
  return { note, notices };
}

export interface EpubWriteInput {
  /** The chapters as laid out (`layOutBookPrint`). */
  docs: VDTDocument[];
  chapters: readonly Chapter[];
  /** The configuration the layout ran with. */
  config: PostextConfig;
  layout: EpubLayout;
  identity: EpubBookIdentity | null;
  /** The interface language (the book's when it names none). */
  locale: string;
  /** The cover, given the package's title. */
  cover: (title: string) => Promise<EpubCover | null>;
  note: (n: EpubNotice) => void;
}

/** The writer's options (without progress and signal) and the package
 *  metadata: the fonts the pages are set in, the families left out of
 *  them said through `note`. */
export async function epubWriterOptions(input: EpubWriteInput): Promise<{ options: RenderToEpubOptions; metadata: EpubMetadata }> {
  const { docs, chapters, config, note } = input;
  const metadata = epubMetadataOf(composeBookMemo(chapters).metadata, config, input.identity, input.locale);
  const [{ fonts, withheld, stoodIn }, cover] = await Promise.all([
    collectEpubFonts(config, docs, chapters.map((c) => c.markdown)),
    input.cover(metadata.title),
  ]);
  for (const family of withheld) note({ kind: 'fontWithheld', family });
  for (const stood of stoodIn) note({ kind: 'fontStoodIn', ...stood });
  return {
    metadata,
    options: {
      layout: input.layout,
      metadata,
      fonts,
      resourceBytes: epubResourceBytes(),
      svgFonts: epubSvgFonts(),
      ...(cover ? { cover } : {}),
      onWarning: note,
    },
  };
}
