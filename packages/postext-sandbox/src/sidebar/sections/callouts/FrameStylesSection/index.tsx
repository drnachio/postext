'use client';

import { memo, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ChevronDown, ChevronRight, LayoutTemplate, Merge, PenLine, SquareArrowOutUpRight, Undo2 } from 'lucide-react';
import { onFontsChanged, type CalloutStyleConfig, type PostextConfig } from 'postext';
import type { SandboxLabels } from '../../../../types/labels.js';
import { useSandboxDispatch, useSandboxLabels, useSandboxResources, useSandboxSelector, useSandboxStore } from '../../../../context/SandboxContext.js';
import { CollapsibleSection, FieldRow, NumberControl } from '../../../../controls/index.js';
import { Button, SegmentedControl, Switch } from '../../../../ui/index.js';
import { SearchScope } from '../../../search/SearchScope.js';
import { CalloutStyleCard, useCalloutStyleEdits } from '../CalloutStylesSection.js';
import { bookCompareOptions, frameStyleLibrary, type FrameStyleLibrary } from '../../../../frameStyles/library.js';
import { differingGroups, mergeSuggestions, POSITION_FIELDS, stylesAfterMerging, type CompareOptions, type MergeSuggestion } from '../../../../frameStyles/styleCompare.js';
import { placesToKeep, planMerges } from '../../../../frameStyles/styleMerge.js';
import { applyStyleRewrite, canUndoStyleRewrite, undoStyleRewrite, type StyleRewriteRecord } from '../../../../frameStyles/applyRewrite.js';
import { useBookTexts } from '../../../../frameStyles/useBookTexts.js';
import type { StyleUsage } from '../../../../frameStyles/styleUsage.js';
import { templateEditor } from '../../../../templates/editorStore.js';
import { showPageTemplatesSection } from '../../../../templates/showSection.js';
import { StylePreview } from './StylePreview.js';
import { boxesText, groupsText, kindText, pagesText, suggestionText, usageText } from './text.js';

const noSubscription = () => () => undefined;
const noVersion = () => 0;

type Filter = 'templates' | 'text' | 'unused' | 'all';

const PREVIEW_WIDTH = 220;

function styleName(s: CalloutStyleConfig | undefined, id: string): string {
  return s?.name && s.name !== s.id ? s.name : id;
}

const NAMES_SHOWN = 6;

/** The styles a suggestion merges, the first few by name. */
function mergedNames(ids: readonly string[], byId: ReadonlyMap<string, CalloutStyleConfig>, labels: SandboxLabels): string {
  const names = ids.slice(0, NAMES_SHOWN).map((id) => styleName(byId.get(id), id)).join(labels.frameStylesListSeparator);
  return ids.length > NAMES_SHOWN ? `${names} ${labels.frameStylesMoreNames.replace('__count__', String(ids.length - NAMES_SHOWN))}` : names;
}

function matches(filter: Filter, u: StyleUsage | undefined): boolean {
  const frames = (u?.frames.length ?? 0) > 0 || (u?.templates.length ?? 0) > 0;
  const text = (u?.fenceCount ?? 0) > 0;
  if (filter === 'templates') return frames;
  if (filter === 'text') return text;
  if (filter === 'unused') return !frames && !text;
  return true;
}

/** Design › Boxes › Frame styles (#873): every callout style painted by
 *  the engine, where the book uses it (template frames, composed pages,
 *  `:::callout` boxes per chapter), the style's editor in place, and the
 *  merges of near-identical styles, undoable. */
export const FrameStylesSection = memo(function FrameStylesSection() {
  const labels = useSandboxLabels();
  const dispatch = useSandboxDispatch();
  const config = useSandboxSelector((s) => s.config);
  const uiLocale = useSandboxSelector((s) => s.locale);
  const resources = useSandboxResources();
  const chapters = useBookTexts();
  const edits = useCalloutStyleEdits();
  const [ignorePosition, setIgnorePosition] = useState(false);
  // Merging on the look only: a style whose boxes stand elsewhere stays,
  // with only its place, based on the kept style (#905).
  const [keepPlaces, setKeepPlaces] = useState(true);
  const [maxFields, setMaxFields] = useState(2);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const activeChapterId = useSandboxSelector((s) => s.activeChapterId);
  // The last merge, offered back while its steps are the latest of the
  // Sandbox's history (#899).
  const history = useSandboxStore().history;
  const [last, setLast] = useState<StyleRewriteRecord | null>(null);
  useSyncExternalStore(history?.subscribe ?? noSubscription, history?.getVersion ?? noVersion, history?.getVersion ?? noVersion);
  const undoable = canUndoStyleRewrite(history, last);

  // Repaint the previews when fonts land.
  const [fontsVersion, setFontsVersion] = useState(0);
  useEffect(() => onFontsChanged(() => setFontsVersion((n) => n + 1)), []);

  const library = useMemo(
    () => frameStyleLibrary(config, chapters, { maxFields, ignorePosition }, uiLocale),
    [config, chapters, maxFields, ignorePosition, uiLocale],
  );
  // Suggestions held back because the boxes would move.
  const withLook = useMemo(
    () => (ignorePosition || !library.stored ? library.suggestions : mergeSuggestions(library.styles, library.resolved, library.usage, bookCompareOptions(config, { maxFields, ignorePosition: true }))),
    [library, ignorePosition, config, maxFields],
  );
  const compare = useMemo(() => bookCompareOptions(config), [config]);
  const hidden = stylesAfterMerging(library.styles.length, library.suggestions) - stylesAfterMerging(library.styles.length, withLook);
  const anyTemplate = library.styles.some((s) => matches('templates', library.usage.get(s.id)));
  const shown: Filter = filter ?? (anyTemplate ? 'templates' : 'all');
  const visible = library.styles.filter((s) => matches(shown, library.usage.get(s.id)));
  const byId = new Map(library.styles.map((s) => [s.id, s]));

  const { calloutStyles: _cs, pageTemplates: _pt, ...rest } = config;
  void _cs;
  void _pt;
  const contextKey = useMemo(
    () => JSON.stringify([rest, resources.map((r) => r.id), fontsVersion]),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `rest` is `config` without the lists the preview replaces.
    [config, resources, fontsVersion],
  );
  const sample = useMemo(() => ({ text: labels.frameStylesSampleText, label: labels.frameStylesSampleLabel }), [labels]);

  const merge = (list: readonly MergeSuggestion[]) => {
    if (list.length === 0) return;
    const before = { calloutStyles: config.calloutStyles, pageTemplates: config.pageTemplates };
    const plan = planMerges({ ...before, exerciseStyles: config.exerciseStyles, exercises: config.exercises }, library.styles, chapters, list, placesOf(list));
    const merged = plan.from.length;
    const message = list.length === 1
      ? labels.frameStylesMerged.replace('__count__', String(merged)).replace('__name__', styleName(byId.get(list[0]!.keep), list[0]!.keep))
      : labels.frameStylesMergedAll.replace('__count__', String(merged)).replace('__left__', String(plan.calloutStyles.length));
    setLast(applyStyleRewrite(dispatch, before, plan, message, activeChapterId));
    setReviewing(null);
  };

  /** The styles a merge keeps for their place (#905). */
  function placesOf(list: readonly MergeSuggestion[]) {
    return ignorePosition && keepPlaces ? placesToKeep(list, library, compare) : new Map<string, Partial<CalloutStyleConfig>>();
  }

  const undo = () => {
    if (history && last) undoStyleRewrite(history, last);
    setLast(null);
  };

  const goToBox = (chapterId: string, offset: number) => {
    const text = chapters.find((c) => c.id === chapterId)?.markdown ?? '';
    const end = text.indexOf('\n', offset);
    dispatch({ type: 'SET_PANEL', payload: 'markdown' });
    dispatch({ type: 'SET_PENDING_EDITOR_FOCUS', payload: { chapterId, anchor: offset, head: end < 0 ? text.length : end, selectWord: false } });
  };

  const goToFrame = (templateId: string, frame: string, scope: 'base' | 'recto' | 'verso') => {
    templateEditor.select({ templateId, scope, frame, group: null, pageIndex: null });
    showPageTemplatesSection(frame);
  };

  const chapterTitle = (index: number) => chapters[index]?.title || labels.chapterUntitled.replace('__n__', String(index + 1));

  return (
    <CollapsibleSection title={labels.frameStylesSection} sectionId="frameStyles">
      <SearchScope title={labels.frameStylesSection}>
        <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>{labels.frameStylesIntro}</p>

        {last && undoable && (
          <div role="status" className="mb-2 flex items-center gap-2 rounded border px-2 py-1.5 text-xs" style={{ borderColor: 'var(--rule)', color: 'var(--foreground)' }}>
            <span className="min-w-0 flex-1">{last.message}</span>
            <Button variant="outline" size="xs" icon={<Undo2 size={12} />} onClick={undo}>{labels.undo}</Button>
          </div>
        )}

        {library.kinds.length > 0 && (
          <div className="mb-3">
            <h4 className="mb-1 text-xs font-semibold" style={{ color: 'var(--foreground)' }}>{labels.frameStylesKinds}</h4>
            <p className="mb-2 text-[0.7rem]" style={{ color: 'var(--slate)' }}>{labels.frameStylesKindsHint}</p>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {library.kinds.map((k) => (
                <li key={k.base} className="rounded border p-2 text-xs" style={{ borderColor: 'var(--rule)' }}>
                  <p className="mb-1 font-medium" style={{ color: 'var(--foreground)' }}>{kindText(k, styleName(byId.get(k.base), k.base), labels, uiLocale)}</p>
                  <p className="m-0 text-[0.7rem]" style={{ color: 'var(--slate)' }}>
                    <span dir="auto">{mergedNames(k.variants.map((v) => v.id), byId, labels)}</span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {library.stored && (
          <div className="mb-3">
            <h4 className="mb-1 text-xs font-semibold" style={{ color: 'var(--foreground)' }}>
              {labels.frameStylesSuggestions}
            </h4>
            {/* Settings of the comparison, not of the book: never shown as changed. */}
            <FieldRow label={labels.frameStylesMaxFields} tooltip={labels.frameStylesMaxFieldsTooltip}>
              <NumberControl value={maxFields} min={0} max={8} onChange={(v) => setMaxFields(Math.max(0, Math.round(v)))} muted={false} />
            </FieldRow>
            <FieldRow label={labels.frameStylesIgnorePosition} tooltip={labels.frameStylesIgnorePositionTooltip}>
              <Switch ariaLabel={labels.frameStylesIgnorePosition} checked={ignorePosition} onCheckedChange={setIgnorePosition} />
            </FieldRow>
            {ignorePosition && (
              <FieldRow label={labels.frameStylesKeepPlaces} tooltip={labels.frameStylesKeepPlacesTooltip}>
                <Switch ariaLabel={labels.frameStylesKeepPlaces} checked={keepPlaces} onCheckedChange={setKeepPlaces} />
              </FieldRow>
            )}
            <p className="mb-2 text-[0.7rem]" style={{ color: 'var(--slate)' }}>{labels.frameStylesTolerances}</p>
            {library.suggestions.length === 0 && (
              <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>{labels.frameStylesSuggestionsNone}</p>
            )}
            {!ignorePosition && hidden > 0 && (
              <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>{labels.frameStylesHiddenByPosition.replace('__count__', String(hidden))}</p>
            )}
            {library.suggestions.length > 1 && (
              <div className="mb-2">
                {reviewing === '*' ? (
                  <ReviewPanel
                    suggestions={library.suggestions}
                    library={library}
                    places={placesOf(library.suggestions)}
                    compare={compare}
                    chapterTitle={chapterTitle}
                    uiLocale={uiLocale}
                    confirmLabel={labels.frameStylesMergeAllConfirm}
                    onConfirm={() => merge(library.suggestions)}
                    onCancel={() => setReviewing(null)}
                  />
                ) : (
                  <Button variant="outline" size="xs" icon={<Merge size={12} />} onClick={() => setReviewing('*')}>
                    {labels.frameStylesReviewAll
                      .replace('__from__', String(library.styles.length))
                      .replace('__to__', String(stylesAfterMerging(library.styles.length, library.suggestions)))}
                  </Button>
                )}
              </div>
            )}
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {library.suggestions.map((s) => (
                <li key={s.keep} className="rounded border p-2" style={{ borderColor: 'var(--rule)' }}>
                  <p className="mb-1 text-xs font-medium" style={{ color: 'var(--foreground)' }}>{suggestionText(s, labels, uiLocale)}</p>
                  <p className="mb-1 text-[0.7rem]" style={{ color: 'var(--slate)' }}>
                    {labels.frameStylesKeeps.replace('__name__', styleName(byId.get(s.keep), s.keep))}
                    {' · '}
                    <span dir="auto">{mergedNames(s.merge, byId, labels)}</span>
                  </p>
                  <StylePreview
                    style={byId.get(s.keep)!}
                    config={config}
                    contextKey={contextKey}
                    resources={resources}
                    sample={sample}
                    width={PREVIEW_WIDTH}
                    label={labels.frameStylesPreviewOf.replace('__name__', styleName(byId.get(s.keep), s.keep))}
                  />
                  {reviewing === s.keep ? (
                    <ReviewPanel
                      suggestions={[s]}
                      library={library}
                      places={placesOf([s])}
                    compare={compare}
                      chapterTitle={chapterTitle}
                      uiLocale={uiLocale}
                      confirmLabel={labels.frameStylesMergeInto.replace('__name__', styleName(byId.get(s.keep), s.keep))}
                      onConfirm={() => merge([s])}
                      onCancel={() => setReviewing(null)}
                    />
                  ) : (
                    <Button variant="outline" size="xs" className="mt-1" onClick={() => setReviewing(s.keep)}>{labels.frameStylesReview}</Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mb-2">
          <SegmentedControl<Filter>
            ariaLabel={labels.frameStylesShow}
            size="sm"
            value={shown}
            onValueChange={setFilter}
            options={[
              { value: 'templates', label: labels.frameStylesShowTemplates },
              { value: 'text', label: labels.frameStylesShowText },
              { value: 'unused', label: labels.frameStylesShowUnused },
              { value: 'all', label: labels.frameStylesShowAll },
            ]}
          />
        </div>
        <p className="mb-2 text-[0.7rem]" style={{ color: 'var(--slate)' }}>
          {labels.frameStylesCount.replace('__shown__', String(visible.length)).replace('__count__', String(library.styles.length))}
        </p>
        {visible.length === 0 && <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>{labels.frameStylesEmpty}</p>}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {visible.map((style) => (
            <StyleRow
              key={style.id}
              style={style}
              usage={library.usage.get(style.id)}
              config={config}
              contextKey={contextKey}
              sample={sample}
              chapterTitle={chapterTitle}
              onGoToBox={goToBox}
              onGoToFrame={goToFrame}
              edit={() => <CalloutStyleCard {...edits.cardProps(style)} />}
            />
          ))}
        </ul>
      </SearchScope>
    </CollapsibleSection>
  );
});

interface ReviewPanelProps {
  suggestions: readonly MergeSuggestion[];
  library: FrameStyleLibrary;
  /** The styles that stay for the place of their boxes (#905). */
  places: ReadonlyMap<string, unknown>;
  compare: CompareOptions;
  chapterTitle: (index: number) => string;
  uiLocale: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** What a merge changes, before it is made: each style that goes, what it
 *  differs in, the boxes and frames that will name the kept style, and the
 *  boxes that will move. */
function ReviewPanel({ suggestions, library, places, compare, chapterTitle, uiLocale, confirmLabel, onConfirm, onCancel }: ReviewPanelProps) {
  const labels = useSandboxLabels();
  const byId = new Map(library.styles.map((s) => [s.id, s]));
  const resolvedById = new Map(library.styles.map((s, i) => [s.id, library.resolved[i]]));
  const resolvedOf = (id: string) => resolvedById.get(id) ?? byId.get(id)!;
  let fences = 0;
  let frames = 0;
  let moves = 0;
  const chapterSet = new Set<number>();
  for (const s of suggestions) {
    for (const id of s.merge) {
      const u = library.usage.get(id);
      // A style that stays for its place keeps its boxes and their type.
      if (places.has(id)) continue;
      // Its boxes move to where the kept style's stand.
      if ((u?.fenceCount ?? 0) > 0 && differingGroups(resolvedOf(s.keep), resolvedOf(id), compare).some((f) => POSITION_FIELDS.has(f))) moves += u!.fenceCount;
      fences += u?.fences.reduce((n, f) => n + f.offsets.length - f.implicit, 0) ?? 0;
      frames += u?.frames.length ?? 0;
      for (const f of u?.fences ?? []) if (f.offsets.length > f.implicit) chapterSet.add(f.chapterIndex);
    }
  }
  const removed = suggestions.reduce((n, s) => n + s.merge.filter((id) => !places.has(id)).length, 0);
  return (
    <div className="mt-2 rounded border p-2 text-xs" style={{ borderColor: 'var(--brand)', color: 'var(--foreground)' }}>
      <ul className="m-0 mb-2 flex max-h-64 list-none flex-col gap-1 overflow-auto p-0">
        {suggestions.flatMap((s) => s.merge.map((id) => {
          const a = resolvedById.get(s.keep);
          const b = resolvedById.get(id);
          const diff = a && b ? differingGroups(a, b, compare) : [];
          return (
            <li key={id}>
              <span dir="auto">{styleName(byId.get(id), id)}</span>
              {' → '}
              <span dir="auto">{styleName(byId.get(s.keep), s.keep)}</span>
              {': '}
              <span style={{ color: 'var(--slate)' }}>{diff.length > 0 ? groupsText(diff, labels, uiLocale) : labels.frameStylesNoDifference}</span>
            </li>
          );
        }))}
      </ul>
      <p className="mb-1">
        {labels.frameStylesReviewSummary
          .replace('__styles__', String(removed))
          .replace('__boxes__', String(fences))
          .replace('__chapters__', String(chapterSet.size))
          .replace('__frames__', String(frames))}
      </p>
      {chapterSet.size > 0 && (
        <p className="mb-1" style={{ color: 'var(--slate)' }}>{[...chapterSet].sort((a, b) => a - b).map(chapterTitle).join(', ')}</p>
      )}
      {moves > 0 && (
        <p className="mb-1 font-medium" style={{ color: 'var(--pt-warning, var(--foreground))' }}>
          {labels.frameStylesReviewMoves.replace('__count__', String(moves))}
        </p>
      )}
      {places.size > 0 && (
        <p className="mb-1">{labels.frameStylesReviewStays.replace('__count__', String(places.size))}</p>
      )}
      <p className="mb-2" style={{ color: 'var(--slate)' }}>{labels.frameStylesReviewUndo}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="xs" icon={<Merge size={12} />} onClick={onConfirm}>{confirmLabel}</Button>
        <Button variant="outline" size="xs" onClick={onCancel}>{labels.cancel}</Button>
      </div>
    </div>
  );
}

interface StyleRowProps {
  style: CalloutStyleConfig;
  usage: StyleUsage | undefined;
  config: PostextConfig;
  contextKey: string;
  sample: { text: string; label: string };
  chapterTitle: (index: number) => string;
  onGoToBox: (chapterId: string, offset: number) => void;
  onGoToFrame: (templateId: string, frame: string, scope: 'base' | 'recto' | 'verso') => void;
  edit: () => React.ReactNode;
}

/** One style of the library: its picture, where it is used and, opened,
 *  every chapter and frame using it and the style's own editor. */
function StyleRow({ style, usage, config, contextKey, sample, chapterTitle, onGoToBox, onGoToFrame, edit }: StyleRowProps) {
  const labels = useSandboxLabels();
  const resources = useSandboxResources();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  // The next box of each chapter a "show" press goes to.
  const [cursor, setCursor] = useState<Record<string, number>>({});
  const name = styleName(style, style.id);
  const scopeLabel = (scope: 'base' | 'recto' | 'verso') =>
    scope === 'recto' ? labels.pageTemplatesScopeRecto : scope === 'verso' ? labels.pageTemplatesScopeVerso : labels.pageTemplatesScopeBase;
  return (
    <li className="rounded border p-2" style={{ borderColor: 'var(--rule)' }} data-frame-style={style.id}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="mb-1 flex min-h-11 w-full cursor-pointer items-center gap-1 text-start"
      >
        {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-xs font-medium" style={{ color: 'var(--foreground)' }} dir="auto">{name}</span>
          <span className="truncate text-[0.7rem]" style={{ color: 'var(--slate)' }}>
            {name !== style.id && <><span dir="ltr">{style.id}</span>{' · '}</>}
            {usageText(usage, labels)}
          </span>
        </span>
      </button>
      <StylePreview
        style={style}
        config={config}
        contextKey={contextKey}
        resources={resources}
        sample={sample}
        width={PREVIEW_WIDTH}
        label={labels.frameStylesPreviewOf.replace('__name__', name)}
      />
      {open && (
        <div className="mt-2 text-xs" style={{ color: 'var(--foreground)' }}>
          {usage && usage.frames.length > 0 && (
            <ul className="m-0 mb-1 flex list-none flex-col gap-1 p-0" aria-label={labels.frameStylesFramesHeading}>
              {usage.frames.map((f) => (
                <li key={`${f.templateId}/${f.scope}/${f.frame}`} className="flex items-center gap-1">
                  <LayoutTemplate size={12} aria-hidden />
                  <span className="min-w-0 flex-1 truncate" dir="auto">
                    {f.templateId} › {f.frame}{f.scope !== 'base' ? ` (${scopeLabel(f.scope)})` : ''}
                  </span>
                  <Button variant="ghost" size="xs" icon={<SquareArrowOutUpRight size={12} />} onClick={() => onGoToFrame(f.templateId, f.frame, f.scope)}>
                    {labels.frameStylesOpenFrame}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {usage && usage.pages.length > 0 && (
            <ul className="m-0 mb-1 flex list-none flex-col gap-1 p-0" aria-label={labels.frameStylesPagesHeading}>
              {usage.pages.map((p) => (
                <li key={`p-${p.chapterId}`} className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate" dir="auto">{chapterTitle(p.chapterIndex)}: {pagesText(p.offsets.length, labels)}</span>
                  <Button variant="ghost" size="xs" icon={<SquareArrowOutUpRight size={12} />} onClick={() => onGoToBox(p.chapterId, p.offsets[0]!)}>
                    {labels.frameStylesShowInText}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {usage && usage.fences.length > 0 && (
            <ul className="m-0 mb-1 flex list-none flex-col gap-1 p-0" aria-label={labels.frameStylesBoxesHeading}>
              {usage.fences.map((f) => {
                const at = (cursor[f.chapterId] ?? 0) % f.offsets.length;
                return (
                  <li key={`f-${f.chapterId}`} className="flex items-center gap-1">
                    <span className="min-w-0 flex-1 truncate" dir="auto">
                      {chapterTitle(f.chapterIndex)}: {boxesText(f.offsets.length, labels)}
                      {f.implicit > 0 ? ` (${labels.frameStylesImplicit.replace('__count__', String(f.implicit))})` : ''}
                    </span>
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={<SquareArrowOutUpRight size={12} />}
                      aria-label={labels.frameStylesShowBoxAria.replace('__n__', String(at + 1)).replace('__count__', String(f.offsets.length)).replace('__chapter__', chapterTitle(f.chapterIndex))}
                      onClick={() => {
                        onGoToBox(f.chapterId, f.offsets[at]!);
                        setCursor((c) => ({ ...c, [f.chapterId]: at + 1 }));
                      }}
                    >
                      {f.offsets.length > 1 ? `${labels.frameStylesShowInText} ${at + 1}/${f.offsets.length}` : labels.frameStylesShowInText}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          <Button variant="outline" size="xs" icon={<PenLine size={12} />} aria-expanded={editing} onClick={() => setEditing((v) => !v)} className="mt-1">
            {editing ? labels.frameStylesEditDone : labels.frameStylesEdit}
          </Button>
          {editing && <div className="mt-2">{edit()}</div>}
        </div>
      )}
    </li>
  );
}
