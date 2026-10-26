// A layout request, its priority, the service's interface and state, and
// the queue entry a request waits in (#1276: split out of LayoutService.ts).
import type { BuildProgress } from 'postext/worker';
import type { PostextContent, PostextConfig, VDTDocument } from 'postext';

/** Who is asking, by urgency: what the reader is looking at, what they
 *  asked for, what runs behind their back. */
export type LayoutPriority = 'preview' | 'pdf' | 'background';

export const RANK: Record<LayoutPriority, number> = { preview: 0, pdf: 1, background: 2 };

export interface LayoutRequest {
  /** One client keeps one build: a new request from the same client
   *  supersedes its earlier one (queued or running). */
  clientId: string;
  priority: LayoutPriority;
  content: PostextContent;
  config: PostextConfig;
  /** Fingerprint of everything the document depends on; the worker keeps
   *  the last few documents by it. Omit for a document not worth keeping. */
  cacheKey?: string;
  onProgress?: (progress: BuildProgress) => void;
  /** Warm the worker's cache only: the document is built and kept there,
   *  not sent back (needs `cacheKey`). Resolves with `undefined`. */
  warmOnly?: boolean;
}

export interface LayoutService {
  /** Lay `content` out on the shared worker. Rejects with an `AbortError`
   *  when a later request from the same client supersedes this one, or
   *  when the client is cancelled. */
  build(request: LayoutRequest): Promise<VDTDocument>;
  /** Drop whatever `clientId` has pending (a component unmounting), and
   *  the requests of its sub-clients (`clientId:…`). */
  cancel(clientId: string): void;
  dispose(): void;
  /** Disposed services reject every build: the host makes a new one. */
  readonly disposed: boolean;
  /** What the service is doing and waiting for, for a check that asks a
   *  page why its layout does not come (#757). */
  state?(): LayoutServiceState;
}

export interface LayoutServiceState {
  /** The build under way: whose, and the step it is at. */
  active: { clientId: string; step: string; sinceMs: number } | null;
  queued: string[];
  /** The step of the font queue under way, if any. */
  fonts: { step: string; sinceMs: number } | null;
  /** What the worker was asked and has not answered. */
  worker: { ask: string; sinceMs: number }[];
  /** The files sent to the worker, by family. */
  sent: Record<string, number>;
  short: string[];
  retryDue: boolean;
  fontsPending: boolean;
}

export interface Entry {
  request: LayoutRequest;
  resolve: (doc: VDTDocument) => void;
  reject: (err: unknown) => void;
  /** Set while the entry runs on the worker. */
  controller: AbortController | null;
  /** The running build was interrupted for a more urgent one and goes
   *  back to the queue when the worker acknowledges the cancel. */
  requeue: boolean;
  /** The running build was superseded or cancelled: its rejection is final. */
  dropped: boolean;
}
