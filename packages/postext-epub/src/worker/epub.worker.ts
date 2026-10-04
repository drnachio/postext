/// <reference lib="webworker" />

// The worker entry of `createEpubWorker` (`postext-epub/worker/entry`).
// Bundlers that resolve `new Worker(new URL(…, import.meta.url))` pick it up
// from the client; hosts that build their own worker import this module.

import { serveEpubRequests, type EpubWorkerPort } from './serve';

serveEpubRequests(self as unknown as EpubWorkerPort);
