'use client';

import { memo } from 'react';
import { Plus } from 'lucide-react';
import { resolveBodyTextConfig, resolveHeadingsConfig, resolveUnorderedListsConfig, type CalloutStyleConfig, DEFAULT_CALLOUT_STYLES, resolveCalloutStylesConfig, type ResolvedCalloutStyleConfig, calloutStyleChain } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector, useSandboxResources } from '../../../context/SandboxContext.js';
import { openCard, moveCardState, CollapsibleSection, ItemCardListActions } from '../../../controls/index.js';
import { Button } from '../../../ui/index.js';
import { useBookTexts } from '../../../frameStyles/useBookTexts.js';
import { planRename } from '../../../frameStyles/styleMerge.js';
import { applyStyleRewrite } from '../../../frameStyles/applyRewrite.js';
import { removeCalloutStyle } from '../../../frameStyles/styleRemove.js';
import { CalloutStyleCard } from './CalloutStylesSection/CalloutStyleCard.js';
import { nextStyleId, uniqueId } from './CalloutStylesSection/shared.js';

export { joinedTabPatch, COMMON_TAB_GLYPHS, labelIconKindPatch } from './CalloutStylesSection/iconFields.js';
export { CalloutStyleCard } from './CalloutStylesSection/CalloutStyleCard.js';
export { CalloutLabelFields, CalloutTitleStyleFields } from './CalloutStylesSection/labelFields.js';

/** The callout styles of the book and how to edit them: what the Box
 *  styles section and the frame-style library (#873) both write. A rename
 *  also renames the style in every `:::callout` fence, template frame and
 *  exercise style that names it. */
export function useCalloutStyleEdits() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.calloutStyles);
  const pageTemplates = useSandboxSelector((s) => s.config.pageTemplates);
  const exerciseStyles = useSandboxSelector((s) => s.config.exerciseStyles);
  const exercises = useSandboxSelector((s) => s.config.exercises);
  const bodyTextRaw = useSandboxSelector((s) => s.config.bodyText);
  const headingsRaw = useSandboxSelector((s) => s.config.headings);
  const unorderedListsRaw = useSandboxSelector((s) => s.config.unorderedLists);
  const chapters = useBookTexts();
  const activeChapterId = useSandboxSelector((s) => s.activeChapterId);
  const resources = useSandboxResources();
  const iconResources = resources.filter((r) => r.kind === 'svg' || r.kind === 'bitmap');

  // Continuation strings default per document language, the way the engine
  // resolves them (see the table style section).
  const docLocale = useSandboxSelector((s) => s.config.locale ?? s.config.bodyText?.hyphenation?.locale ?? s.locale);
  const bodyText = resolveBodyTextConfig(bodyTextRaw);
  const headings = resolveHeadingsConfig(headingsRaw);
  const unorderedLists = resolveUnorderedListsConfig(unorderedListsRaw, bodyText);
  const styles: CalloutStyleConfig[] = raw ?? DEFAULT_CALLOUT_STYLES;
  const resolved = resolveCalloutStylesConfig(styles, bodyText, headings, unorderedLists, docLocale);
  const resolveOne = (style: CalloutStyleConfig): ResolvedCalloutStyleConfig =>
    resolved[styles.indexOf(style)] ?? resolveCalloutStylesConfig([style], bodyText, headings, unorderedLists, docLocale)[0]!;

  const write = (next: CalloutStyleConfig[]) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { calloutStyles: next.length > 0 ? next : undefined },
    });
  };

  const addStyle = () => {
    const id = nextStyleId(styles);
    openCard('calloutStyles', id);
    write([...styles, { id, name: labels.calloutStyleNewName }]);
  };

  const duplicateStyle = (id: string) => {
    const index = styles.findIndex((s) => s.id === id);
    const source = styles[index];
    if (!source) return;
    const taken = new Set(styles.map((s) => s.id));
    const copy: CalloutStyleConfig = structuredClone({ ...source, id: uniqueId(`${source.id}-copy`, taken) });
    openCard('calloutStyles', copy.id);
    const next = styles.slice();
    next.splice(index + 1, 0, copy);
    write(next);
  };

  const updateStyle = (id: string, partial: Partial<CalloutStyleConfig>) => {
    write(styles.map((s) => (s.id === id ? { ...s, ...partial } : s)));
  };

  const resetStyleField = (id: string, field: keyof CalloutStyleConfig) => {
    write(
      styles.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s };
        delete next[field];
        return next;
      }),
    );
  };

  const renameStyle = (id: string, nextId: string) => {
    if (styles.some((s) => s.id === nextId)) return;
    moveCardState('calloutStyles', id, nextId);
    // The exercises' boxes that name it are renamed too (#1244).
    const plan = planRename({ calloutStyles: raw, pageTemplates, exerciseStyles, exercises }, styles, chapters, id, nextId);
    applyStyleRewrite(dispatch, { calloutStyles: raw, pageTemplates }, plan, labels.frameStylesRenamed.replace('__from__', id).replace('__to__', nextId), activeChapterId);
  };

  /** A removed style's children (#905) take its look over, and its parent
   *  if it had one, so no box changes. */
  const removeStyle = (id: string) => write(removeCalloutStyle(styles, id));
  /** The styles `style` may be based on: not itself, nor one based on it
   *  (directly or further down), which would close a loop. */
  const parentsOf = (style: CalloutStyleConfig) => styles
    .filter((s, i) => s.id !== style.id && !calloutStyleChain(styles, i).chain.some((k) => styles[k]?.id === style.id))
    .map((s) => ({ id: s.id, name: s.name || s.id }));

  const cardProps = (style: CalloutStyleConfig) => ({
    style,
    resolved: resolveOne(style),
    otherIds: new Set(styles.filter((s) => s.id !== style.id).map((s) => s.id)),
    parents: parentsOf(style),
    stored: raw !== undefined,
    iconResources,
    listDefaults: { bulletFontSize: unorderedLists.bulletFontSize, bulletFontWeight: unorderedLists.fontWeight, bulletFontFamily: unorderedLists.fontFamily, marginTop: unorderedLists.marginTop, marginBottom: unorderedLists.marginBottom },
    onChange: (partial: Partial<CalloutStyleConfig>) => updateStyle(style.id, partial),
    onResetField: (field: keyof CalloutStyleConfig) => resetStyleField(style.id, field),
    onRename: (nextId: string) => renameStyle(style.id, nextId),
    onDuplicate: () => duplicateStyle(style.id),
    onRemove: () => removeStyle(style.id),
  });

  return { raw, styles, resolved, addStyle, cardProps, dispatch };
}

/** Config-panel section for the named callout styles selected by
 *  `:::callout{type="…"}` (`config.calloutStyles`). While the config has no
 *  list, the built-in `note` style is shown so it can be edited in place. */
export const CalloutStylesSection = memo(function CalloutStylesSection() {
  const labels = useSandboxLabels();
  const { raw, styles, addStyle, cardProps, dispatch } = useCalloutStyleEdits();

  return (
    <CollapsibleSection
      title={labels.calloutStylesSection}
      sectionId="calloutStyles"
      hasOverrides={raw !== undefined}
      onReset={() => dispatch({ type: 'UPDATE_CONFIG', payload: { calloutStyles: undefined } })}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.calloutStylesResetConfirm}
    >
      {styles.length === 0 && (
        <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>
          {labels.calloutStylesEmpty}
        </p>
      )}
      <ItemCardListActions list="calloutStyles" ids={styles.map((s) => s.id)} />
      {styles.map((style) => (
        <CalloutStyleCard key={style.id} {...cardProps(style)} />
      ))}
      <Button variant="outline" size="xs" icon={<Plus size={12} />} onClick={addStyle} className="mt-1">
        {labels.calloutStyleAdd}
      </Button>
    </CollapsibleSection>
  );
});
