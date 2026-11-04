'use client';

// External links in print (#1302): what a printed page shows of the
// address a link points at — nothing, the address in parentheses, or a
// note with the address, a QR code or both. The fields a choice makes moot
// stay hidden: the note settings without notes, the code's without a code.
// Then how a link looks (#1402): its colour and underline, in the outputs
// ticked below them.

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { DEFAULT_LINKS_CONFIG, DEFAULT_LINK_STYLE_OUTPUTS, LINK_STYLE_OUTPUTS, dimensionsEqual, resolveLinksConfig, resolveLinkStyleConfig } from 'postext';
import type { ColorValue, DimensionUnit, LinkQrConfig, LinksConfig, LinkStyleConfig, LinkStyleOutput } from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FieldGroup,
  NestedGroup,
  NumberInput,
  SelectInput,
  ToggleSwitch,
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
  // A link without a colour of its own takes the text's.
  const textColor = useSandboxSelector((s) => s.config.bodyText?.color);
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

  const style = resolveLinkStyleConfig(raw?.style ?? {});
  const updateStyle = (partial: Partial<LinkStyleConfig>) => update({ style: { ...raw?.style, ...partial } });
  const resetStyleField = (field: keyof LinkStyleConfig) => {
    if (!raw?.style) return;
    const next = { ...raw.style };
    delete next[field];
    if (Object.keys(next).length === 0) resetField('style');
    else update({ style: next });
  };
  const outputLabels: Record<LinkStyleOutput, string> = {
    canvas: labels.linksOutputCanvas,
    folio: labels.linksOutputFolio,
    pdf: labels.linksOutputPdf,
    html: labels.linksOutputHtml,
    epub: labels.linksOutputEpub,
    scorm: labels.linksOutputScorm,
  };
  const setOutput = (output: LinkStyleOutput, on: boolean) => {
    const next = LINK_STYLE_OUTPUTS.filter((o) => (o === output ? on : style.outputs.includes(o)));
    const isDefault = next.length === DEFAULT_LINK_STYLE_OUTPUTS.length && next.every((o) => DEFAULT_LINK_STYLE_OUTPUTS.includes(o));
    if (isDefault) resetStyleField('outputs');
    else updateStyle({ outputs: next });
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
      <FieldGroup title={labels.linksGroupPrint} description={labels.linksGroupPrintDescription}>
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
      </FieldGroup>
      <FieldGroup title={labels.linksGroupLook} description={labels.linksGroupLookDescription}>
        <ColorPicker
          label={labels.linksStyleColor}
          value={raw?.style?.color ?? textColor ?? FALLBACK_COLOR}
          onChange={(color) => updateStyle({ color })}
          tooltip={labels.linksStyleColorTooltip}
          isDefault={raw?.style?.color === undefined}
          onReset={() => resetStyleField('color')}
          fieldId="links-style-color"
        />
        <SelectInput
          label={labels.linksStyleUnderline}
          value={style.underline}
          variant="segmented"
          stacked
          options={[
            { value: 'none', label: labels.linksStyleUnderlineNone },
            { value: 'solid', label: labels.linksStyleUnderlineSolid },
            { value: 'dotted', label: labels.linksStyleUnderlineDotted },
            { value: 'dashed', label: labels.linksStyleUnderlineDashed },
          ]}
          onChange={(v) => updateStyle({ underline: v as LinkStyleConfig['underline'] })}
          tooltip={labels.linksStyleUnderlineTooltip}
          isDefault={style.underline === 'none'}
          onReset={() => resetStyleField('underline')}
        />
        {style.underline !== 'none' && (
          <ColorPicker
            label={labels.linksStyleUnderlineColor}
            value={raw?.style?.underlineColor ?? raw?.style?.color ?? textColor ?? FALLBACK_COLOR}
            onChange={(color) => updateStyle({ underlineColor: color })}
            tooltip={labels.linksStyleUnderlineColorTooltip}
            isDefault={raw?.style?.underlineColor === undefined}
            onReset={() => resetStyleField('underlineColor')}
            fieldId="links-style-underline-color"
          />
        )}
      </FieldGroup>
      <FieldGroup title={labels.linksGroupOutputs} description={labels.linksGroupOutputsDescription}>
        {LINK_STYLE_OUTPUTS.map((output) => (
          <ToggleSwitch
            key={output}
            label={outputLabels[output]}
            checked={style.outputs.includes(output)}
            onChange={(on) => setOutput(output, on)}
            isDefault={raw?.style?.outputs === undefined}
            onReset={() => resetStyleField('outputs')}
          />
        ))}
      </FieldGroup>
    </CollapsibleSection>
  );
});
