'use client';

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import {
  DEFAULT_CITATIONS_CONFIG,
  citationLocale,
  defaultBibliographyTitle,
  dimensionsEqual,
  ensureCitationEngine,
  processCitations,
  resolveCitationsConfig,
  setCitationEngineLoader,
  type CitationContext,
  type CitationsConfig,
  type CslItem,
  type DimensionUnit,
  type InlineSpan,
  type ResolvedConfig,
} from 'postext';
import { LOCALE_TAGS, STYLE_CATALOG } from 'postext-citeproc/catalog';
import { CollapsibleSection, DimensionInput, FieldGroup, NestedGroup, SelectInput, TextInput, ToggleSwitch } from '../../controls';

// The preview formats on the main thread: the engine is loaded the first
// time the section opens (the layout worker loads its own).
setCitationEngineLoader(() => import('postext-citeproc/register'));

const D = DEFAULT_CITATIONS_CONFIG;
const SIZE_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const SPACE_UNITS: DimensionUnit[] = ['em', 'pt', 'mm'];

type Bibliography = NonNullable<CitationsConfig['bibliography']>;

/** Works the preview cites: a book, an article, a chapter, a Chinese book
 *  for the Chinese styles, and a Japanese book and article for a Japanese
 *  locale or SIST 02. */
const SAMPLE_ITEMS: CslItem[] = [
  { id: 'garcia2020', type: 'book', author: [{ family: 'García', given: 'Ana' }], title: 'Tipografía y lectura', issued: { 'date-parts': [[2020]] }, publisher: 'Trea', 'publisher-place': 'Gijón', language: 'es' },
  { id: 'lopez2019', type: 'article-journal', author: [{ family: 'López', given: 'Luis' }, { family: 'Ruiz', given: 'Eva' }], title: 'Leer en pantalla', 'container-title': 'Revista de Letras', volume: '12', issue: '3', page: '45-67', issued: { 'date-parts': [[2019]] }, DOI: '10.1000/xyz', language: 'es' },
  { id: 'bringhurst2004', type: 'book', author: [{ family: 'Bringhurst', given: 'Robert' }], title: 'The Elements of Typographic Style', edition: '3', issued: { 'date-parts': [[2004]] }, publisher: 'Hartley & Marks', 'publisher-place': 'Vancouver', language: 'en' },
  { id: 'zhang2018', type: 'book', language: 'zh-CN', author: [{ family: '张三' }, { family: '李四' }, { family: '王五' }, { family: '赵六' }], title: '排版学', issued: { 'date-parts': [[2018]] }, publisher: '商务印书馆', 'publisher-place': '北京' },
  { id: 'natsume1914', type: 'book', language: 'ja', author: [{ family: '夏目', given: '漱石' }], title: 'こころ', issued: { 'date-parts': [[1914]] }, publisher: '岩波書店', 'publisher-place': '東京' },
  { id: 'yamada2015', type: 'article-journal', language: 'ja', author: [{ family: '山田', given: '太郎' }, { family: '佐藤', given: '花子' }, { family: '鈴木', given: '一郎' }], title: '縦組みの行間について', 'container-title': '印刷雑誌', volume: '98', issue: '4', page: '12-19', issued: { 'date-parts': [[2015]] } },
];

/** The preview's citations: parenthetical with a page, narrative, and two
 *  works together; in Japanese, the Japanese works (a narrative one with
 *  three authors shows the locale's ほか). */
function sampleContext(script: 'chinese' | 'japanese' | undefined): CitationContext {
  const japanese = script === 'japanese';
  const clusters: CitationContext['clusters'] = [
    { mode: 'parenthetical', items: [{ id: japanese ? 'natsume1914' : 'garcia2020', locator: '33', label: 'page' }], noteIndex: 1 },
    { mode: 'narrative', items: [{ id: japanese ? 'yamada2015' : 'bringhurst2004' }], noteIndex: 2 },
    { mode: 'parenthetical', items: [{ id: script === 'chinese' ? 'zhang2018' : japanese ? 'natsume1914' : 'lopez2019' }, { id: 'garcia2020' }], noteIndex: 3 },
  ];
  return { items: SAMPLE_ITEMS, nocite: [], clusters, local: [0, 1, 2], placed: true, last: true, issues: [] };
}

/** Spans as React nodes. */
function renderSpans(spans: readonly InlineSpan[]): ReactNode {
  return spans.map((s, i) => {
    let node: ReactNode = s.text;
    if (s.smallCaps) node = <span style={{ fontVariant: 'small-caps' }}>{node}</span>;
    if (s.italic) node = <em>{node}</em>;
    if (s.bold) node = <strong>{node}</strong>;
    if (s.script === 'sup') node = <sup>{node}</sup>;
    if (s.script === 'sub') node = <sub>{node}</sub>;
    return <span key={i}>{node}</span>;
  });
}

/** A strip of the active style at work: three citations and the list. */
function CitationPreview({ raw, locale }: { raw: CitationsConfig | undefined; locale: string | undefined }) {
  const labels = useSandboxLabels();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void ensureCitationEngine().then((ok) => { if (alive) setReady(ok); });
    return () => { alive = false; };
  }, []);
  const preview = useMemo(() => {
    if (!ready) return null;
    const citations = resolveCitationsConfig(raw);
    const resolved = { citations } as unknown as ResolvedConfig;
    const cslLocale = citationLocale(resolved, locale);
    const script = cslLocale.startsWith('zh') || citations.style.includes('gb-t-7714') ? 'chinese'
      : cslLocale.startsWith('ja') || citations.style === 'sist02' ? 'japanese' : undefined;
    return processCitations(sampleContext(script), resolved, cslLocale);
  }, [ready, raw, locale]);
  const note = preview?.processor.kind === 'note';
  return (
    <div className="mb-3 rounded-md border border-rule bg-surface px-3 py-2 text-[12.5px] leading-snug text-foreground" aria-live="polite">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-slate">{labels.citationsPreview}</div>
      {!preview && <p className="text-slate">{ready ? labels.citationsPreviewUnavailable : labels.citationsPreviewLoading}</p>}
      {preview && (
        <>
          {note ? (
            <ol className="mb-2 list-decimal ps-5">
              {preview.formatted.map((spans, i) => <li key={i}>{spans ? renderSpans(spans) : null}</li>)}
            </ol>
          ) : (
            <p className="mb-2">
              {preview.formatted.map((spans, i) => (
                <span key={i}>{i > 0 ? ' · ' : ''}{spans ? renderSpans(spans) : null}</span>
              ))}
            </p>
          )}
          <ul className="space-y-1">
            {preview.entries.map((e) => (
              <li key={e.id} className="ps-4 -indent-4">
                {/* Our own sample data, formatted by citeproc. */}
                {e.label ? <span>{e.label.replace(/<[^>]*>/g, '')} </span> : null}
                <span dangerouslySetInnerHTML={{ __html: e.html }} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const FORMAT_ORDER = ['author-date', 'author', 'numeric', 'note'] as const;

/**
 * Citations and the bibliography (#270): the CSL style that decides what a
 * citation and an entry say, and the settings that decide how they look —
 * the numbered marker, colour, links, the list's title, size and spacing.
 */
export const CitationsSection = memo(function CitationsSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.citations);
  const docLocale = useSandboxSelector((s) => s.config.locale ?? s.config.bodyText?.hyphenation?.locale);
  const c = resolveCitationsConfig(raw);
  const b = c.bibliography;
  const fileRef = useRef<HTMLInputElement>(null);

  const write = (next: CitationsConfig | undefined) => {
    const empty = !next || Object.keys(next).length === 0;
    dispatch({ type: 'UPDATE_CONFIG', payload: { citations: empty ? undefined : next } });
  };
  const update = (partial: Partial<CitationsConfig>) => write({ ...raw, ...partial });
  const resetField = (field: keyof CitationsConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    write(next);
  };
  const updateBib = (partial: Partial<Bibliography>) => update({ bibliography: { ...raw?.bibliography, ...partial } });
  const resetBib = (field: keyof Bibliography) => {
    if (!raw?.bibliography) return;
    const next = { ...raw.bibliography };
    delete next[field];
    if (Object.keys(next).length === 0) resetField('bibliography');
    else update({ bibliography: next });
  };

  const formatName: Record<string, string> = {
    'author-date': labels.citationsFormatAuthorDate,
    author: labels.citationsFormatAuthor,
    numeric: labels.citationsFormatNumeric,
    note: labels.citationsFormatNote,
  };
  const styleOptions = [
    ...FORMAT_ORDER.flatMap((format) => STYLE_CATALOG.filter((s) => s.format === format).map((s) => ({
      value: s.id,
      label: `${s.short} — ${formatName[format]}`,
    }))),
    { value: 'custom', label: labels.citationsStyleCustom },
  ];
  const info = STYLE_CATALOG.find((s) => s.id === c.style);
  const numeric = info?.format === 'numeric' || (c.style === 'custom' && /citation-number/.test(c.customStyle ?? ''));
  const noteStyle = info?.format === 'note' || (c.style === 'custom' && /class="note"/.test(c.customStyle ?? ''));
  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;

  const loadCsl = (file: File | undefined) => {
    if (!file) return;
    void file.text().then((xml) => {
      if (!/<style[\s>]/.test(xml)) return;
      update({ style: 'custom', customStyle: xml });
    });
  };

  return (
    <CollapsibleSection
      title={labels.citationsSection}
      sectionId="citations"
      onReset={() => write(undefined)}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <CitationPreview raw={raw} locale={docLocale} />
      <FieldGroup title={labels.citationsGroupStyle} description={labels.citationsGroupStyleDescription}>
        <SelectInput
          label={labels.citationsStyle}
          value={c.style}
          options={styleOptions}
          onChange={(v) => update({ style: v })}
          tooltip={info?.fields ? `${info.title} — ${info.fields}` : labels.citationsStyleTooltip}
          isDefault={raw?.style === undefined}
          onReset={() => resetField('style')}
        />
        {c.style === 'custom' && (
          <NestedGroup>
            <div className="flex items-center gap-2 py-1 text-[12.5px]">
              <button type="button" className="rounded border border-rule px-2 py-1 hover:bg-surface" onClick={() => fileRef.current?.click()}>
                {labels.citationsLoadCsl}
              </button>
              <span className="truncate text-slate">
                {c.customStyle ? /<title>([^<]*)<\/title>/.exec(c.customStyle)?.[1] ?? labels.citationsCustomLoaded : labels.citationsCustomNone}
              </span>
              <input ref={fileRef} type="file" accept=".csl,.xml,application/xml,text/xml" className="hidden" onChange={(e) => loadCsl(e.target.files?.[0])} />
            </div>
          </NestedGroup>
        )}
        <SelectInput
          label={labels.citationsLocale}
          value={c.locale ?? 'auto'}
          options={[
            { value: 'auto', label: labels.citationsLocaleAuto },
            ...LOCALE_TAGS.map((v) => ({ value: v, label: v })),
          ]}
          onChange={(v) => (v === 'auto' ? resetField('locale') : update({ locale: v }))}
          tooltip={labels.citationsLocaleTooltip}
          isDefault={raw?.locale === undefined}
          onReset={() => resetField('locale')}
        />
      </FieldGroup>
      <FieldGroup title={labels.citationsGroupInText} description={labels.citationsGroupInTextDescription}>
        {numeric && (
          <>
            <SelectInput
              label={labels.citationsMarker}
              value={c.marker}
              options={[
                { value: 'style', label: labels.citationsMarkerStyle },
                { value: 'brackets', label: '[1]' },
                { value: 'parentheses', label: '(1)' },
                { value: 'superscript', label: '¹' },
                { value: 'corner', label: '〔1〕' },
              ]}
              onChange={(v) => update({ marker: v as CitationsConfig['marker'] })}
              tooltip={labels.citationsMarkerTooltip}
              isDefault={c.marker === D.marker}
              onReset={() => resetField('marker')}
            />
            <ToggleSwitch
              label={labels.citationsCollapseRanges}
              checked={c.collapseRanges}
              onChange={(v) => update({ collapseRanges: v })}
              tooltip={labels.citationsCollapseRangesTooltip}
              isDefault={c.collapseRanges === D.collapseRanges}
              onReset={() => resetField('collapseRanges')}
            />
          </>
        )}
        {noteStyle && (
          <SelectInput
            label={labels.citationsNotes}
            value={c.notes}
            variant="segmented"
            stacked
            options={[
              { value: 'footnote', label: labels.citationsNotesFootnote },
              { value: 'warichu', label: labels.citationsNotesWarichu },
            ]}
            onChange={(v) => update({ notes: v as CitationsConfig['notes'] })}
            tooltip={labels.citationsNotesTooltip}
            isDefault={c.notes === D.notes}
            onReset={() => resetField('notes')}
          />
        )}
        <ToggleSwitch
          label={labels.citationsLink}
          checked={c.link}
          onChange={(v) => update({ link: v })}
          tooltip={labels.citationsLinkTooltip}
          isDefault={c.link === D.link}
          onReset={() => resetField('link')}
        />
      </FieldGroup>
      <FieldGroup title={labels.citationsGroupBibliography} description={labels.citationsGroupBibliographyDescription}>
        <TextInput
          label={labels.citationsBibliographyTitle}
          value={b.title ?? ''}
          placeholder={defaultBibliographyTitle(docLocale)}
          onChange={(v) => (v === '' ? resetBib('title') : updateBib({ title: v }))}
          tooltip={labels.citationsBibliographyTitleTooltip}
          isDefault={raw?.bibliography?.title === undefined}
          onReset={() => resetBib('title')}
        />
        <SelectInput
          label={labels.citationsBibliographyScope}
          value={b.scope}
          variant="segmented"
          stacked
          options={[
            { value: 'book', label: labels.citationsBibliographyScopeBook },
            { value: 'chapter', label: labels.citationsBibliographyScopeChapter },
          ]}
          onChange={(v) => updateBib({ scope: v as Bibliography['scope'] })}
          tooltip={labels.citationsBibliographyScopeTooltip}
          isDefault={b.scope === D.bibliography.scope}
          onReset={() => resetBib('scope')}
        />
        <ToggleSwitch
          label={labels.citationsBibliographyAuto}
          checked={b.auto}
          onChange={(v) => updateBib({ auto: v })}
          tooltip={labels.citationsBibliographyAutoTooltip}
          isDefault={b.auto === D.bibliography.auto}
          onReset={() => resetBib('auto')}
        />
        <DimensionInput
          label={labels.citationsBibliographyFontSize}
          value={b.fontSize}
          onChange={(dim) => updateBib({ fontSize: dim })}
          min={0.1}
          step={0.05}
          tooltip={labels.citationsBibliographyFontSizeTooltip}
          isDefault={dimensionsEqual(b.fontSize, D.bibliography.fontSize)}
          onReset={() => resetBib('fontSize')}
          units={SIZE_UNITS}
        />
        <DimensionInput
          label={labels.citationsBibliographyHangingIndent}
          value={b.hangingIndent}
          onChange={(dim) => updateBib({ hangingIndent: dim })}
          min={0}
          step={0.1}
          tooltip={labels.citationsBibliographyHangingIndentTooltip}
          isDefault={dimensionsEqual(b.hangingIndent, D.bibliography.hangingIndent)}
          onReset={() => resetBib('hangingIndent')}
          units={SPACE_UNITS}
        />
        {numeric && (
          <DimensionInput
            label={labels.citationsBibliographyLabelWidth}
            value={b.labelWidth ?? { value: 2.6, unit: 'em' }}
            onChange={(dim) => updateBib({ labelWidth: dim })}
            min={0}
            step={0.1}
            tooltip={labels.citationsBibliographyLabelWidthTooltip}
            isDefault={b.labelWidth === undefined}
            onReset={() => resetBib('labelWidth')}
            units={SPACE_UNITS}
          />
        )}
        {numeric && (
          <SelectInput
            label={labels.citationsBibliographyLabelAlign}
            value={b.labelAlign}
            variant="segmented"
            options={[
              { value: 'left', label: labels.citationsBibliographyLabelAlignLeft },
              { value: 'right', label: labels.citationsBibliographyLabelAlignRight },
            ]}
            onChange={(v) => updateBib({ labelAlign: v as Bibliography['labelAlign'] })}
            tooltip={labels.citationsBibliographyLabelAlignTooltip}
            isDefault={b.labelAlign === D.bibliography.labelAlign}
            onReset={() => resetBib('labelAlign')}
          />
        )}
        <DimensionInput
          label={labels.citationsBibliographyEntrySpacing}
          value={b.entrySpacing}
          onChange={(dim) => updateBib({ entrySpacing: dim })}
          min={0}
          step={0.1}
          tooltip={labels.citationsBibliographyEntrySpacingTooltip}
          isDefault={dimensionsEqual(b.entrySpacing, D.bibliography.entrySpacing)}
          onReset={() => resetBib('entrySpacing')}
          units={SPACE_UNITS}
        />
        <SelectInput
          label={labels.citationsBibliographyDoi}
          value={b.doi}
          variant="segmented"
          stacked
          options={[
            { value: 'link', label: labels.citationsBibliographyDoiLink },
            { value: 'text', label: labels.citationsBibliographyDoiText },
            { value: 'hide', label: labels.citationsBibliographyDoiHide },
          ]}
          onChange={(v) => updateBib({ doi: v as Bibliography['doi'] })}
          tooltip={labels.citationsBibliographyDoiTooltip}
          isDefault={b.doi === D.bibliography.doi}
          onReset={() => resetBib('doi')}
        />
        <ToggleSwitch
          label={labels.citationsBibliographyIncludeUncited}
          checked={b.includeUncited}
          onChange={(v) => updateBib({ includeUncited: v })}
          tooltip={labels.citationsBibliographyIncludeUncitedTooltip}
          isDefault={b.includeUncited === D.bibliography.includeUncited}
          onReset={() => resetBib('includeUncited')}
        />
        {/* A numbered list keeps the order of its numbers. */}
        {!numeric && (
          <ToggleSwitch
            label={labels.citationsBibliographyGroupByLanguage}
            checked={b.groupByLanguage}
            onChange={(v) => updateBib({ groupByLanguage: v })}
            tooltip={labels.citationsBibliographyGroupByLanguageTooltip}
            isDefault={b.groupByLanguage === D.bibliography.groupByLanguage}
            onReset={() => resetBib('groupByLanguage')}
          />
        )}
      </FieldGroup>
      <p className="mt-2 text-[11px] leading-snug text-slate">{labels.citationsAttribution}</p>
    </CollapsibleSection>
  );
});
