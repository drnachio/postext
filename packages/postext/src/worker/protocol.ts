import type { PostextContent, PostextConfig } from '../types';
import type { VDTDocument } from '../vdt';

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
