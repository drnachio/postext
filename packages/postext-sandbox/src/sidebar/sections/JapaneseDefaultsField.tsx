'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { resolveLayoutConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import {
  forgetJapaneseDefaults,
  japaneseDefaults,
  keepJapaneseDefaultsFocus,
  recallJapaneseDefaults,
  rememberJapaneseDefaults,
  takeJapaneseDefaultsFocus,
  undoJapaneseDefaults,
  type JapaneseBook,
  type JapaneseDefaultChange,
  type JapaneseDefaultId,
  type JapaneseDefaultValue,
  type JapaneseRuleField,
} from '../../context/japaneseDefaults';
import type { DefaultsFocus, DefaultsMemory } from '../../context/defaultsReview';
import { FieldRow } from '../../controls';
import { fetchGoogleFonts, type FontEntry } from '../../controls/FontPicker';
import { Button, SegmentedControl } from '../../ui';
import type { SandboxLabels } from '../../types/labels';
import { Choice, bookKeyOf, valueText as chineseValueText } from './ChineseDefaultsField';

/** What each row of the review list is called. The rows the Chinese and
 *  Arabic lists share keep their labels. */
const ITEM_LABELS: Record<JapaneseDefaultId, keyof SandboxLabels> = {
  locale: 'documentLocale',
  writingMode: 'writingMode',
  binding: 'binding',
  bodyFont: 'chineseDefaultsBodyFont',
  headingFont: 'chineseDefaultsHeadingFont',
  designFonts: 'arabicDefaultsDesignFonts',
  lineHeight: 'bodyLineHeight',
  grid: 'cjkGrid',
  firstLineIndent: 'bodyFirstLineIndent',
  indentAfterHeading: 'bodyIndentAfterHeading',
  paragraphSpacing: 'bodyParagraphSpacing',
  textAlign: 'bodyTextAlign',
  hyphenation: 'bodyHyphenation',
  cjkRules: 'cjkSection',
  resourceTypes: 'chineseDefaultsResourceTypes',
  captionLabel: 'chineseDefaultsCaptionLabel',
  chapterNumbering: 'chineseDefaultsChapterNumbers',
  headingLayout: 'japaneseDefaultsHeadingLayout',
  listNumbers: 'chineseDefaultsListNumbers',
  footnotes: 'footnotesSection',
  folio: 'japaneseDefaultsFolio',
};

/** The East Asian typography settings the `cjkRules` row names. */
const RULE_LABELS: Record<JapaneseRuleField, keyof SandboxLabels> = {
  region: 'cjkRegion',
  lineBreak: 'cjkLineBreak',
  punctuationWidth: 'cjkPunctuationWidth',
  compressAdjacent: 'cjkCompressAdjacent',
  trimLineStart: 'cjkTrimLineStart',
  hangingPunctuation: 'cjkHanging',
  paragraphStartBracket: 'cjkParagraphStartBracket',
  spaceAfterQuestion: 'cjkSpaceAfterQuestion',
  emphasis: 'cjkEmphasis',
  emphasisMark: 'cjkEmphasisMark',
  bookTitleMark: 'cjkBookTitleMark',
  bookTitleBrackets: 'cjkBookTitleBrackets',
};

/** A value of the review list as the interface shows it. */
export function japaneseValueText(v: JapaneseDefaultValue, labels: SandboxLabels, uiLocale: string): string {
  switch (v.kind) {
    case 'cjkFields': return v.fields.map((f) => String(labels[RULE_LABELS[f]])).join(', ');
    case 'japanAuto': return labels.cjkAuto.replace('__value__', labels.cjkRegionJapan);
    case 'headingMargins': return labels.japaneseDefaultsHeadingMargins;
    default: return chineseValueText(v, labels, uiLocale);
  }
}

/** Written text (a typeface, 第一章, 42字 × 16行) carries its language, so
 *  kanji take their Japanese forms; interface words do not. */
function valueLang(v: JapaneseDefaultValue, lang: string): string | undefined {
  if (v.kind === 'locale') return v.tag;
  return v.kind === 'text' ? lang : undefined;
}

/**
 * "Japanese defaults": pick the kind of book (vertical bunko, horizontal
 * technical book), review the list of changes, apply them as one step,
 * take it back with Undo. Rows the author made their own come unticked;
 * the ones that go with the language and direction cannot be unticked.
 * Shown for a book whose document language is Japanese.
 */
export function JapaneseDefaultsField() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const uiLocale = useSandboxSelector((s) => s.locale) ?? 'en';
  const [open, setOpen] = useState(false);
  const [book, setBook] = useState<JapaneseBook>('vertical');
  const [ticks, setTicks] = useState<ReadonlyMap<JapaneseDefaultId, boolean>>(new Map());
  const bookKey = useSandboxSelector(bookKeyOf);
  const [memory, setMemoryState] = useState(() => recallJapaneseDefaults(bookKey));
  const setMemory = (m: DefaultsMemory | null) => {
    if (m) rememberJapaneseDefaults(m);
    else forgetJapaneseDefaults();
    setMemoryState(m);
  };
  // Another book on screen: what was done in the last one is forgotten.
  const mine = memory?.book === bookKey ? memory : null;
  useEffect(() => {
    if (memory && memory.book !== bookKey) {
      recallJapaneseDefaults(bookKey);
      setMemoryState(null);
    }
  }, [bookKey, memory]);
  const status = mine?.status ?? null;
  const undoable = mine?.undo ?? null;
  const panelId = useId();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const reviewRef = useRef<HTMLButtonElement>(null);
  const firstControlRef = useRef<HTMLDivElement>(null);

  // Which design faces have kana: the font picker's list of Fontsource
  // families and their subsets, fetched when the list opens.
  const [fontList, setFontList] = useState<readonly FontEntry[] | null>(null);
  useEffect(() => {
    if (!open || fontList) return;
    let live = true;
    void fetchGoogleFonts().then((list) => { if (live) setFontList(list); });
    return () => { live = false; };
  }, [open, fontList]);
  const fontSubsets = useMemo(() => {
    if (!fontList) return undefined;
    const byFamily = new Map(fontList.map((f) => [f.family, f.subsets]));
    return (family: string) => byFamily.get(family);
  }, [fontList]);

  const preview = useMemo(() => {
    if (!open) return null;
    const options = { book, fallbackLocale: uiLocale, fontSubsets };
    const base = japaneseDefaults(config, options);
    const include = base.changes
      .filter((c) => !c.required && (ticks.get(c.id) ?? !c.customised))
      .map((c) => c.id);
    return japaneseDefaults(config, { ...options, include });
  }, [open, config, book, uiLocale, ticks, fontSubsets]);

  const undone = useMemo(
    () => (undoable ? undoJapaneseDefaults(config, undoable.before, undoable.after) : null),
    [config, undoable],
  );
  const canUndo = undone !== null && undone.config !== config;

  useEffect(() => {
    if (open) firstControlRef.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus();
  }, [open]);

  // Apply sends the focus to the message and Undo to Review; a change of
  // typefaces remounts the section once the fonts load (see the Chinese
  // list), so the request waits in the memory.
  useEffect(() => {
    if (open) return;
    const want = takeJapaneseDefaultsFocus(bookKey);
    if (want === 'status') statusRef.current?.focus();
    else if (want === 'review') reviewRef.current?.focus();
  }, [open, bookKey, memory]);
  useLayoutEffect(() => () => {
    const target = (document.activeElement as HTMLElement | null)?.dataset?.japaneseDefaultsFocus;
    if (target === 'status' || target === 'review') keepJapaneseDefaultsFocus(target satisfies DefaultsFocus);
  }, []);

  const start = () => {
    // A Japanese book already set up across (第1章) keeps its direction;
    // any other opens on the vertical bunko, the usual Japanese book.
    const across = resolveLayoutConfig(config.layout).writingMode === 'horizontal-tb'
      && config.headings?.levels?.find((l) => l.level === 1)?.numberingTemplate === '第{1}章';
    setBook(across ? 'horizontal' : 'vertical');
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
      book: bookKey,
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
    setMemory({ book: bookKey, at: Date.now(), status: { kind: 'undone', partial: undone.kept.length > 0 }, undo: null, focus: 'review' });
  };

  const appliedCount = preview?.changes.filter((c) => c.applied).length ?? 0;
  const statusText = status?.kind === 'applied'
    ? (status.count === 1 ? labels.japaneseDefaultsAppliedOne : labels.japaneseDefaultsApplied.replace('__count__', String(status.count)))
    : status?.kind === 'undone' ? (status.partial ? labels.japaneseDefaultsUndonePartial : labels.japaneseDefaultsUndone) : '';

  return (
    <FieldRow label={labels.japaneseDefaults} tooltip={labels.japaneseDefaultsTooltip} isDefault stacked>
      {!open ? (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Button ref={reviewRef} variant="primary" size="sm" onClick={start} aria-expanded={false} data-japanese-defaults-focus="review">
            {labels.chineseDefaultsReview}
          </Button>
          <p ref={statusRef} tabIndex={-1} role="status" data-japanese-defaults-focus="status" className="min-w-0 flex-1 text-[0.68rem] leading-[1.35] text-(--slate) outline-none [text-wrap:pretty]">
            {status?.kind === 'undone' || canUndo ? statusText : ''}
          </p>
          {canUndo && status?.kind === 'applied' && (
            <Button variant="outline" size="sm" onClick={undo}>{labels.undo}</Button>
          )}
        </div>
      ) : (
        <div id={panelId} className="w-full min-w-0 rounded-md border border-(--rule) bg-(--surface) p-2.5">
          <div ref={firstControlRef} className="flex flex-col gap-2">
            <Choice label={labels.japaneseDefaultsBook}>
              {(labelId) => (
                <SegmentedControl<JapaneseBook>
                  value={book}
                  onValueChange={(v) => { setBook(v); setTicks(new Map()); }}
                  options={[
                    { value: 'vertical', label: labels.japaneseDefaultsVertical, title: labels.japaneseDefaultsVerticalDescription },
                    { value: 'horizontal', label: labels.japaneseDefaultsHorizontal, title: labels.japaneseDefaultsHorizontalDescription },
                  ]}
                  ariaLabel={labels.japaneseDefaultsBook}
                  ariaLabelledBy={labelId}
                  fill
                />
              )}
            </Choice>
          </div>
          <fieldset className="m-0 mt-3 min-w-0 border-0 p-0">
            <legend className="mb-1.5 p-0 text-[0.72rem] font-semibold tracking-[0.12em] text-(--slate) pt-caps">
              {labels.chineseDefaultsChanges}
            </legend>
            {preview && preview.changes.length === 0 ? (
              <p className="text-[0.68rem] text-(--slate)">{labels.japaneseDefaultsNothing}</p>
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

function ChangeRow({ change, labels, uiLocale, fromLang, toLang, onToggle }: {
  change: JapaneseDefaultChange;
  labels: SandboxLabels;
  uiLocale: string;
  fromLang: string;
  toLang: string;
  onToggle: (on: boolean) => void;
}) {
  const id = useId();
  const note = change.required ? labels.chineseDefaultsFollowsLanguage : change.customised ? labels.chineseDefaultsOwn : null;
  return (
    <li className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={change.applied}
        disabled={change.required}
        onChange={(e) => onToggle(e.target.checked)}
        aria-describedby={`${id}-values`}
        className="mt-0.5 h-3.5 w-3.5 pt-large:mt-0 pt-large:h-6 pt-large:w-6 shrink-0 cursor-pointer accent-(--brand) disabled:cursor-default disabled:opacity-60"
      />
      <label htmlFor={id} className="flex pt-large:min-h-11 min-w-0 flex-1 cursor-pointer flex-col justify-center">
        <span className="text-xs leading-[1.3] text-(--foreground)">
          {String(labels[ITEM_LABELS[change.id]])}
          {note && <span className="ms-1.5 text-[0.62rem] text-(--brand)">· {note}</span>}
        </span>
        <span id={`${id}-values`} className="text-[0.68rem] leading-[1.35] text-(--slate) [overflow-wrap:anywhere]">
          <span lang={valueLang(change.from, fromLang)}>{japaneseValueText(change.from, labels, uiLocale)}</span>
          <span aria-hidden="true"> → </span>
          <span className="sr-only"> {labels.chineseDefaultsBecomes} </span>
          <span lang={valueLang(change.to, toLang)} className="text-(--foreground)">{japaneseValueText(change.to, labels, uiLocale)}</span>
        </span>
      </label>
    </li>
  );
}
