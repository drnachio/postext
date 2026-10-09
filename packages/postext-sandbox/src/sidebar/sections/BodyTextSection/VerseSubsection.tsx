'use client';

import { DEFAULT_VERSE_CONFIG, dimensionsEqual } from 'postext';
import type { BodyTextConfig, ResolvedBodyTextConfig, VerseConfig } from 'postext';
import { CollapsibleSection, DimensionInput, NumberInput, SelectInput, TextInput } from '../../../controls';
import type { useSandboxLabels } from '../../../context/SandboxContext';
import { INDENT_UNITS } from './constants';

interface Props {
  bodyText: ResolvedBodyTextConfig;
  raw: BodyTextConfig | undefined;
  updateBodyText: (partial: Partial<BodyTextConfig>) => void;
  labels: ReturnType<typeof useSandboxLabels>;
}

const D = DEFAULT_VERSE_CONFIG;

/** How `:::verse` poems are set line by line (#620): `bodyText.verse`.
 *  A poem's fence names any of these for itself. */
export function VerseSubsection({ bodyText, raw, updateBodyText, labels }: Props) {
  const verse = bodyText.verse;
  const update = (partial: Partial<VerseConfig>) => {
    updateBodyText({ verse: { ...raw?.verse, ...partial } });
  };
  const reset = (field: keyof VerseConfig) => {
    if (!raw?.verse) return;
    const next = { ...raw.verse };
    delete next[field];
    updateBodyText({ verse: Object.keys(next).length > 0 ? next : undefined });
  };

  return (
    <CollapsibleSection title={labels.bodyGroupVerse} sectionId="bodyText-verse" variant="subsection">
      <SelectInput
        label={labels.bodyVerseLayout}
        value={verse.layout}
        options={[
          { value: 'auto', label: labels.bodyVerseLayoutAuto },
          { value: 'bayt', label: labels.bodyVerseLayoutBayt },
        ]}
        onChange={(value) => update({ layout: value as VerseConfig['layout'] })}
        tooltip={labels.bodyVerseLayoutTooltip}
        isDefault={verse.layout === D.layout}
        onReset={() => reset('layout')}
      />
      <DimensionInput
        label={labels.bodyVerseIndentStep}
        value={verse.indentStep}
        onChange={(indentStep) => update({ indentStep })}
        min={0}
        step={0.25}
        tooltip={labels.bodyVerseIndentStepTooltip}
        isDefault={dimensionsEqual(verse.indentStep, D.indentStep)}
        onReset={() => reset('indentStep')}
        units={INDENT_UNITS}
      />
      <SelectInput
        label={labels.bodyVerseTurnover}
        value={verse.turnover}
        options={[
          { value: 'hang', label: labels.bodyVerseTurnoverHang },
          { value: 'right', label: labels.bodyVerseTurnoverRight },
        ]}
        onChange={(value) => update({ turnover: value as VerseConfig['turnover'] })}
        tooltip={labels.bodyVerseTurnoverTooltip}
        isDefault={verse.turnover === D.turnover}
        onReset={() => reset('turnover')}
        variant="segmented"
      />
      {verse.turnover === 'hang' ? (
        <DimensionInput
          label={labels.bodyVerseHang}
          value={verse.hang}
          onChange={(hang) => update({ hang })}
          min={0}
          step={0.25}
          tooltip={labels.bodyVerseHangTooltip}
          isDefault={dimensionsEqual(verse.hang, D.hang)}
          onReset={() => reset('hang')}
          units={INDENT_UNITS}
        />
      ) : (
        <TextInput
          label={labels.bodyVerseTurnoverMark}
          value={verse.turnoverMark}
          onChange={(turnoverMark) => update({ turnoverMark })}
          tooltip={labels.bodyVerseTurnoverMarkTooltip}
          isDefault={verse.turnoverMark === D.turnoverMark}
          onReset={() => reset('turnoverMark')}
          widthCh={4}
        />
      )}
      <NumberInput
        label={labels.bodyVerseStanzaSpace}
        value={verse.stanzaSpace}
        onChange={(stanzaSpace) => update({ stanzaSpace })}
        min={0}
        max={4}
        step={0.5}
        tooltip={labels.bodyVerseStanzaSpaceTooltip}
        isDefault={verse.stanzaSpace === D.stanzaSpace}
        onReset={() => reset('stanzaSpace')}
      />
      <NumberInput
        label={labels.bodyVerseKeepStanzas}
        value={verse.keepStanzas}
        onChange={(keepStanzas) => update({ keepStanzas: Math.max(0, Math.round(keepStanzas)) })}
        min={0}
        max={20}
        step={1}
        tooltip={labels.bodyVerseKeepStanzasTooltip}
        isDefault={verse.keepStanzas === D.keepStanzas}
        onReset={() => reset('keepStanzas')}
      />
    </CollapsibleSection>
  );
}
