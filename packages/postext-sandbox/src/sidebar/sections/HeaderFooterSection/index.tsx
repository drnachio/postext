'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext';
import { resolveHeaderFooterConfig } from 'postext';
import type { HeaderFooterSlot } from 'postext';
import { CollapsibleSection } from '../../../controls';
import { SlotEditor } from './SlotEditor';

type SlotKey = 'header' | 'footer';

export const HeaderFooterSection = memo(function HeaderFooterSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const rawHeader = useSandboxSelector((s) => s.config.header);
  const rawFooter = useSandboxSelector((s) => s.config.footer);

  const header = resolveHeaderFooterConfig(rawHeader, 'header');
  const footer = resolveHeaderFooterConfig(rawFooter, 'footer');

  const updateSlot = (key: SlotKey, slot: HeaderFooterSlot | undefined) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { [key]: slot } });
  };

  const resetAll = () => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { header: undefined, footer: undefined } });
  };

  const hasOverrides = rawHeader !== undefined || rawFooter !== undefined;

  return (
    <CollapsibleSection
      title={labels.headerFooter}
      sectionId="headerFooter"
      onReset={resetAll}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <SlotSubSection
        slotKey="header"
        title={labels.header}
        raw={rawHeader}
        resolved={header}
        onUpdate={(next) => updateSlot('header', next)}
      />
      <SlotSubSection
        slotKey="footer"
        title={labels.footer}
        raw={rawFooter}
        resolved={footer}
        onUpdate={(next) => updateSlot('footer', next)}
      />
    </CollapsibleSection>
  );
});

function SlotSubSection({
  slotKey,
  title,
  raw,
  resolved,
  onUpdate,
}: {
  slotKey: SlotKey;
  title: string;
  raw: HeaderFooterSlot | undefined;
  resolved: ReturnType<typeof resolveHeaderFooterConfig>;
  onUpdate: (slot: HeaderFooterSlot | undefined) => void;
}) {
  const labels = useSandboxLabels();

  const hasOverrides = raw !== undefined;
  const resetSlot = () => onUpdate(undefined);

  return (
    <CollapsibleSection
      title={title}
      sectionId={`headerFooter-${slotKey}`}
      onReset={resetSlot}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <SlotEditor
        slotKey={slotKey}
        raw={raw}
        resolved={resolved}
        onUpdate={onUpdate}
      />
    </CollapsibleSection>
  );
}
