import { useEffect } from 'react';
import { contourRowsOf, traceResourceContour, withContourTrace, type PostextConfig, type Resource } from 'postext';
import { getBlob } from '../../../storage/blobStore.js';
import { useSandboxDispatch, useSandboxSelector, useSandboxStateGetter } from '../../../context/SandboxContext.js';

/** Whether a page template of `config` has a frame that pushes with its
 *  pictures' contour (#883). */
export function configWrapsContours(config: Pick<PostextConfig, 'pageTemplates'>): boolean {
  const frames = (patch: { frames?: { wrap?: string }[] } | undefined): boolean => (patch?.frames ?? []).some((f) => f?.wrap === 'contour');
  return (config.pageTemplates ?? []).some((t) => frames(t) || frames(t.variants?.recto) || frames(t.variants?.verso));
}

/** The bitmaps whose alpha channel a contour wrap runs round and that have
 *  no trace of their file at their threshold yet (#883): those with a
 *  `contour`, or whose placement or type wraps by contour, and every bitmap
 *  when a frame of the book pushes by contour. */
export function resourcesToTrace(resources: readonly Resource[], config: Pick<PostextConfig, 'pageTemplates' | 'resourceTypes'>): Resource[] {
  const all = configWrapsContours(config);
  const types = new Map((config.resourceTypes ?? []).map((t) => [t.id, t]));
  return resources.filter((r) => {
    if (r.kind !== 'bitmap' || !r.bitmap?.fileId || r.contour?.alpha === false || (r.contour?.points?.length ?? 0) >= 3) return false;
    const wants = all || r.contour !== undefined || (r.placement?.wrap ?? types.get(r.typeId)?.defaultPlacement?.wrap) === 'contour';
    return wants && !contourRowsOf(r);
  });
}

/** Files found with no transparency (or unreadable), at a threshold: not
 *  read again while the book is open. */
const untraceable = new Set<string>();

/**
 * Keep the alpha traces of the book's contour wraps (#883) up to date: the
 * layout reads pictures by their size only, so the shape comes with the
 * resource (`contour.traced`), traced here from the stored file when a
 * picture asks for one, its file changes or its threshold does.
 */
export function useContourTraces(): void {
  const resources = useSandboxSelector((s) => s.resources);
  const pageTemplates = useSandboxSelector((s) => s.config.pageTemplates);
  const resourceTypes = useSandboxSelector((s) => s.config.resourceTypes);
  const dispatch = useSandboxDispatch();
  const getState = useSandboxStateGetter();
  useEffect(() => {
    const todo = resourcesToTrace(resources, { pageTemplates, resourceTypes })
      .filter((r) => !untraceable.has(`${r.bitmap!.fileId}@${r.contour?.threshold ?? ''}`));
    if (todo.length === 0) return;
    let live = true;
    void (async () => {
      for (const r of todo) {
        const key = `${r.bitmap!.fileId}@${r.contour?.threshold ?? ''}`;
        try {
          const record = await getBlob(r.bitmap!.fileId);
          const trace = record ? await traceResourceContour(r, record.bytes, record.contentType) : undefined;
          if (!live) return;
          if (!trace) {
            untraceable.add(key);
            continue;
          }
          // The resource as it is now (it may have been edited meanwhile).
          const now = getState().resources.find((x) => x.id === r.id);
          if (!now || now.bitmap?.fileId !== trace.fileId) continue;
          const next = withContourTrace(now, trace);
          if (!contourRowsOf(next)) continue;
          dispatch({ type: 'UPSERT_RESOURCE', payload: next });
        } catch {
          untraceable.add(key);
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [resources, pageTemplates, resourceTypes, dispatch, getState]);
}
