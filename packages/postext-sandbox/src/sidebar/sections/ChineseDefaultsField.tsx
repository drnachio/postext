'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { chineseScriptOf, resolveLayoutConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector, type SandboxState } from '../../context/SandboxContext';
import {
  chineseDefaults,
  forgetChineseDefaults,
  keepChineseDefaultsFocus,
  recallChineseDefaults,
  rememberChineseDefaults,
  takeChineseDefaultsFocus,
  undoChineseDefaults,
  type ChineseDefaultChange,
  type ChineseDefaultsFocus,
  type ChineseDefaultId,
  type ChineseDefaultValue,
  type ChineseDefaultsMemory,
} from '../../context/chineseDefaults';
import { FieldRow } from '../../controls';
import { formatNumber } from '../../controls/units';
import { Button, SegmentedControl } from '../../ui';
import type { SandboxLabels } from '../../types/labels';
import { documentLocaleLabel } from './BodyTextSection/constants';

type Script = 'zh-Hans' | 'zh-Hant';

/** What each row of the review list is called. */
const ITEM_LABELS: Record<ChineseDefaultId, keyof SandboxLabels> = {
  locale: 'documentLocale',
  writingMode: 'writingMode',
  binding: 'binding',
  bodyFont: 'chineseDefaultsBodyFont',
  headingFont: 'chineseDefaultsHeadingFont',
  firstLineIndent: 'bodyFirstLineIndent',
  indentAfterHeading: 'bodyIndentAfterHeading',
  paragraphSpacing: 'bodyParagraphSpacing',
  textAlign: 'bodyTextAlign',
  hyphenation: 'bodyHyphenation',
  resourceTypes: 'chineseDefaultsResourceTypes',
  captionLabel: 'chineseDefaultsCaptionLabel',
  chapterNumbering: 'chineseDefaultsChapterNumbers',
  listNumbers: 'chineseDefaultsListNumbers',
};

/** The book on screen: the project, or the preset and its language, and
 *  the load (a book opened again is another book). Undo belongs to it. */
function bookKeyOf(s: SandboxState): string {
  return [s.activeProjectId ?? '', s.activePresetId, s.presetApplied?.locale ?? '', s.bookVersion].join('\u0000');
}

/** A value of the review list as the interface shows it. */
export function valueText(v: ChineseDefaultValue, labels: SandboxLabels, uiLocale: string): string {
  switch (v.kind) {
    case 'locale': return documentLocaleLabel(v.tag);
    case 'text': return v.text;
    case 'switch': return v.on ? labels.cjkOn : labels.cjkOff;
    case 'dimension': return `${formatNumber(v.value.value, uiLocale)} ${v.value.unit}`;
    case 'align':
      return v.value === 'justify' ? labels.bodyTextAlignJustify
        : v.value === 'center' ? labels.headingsTextAlignCenter
          : v.value === 'right' ? labels.headingsTextAlignRight
            : labels.bodyTextAlignLeft;
    case 'writingMode':
      return `${v.value === 'vertical-rl' ? labels.writingModeVerticalShort : labels.writingModeHorizontal}, ${
        v.binding === 'right' ? labels.settingsSummaryBoundRight : labels.settingsSummaryBoundLeft}`;
    case 'binding': {
      const name = v.value === 'right' ? labels.bindingRight : labels.bindingLeft;
      return v.auto ? labels.cjkAuto.replace('__value__', name) : name;
    }
    case 'none': return labels.chineseDefaultsNoNumber;
  }
}

/** Written text (a typeface, 第一章, a language name) carries its language,
 *  so Han characters take the right forms; interface words do not. */
function valueLang(v: ChineseDefaultValue, lang: string): string | undefined {
  if (v.kind === 'locale') return v.tag;
  return v.kind === 'text' ? lang : undefined;
}

/**
 * "Chinese defaults": pick the characters (and the direction), review the
 * list of changes, apply them as one step, take it back with Undo. Rows the
 * author made their own come unticked; the ones that go with the chosen
 * language and direction cannot be unticked.
 */
export function ChineseDefaultsField() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const uiLocale = useSandboxSelector((s) => s.locale) ?? 'en';
  const [open, setOpen] = useState(false);
  const [script, setScript] = useState<Script>('zh-Hans');
  const [verticalPick, setVerticalPick] = useState<boolean | null>(null);
  const [ticks, setTicks] = useState<ReadonlyMap<ChineseDefaultId, boolean>>(new Map());
  const book = useSandboxSelector(bookKeyOf);
  const [memory, setMemoryState] = useState(() => recallChineseDefaults(book));
  const setMemory = (m: ChineseDefaultsMemory | null) => {
    if (m) rememberChineseDefaults(m);
    else forgetChineseDefaults();
    setMemoryState(m);
  };
  // Another book on screen: what was done in the last one is forgotten.
  const mine = memory?.book === book ? memory : null;
  useEffect(() => {
    if (memory && memory.book !== book) {
      recallChineseDefaults(book);
      setMemoryState(null);
    }
  }, [book, memory]);
  const status = mine?.status ?? null;
  const undoable = mine?.undo ?? null;
  const panelId = useId();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const reviewRef = useRef<HTMLButtonElement>(null);
  const firstControlRef = useRef<HTMLDivElement>(null);

  const docScript = chineseScriptOf(config.locale);
  const currentVertical = resolveLayoutConfig(config.layout).writingMode === 'vertical-rl';
  // A Chinese book keeps its direction; a new one takes the usual one for
  // its characters: horizontal on the mainland, vertical for Traditional.
  const vertical = verticalPick ?? (docScript ? currentVertical : script === 'zh-Hant');

  const preview = useMemo(() => {
    if (!open) return null;
    const options = { locale: script, vertical, fallbackLocale: uiLocale };
    const base = chineseDefaults(config, options);
    const include = base.changes
      .filter((c) => !c.required && (ticks.get(c.id) ?? !c.customised))
      .map((c) => c.id);
    return chineseDefaults(config, { ...options, include });
  }, [open, config, script, vertical, uiLocale, ticks]);

  const undone = useMemo(
    () => (undoable ? undoChineseDefaults(config, undoable.before, undoable.after) : null),
    [config, undoable],
  );
  const canUndo = undone !== null && undone.config !== config;

  useEffect(() => {
    if (open) firstControlRef.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus();
  }, [open]);

  // Apply sends the focus to the message and Undo to Review. When they
  // change the typefaces, the sandbox puts its interface away until the
  // fonts load and this section mounts anew: the request waits in the
  // memory, and is kept again if the section goes with the focus in it.
  useEffect(() => {
    if (open) return;
    const want = takeChineseDefaultsFocus(book);
    if (want === 'status') statusRef.current?.focus();
    else if (want === 'review') reviewRef.current?.focus();
  }, [open, book, memory]);
  useLayoutEffect(() => () => {
    const target = (document.activeElement as HTMLElement | null)?.dataset?.chineseDefaultsFocus;
    if (target === 'status' || target === 'review') keepChineseDefaultsFocus(target satisfies ChineseDefaultsFocus);
  }, []);

  const start = () => {
    setScript(docScript === 'Hant' ? 'zh-Hant' : 'zh-Hans');
    setVerticalPick(null);
    setTicks(new Map());
    setMemory(null);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => reviewRef.current?.focus());
  };
  const apply = () => {
    if (!preview) return;
    const count = preview.changes.filter((c) => c.applied).length;
    if (count > 0) dispatch({ type: 'SET_CONFIG', payload: preview.config });
    setMemory({
      book,
      at: Date.now(),
      status: { kind: 'applied', count },
      undo: count > 0 ? { before: config, after: preview.config } : null,
      focus: 'status',
    });
    setOpen(false);
  };
  const undo = () => {
    if (!undone) return;
    dispatch({ type: 'SET_CONFIG', payload: undone.config });
    setMemory({ book, at: Date.now(), status: { kind: 'undone', partial: undone.kept.length > 0 }, undo: null, focus: 'review' });
  };

  const appliedCount = preview?.changes.filter((c) => c.applied).length ?? 0;
  const statusText = status?.kind === 'applied'
    ? (status.count === 1 ? labels.chineseDefaultsAppliedOne : labels.chineseDefaultsApplied.replace('__count__', String(status.count)))
    : status?.kind === 'undone' ? (status.partial ? labels.chineseDefaultsUndonePartial : labels.chineseDefaultsUndone) : '';

  return (
    <FieldRow label={labels.chineseDefaults} tooltip={labels.chineseDefaultsTooltip} isDefault stacked>
      {!open ? (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Button ref={reviewRef} variant="primary" size="sm" onClick={start} aria-expanded={false} data-chinese-defaults-focus="review">
            {labels.chineseDefaultsReview}
          </Button>
          <p ref={statusRef} tabIndex={-1} role="status" data-chinese-defaults-focus="status" className="min-w-0 flex-1 text-[0.68rem] leading-[1.35] text-(--slate) outline-none [text-wrap:pretty]">
            {status?.kind === 'undone' || canUndo ? statusText : ''}
          </p>
          {canUndo && status?.kind === 'applied' && (
            <Button variant="outline" size="sm" onClick={undo}>{labels.undo}</Button>
          )}
        </div>
      ) : (
        <div id={panelId} className="w-full min-w-0 rounded-md border border-(--rule) bg-(--surface) p-2.5">
          <div ref={firstControlRef} className="flex flex-col gap-2">
            <Choice label={labels.chineseDefaultsScript}>
              {(labelId) => (
                <SegmentedControl<Script>
                  value={script}
                  onValueChange={(v) => { setScript(v); setTicks(new Map()); }}
                  options={[
                    { value: 'zh-Hans', label: <span lang="zh-Hans">{labels.chineseDefaultsSimplified}</span>, title: labels.chineseDefaultsSimplified },
                    { value: 'zh-Hant', label: <span lang="zh-Hant">{labels.chineseDefaultsTraditional}</span>, title: labels.chineseDefaultsTraditional },
                  ]}
                  ariaLabel={labels.chineseDefaultsScript}
                  ariaLabelledBy={labelId}
                  fill
                />
              )}
            </Choice>
            <Choice label={labels.chineseDefaultsDirection}>
              {(labelId) => (
                <SegmentedControl<'h' | 'v'>
                  value={vertical ? 'v' : 'h'}
                  onValueChange={(v) => setVerticalPick(v === 'v')}
                  options={[
                    { value: 'h', label: labels.writingModeHorizontal },
                    { value: 'v', label: labels.writingModeVerticalShort, title: labels.writingModeVerticalDescription },
                  ]}
                  ariaLabel={labels.chineseDefaultsDirection}
                  ariaLabelledBy={labelId}
                  fill
                />
              )}
            </Choice>
          </div>
          <fieldset className="m-0 mt-3 min-w-0 border-0 p-0">
            <legend className="mb-1.5 p-0 text-[0.6rem] font-semibold tracking-[0.12em] text-(--slate) uppercase">
              {labels.chineseDefaultsChanges}
            </legend>
            {preview && preview.changes.length === 0 ? (
              <p className="text-[0.68rem] text-(--slate)">{labels.chineseDefaultsNothing}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {preview?.changes.map((c) => (
                  <ChangeRow
                    key={c.id}
                    change={c}
                    labels={labels}
                    uiLocale={uiLocale}
                    fromLang={config.locale ?? uiLocale}
                    toLang={preview.locale}
                    onToggle={(on) => setTicks((prev) => new Map(prev).set(c.id, on))}
                  />
                ))}
              </ul>
            )}
          </fieldset>
          <div className="mt-3 flex flex-wrap justify-end gap-1.5">
            <Button variant="ghost" size="sm" onClick={close}>{labels.cancel}</Button>
            <Button variant="primary" size="sm" onClick={apply} disabled={appliedCount === 0}>
              {appliedCount === 1 ? labels.chineseDefaultsApplyOne : labels.chineseDefaultsApply.replace('__count__', String(appliedCount))}
            </Button>
          </div>
        </div>
      )}
    </FieldRow>
  );
}

function Choice({ label, children }: { label: string; children: (labelId: string) => ReactNode }) {
  const labelId = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span id={labelId} className="text-[0.6rem] font-semibold tracking-[0.12em] text-(--slate) uppercase">{label}</span>
      {children(labelId)}
    </div>
  );
}

function ChangeRow({ change, labels, uiLocale, fromLang, toLang, onToggle }: {
  change: ChineseDefaultChange;
  labels: SandboxLabels;
  uiLocale: string;
  fromLang: string;
  toLang: string;
  onToggle: (on: boolean) => void;
}) {
  const id = useId();
  const note = change.required && change.id === 'hyphenation'
    ? labels.chineseDefaultsFollowsLanguage
    : change.customised ? labels.chineseDefaultsOwn : null;
  return (
    <li className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        checked={change.applied}
        disabled={change.required}
        onChange={(e) => onToggle(e.target.checked)}
        aria-describedby={`${id}-values`}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-(--brand) disabled:cursor-default disabled:opacity-60"
      />
      <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col">
        <span className="text-xs leading-[1.3] text-(--foreground)">
          {String(labels[ITEM_LABELS[change.id]])}
          {note && <span className="ml-1.5 text-[0.62rem] text-(--brand)">· {note}</span>}
        </span>
        <span id={`${id}-values`} className="text-[0.68rem] leading-[1.35] text-(--slate) [overflow-wrap:anywhere]">
          <span lang={valueLang(change.from, fromLang)}>{valueText(change.from, labels, uiLocale)}</span>
          <span aria-hidden="true"> → </span>
          <span className="sr-only"> {labels.chineseDefaultsBecomes} </span>
          <span lang={valueLang(change.to, toLang)} className="text-(--foreground)">{valueText(change.to, labels, uiLocale)}</span>
        </span>
      </label>
    </li>
  );
}
