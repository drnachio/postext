import type { VDTDocument } from 'postext';
import type { PdfWarning, RenderProgress, RenderToPdfOptions } from '../pdf-backend';

/** The render options that travel to the worker as data. */
export type PdfRenderSettings = Pick<RenderToPdfOptions, 'pageNegative' | 'outlines' | 'colorSpace' | 'accessible'>;

export type PdfRequestMessage =
  | {
      kind: 'render';
      id: number;
      docs: VDTDocument[];
      settings: PdfRenderSettings;
      /** Resource bytes by file id (transferred). */
      resourceBytes: [string, Uint8Array][];
    }
  | {
      /** The host's answer to a `font` or `rasterize` question: a font as
       *  one file or several (a face served as unicode-range slices). */
      kind: 'answer';
      askId: number;
      bytes: Uint8Array | Uint8Array[] | null;
      error?: string;
    }
  | { kind: 'dispose' };

export type PdfResponseMessage =
  | { kind: 'progress'; id: number; progress: RenderProgress }
  /** A render warning (`RenderToPdfOptions.onWarning`: a font fallback,
   *  characters a face lacks, an image painted as a placeholder…),
   *  forwarded as it happens. */
  | { kind: 'warning'; id: number; warning: PdfWarning }
  | { kind: 'rendered'; id: number; bytes: Uint8Array }
  | { kind: 'error'; id: number; message: string; stack?: string }
  /** The worker cannot reach fonts or decode SVG itself: it asks the host.
   *  `codePoints` are the characters the pages set in the face
   *  (`PdfFontRequest`). */
  | { kind: 'font'; askId: number; family: string; weight: number; style: 'normal' | 'italic'; codePoints?: number[] }
  | { kind: 'rasterize'; askId: number; svg: string; widthPx: number; heightPx: number };
