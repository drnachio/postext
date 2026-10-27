import { type LayoutWorkerHandle, createLayoutWorker, type BuildStats } from 'postext/worker';
import { type FontVariantUse, baseFontFamily, type PostextConfig, type PostextContent, type VDTDocument, documentFontFaces, fontSampleText } from 'postext';
import { onCustomFontsChanged, getCustomFontFamily, loadFont, familyCutFaces, fontPayloadKey, collectFontPayloadsForFamilies, fetchFacePayloads, asFeaturePayloads, fontRequestsUnanswered, FONT_RETRY_MS, collectStandInPayloads, configFontUses, loadFacesForText } from '../controls/fonts/fontLoader.js';
import { resourcesKeyOf } from '../book/layoutKeys.js';
import { markBuiltWithoutFaces } from '../book/withoutFaces.js';
import { perfSpan, perfSizeKb } from '../perf/marks.js';
import { FONT_WAIT_CEILING_MS, unsettle, LATE_RELAYOUT_GRACE_MS, lateFontsListeners, FONT_RETRIES, settledWithin, documentCharacters, FONT_ROUNDS, fontsPending } from './LayoutService/fonts.js';
import { type LayoutService, type Entry, RANK } from './LayoutService/types.js';

export type { LayoutPriority, LayoutRequest, LayoutService, LayoutServiceState } from './LayoutService/types.js';
export { FONT_WAIT_CEILING_MS, documentCharacters, fontsPending, onFontsPending, onLateFonts } from './LayoutService/fonts.js';

const abortError = (): DOMException => new DOMException('Aborted', 'AbortError');

export { builtWithoutFaces } from '../book/withoutFaces.js';

/**
 * One layout worker for the whole sandbox — previews, the PDF tab and the
 * background paginator share its fonts, its measurement cache and its
 * document cache — with one build in flight at a time, chosen by priority:
 * a preview's build goes before the PDF's, which goes before a background
 * chapter's. A more urgent request interrupts a less urgent build (the
 * worker stops at the next pass) and puts it back in the queue, promise
 * still pending, so a paginator never loses a chapter to the reader's
 * typing. Within one client the last request wins: the earlier one is
 * cancelled and rejected.
 */
export function createLayoutService(options?: {
  handle?: LayoutWorkerHandle;
  /** The longest a build waits for the files of its faces
   *  (`FONT_WAIT_CEILING_MS`); `Infinity` for a host with a bound of its
   *  own (the headless entry). */
  fontCeilingMs?: number;
}): LayoutService {
  const fontCeilingMs = options?.fontCeilingMs ?? FONT_WAIT_CEILING_MS;
  // What this service holds of `fontsPending`, given back when disposed.
  let unsettled = 0;
  const countUnsettled = (by: number): void => {
    unsettled += by;
    unsettle(by);
  };
  // The worker is spawned on first use, not on creation: the provider's
  // state initialiser also runs while the page is rendered on the server
  // (Next.js prerender), where `Worker` does not exist.
  let handle: LayoutWorkerHandle | null = options?.handle ?? null;
  // The Sandbox's own entry: Postext's worker with the citation engine
  // loaded on demand (see ./layout.worker.ts).
  const worker = (): LayoutWorkerHandle => (handle ??= createLayoutWorker({
    worker: new Worker(new URL('./layout.worker.js', import.meta.url), { type: 'module' }),
  }));
  const queue: Entry[] = [];
  let active: Entry | null = null;
  let disposed = false;
  // Where things stand, for `state()`.
  let activeStep = { step: '', at: 0 };
  let fontStep: { step: string; at: number } | null = null;
  const asked = new Set<{ ask: string; at: number }>();
  const at = (step: string): void => { activeStep = { step, at: Date.now() }; };
  const fontsAt = (step: string | null): void => { fontStep = step === null ? null : { step, at: Date.now() }; };
  const askWorker = <T>(ask: string, send: () => Promise<T>): Promise<T> => {
    const entry = { ask, at: Date.now() };
    asked.add(entry);
    return send().finally(() => { asked.delete(entry); });
  };

  // One thing at a time on the worker (#757): a build that did not wait
  // for a slow file must not have its faces registered half way through
  // (the worker answers a registration between two passes of a build, and
  // would keep the document measured half with them under its cache key).
  // A registration waits for the build under way, and a build for it.
  let workerUse: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(use: () => Promise<T>): Promise<T> => {
    const run = workerUse.then(use, use);
    workerUse = run.catch(() => {});
    return run;
  };
  const register = (payloads: Parameters<LayoutWorkerHandle['registerFonts']>[0]): Promise<void> =>
    exclusive(() => askWorker(`registerFonts (${payloads.length} files)`, () => worker().registerFonts(payloads)));

  // --- fonts: registered lazily, for the worker's lifetime
  // The custom families sent, each with every file it has.
  const registeredFamilies = new Set<string>();
  // The catalogue families (#757): the weights and slants the builds so
  // far asked of each, and the faces sent for them, by face key. A family
  // is a file per weight, style and subset, and the worker is sent the
  // cuts a build is set in before it lays it out, each with all its files,
  // so a chapter is laid out once and the files of a cut stand in the
  // worker in the order they are declared. A face that arrives later
  // (one only the pages name, a stand-in slice, a custom font uploaded
  // again) is measured with from the next build on: the engine's worker
  // makes its canvas resolve those fonts again (#760).
  const familyUses = new Map<string, Map<string, FontVariantUse>>();
  const sentFaces = new Map<string, Set<string>>();
  // The stand-in faces sent so far (#688), by face key: a family's own
  // file under a bold or an italic it lacks, for the characters of the
  // builds so far.
  const registeredStandIns = new Set<string>();
  let fontQueue: Promise<void> = Promise.resolve();
  // The families the network did not give every file of, and the tries
  // each has left: asked for again a while later, and the views told when
  // their files arrive.
  const shortFamilies = new Set<string>();
  const retriesLeft = new Map<string, number>();
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  const announce = (families: readonly string[]): void => {
    if (disposed || families.length === 0) return;
    // Unsettled until the views have asked for their builds.
    countUnsettled(1);
    setTimeout(() => { if (!disposed) countUnsettled(-1); }, LATE_RELAYOUT_GRACE_MS);
    for (const listener of [...lateFontsListeners]) listener([...families]);
  };
  const unsubscribeFonts = onCustomFontsChanged((changed) => {
    // A feature family (#1237) of a changed family was made from its files.
    const bases = new Set(changed.map((f) => f.toLowerCase()));
    const families = [...new Set([...changed, ...[...registeredFamilies, ...sentFaces.keys()].filter((f) => bases.has(baseFontFamily(f).toLowerCase()))])];
    const toUnregister = families.filter((f) => registeredFamilies.has(f) || sentFaces.has(f));
    for (const f of families) {
      registeredFamilies.delete(f);
      sentFaces.delete(f);
    }
    // The worker drops every face of the family, its stand-ins too.
    for (const key of registeredStandIns) if (families.some((f) => key.startsWith(`${f}|`))) registeredStandIns.delete(key);
    if (toUnregister.length === 0) return;
    fontQueue = fontQueue.then(() =>
      worker().unregisterFonts(toUnregister).catch((err) => {
        console.warn('[LayoutService] font unregister failed', err);
      }),
    );
  });

  /** Note the faces asked of each family, and have the page declare the
   *  new ones: it paints with the cut the worker measures with, and a cut
   *  is declared when it is first set (a heading weight changed in the
   *  settings, a face only the pages name). They load as the page paints. */
  const noteUses = (uses: Iterable<[string, readonly FontVariantUse[]]>): void => {
    for (const [family, list] of uses) {
      let known = familyUses.get(family);
      if (!known) familyUses.set(family, (known = new Map()));
      const fresh: FontVariantUse[] = [];
      for (const use of list) {
        const key = `${use.weight}|${use.style}`;
        if (known.has(key)) continue;
        known.set(key, { weight: use.weight, style: use.style });
        fresh.push({ weight: use.weight, style: use.style });
      }
      if (fresh.length > 0 && !getCustomFontFamily(baseFontFamily(family))) void loadFont(family, fresh).catch(() => {});
    }
  };

  /** The files of a catalogue family the worker lacks for the faces asked
   *  of it so far: every file of each cut, and of its regular, its bold
   *  and their italics, which a text asks for without its configuration
   *  saying so (`familyCutFaces`). */
  const lackingFaces = async (family: string) => {
    const uses = [...(familyUses.get(family)?.values() ?? [])];
    const had = sentFaces.get(family);
    // A feature family (#1237) is sent as its base family's files, under
    // its name.
    return (await familyCutFaces(baseFontFamily(family), uses, { standard: true }))
      .map((face) => ({ ...face, family }))
      .filter((face) => !had?.has(fontPayloadKey(face)));
  };

  /** Send the worker the faces of `families` it lacks; true when it got
   *  any. */
  const sendFamilies = async (families: readonly string[]): Promise<boolean> => {
    let sent = false;
    const custom = families.filter((f) => getCustomFontFamily(baseFontFamily(f)) && !registeredFamilies.has(f));
    if (custom.length > 0) {
      for (const f of custom) registeredFamilies.add(f);
      try {
        fontsAt(`the files of the custom families ${custom.join(', ')}`);
        const payloads = await collectFontPayloadsForFamilies(custom);
        if (payloads.length > 0) {
          await register(payloads);
          sent = true;
        }
        const delivered = new Set(payloads.map((p) => p.family));
        for (const f of custom) if (!delivered.has(f)) registeredFamilies.delete(f);
      } catch (err) {
        for (const f of custom) registeredFamilies.delete(f);
        console.warn('[LayoutService] font registration failed', err);
      }
    }
    // One message for every family: their files are fetched side by side.
    try {
      const catalogue = families.filter((f) => !getCustomFontFamily(baseFontFamily(f)));
      fontsAt(`the faces of ${catalogue.join(', ')}`);
      const perFamily = await Promise.all(catalogue.map(lackingFaces));
      const lacking = perFamily.flat();
      fontsAt(`${lacking.length} files of ${catalogue.join(', ')}`);
      // A file that cannot be had is left out, and asked for again: by a
      // later build, and by the service itself a while later. A feature
      // family's files take its features.
      const payloads = lacking.length > 0 ? (await fetchFacePayloads(lacking)).flatMap((p) => asFeaturePayloads(p.family, [p])) : [];
      const got = new Set(payloads.map(fontPayloadKey));
      // Short of files: the network did not answer for one of them, or
      // for the family's record or style sheet. A file the server has not
      // (a 404) is not one a later try brings.
      const wasShort = new Set(shortFamilies);
      catalogue.forEach((family, i) => {
        const faces = perFamily[i]!;
        const short = fontRequestsUnanswered(baseFontFamily(family), faces.filter((face) => !got.has(fontPayloadKey(face))).map((face) => face.url));
        if (short) shortFamilies.add(family);
        else {
          shortFamilies.delete(family);
          retriesLeft.delete(family);
        }
      });
      scheduleRetry();
      if (payloads.length === 0) return sent;
      const keys = payloads.map((p) => [p.family, fontPayloadKey(p)] as const);
      await register(payloads);
      for (const [family, key] of keys) {
        const had = sentFaces.get(family);
        if (had) had.add(key);
        else sentFaces.set(family, new Set([key]));
      }
      // Files of a family the builds so far went without: what was laid
      // out meanwhile is laid out again.
      announce([...new Set(payloads.map((p) => p.family))].filter((family) => wasShort.has(family)));
      return true;
    } catch (err) {
      console.warn('[LayoutService] font registration failed', err);
      return sent;
    }
  };

  /** Ask again, a while later, for the families short of files: nobody
   *  may build in the meantime, and the pages on show were measured
   *  without them. */
  function scheduleRetry(): void {
    if (retryTimer !== null || disposed) return;
    const due = (): string[] => [...shortFamilies].filter((f) => (retriesLeft.get(f) ?? FONT_RETRIES) > 0);
    if (due().length === 0) return;
    // Unsettled while a try is due: the pages on show may change.
    countUnsettled(1);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      const families = due();
      if (disposed) return;
      if (families.length === 0) {
        countUnsettled(-1);
        return;
      }
      for (const f of families) retriesLeft.set(f, (retriesLeft.get(f) ?? FONT_RETRIES) - 1);
      const next = fontQueue.then(async () => {
        try {
          if (!disposed) await sendFamilies(families);
        } finally {
          if (!disposed) countUnsettled(-1);
        }
      });
      fontQueue = next;
    }, FONT_RETRY_MS + 1_000);
  }

  /** After the families' own faces: the bold or the italic a family has no
   *  file for, answered by its own face (#688), in the files that hold
   *  this build's characters. True when the worker got any. */
  const sendStandIns = async (config: PostextConfig, content: PostextContent): Promise<boolean> => {
    try {
      fontsAt('the stand-in faces');
      const standIns = await collectStandInPayloads(config, content, registeredStandIns);
      if (standIns.length > 0) {
        const keys = standIns.map(fontPayloadKey);
        await register(standIns);
        for (const key of keys) registeredStandIns.add(key);
        return true;
      }
    } catch (err) {
      console.warn('[LayoutService] stand-in font registration failed', err);
    }
    return false;
  };

  /** Send the worker the faces of a build; the families, when it got any
   *  it did not have. */
  const ensureFonts = async (config: PostextConfig, content: PostextContent): Promise<string[]> => {
    // The text decides some faces too (a comic page letters in its own).
    const uses = configFontUses(config, content.markdown);
    noteUses(uses);
    const families = [...uses.keys()];
    let sent = false;
    const next = fontQueue.then(async () => {
      try {
        sent = await sendFamilies(families);
        sent = (await sendStandIns(config, content)) || sent;
      } finally {
        fontsAt(null);
      }
    });
    fontQueue = next;
    await next;
    return sent ? families : [];
  };

  /** Wait for `fonts`: as long as its requests are answered, the ceiling
   *  at most. False past the ceiling: the build goes ahead, and the views
   *  are told when the faces arrive. */
  const hold = async (fonts: Promise<string[] | boolean>, families: () => string[]): Promise<boolean> => {
    countUnsettled(1);
    void fonts.then(() => {}, () => {}).then(() => { if (!disposed) countUnsettled(-1); });
    if (await settledWithin(fonts, fontCeilingMs)) return true;
    void fonts.then((sent) => {
      const late = Array.isArray(sent) ? sent : sent ? families() : [];
      announce(late);
    }, () => {});
    return false;
  };

  /**
   * The faces the pages of `doc` are set in that the worker was not sent
   * (#757): a weight and slant its configuration did not announce and the
   * regular, the bold and their italics do not cover (the italic of a
   * heading set at 600, the bold of a caption in a family cut by slices).
   * With the variable file every weight was there; with a file per weight
   * the pages say which ones they need. The service notes those faces (the
   * page declares them) and sends the worker their files; true when it
   * got any, and the document is then laid out again with them. The page
   * loads those faces for the characters the document sets before the
   * document is handed back (#770): the first paint that follows has
   * them, where it set a script other than Latin in a fallback face until
   * the file its text needed had come.
   */
  const ensureDocumentFonts = async (doc: VDTDocument, config: PostextConfig, content: PostextContent): Promise<boolean> => {
    const asked = new Map<string, FontVariantUse[]>();
    for (const face of documentFontFaces(doc)) {
      const list = asked.get(face.family);
      if (list) list.push({ weight: face.weight, style: face.style });
      else asked.set(face.family, [{ weight: face.weight, style: face.style }]);
    }
    const fresh: [string, FontVariantUse[]][] = [];
    for (const [family, list] of asked) {
      if (getCustomFontFamily(family)) continue;
      const known = familyUses.get(family);
      const news = list.filter((use) => !known?.has(`${use.weight}|${use.style}`));
      if (news.length > 0) fresh.push([family, news]);
    }
    if (fresh.length === 0) return false;
    noteUses(fresh);
    const onPage = loadFacesForText(fresh, fontSampleText(content, config) + documentCharacters(doc)).catch(() => {});
    let sent = false;
    const next = fontQueue.then(async () => {
      try {
        sent = await sendFamilies(fresh.map(([family]) => family));
        if (sent) await sendStandIns(config, content);
      } finally {
        fontsAt(null);
      }
    });
    fontQueue = next;
    await next;
    fontsAt('the faces the page loads for the document\'s text');
    await onPage;
    fontsAt(null);
    return sent;
  };

  // --- the queue
  const takeNext = (): Entry | null => {
    if (queue.length === 0) return null;
    let best = 0;
    for (let i = 1; i < queue.length; i++) {
      if (RANK[queue[i]!.request.priority] < RANK[queue[best]!.request.priority]) best = i;
    }
    return queue.splice(best, 1)[0]!;
  };

  const run = async (entry: Entry): Promise<void> => {
    active = entry;
    const controller = new AbortController();
    entry.controller = controller;
    const { request } = entry;
    const span = perfSpan('worker.build', {
      client: request.priority,
      markdownKb: Math.round(request.content.markdown.length / 1024),
      contentKb: perfSizeKb(request.content),
    });
    let stats: BuildStats | null = null;
    try {
      // Waited for while its requests are answered (#757): a request the
      // loader gives up, or the ceiling, lets the chapter go without.
      at('the files of its faces');
      let waited = await hold(ensureFonts(request.config, request.content), () => []);
      if (controller.signal.aborted) throw abortError();
      const buildOptions = {
        signal: controller.signal,
        onProgress: request.onProgress,
        onStats: (s: BuildStats) => { stats = s; },
        resourcesKey: request.content.resources ? resourcesKeyOf(request.content.resources) : undefined,
        cacheKey: request.cacheKey,
      };
      const build = (): Promise<VDTDocument> => exclusive(() => askWorker('build', () => worker().build(request.content, request.config, buildOptions)));
      at('the worker\'s layout');
      let doc = request.warmOnly && request.cacheKey
        ? await exclusive(() => askWorker('warm', () => worker().warm(request.content, request.config, { ...buildOptions, cacheKey: request.cacheKey! }))).then(() => null)
        : await build();
      // Laid out again when its pages set a face the worker did not have
      // (#757): once for the faces the first layout names, once more for
      // any the second brings.
      for (let round = 0; doc && round < FONT_ROUNDS; round++) {
        at('the files of the faces its pages name');
        const named = ensureDocumentFonts(doc, request.config, request.content);
        const families = (): string[] => [...new Set(documentFontFaces(doc!).map((face) => face.family))];
        // A file of theirs that is slow: the document stands as it is, and
        // the views lay out again when it arrives.
        if (!(await hold(named, families))) {
          waited = false;
          break;
        }
        if (!(await named)) break;
        if (controller.signal.aborted) throw abortError();
        at('the worker\'s layout, again');
        doc = await build();
      }
      const built = stats as BuildStats | null;
      span.end({
        warm: !!request.warmOnly,
        pages: doc?.pages.length,
        docKb: doc ? perfSizeKb(doc) : 0,
        cached: built?.cached ?? false,
        workerMs: built?.totalMs,
        passes: built?.passes.length,
        passMs: built?.passes.map((p) => Math.round(p.ms)).join('/'),
      });
      if (doc) {
        // Laid out without a face it asked for: said of the document, so
        // nobody takes its pages for the chapter's.
        const asked = new Set([...configFontUses(request.config, request.content.markdown).keys(), ...documentFontFaces(doc).map((face) => face.family)]);
        if (!waited || [...asked].some((family) => shortFamilies.has(family))) markBuiltWithoutFaces(doc);
      }
      entry.resolve(doc as VDTDocument);
    } catch (err) {
      const aborted = (err as { name?: string } | null)?.name === 'AbortError';
      if (aborted && entry.requeue && !entry.dropped && !disposed) {
        span.end({ requeued: true });
        entry.requeue = false;
        entry.controller = null;
        queue.push(entry);
      } else {
        span.end({ aborted });
        entry.reject(err);
      }
    } finally {
      if (active === entry) active = null;
      pump();
    }
  };

  const pump = (): void => {
    if (disposed || active) return;
    const next = takeNext();
    if (next) void run(next);
  };

  const interrupt = (entry: Entry, requeue: boolean): void => {
    entry.requeue = requeue;
    entry.dropped = !requeue;
    entry.controller?.abort();
  };

  return {
    get disposed() { return disposed; },
    state() {
      const now = Date.now();
      return {
        active: active ? { clientId: active.request.clientId, step: activeStep.step, sinceMs: now - activeStep.at } : null,
        queued: queue.map((q) => q.request.clientId),
        fonts: fontStep ? { step: fontStep.step, sinceMs: now - fontStep.at } : null,
        worker: [...asked].map((a) => ({ ask: a.ask, sinceMs: now - a.at })),
        sent: Object.fromEntries([...sentFaces].map(([family, keys]) => [family, keys.size])),
        short: [...shortFamilies],
        retryDue: retryTimer !== null,
        fontsPending: fontsPending(),
      };
    },
    build(request) {
      if (disposed) return Promise.reject(new Error('Layout service disposed'));
      return new Promise<VDTDocument>((resolve, reject) => {
        // Last wins within a client: the earlier request is dropped.
        for (let i = queue.length - 1; i >= 0; i--) {
          const q = queue[i]!;
          if (q.request.clientId === request.clientId) {
            queue.splice(i, 1);
            q.reject(abortError());
          }
        }
        if (active?.request.clientId === request.clientId) interrupt(active, false);
        // A more urgent request interrupts a less urgent build, which
        // returns to the queue once the worker has stopped it.
        else if (active && RANK[request.priority] < RANK[active.request.priority] && !active.requeue) interrupt(active, true);
        queue.push({ request, resolve, reject, controller: null, requeue: false, dropped: false });
        pump();
      });
    },
    cancel(clientId) {
      const owned = (id: string) => id === clientId || id.startsWith(`${clientId}:`);
      for (let i = queue.length - 1; i >= 0; i--) {
        const q = queue[i]!;
        if (owned(q.request.clientId)) {
          queue.splice(i, 1);
          q.reject(abortError());
        }
      }
      if (active && owned(active.request.clientId)) interrupt(active, false);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      unsettle(-unsettled);
      unsettled = 0;
      unsubscribeFonts();
      for (const q of queue.splice(0)) q.reject(abortError());
      if (active) interrupt(active, false);
      handle?.dispose();
    },
  };
}
