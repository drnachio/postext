import type { PostextContent, PostextConfig } from '../types';
import type { VDTDocument } from '../vdt';
import type { BuildPassInfo, BuildProgress } from '../pipeline/build';

/** Where a build's time went (dev tooling; always attached, cheap). */
export interface BuildStats {
  /** Every placement pass, in build order. */
  passes: BuildPassInfo[];
  /** Wall time of the whole build inside the worker, in ms. */
  totalMs: number;
}

export interface FontPayload {
  family: string;
  weight: string;
  style: string;
  unicodeRange?: string;
  /** Transferred to the worker. Becomes detached on the sender side. */
  buffer: ArrayBuffer;
}

export type RequestMessage =
  | {
      kind: 'registerFonts';
      id: number;
      faces: FontPayload[];
    }
  | {
      kind: 'unregisterFonts';
      id: number;
      /** Family names to drop from the worker's face set. All faces whose
       *  family matches are removed from `document.fonts` and from the
       *  internal dedup map, so the next `registerFonts` for the same
       *  family takes effect instead of being deduped. */
      families: string[];
    }
  | {
      kind: 'build';
      id: number;
      content: PostextContent;
      config?: PostextConfig;
      /** Fingerprint of `content.resources`. When it matches the list the
       *  worker last received, `content.resources` may be left out and the
       *  worker lays out with the list it already holds — the resources of
       *  a book (hundreds of tables and figures) are the bulk of a build
       *  message and change far less often than the text. */
      resourcesKey?: string;
    }
  | {
      kind: 'cancel';
      /** Id of the in-flight build to cancel. */
      id: number;
    }
  | {
      kind: 'dispose';
    };

export type ResponseMessage =
  | {
      kind: 'built';
      id: number;
      doc: VDTDocument;
      stats: BuildStats;
    }
  | {
      kind: 'progress';
      id: number;
      progress: BuildProgress;
    }
  | {
      kind: 'fontsRegistered';
      id: number;
    }
  | {
      kind: 'fontsUnregistered';
      id: number;
    }
  | {
      kind: 'cancelled';
      id: number;
    }
  | {
      kind: 'error';
      id: number;
      message: string;
      stack?: string;
    };
