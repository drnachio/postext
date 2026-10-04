'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import {
  arabicDefaults,
  forgetArabicDefaults,
  keepArabicDefaultsFocus,
  recallArabicDefaults,
  rememberArabicDefaults,
  takeArabicDefaultsFocus,
  undoArabicDefaults,
  type ArabicDefaultChange,
  type ArabicDefaultId,
  type ArabicDefaultValue,
  type ArabicFaces,
} from '../../context/arabicDefaults';
import type { DefaultsFocus, DefaultsMemory } from '../../context/defaultsReview';
import { FieldRow } from '../../controls';
import { formatNumber } from '../../controls/units';
import { fetchGoogleFonts, type FontEntry } from '../../controls/FontPicker';
import { Button, SegmentedControl } from '../../ui';
import type { SandboxLabels } from '../../types/labels';
import { Choice, bookKeyOf, valueText as chineseValueText } from './ChineseDefaultsField';

/** What each row of the review list is called. The rows the Chinese list
 *  shares keep its labels. */
const ITEM_LABELS: Record<ArabicDefaultId, keyof SandboxLabels> = {
  direction: 'documentDirection',
  binding: 'binding',
  bodyFont: 'chineseDefaultsBodyFont',
  headingFont: 'chineseDefaultsHeadingFont',
  designFonts: 'arabicDefaultsDesignFonts',
  lineHeight: 'bodyLineHeight',
  textAlign: 'bodyTextAlign',
  hyphenation: 'bodyHyphenation',
  kashida: 'bodyKashida',
  emphasis: 'bodyEmphasis',
  numerals: 'numerals',
  resourceTypes: 'chineseDefaultsResourceTypes',
  captionLabel: 'chineseDefaultsCaptionLabel',
  chapterNumbering: 'chineseDefaultsChapterNumbers',
  listNumbers: 'chineseDefaultsListNumbers',
  footnotes: 'footnotesSection',
};

/** A value of the review list as the interface shows it. */
export function arabicValueText(v: ArabicDefaultValue, labels: SandboxLabels, uiLocale: string): string {
  const auto = (name: string, isAuto?: boolean) => (isAuto ? labels.cjkAuto.replace('__value__', name) : name);
  switch (v.kind) {
    case 'direction':
      return auto(v.value === 'rtl' ? labels.documentDirectionRtl : labels.documentDirectionLtr, v.auto);
    case 'digits':
      return auto(v.value === 'arab' ? labels.numeralsArab : v.value === 'arabext' ? labels.numeralsArabext : labels.numeralsLatn, v.auto);
    case 'dimension':
      return `${formatNumber(v.value.value, uiLocale)} ${v.value.unit}`;
    case 'emphasis':
      return auto(
        v.value === 'bold' ? labels.bodyEmphasisBold : v.value === 'color' ? labels.bodyEmphasisColor : v.value === 'overline' ? labels.bodyEmphasisOverline : labels.bodyEmphasisItalic,
        v.auto,
      );
    case 'footnotes': {
      const text = chineseValueText({ kind: 'footnotes', marker: v.marker, position: v.position, numbering: v.numbering }, labels, uiLocale);
      if (!v.noteNumber) return text;
      const note = v.noteNumber === 'inline' ? labels.footnotesMarkerPositionInline : labels.footnotesMarkerPositionSuperscript;
      return `${text}; ${labels.footnotesNoteNumberPosition}: ${note}`;
    }
    default:
      return chineseValueText(v, labels, uiLocale);
  }
}

/** Written text (a typeface, الفصل الأول, a sample number) carries the
 *  document's language, so the browser picks Arabic forms and direction for
 *  it; interface words (the footnote row's among them) do not. */
function valueLang(v: ArabicDefaultValue, lang: string): string | undefined {
  return v.kind === 'text' ? lang : undefined;
}

/**
 * "Arabic defaults": pick the typefaces, review the list of changes, apply
 * them as one step, take it back with Undo. Rows the author made their own
 * come unticked; the direction, which goes with the language, cannot be
 * unticked. Shown for a book in an Arabic-script language (`locale`).
 */
export function ArabicDefaultsField({ locale }: { locale: string }) {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const uiLocale = useSandboxSelector((s) => s.locale) ?? 'en';
  const [open, setOpen] = useState(false);
  const [faces, setFaces] = useState<ArabicFaces>('classical');
  const [ticks, setTicks] = useState<ReadonlyMap<ArabicDefaultId, boolean>>(new Map());
  const book = useSandboxSelector(bookKeyOf);
  const [memory, setMemoryState] = useState(() => recallArabicDefaults(book));
  const setMemory = (m: DefaultsMemory | null) => {
    if (m) rememberArabicDefaults(m);
    else forgetArabicDefaults();
    setMemoryState(m);
  };
  // Another book on screen: what was done in the last one is forgotten.
  const mine = memory?.book === book ? memory : null;
  useEffect(() => {
    if (memory && memory.book !== book) {
      recallArabicDefaults(book);
      setMemoryState(null);
    }
  }, [book, memory]);
  const status = mine?.status ?? null;
  const undoable = mine?.undo ?? null;
  const panelId = useId();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const reviewRef = useRef<HTMLButtonElement>(null);
  const firstControlRef = useRef<HTMLDivElement>(null);

  // Which design faces have Arabic letters: the font picker's list of
  // Fontsource families and their subsets, fetched when the list opens.
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
    const base = arabicDefaults(config, { locale, faces, fontSubsets });
    const include = base.changes
      .filter((c) => !c.required && (ticks.get(c.id) ?? !c.customised))
      .map((c) => c.id);
    return arabicDefaults(config, { locale, faces, include, fontSubsets });
  }, [open, config, locale, faces, ticks, fontSubsets]);

  const undone = useMemo(
    () => (undoable ? undoArabicDefaults(config, undoable.before, undoable.after) : null),
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
    const want = takeArabicDefaultsFocus(book);
    if (want === 'status') statusRef.current?.focus();
    else if (want === 'review') reviewRef.current?.focus();
  }, [open, book, memory]);
  useLayoutEffect(() => () => {
    const target = (document.activeElement as HTMLElement | null)?.dataset?.arabicDefaultsFocus;
    if (target === 'status' || target === 'review') keepArabicDefaultsFocus(target satisfies DefaultsFocus);
  }, []);

  const start = () => {
    // A book already in the modern faces keeps them.
    setFaces(config.bodyText?.fontFamily === 'Noto Naskh Arabic' ? 'modern' : 'classical');
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
    ? (status.count === 1 ? labels.arabicDefaultsAppliedOne : labels.arabicDefaultsApplied.replace('__count__', String(status.count)))
    : status?.kind === 'undone' ? (status.partial ? labels.arabicDefaultsUndonePartial : labels.arabicDefaultsUndone) : '';

  return (
    <FieldRow label={labels.arabicDefaults} tooltip={labels.arabicDefaultsTooltip} isDefault stacked>
      {!open ? (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Button ref={reviewRef} variant="primary" size="sm" onClick={start} aria-expanded={false} data-arabic-defaults-focus="review">
            {labels.chineseDefaultsReview}
          </Button>
          <p ref={statusRef} tabIndex={-1} role="status" data-arabic-defaults-focus="status" className="min-w-0 flex-1 text-[0.68rem] leading-[1.35] text-(--slate) outline-none [text-wrap:pretty]">
            {status?.kind === 'undone' || canUndo ? statusText : ''}
          </p>
          {canUndo && status?.kind === 'applied' && (
            <Button variant="outline" size="sm" onClick={undo}>{labels.undo}</Button>
          )}
        </div>
      ) : (
        <div id={panelId} className="w-full min-w-0 rounded-md border border-(--rule) bg-(--surface) p-2.5">
          <div ref={firstControlRef} className="flex flex-col gap-2">
            <Choice label={labels.arabicDefaultsFaces}>
              {(labelId) => (
                <SegmentedControl<ArabicFaces>
                  value={faces}
                  onValueChange={(v) => { setFaces(v); setTicks(new Map()); }}
                  options={[
                    { value: 'classical', label: labels.arabicDefaultsClassical },
                    { value: 'modern', label: labels.arabicDefaultsModern },
                  ]}
                  ariaLabel={labels.arabicDefaultsFaces}
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
              <p className="text-[0.68rem] text-(--slate)">{labels.arabicDefaultsNothing}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {preview?.changes.map((c) => (
                  <ChangeRow
                    key={c.id}
                    change={c}
                    labels={labels}
                    uiLocale={uiLocale}
                    lang={locale}
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

function ChangeRow({ change, labels, uiLocale, lang, onToggle }: {
  change: ArabicDefaultChange;
  labels: SandboxLabels;
  uiLocale: string;
  lang: string;
  onToggle: (on: boolean) => void;
}) {
  const id = useId();
  const note = change.required ? labels.chineseDefaultsFollowsLanguage : change.customised ? labels.chineseDefaultsOwn : null;
  // Arabic samples are isolated (`<bdi>`), so the arrow between them stays
  // where the interface's direction puts it.
  const value = (v: ArabicDefaultValue, className?: string) => {
    const text = arabicValueText(v, labels, uiLocale);
    const l = valueLang(v, lang);
    return l ? <bdi lang={l} className={className}>{text}</bdi> : <span className={className}>{text}</span>;
  };
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
          {value(change.from)}
          <span aria-hidden="true"> → </span>
          <span className="sr-only"> {labels.chineseDefaultsBecomes} </span>
          {value(change.to, 'text-(--foreground)')}
        </span>
      </label>
    </li>
  );
}
