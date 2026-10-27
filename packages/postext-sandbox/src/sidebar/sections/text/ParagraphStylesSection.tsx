'use client';

import { memo } from 'react';
import { Plus } from 'lucide-react';
import { resolveBodyTextConfig, type ParagraphStyleConfig, resolveParagraphStylesConfig, type ParagraphContainerSpacing, type BodyTextConfig, type ParagraphStylesInBoxes, DEFAULT_BODY_TEXT_CONFIG } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { openCard, moveCardState, CollapsibleSection, SelectInput, ItemCardListActions } from '../../../controls/index.js';
import { Button } from '../../../ui/index.js';
import { ParagraphStyleCard } from './ParagraphStylesSection/ParagraphStyleCard.js';
import { nextStyleId } from './ParagraphStylesSection/shared.js';

/** Config-panel section for the named paragraph styles applied by
 *  `:::paragraphs{style="…"}` containers (`config.paragraphStyles`). */
export const ParagraphStylesSection = memo(function ParagraphStylesSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.paragraphStyles);
  const bodyTextRaw = useSandboxSelector((s) => s.config.bodyText);
  const bodyText = resolveBodyTextConfig(bodyTextRaw);
  const styles: ParagraphStyleConfig[] = raw ?? [];
  const resolved = resolveParagraphStylesConfig(raw, bodyText);

  const write = (next: ParagraphStyleConfig[]) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { paragraphStyles: next.length > 0 ? next : undefined },
    });
  };

  const addStyle = () => {
    const id = nextStyleId(styles);
    openCard('paragraphStyles', id);
    write([...styles, { id, name: labels.paragraphStyleNewName }]);
  };

  const updateStyle = (id: string, partial: Partial<ParagraphStyleConfig>) => {
    write(styles.map((s) => (s.id === id ? { ...s, ...partial } : s)));
  };

  const resetStyleField = (id: string, field: keyof ParagraphStyleConfig) => {
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
    moveCardState('paragraphStyles', id, nextId);
    write(styles.map((s) => (s.id === id ? { ...s, id: nextId } : s)));
  };

  const removeStyle = (id: string) => {
    write(styles.filter((s) => s.id !== id));
  };

  /** The document-wide rule for the space under a container, kept in
   *  `bodyText` (EF-159, EF-181). */
  const writeContainerSpacing = (value: ParagraphContainerSpacing | undefined) => {
    const next: BodyTextConfig = { ...bodyTextRaw };
    if (value === undefined) delete next.paragraphContainerSpacing;
    else next.paragraphContainerSpacing = value;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { bodyText: Object.keys(next).length > 0 ? next : undefined },
    });
  };
  /** What a style's unset type fields take inside a box (#1119), kept in
   *  `bodyText`. */
  const writeInBoxes = (value: ParagraphStylesInBoxes | undefined) => {
    const next: BodyTextConfig = { ...bodyTextRaw };
    if (value === undefined) delete next.paragraphStylesInBoxes;
    else next.paragraphStylesInBoxes = value;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { bodyText: Object.keys(next).length > 0 ? next : undefined },
    });
  };
  const inBoxesOptions = [
    { value: 'box', label: labels.paragraphStylesInBoxesBox },
    { value: 'document', label: labels.paragraphStylesInBoxesDocument },
  ];
  const containerSpacingOptions = [
    { value: 'collapse', label: labels.paragraphContainerSpacingCollapse },
    { value: 'add', label: labels.paragraphContainerSpacingAdd },
  ];

  return (
    <CollapsibleSection
      title={labels.paragraphStylesSection}
      sectionId="paragraphStyles"
      hasOverrides={styles.length > 0}
      onReset={() => dispatch({ type: 'UPDATE_CONFIG', payload: { paragraphStyles: undefined } })}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.paragraphStylesResetConfirm}
    >
      {styles.length === 0 && (
        <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>
          {labels.paragraphStylesEmpty}
        </p>
      )}
      {styles.length > 0 && (
        <SelectInput
          label={labels.paragraphContainerSpacing}
          value={bodyText.paragraphContainerSpacing}
          options={containerSpacingOptions}
          onChange={(v) => writeContainerSpacing(v as ParagraphContainerSpacing)}
          tooltip={labels.paragraphContainerSpacingTooltip}
          isDefault={bodyText.paragraphContainerSpacing === DEFAULT_BODY_TEXT_CONFIG.paragraphContainerSpacing}
          onReset={() => writeContainerSpacing(undefined)}
        />
      )}
      {styles.length > 0 && (
        <SelectInput
          label={labels.paragraphStylesInBoxes}
          value={bodyText.paragraphStylesInBoxes}
          options={inBoxesOptions}
          onChange={(v) => writeInBoxes(v as ParagraphStylesInBoxes)}
          tooltip={labels.paragraphStylesInBoxesTooltip}
          isDefault={bodyText.paragraphStylesInBoxes === DEFAULT_BODY_TEXT_CONFIG.paragraphStylesInBoxes}
          onReset={() => writeInBoxes(undefined)}
        />
      )}
      <ItemCardListActions list="paragraphStyles" ids={styles.map((s) => s.id)} />
      {styles.map((style, i) => (
        <ParagraphStyleCard
          key={style.id}
          style={style}
          resolved={resolved[i] ?? resolveParagraphStylesConfig([style], bodyText)[0]!}
          bodyBoldColor={bodyText.boldColor ?? bodyText.color}
          bodyItalicColor={bodyText.italicColor ?? bodyText.color}
          otherIds={new Set(styles.filter((s) => s.id !== style.id).map((s) => s.id))}
          onChange={(partial) => updateStyle(style.id, partial)}
          onResetField={(field) => resetStyleField(style.id, field)}
          onRename={(nextId) => renameStyle(style.id, nextId)}
          onRemove={() => removeStyle(style.id)}
        />
      ))}
      <Button variant="outline" size="xs" icon={<Plus size={12} />} onClick={addStyle} className="mt-1">
        {labels.paragraphStyleAdd}
      </Button>
    </CollapsibleSection>
  );
});
