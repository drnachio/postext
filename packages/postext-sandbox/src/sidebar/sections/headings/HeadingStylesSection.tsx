'use client';

import { memo } from 'react';
import { Plus } from 'lucide-react';
import { type HeadingStyleConfig, resolveBodyTextConfig, resolveHeadingsConfig, resolvePageConfig, resolveLayoutConfig, resolveUnorderedListsConfig, resolveOrderedListsConfig, DEFAULT_COLOR_PALETTE, resolveHeaderFooterConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { openCard, moveCardState, CollapsibleSection, ItemCardListActions } from '../../../controls/index.js';
import { Button } from '../../../ui/index.js';
import { type Baselines, HeadingStyleCard } from './HeadingStylesSection/HeadingStyleCard.js';
import { nextStyleId, infoStyle } from './HeadingStylesSection/shared.js';

/** Config-panel section for the named heading styles applied with
 *  `# Title {style="…"}` (`config.headingStyles`). */
export const HeadingStylesSection = memo(function HeadingStylesSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const styles: HeadingStyleConfig[] = config.headingStyles ?? [];

  const bodyText = resolveBodyTextConfig(config.bodyText, config.locale);
  const headings = resolveHeadingsConfig(config.headings);
  const base: Baselines = {
    level: headings.levels[0]!,
    page: resolvePageConfig(config.page),
    layout: resolveLayoutConfig(config.layout),
    bodyText,
    unorderedLists: resolveUnorderedListsConfig(config.unorderedLists, bodyText),
    orderedLists: resolveOrderedListsConfig(config.orderedLists, bodyText),
    palette: config.colorPalette && config.colorPalette.length > 0 ? config.colorPalette : DEFAULT_COLOR_PALETTE,
    documentHeader: resolveHeaderFooterConfig(config.header, 'header'),
    documentFooter: resolveHeaderFooterConfig(config.footer, 'footer'),
  };

  const write = (next: HeadingStyleConfig[]) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { headingStyles: next.length > 0 ? next : undefined } });
  };

  const addStyle = () => {
    const id = nextStyleId(styles);
    openCard('headingStyles', id);
    write([...styles, { id, name: labels.headingStyleNewName }]);
  };

  const updateStyle = (id: string, partial: Partial<HeadingStyleConfig>) => {
    write(
      styles.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, ...partial };
        for (const [k, v] of Object.entries(partial)) {
          if (v === undefined) delete (next as Record<string, unknown>)[k];
        }
        return next;
      }),
    );
  };

  const renameStyle = (id: string, nextId: string) => {
    if (styles.some((s) => s.id === nextId)) return;
    moveCardState('headingStyles', id, nextId);
    write(styles.map((s) => (s.id === id ? { ...s, id: nextId } : s)));
  };

  const removeStyle = (id: string) => {
    write(styles.filter((s) => s.id !== id));
  };

  return (
    <CollapsibleSection
      title={labels.headingStylesSection}
      sectionId="headingStyles"
      hasOverrides={styles.length > 0}
      onReset={() => dispatch({ type: 'UPDATE_CONFIG', payload: { headingStyles: undefined } })}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.headingStylesResetConfirm}
    >
      {styles.length === 0 && (
        <p className="mb-2 text-xs" style={infoStyle}>
          {labels.headingStylesEmpty}
        </p>
      )}
      <ItemCardListActions list="headingStyles" ids={styles.map((s) => s.id)} />
      {styles.map((style) => (
        <HeadingStyleCard
          key={style.id}
          style={style}
          otherIds={new Set(styles.filter((s) => s.id !== style.id).map((s) => s.id))}
          base={base}
          onChange={(partial) => updateStyle(style.id, partial)}
          onRename={(nextId) => renameStyle(style.id, nextId)}
          onRemove={() => removeStyle(style.id)}
        />
      ))}
      <Button variant="outline" size="xs" icon={<Plus size={12} />} onClick={addStyle} className="mt-1">
        {labels.headingStyleAdd}
      </Button>
    </CollapsibleSection>
  );
});
