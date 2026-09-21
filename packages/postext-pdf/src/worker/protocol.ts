import type { VDTDocument } from 'postext';
import type { RenderProgress, RenderToPdfOptions } from '../pdf-backend';

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
      /** The host's answer to a `font` or `rasterize` question. */
      kind: 'answer';
      askId: number;
      bytes: Uint8Array | null;
      error?: string;
    }
  | { kind: 'dispose' };

export type PdfResponseMessage =
  | { kind: 'progress'; id: number; progress: RenderProgress }
  | { kind: 'rendered'; id: number; bytes: Uint8Array }
  | { kind: 'error'; id: number; message: string; stack?: string }
  /** The worker cannot reach fonts or decode SVG itself: it asks the host. */
  | { kind: 'font'; askId: number; family: string; weight: number; style: 'normal' | 'italic' }
  | { kind: 'rasterize'; askId: number; svg: string; widthPx: number; heightPx: number };
