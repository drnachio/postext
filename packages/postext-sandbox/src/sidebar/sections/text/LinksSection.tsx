'use client';

// External links in print (#1302): what a printed page shows of the
// address a link points at — nothing, the address in parentheses, or a
// note with the address, a QR code or both. The fields a choice makes moot
// stay hidden: the note settings without notes, the code's without a code.

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { DEFAULT_LINKS_CONFIG, dimensionsEqual, resolveLinksConfig } from 'postext';
import type { ColorValue, DimensionUnit, LinkQrConfig, LinksConfig } from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  NestedGroup,
  NumberInput,
  SelectInput,
} from '../../../controls/index.js';

const QR_SIZE_UNITS: DimensionUnit[] = ['mm', 'cm', 'in', 'pt'];
const GAP_UNITS: DimensionUnit[] = ['em', 'pt', 'mm'];

const D = DEFAULT_LINKS_CONFIG;

const FALLBACK_COLOR: ColorValue = { model: 'rgb', hex: '#000000' };

export const LinksSection = memo(function LinksSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.links);
  // The code's dark modules follow the notes' text colour when unset.
  const notesColor = useSandboxSelector((s) => s.config.footnotes?.color ?? s.config.bodyText?.color);
  const links = resolveLinksConfig(raw);

  const write = (next: LinksConfig | undefined) => {
    const empty = !next || Object.keys(next).length === 0;
    dispatch({ type: 'UPDATE_CONFIG', payload: { links: empty ? undefined : next } });
  };
  const update = (partial: Partial<LinksConfig>) => write({ ...raw, ...partial });
  const resetField = (field: keyof LinksConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    write(next);
  };
  const updateQr = (partial: Partial<LinkQrConfig>) => update({ qr: { ...raw?.qr, ...partial } });
  const resetQrField = (field: keyof LinkQrConfig) => {
    if (!raw?.qr) return;
    const next = { ...raw.qr };
    delete next[field];
    if (Object.keys(next).length === 0) resetField('qr');
    else update({ qr: next });
  };

  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;
  const printed = links.print !== 'none';
  const notes = links.print === 'notes';
  const qr = notes && links.show !== 'url';

  return (
    <CollapsibleSection
      title={labels.linksSection}
      sectionId="links"
      onReset={() => write(undefined)}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <SelectInput
        label={labels.linksPrint}
        value={links.print}
        variant="segmented"
        stacked
        options={[
          { value: 'none', label: labels.linksPrintNone },
          { value: 'inline', label: labels.linksPrintInline },
          { value: 'notes', label: labels.linksPrintNotes },
        ]}
        onChange={(v) => update({ print: v as LinksConfig['print'] })}
        tooltip={labels.linksPrintTooltip}
        isDefault={links.print === D.print}
        onReset={() => resetField('print')}
      />
      {notes && (
        <SelectInput
          label={labels.linksShow}
          value={links.show}
          variant="segmented"
          stacked
          options={[
            { value: 'url', label: labels.linksShowUrl },
            { value: 'qr', label: labels.linksShowQr },
            { value: 'both', label: labels.linksShowBoth },
          ]}
          onChange={(v) => update({ show: v as LinksConfig['show'] })}
          tooltip={labels.linksShowTooltip}
          isDefault={links.show === D.show}
          onReset={() => resetField('show')}
        />
      )}
      {printed && (
        <SelectInput
          label={labels.linksUrlDisplay}
          value={links.urlDisplay}
          variant="segmented"
          stacked
          options={[
            { value: 'full', label: labels.linksUrlDisplayFull },
            { value: 'short', label: labels.linksUrlDisplayShort },
          ]}
          onChange={(v) => update({ urlDisplay: v as LinksConfig['urlDisplay'] })}
          tooltip={labels.linksUrlDisplayTooltip}
          isDefault={links.urlDisplay === D.urlDisplay}
          onReset={() => resetField('urlDisplay')}
        />
      )}
      {notes && (
        <SelectInput
          label={labels.linksRepeat}
          value={links.repeat}
          variant="segmented"
          stacked
          options={[
            { value: 'every', label: labels.linksRepeatEvery },
            { value: 'first', label: labels.linksRepeatFirst },
          ]}
          onChange={(v) => update({ repeat: v as LinksConfig['repeat'] })}
          tooltip={labels.linksRepeatTooltip}
          isDefault={links.repeat === D.repeat}
          onReset={() => resetField('repeat')}
        />
      )}
      {printed && (
        <SelectInput
          label={labels.linksVisibleUrls}
          value={links.visibleUrls}
          variant="segmented"
          stacked
          options={[
            { value: 'skip', label: labels.linksVisibleUrlsSkip },
            { value: 'note', label: labels.linksVisibleUrlsNote },
          ]}
          onChange={(v) => update({ visibleUrls: v as LinksConfig['visibleUrls'] })}
          tooltip={labels.linksVisibleUrlsTooltip}
          isDefault={links.visibleUrls === D.visibleUrls}
          onReset={() => resetField('visibleUrls')}
        />
      )}
      {qr && (
        <NestedGroup>
          <DimensionInput
            label={labels.linksQrSize}
            value={links.qr.size}
            onChange={(dim) => updateQr({ size: dim })}
            min={1}
            step={1}
            tooltip={labels.linksQrSizeTooltip}
            isDefault={dimensionsEqual(links.qr.size, D.qr.size)}
            onReset={() => resetQrField('size')}
            units={QR_SIZE_UNITS}
          />
          <SelectInput
            label={labels.linksQrErrorCorrection}
            value={links.qr.errorCorrection}
            options={[
              { value: 'L', label: labels.linksQrErrorCorrectionL },
              { value: 'M', label: labels.linksQrErrorCorrectionM },
              { value: 'Q', label: labels.linksQrErrorCorrectionQ },
              { value: 'H', label: labels.linksQrErrorCorrectionH },
            ]}
            onChange={(v) => updateQr({ errorCorrection: v as LinkQrConfig['errorCorrection'] })}
            tooltip={labels.linksQrErrorCorrectionTooltip}
            isDefault={links.qr.errorCorrection === D.qr.errorCorrection}
            onReset={() => resetQrField('errorCorrection')}
          />
          <NumberInput
            label={labels.linksQrQuietZone}
            value={links.qr.quietZone}
            onChange={(v) => updateQr({ quietZone: Math.round(v) })}
            min={0}
            max={8}
            step={1}
            tooltip={labels.linksQrQuietZoneTooltip}
            isDefault={links.qr.quietZone === D.qr.quietZone}
            onReset={() => resetQrField('quietZone')}
          />
          <ColorPicker
            label={labels.linksQrColor}
            value={links.qr.color ?? notesColor ?? FALLBACK_COLOR}
            onChange={(color) => updateQr({ color })}
            tooltip={labels.linksQrColorTooltip}
            isDefault={raw?.qr?.color === undefined}
            onReset={() => resetQrField('color')}
            fieldId="links-qr-color"
          />
          <SelectInput
            label={labels.linksQrSide}
            value={links.qr.side}
            variant="segmented"
            stacked
            options={[
              { value: 'start', label: labels.linksQrSideStart },
              { value: 'end', label: labels.linksQrSideEnd },
            ]}
            onChange={(v) => updateQr({ side: v as LinkQrConfig['side'] })}
            tooltip={labels.linksQrSideTooltip}
            isDefault={links.qr.side === D.qr.side}
            onReset={() => resetQrField('side')}
          />
          <DimensionInput
            label={labels.linksQrGap}
            value={links.qr.gap}
            onChange={(dim) => updateQr({ gap: dim })}
            min={0}
            step={0.1}
            tooltip={labels.linksQrGapTooltip}
            isDefault={dimensionsEqual(links.qr.gap, D.qr.gap)}
            onReset={() => resetQrField('gap')}
            units={GAP_UNITS}
          />
        </NestedGroup>
      )}
    </CollapsibleSection>
  );
});
