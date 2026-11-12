'use client';

import { useEffect, useState } from 'react';
import { useSandboxSelector } from '../../context/SandboxContext.js';
import { onSavedDesignsChange } from '../../designs/designStore.js';
import { listDesignEntries, loadDesign, type DesignEntry, type ReadyDesign } from '../../designs/designSources.js';
import type { DesignHost } from '../../designs/designActions.js';

/** The gallery's designs, kept current (null while the first list loads). */
export function useDesignEntries(host: DesignHost): DesignEntry[] | null {
  const locale = useSandboxSelector((s) => s.locale);
  const presets = useSandboxSelector((s) => s.presetSummaries);
  const [entries, setEntries] = useState<DesignEntry[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      listDesignEntries(host.sources()).then((l) => { if (alive) setEntries(l); }, () => { if (alive) setEntries([]); });
    };
    load();
    const off = onSavedDesignsChange(load);
    return () => { alive = false; off(); };
  }, [host, locale, presets]);
  return entries;
}

/** A design of the gallery loaded for its card (saved and shipped ones; a
 *  sample book's is read only when it is used). */
export function useLoadedDesign(host: DesignHost, entry: DesignEntry): ReadyDesign | null {
  const [ready, setReady] = useState<ReadyDesign | null>(null);
  useEffect(() => {
    if (entry.kind === 'sample') return;
    let alive = true;
    loadDesign(host.sources(), entry.id).then((r) => { if (alive) setReady(r); }, () => undefined);
    return () => { alive = false; };
  }, [host, entry.id, entry.kind]);
  return ready;
}
