'use client';

import type { ColorValue, Dimension, DimensionUnit, DesignTextElement, ParagraphDropCap } from 'postext';
import { useSandboxLabels } from '../../context/SandboxContext';
import { ColorPicker, DimensionInput, FontPicker, NestedGroup, NumberInput, SelectInput, ToggleSwitch } from '../../controls';

const TEXT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em', 'rem'];
const GAP_UNITS: DimensionUnit[] = ['pt', 'mm', 'cm', 'in', 'em', 'px'];
const ZERO: Dimension = { value: 0, unit: 'pt' };
/** A body drop cap's default gap (#623): 0.15 em of the text. */
const BODY_GAP: Dimension = { value: 0.15, unit: 'em' };

type DesignDropCap = NonNullable<DesignTextElement['dropCap']>;

interface Inherited {
  fontFamily: string;
  fontWeight: number;
  color: ColorValue;
}

interface CommonProps {
  /** What the initial takes when it sets nothing: the text's face, weight
   *  and colour. */
  inherited: Inherited;
  /** Id stem of the colour picker. */
  fieldId: string;
}

/**
 * The fields of a drop cap: lines, face, weight, size, colour and gap. A
 * design text's drop cap (`kind: 'design'`) has those alone; a body
 * paragraph's (#623) adds the lines it sinks, the letters it takes, its
 * slant, the opening mark, the lead-in, what a short paragraph does and,
 * in a paragraph style, whether it opens every paragraph. A field reset
 * drops just its key: the drop cap stays on until its switch is turned off.
 */
export function DropCapFields(props:
  | (CommonProps & { kind: 'design'; value: DesignDropCap; onChange: (next: DesignDropCap) => void })
  | (CommonProps & { kind: 'body'; value: ParagraphDropCap; onChange: (next: ParagraphDropCap) => void; each?: boolean })) {
  const labels = useSandboxLabels();
  const { inherited, fieldId } = props;
  const value = props.value as ParagraphDropCap;
  const body = props.kind === 'body';
  const set = (partial: Partial<ParagraphDropCap>) => (props.onChange as (next: ParagraphDropCap) => void)({ ...value, ...partial });
  const reset = (field: keyof ParagraphDropCap) => {
    const next: ParagraphDropCap = { ...value };
    delete next[field];
    (props.onChange as (next: ParagraphDropCap) => void)(next);
  };
  const lines = value.lines ?? (body ? 3 : 2);
  const leadInMode = value.leadIn?.words === undefined ? 'none' : value.leadIn.words === 'line' ? 'line' : 'words';
  const setLeadIn = (partial: Partial<NonNullable<ParagraphDropCap['leadIn']>>) => {
    const next = { ...value.leadIn, ...partial };
    if (next.words === undefined) reset('leadIn');
    else set({ leadIn: next });
  };
  return (
    <NestedGroup>
      <NumberInput
        label={labels.headerFooterElementDropCapLines}
        value={lines}
        onChange={(v) => set({ lines: v })}
        min={1}
        max={10}
        step={1}
        isDefault={value.lines === undefined}
        onReset={() => reset('lines')}
      />
      {body && (
        <NumberInput
          label={labels.dropCapSink}
          value={value.sink ?? lines}
          onChange={(v) => set({ sink: v })}
          min={1}
          max={lines}
          step={1}
          tooltip={labels.dropCapSinkTooltip}
          isDefault={value.sink === undefined}
          onReset={() => reset('sink')}
        />
      )}
      {body && (
        <NumberInput
          label={labels.dropCapCharacters}
          value={value.characters ?? 1}
          onChange={(v) => set({ characters: v })}
          min={1}
          max={6}
          step={1}
          tooltip={labels.dropCapCharactersTooltip}
          isDefault={value.characters === undefined}
          onReset={() => reset('characters')}
        />
      )}
      <FontPicker
        label={labels.headerFooterElementDropCapFont}
        value={value.fontFamily ?? inherited.fontFamily}
        onChange={(v) => set({ fontFamily: v })}
        isDefault={value.fontFamily === undefined}
        onReset={() => reset('fontFamily')}
        searchPlaceholder={labels.headingFontSearch}
        noResultsLabel={labels.headingFontNoResults}
      />
      <NumberInput
        label={labels.headerFooterElementDropCapWeight}
        value={value.fontWeight ?? inherited.fontWeight}
        onChange={(v) => set({ fontWeight: v })}
        min={100}
        max={900}
        step={10}
        isDefault={value.fontWeight === undefined}
        onReset={() => reset('fontWeight')}
      />
      {body && (
        <ToggleSwitch
          label={labels.dropCapItalic}
          checked={value.italic === true}
          onChange={(v) => (v ? set({ italic: true }) : reset('italic'))}
          isDefault={value.italic === undefined}
          onReset={() => reset('italic')}
        />
      )}
      <DimensionInput
        label={labels.headerFooterElementDropCapSize}
        value={value.fontSize ?? ZERO}
        onChange={(dim: Dimension) => set({ fontSize: dim })}
        min={0}
        step={0.5}
        units={TEXT_SIZE_UNITS}
        tooltip={body ? labels.dropCapSizeTooltip : labels.headerFooterElementDropCapSizeTooltip}
        isDefault={value.fontSize === undefined}
        onReset={() => reset('fontSize')}
      />
      <ColorPicker
        label={labels.headerFooterElementDropCapColor}
        value={value.color ?? inherited.color}
        onChange={(c: ColorValue) => set({ color: c })}
        isDefault={value.color === undefined}
        onReset={() => reset('color')}
        fieldId={fieldId}
      />
      <DimensionInput
        label={labels.headerFooterElementDropCapGap}
        value={value.gap ?? (body ? BODY_GAP : ZERO)}
        onChange={(dim: Dimension) => set({ gap: dim })}
        min={0}
        step={0.1}
        units={GAP_UNITS}
        isDefault={value.gap === undefined}
        onReset={() => reset('gap')}
      />
      {body && (
        <SelectInput
          label={labels.dropCapPunctuation}
          value={value.punctuation ?? 'with-cap'}
          options={[
            { value: 'with-cap', label: labels.dropCapPunctuationWithCap },
            { value: 'hang', label: labels.dropCapPunctuationHang },
            { value: 'text', label: labels.dropCapPunctuationText },
          ]}
          onChange={(v) => set({ punctuation: v as ParagraphDropCap['punctuation'] })}
          tooltip={labels.dropCapPunctuationTooltip}
          isDefault={value.punctuation === undefined}
          onReset={() => reset('punctuation')}
        />
      )}
      {body && (
        <SelectInput
          label={labels.dropCapLeadIn}
          value={leadInMode}
          options={[
            { value: 'none', label: labels.dropCapLeadInNone },
            { value: 'words', label: labels.dropCapLeadInWords },
            { value: 'line', label: labels.dropCapLeadInLine },
          ]}
          onChange={(v) => (v === 'none' ? reset('leadIn') : setLeadIn({ words: v === 'line' ? 'line' : typeof value.leadIn?.words === 'number' ? value.leadIn.words : 3 }))}
          tooltip={labels.dropCapLeadInTooltip}
          isDefault={value.leadIn === undefined}
          onReset={() => reset('leadIn')}
        />
      )}
      {body && leadInMode === 'words' && (
        <NumberInput
          label={labels.dropCapLeadInCount}
          value={typeof value.leadIn?.words === 'number' ? value.leadIn.words : 3}
          onChange={(v) => setLeadIn({ words: v })}
          min={1}
          max={12}
          step={1}
          isDefault={false}
        />
      )}
      {body && leadInMode !== 'none' && (
        <SelectInput
          label={labels.dropCapLeadInCase}
          value={value.leadIn?.uppercase ? 'uppercase' : 'smallCaps'}
          options={[
            { value: 'smallCaps', label: labels.dropCapLeadInSmallCaps },
            { value: 'uppercase', label: labels.dropCapLeadInUppercase },
          ]}
          onChange={(v) => setLeadIn(v === 'uppercase' ? { uppercase: true, smallCaps: false } : { uppercase: undefined, smallCaps: undefined })}
          isDefault={!value.leadIn?.uppercase}
          onReset={() => setLeadIn({ uppercase: undefined, smallCaps: undefined })}
        />
      )}
      {body && (
        <SelectInput
          label={labels.dropCapShortParagraph}
          value={value.shortParagraph ?? 'reserve'}
          options={[
            { value: 'reserve', label: labels.dropCapShortReserve },
            { value: 'shrink', label: labels.dropCapShortShrink },
            { value: 'skip', label: labels.dropCapShortSkip },
          ]}
          onChange={(v) => set({ shortParagraph: v as ParagraphDropCap['shortParagraph'] })}
          tooltip={labels.dropCapShortParagraphTooltip}
          isDefault={value.shortParagraph === undefined}
          onReset={() => reset('shortParagraph')}
        />
      )}
      {body && props.kind === 'body' && props.each && (
        <ToggleSwitch
          label={labels.dropCapEach}
          checked={value.each === true}
          onChange={(v) => (v ? set({ each: true }) : reset('each'))}
          tooltip={labels.dropCapEachTooltip}
          isDefault={value.each === undefined}
          onReset={() => reset('each')}
        />
      )}
    </NestedGroup>
  );
}
