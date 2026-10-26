'use client';

import { memo, useState } from 'react';
import { Plus } from 'lucide-react';
import { resolveBodyTextConfig, type LabelStyle } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { moveCardState, CollapsibleSection, ItemCardListActions, openCard } from '../../../controls/index.js';
import { Button } from '../../../ui/index.js';
import { applyLabelStyleRename } from '../../../labelStyles/applyRename.js';
import { useLabelStyleUsage } from '../../../labelStyles/useLabelStyleUsage.js';
import { useBookTexts } from '../../../frameStyles/useBookTexts.js';
import { LabelStyleCard } from './LabelStylesSection/LabelStyleCard.js';
import { nextStyleId } from './LabelStylesSection/shared.js';

export { dashName, withLeaderLook } from './LabelStylesSection/shared.js';

/** Config-panel section for the label styles (`config.labelStyles`, #969):
 *  the looks a `::label` on a picture takes, by its own `style` or its
 *  anchor's. No label style is built in, so the list starts empty. */
export const LabelStylesSection = memo(function LabelStylesSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.labelStyles);
  const paragraphStylesRaw = useSandboxSelector((s) => s.config.paragraphStyles);
  const bodyTextRaw = useSandboxSelector((s) => s.config.bodyText);
  const bodyText = resolveBodyTextConfig(bodyTextRaw);
  const styles: LabelStyle[] = raw ?? [];
  const usage = useLabelStyleUsage();
  const chapters = useBookTexts();
  const resources = useSandboxSelector((s) => s.resources);
  const activeChapterId = useSandboxSelector((s) => s.activeChapterId);
  const [renamedNote, setRenamedNote] = useState<{ id: string; text: string } | null>(null);

  const write = (next: LabelStyle[]) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { labelStyles: next.length > 0 ? next : undefined } });
  };

  const updateStyle = (id: string, partial: Partial<LabelStyle>) => {
    write(styles.map((s) => (s.id === id ? { ...s, ...partial } : s)));
  };

  const resetStyleField = (id: string, field: keyof LabelStyle) => {
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
    moveCardState('labelStyles', id, nextId);
    // The anchors and label lines that name the old id follow it (#994).
    const done = applyLabelStyleRename(dispatch, styles, id, nextId, { chapters, resources: resources ?? [], activeChapterId });
    setRenamedNote(
      done.anchors + done.lines > 0
        ? { id: nextId, text: labels.labelStyleRenamed.replace('__anchors__', String(done.anchors)).replace('__lines__', String(done.lines)) }
        : null,
    );
  };

  const removeStyle = (id: string) => {
    write(styles.filter((s) => s.id !== id));
  };

  return (
    <CollapsibleSection
      title={labels.labelStylesSection}
      sectionId="labelStyles"
      hasOverrides={styles.length > 0}
      onReset={() => dispatch({ type: 'UPDATE_CONFIG', payload: { labelStyles: undefined } })}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.labelStylesResetConfirm}
    >
      {styles.length === 0 && (
        <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>
          {labels.labelStylesEmpty}
        </p>
      )}
      <ItemCardListActions list="labelStyles" ids={styles.map((s) => s.id)} />
      {styles.map((style) => (
        <LabelStyleCard
          key={style.id}
          style={style}
          paragraphStyles={paragraphStylesRaw ?? []}
          bodyFamily={bodyText.fontFamily}
          bodyWeight={bodyText.fontWeight}
          bodyColor={bodyText.color}
          otherIds={new Set(styles.filter((s) => s.id !== style.id).map((s) => s.id))}
          usage={usage.get(style.id)}
          renamed={renamedNote?.id === style.id ? renamedNote.text : null}
          onChange={(partial) => updateStyle(style.id, partial)}
          onResetField={(field) => resetStyleField(style.id, field)}
          onRename={(nextId) => renameStyle(style.id, nextId)}
          onRemove={() => removeStyle(style.id)}
        />
      ))}
      <Button variant="outline" size="xs" icon={<Plus size={12} />} onClick={() => { const id = nextStyleId(styles); openCard('labelStyles', id); write([...styles, { id, name: labels.labelStyleNewName }]); }} className="mt-1">
        {labels.labelStyleAdd}
      </Button>
    </CollapsibleSection>
  );
});
