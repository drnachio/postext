/// <reference lib="webworker" />
// The find bar's worker: searches the book off the main thread, so a
// regular expression that backtracks without end stops this worker (the
// page ends it, ./findClient.ts), not the tab.

import { createFindSession, type FindRequest } from '../../book/find/session.js';

const session = createFindSession();
const scope = self as unknown as { postMessage: (message: unknown) => void };

self.onmessage = (e: MessageEvent<{ seq: number; request: FindRequest }>) => {
  const { seq, request } = e.data;
  scope.postMessage({ seq, outcome: session.run(request) });
};
