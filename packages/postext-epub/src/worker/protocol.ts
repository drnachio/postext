// Messages between `createEpubWorker` (client.ts) and the worker
// (epub.worker.ts, serve.ts). Everything travels as data: the documents are
// cloned, the bytes of fonts, pictures and the cover are transferred, and
// the finished file comes back transferred.

import type { VDTDocument } from 'postext';
import type { EpubProgress, EpubWarning, RenderToEpubOptions } from '../types';

/** A picture's bytes and media type, as `EpubResourceBytes` answers. */
export interface EpubResourcePayload {
  bytes: Uint8Array;
  mediaType: string;
}

/** The render options that travel to the worker as data. */
export type EpubRenderSettings = Pick<RenderToEpubOptions, 'layout' | 'metadata' | 'fonts' | 'cover'> & {
  /** The data part of `svgFonts` (#630): a provider or `withhold` stays
   *  on the host, which inlines those SVGs itself before it posts. */
  svgFonts?: { inline?: boolean; maxBytes?: number };
};

export type EpubRequestMessage =
  | {
      kind: 'render';
      id: number;
      docs: VDTDocument[];
      settings: EpubRenderSettings;
      /** Picture bytes by file id, gathered by the host beforehand. */
      resourceBytes: [string, EpubResourcePayload][];
    }
  /** Stop the render `id`: the writer throws at its next check. */
  | { kind: 'cancel'; id: number }
  | { kind: 'dispose' };

export type EpubResponseMessage =
  | { kind: 'progress'; id: number; progress: EpubProgress }
  | { kind: 'warning'; id: number; warning: EpubWarning }
  | { kind: 'rendered'; id: number; bytes: Uint8Array }
  | { kind: 'error'; id: number; message: string; stack?: string; aborted?: boolean };
