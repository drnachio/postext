/// <reference lib="webworker" />

/**
 * `postext-epub/worker/entry`: the worker behind `createEpubWorker`. Bundlers
 * that resolve `new Worker(new URL(…, import.meta.url))` pick it up from the
 * client; hosts that build their own worker import this module.
 *
 * @module
 */

import { serveEpubRequests, type EpubWorkerPort } from './serve.js';

serveEpubRequests(self as unknown as EpubWorkerPort);
