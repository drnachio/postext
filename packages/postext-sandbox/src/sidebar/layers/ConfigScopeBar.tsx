'use client';

// The scope of the Design panel of a book in several languages (#1209), in
// the parts the panel's scope bar lays out (./DesignScopeBar.tsx): the
// switch (whether a change reaches every edition or only the one on
// screen), what it means in words, and under them the fields the edition
// sets of its own and the notice of a general change some editions do not
// follow.

import { useId, useState } from 'react';
import { ChevronDown, Globe, Languages, Link2 } from 'lucide-react';
import { overridePaths } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext.js';
import { Button, SegmentedControl, cn } from '../../ui/index.js';
import { SETTINGS_SECTIONS } from '../sections/registry.js';
import type { ConfigScope } from '../../editions/configLayers.js';
import { useConfigScope } from './ConfigScopeProvider.js';

/** Setting paths by their top-level key, in order, with the fields or
 *  entries right under it (`fontFamily`, `elements[id=rule]`). */
function groupPaths(paths: readonly string[]): { key: string; paths: string[]; parts: string[] }[] {
  const groups = new Map<string, { key: string; paths: string[]; parts: string[] }>();
  for (const p of paths) {
    const key = p.split(/[.[]/)[0] ?? p;
    const rest = p.slice(key.length).replace(/^\./, '');
    const part = rest.match(/^[^.[]*(\[[^\]]*\])?/)?.[0] ?? '';
    const g = groups.get(key) ?? { key, paths: [], parts: [] };
    g.paths.push(p);
    if (part && !g.parts.includes(part)) g.parts.push(part);
    groups.set(key, g);
  }
  return [...groups.values()];
}

/** Every language, or the edition on screen alone. `hintId` is the
 *  element that says what the choice means ({@link ConfigScopeHint}). */
export function ConfigScopeSwitch({ hintId, className }: { hintId: string; className?: string }) {
  const labels = useSandboxLabels();
  const storeDispatch = useSandboxDispatch();
  const layers = useSandboxSelector((s) => s.configLayers);
  const uiLocale = useSandboxSelector((s) => s.locale);
  const { layer } = useConfigScope();
  if (!layers || !layer) return null;
  const language = layer.languageName(layer.locale);
  const edition = labels.configScopeEdition.replace('__language__', language);
  // Beside "All languages" the edition's option reads as its language
  // alone, set as a name on its own ("Español"); its full wording ("Solo
  // español") stays its tooltip and its name for assistive technology.
  const [initial = '', ...rest] = [...language];
  const short = initial.toLocaleUpperCase(uiLocale) + rest.join('');
  // A long language name is cut at the option's edge, never the icon, and
  // never "All languages".
  const option = (Icon: typeof Globe, text: string) => (
    <span className="inline-flex min-w-0 items-center gap-1"><Icon size={11} aria-hidden="true" className="shrink-0" /><span className="truncate">{text}</span></span>
  );
  return (
    <SegmentedControl<ConfigScope>
      fill="content"
      value={layers.scope}
      onValueChange={(scope) => storeDispatch({ type: 'SET_CONFIG_SCOPE', payload: scope })}
      ariaLabel={labels.configScopeLabel}
      ariaDescribedBy={hintId}
      options={[
        { value: 'all', label: option(Globe, labels.configScopeAll), title: labels.configScopeAll, className: 'shrink-0' },
        { value: 'edition', label: option(Languages, short), title: edition },
      ]}
      {...(className ? { className } : {})}
    />
  );
}

/** What the scope chosen means, in words: on the panel while its help is
 *  on, as its other explanations are; always what describes the switch
 *  to assistive technology. */
export function ConfigScopeHint({ id, shown }: { id: string; shown: boolean }) {
  const labels = useSandboxLabels();
  const layers = useSandboxSelector((s) => s.configLayers);
  const { layer } = useConfigScope();
  if (!layers || !layer) return null;
  const name = layer.languageName(layer.locale);
  return (
    <p id={id} className={shown ? 'text-[0.68rem] leading-[1.4] text-(--slate) [text-wrap:pretty]' : 'sr-only'}>
      {layers.scope === 'edition'
        ? labels.configScopeEditionHint.replace('__language__', name)
        : layer.locales.length > 4
          ? labels.configScopeAllHintMany.replace('__count__', String(layer.locales.length))
          : labels.configScopeAllHint.replace('__languages__', layer.locales.map(layer.languageName).join(', '))}
    </p>
  );
}

/** Under the switch: the fields the edition on screen sets of its own
 *  (with the panel on that edition), or the notice of a change for every
 *  language that some editions do not follow. Nothing when there is
 *  neither. */
export function ConfigScopeNotes() {
  const labels = useSandboxLabels();
  const layers = useSandboxSelector((s) => s.configLayers);
  const { shadowed, dismissShadowed, layer } = useConfigScope();
  const [listOpen, setListOpen] = useState(false);
  const listId = useId();
  if (!layers || !layer) return null;

  const name = layer.languageName(layer.locale);
  const ownPaths = overridePaths(layer.overrides[layer.locale] ?? {});
  const sectionOf = (key: string) => {
    const entry = SETTINGS_SECTIONS.find((e) => (e.configKeys as readonly string[]).includes(key));
    return entry ? String(labels[entry.labelKey]) : undefined;
  };
  const edition = layers.scope === 'edition';

  return (
    <>
      {edition && ownPaths.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-expanded={listOpen}
              aria-controls={listId}
              onClick={() => setListOpen((v) => !v)}
              className="inline-flex min-h-7 pt-large:min-h-11 cursor-pointer items-center gap-1 rounded text-[0.7rem] text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-1 outline-(--brand)"
            >
              <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--edition, var(--brand))' }} />
              {labels.configLayerOwnCount.replace('__count__', String(ownPaths.length)).replace('__language__', name)}
              <ChevronDown size={12} aria-hidden="true" className={cn('transition-transform', listOpen && 'rotate-180')} />
            </button>
            <Button size="xs" variant="ghost" icon={<Link2 size={12} />} onClick={() => layer.useGeneral(ownPaths)}>
              {labels.configLayerUseGeneralAll}
            </Button>
          </div>
          {listOpen && (
            <ul id={listId} className="flex flex-col gap-0.5 ps-3">
              {groupPaths(ownPaths).map(({ key, paths, parts }) => {
                const section = sectionOf(key) ?? key;
                return (
                  <li key={key} className="flex items-center justify-between gap-2 text-[0.68rem] text-(--slate)">
                    <span className="min-w-0 truncate" title={paths.join('\n')}>
                      <span className="text-(--foreground)">{section}</span>
                      <span className="ms-1">({paths.length})</span>
                      {parts.length > 0 && <code className="ms-1 text-[0.64rem]">{parts.join(', ')}</code>}
                    </span>
                    <button
                      type="button"
                      onClick={() => layer.useGeneral(paths)}
                      aria-label={`${labels.configLayerUseGeneral}: ${section}`}
                      title={labels.configLayerUseGeneral}
                      className="inline-flex h-5 w-5 pt-large:h-11 pt-large:w-11 shrink-0 cursor-pointer items-center justify-center rounded text-(--slate) hover:text-(--foreground) focus-visible:outline-2 outline-(--brand)"
                    >
                      <Link2 size={11} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {!edition && shadowed && (
        <div role="status" className="flex flex-col gap-1 rounded-md border border-dashed border-(--slate) px-2 py-1.5 text-[0.68rem] leading-[1.4] text-(--foreground)">
          <span>{labels.configLayerShadowed.replace('__languages__', shadowed.keptBy.map(layer.languageName).join(', '))}</span>
          <span className="flex flex-wrap items-center gap-1">
            {shadowed.keptBy.some(layer.canChange) && (
              <Button size="xs" variant="ghost" icon={<Link2 size={12} />} onClick={() => { for (const l of shadowed.keptBy.filter(layer.canChange)) layer.useGeneralIn(l, shadowed.paths); dismissShadowed(); }}>
                {shadowed.keptBy.filter(layer.canChange).length === 1
                  ? labels.configLayerApplyIn.replace('__language__', layer.languageName(shadowed.keptBy.find(layer.canChange)!))
                  : labels.configLayerApplyInAll}
              </Button>
            )}
            <Button size="xs" variant="ghost" onClick={dismissShadowed}>{labels.configLayerKeep}</Button>
          </span>
        </div>
      )}
    </>
  );
}
