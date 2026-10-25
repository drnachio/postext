'use client';

import { memo, useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import type {
  CalloutStyleConfig,
  ColorValue,
  DimensionUnit,
  ExerciseAnswersStyle,
  ExerciseArithmeticStyle,
  ExerciseAreaStyle,
  ExerciseBankStyle,
  ExerciseBlankStyle,
  ExerciseDigitalStyle,
  ExerciseGridStyle,
  ExerciseIcon,
  ExerciseInstructionStyle,
  ExerciseLevelStyle,
  ExerciseMatchStyle,
  ExerciseNumberShape,
  ExerciseNumberStyle,
  ExerciseOptionLabels,
  ExerciseOptionsStyle,
  ExerciseSolutionsConfig,
  ExerciseStyleConfig,
  ExerciseTrueFalseStyle,
  Resource,
  ResolvedBodyTextConfig,
  ResolvedExerciseStyle,
  ResolvedExercisesConfig,
  ResourceCounterFormat,
  ResourceCounterReset,
} from 'postext';
import {
  DEFAULT_EXERCISE_STYLES,
  DEFAULT_MAIN_COLOR,
  exerciseWords,
  resolveBodyTextConfig,
  resolveColorValue,
  dimensionToPx,
  resolveExerciseStylesConfig,
  resolveExercisesConfig,
} from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxResources, useSandboxSelector } from '../../context/SandboxContext.js';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FontPicker,
  ItemCard,
  ItemCardListActions,
  NumberInput,
  SelectInput,
  TextInput,
  ToggleSwitch,
  moveCardState,
  openCard,
} from '../../controls/index.js';
import { FieldRow } from '../../controls/FieldRow.js';
import { Button, ConfirmPopover, IconButton } from '../../ui/index.js';
import { SearchScope } from '../search/SearchScope.js';
import { useBookTexts } from '../../frameStyles/useBookTexts.js';
import { applyExerciseStyleRename, planExerciseStyleRename } from '../../frameStyles/exerciseRefs.js';
import { counterFormatOptions, resetOnOptions } from '../settings/counterOptions.js';
import { AssessmentFields, SolutionsFields, boxStyleOptions, exerciseLocaleOf } from './exerciseFields.js';

const EM_UNITS: DimensionUnit[] = ['em', 'pt', 'mm'];
const LINE_UNITS: DimensionUnit[] = ['pt', 'px'];
const WHITE: ColorValue = { hex: '#ffffff', model: 'hex' };

const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs';
const inputStyle = { borderColor: 'var(--pt-control-border)', color: 'var(--foreground)' } as const;

/** Turn free text into a `:::exercise{style="…"}`-friendly id. */
function slugifyStyleId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** The parts of a style that are objects of their own. */
type Part = 'number' | 'instruction' | 'options' | 'blank' | 'trueFalse' | 'match' | 'bank' | 'area' | 'grid' | 'arithmetic' | 'level' | 'answers' | 'solutions' | 'digital';
type PartConfig<P extends Part> = NonNullable<ExerciseStyleConfig[P]>;

interface ExerciseStyleCardProps {
  style: ExerciseStyleConfig;
  resolved: ResolvedExerciseStyle;
  book: ResolvedExercisesConfig;
  bodyText: ResolvedBodyTextConfig;
  mainColor: ColorValue;
  /** The word "Exercise" in the document language. */
  word: string;
  calloutStyles: readonly CalloutStyleConfig[] | undefined;
  iconResources: Resource[];
  otherIds: Set<string>;
  /** Styles this one may be based on (no loop). */
  parents: { id: string; name: string }[];
  stored: boolean;
  onChange: (partial: Partial<ExerciseStyleConfig>) => void;
  onResetField: (field: keyof ExerciseStyleConfig) => void;
  onRename: (nextId: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

/** One exercise style: its id and name, the style it is based on, its box,
 *  and a group per part (number, instruction, options, blanks…). */
function ExerciseStyleCard(props: ExerciseStyleCardProps) {
  const { style, resolved, book, bodyText, mainColor, word, calloutStyles, iconResources, otherIds, parents, stored, onChange, onResetField, onRename, onDuplicate, onRemove } = props;
  const labels = useSandboxLabels();
  const [idDraft, setIdDraft] = useState(style.id);
  const draftSlug = slugifyStyleId(idDraft);
  const idTaken = draftSlug.length > 0 && draftSlug !== style.id && otherIds.has(draftSlug);
  const idEmpty = draftSlug.length === 0;
  const sectionId = `exerciseStyles.${style.id}`;
  const fieldId = `exerciseStyle-${style.id}`;

  const commitId = () => {
    if (idEmpty || idTaken) {
      setIdDraft(style.id);
      return;
    }
    setIdDraft(draftSlug);
    if (draftSlug !== style.id) onRename(draftSlug);
  };

  const unset = (field: keyof ExerciseStyleConfig) => style[field] === undefined;
  /** A part's fields merge into what the style sets of it; a reset drops
   *  the field, and the part when nothing is left. */
  const setPart = <P extends Part>(part: P, partial: Partial<PartConfig<P>>) =>
    onChange({ [part]: { ...(style[part] ?? {}), ...partial } } as Partial<ExerciseStyleConfig>);
  const resetPart = <P extends Part>(part: P, field: keyof PartConfig<P>) => {
    const current = style[part] as Record<string, unknown> | undefined;
    if (!current) return;
    const next = { ...current };
    delete next[field as string];
    if (Object.keys(next).length > 0) onChange({ [part]: next } as Partial<ExerciseStyleConfig>);
    else onResetField(part);
  };
  const partUnset = <P extends Part>(part: P, field: keyof PartConfig<P>) => (style[part] as PartConfig<P> | undefined)?.[field] === undefined;
  /** The row props of a part's field: muted while unset, reset to unset. */
  const row = <P extends Part>(part: P, field: keyof PartConfig<P>) => ({ isDefault: partUnset(part, field), onReset: () => resetPart(part, field) });

  const number = (partial: Partial<ExerciseNumberStyle>) => setPart('number', partial);
  const instruction = (partial: Partial<ExerciseInstructionStyle>) => setPart('instruction', partial);
  const options = (partial: Partial<ExerciseOptionsStyle>) => setPart('options', partial);
  const blank = (partial: Partial<ExerciseBlankStyle>) => setPart('blank', partial);
  const trueFalse = (partial: Partial<ExerciseTrueFalseStyle>) => setPart('trueFalse', partial);
  const match = (partial: Partial<ExerciseMatchStyle>) => setPart('match', partial);
  const bank = (partial: Partial<ExerciseBankStyle>) => setPart('bank', partial);
  const area = (partial: Partial<ExerciseAreaStyle>) => setPart('area', partial);
  const grid = (partial: Partial<ExerciseGridStyle>) => setPart('grid', partial);
  const arithmetic = (partial: Partial<ExerciseArithmeticStyle>) => setPart('arithmetic', partial);
  const level = (partial: Partial<ExerciseLevelStyle>) => setPart('level', partial);
  const answers = (partial: Partial<ExerciseAnswersStyle>) => setPart('answers', partial);
  const digital = (partial: Partial<ExerciseDigitalStyle>) => setPart('digital', partial);

  const n = resolved.number;
  const labelMode = style.number?.label === true ? 'word' : typeof style.number?.label === 'string' ? 'custom' : 'none';
  const blankWidthMode = typeof resolved.blank.width === 'object' ? 'fixed' : resolved.blank.width;
  const counterFormats = counterFormatOptions(labels);
  const textColor = bodyText.color;

  return (
    <SearchScope title={`${style.name ?? ''} ${style.id}`} overridden={stored}>
    <ItemCard
      list="exerciseStyles"
      id={style.id}
      styleId={style.id}
      title={style.name || style.id}
      subtitle={style.name && style.name !== style.id ? style.id : undefined}
      actions={
        <>
          <IconButton label={labels.exerciseStyleDuplicate} icon={<Copy size={13} />} onClick={onDuplicate} />
          <ConfirmPopover message={labels.exerciseStyleDeleteConfirm} onConfirm={onRemove}>
            {({ open }) => (
              <IconButton label={labels.exerciseStyleDelete} icon={<Trash2 size={13} />} destructive onClick={open} />
            )}
          </ConfirmPopover>
        </>
      }
    >
      <div className="mb-2 flex flex-col gap-2">
        <FieldRow
          stacked
          label={labels.idLabel} tooltip={labels.styleIdHelp}
          hint={idTaken ? labels.exerciseStyleIdHintDuplicate : labels.exerciseStyleUsageHint.replace('__id__', style.id)}
          className="mb-0"
        >
          <input
            dir="ltr"
            type="text"
            value={idDraft}
            onChange={(e) => setIdDraft(e.target.value)}
            onBlur={commitId}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            aria-label={labels.exerciseStyleIdAria}
            className={inputClass}
            style={{ ...inputStyle, borderColor: idEmpty || idTaken ? 'var(--destructive)' : 'var(--rule)' }}
          />
        </FieldRow>
        <FieldRow stacked label={labels.exerciseStyleNameLabel} tooltip={labels.styleNameHelp} className="mb-0">
          <input
            dir="auto"
            type="text"
            value={style.name ?? ''}
            onChange={(e) => onChange({ name: e.target.value.length > 0 ? e.target.value : undefined })}
            aria-label={labels.exerciseStyleNameAria}
            placeholder={style.id}
            className={inputClass}
            style={inputStyle}
          />
        </FieldRow>
      </div>

      {(parents.length > 0 || style.extends !== undefined) && (
        <SelectInput
          label={labels.exerciseStyleExtends}
          value={style.extends ?? ''}
          options={[
            { value: '', label: labels.exerciseStyleExtendsNone },
            ...parents.map((p) => ({ value: p.id, label: p.name })),
            ...(style.extends !== undefined && !parents.some((p) => p.id === style.extends) ? [{ value: style.extends, label: style.extends }] : []),
          ]}
          onChange={(v) => (v === '' ? onResetField('extends') : onChange({ extends: v }))}
          tooltip={labels.exerciseStyleExtendsTooltip}
          isDefault={unset('extends')}
          onReset={() => onResetField('extends')}
        />
      )}
      <SelectInput
        label={labels.exerciseStyleBox}
        value={resolved.box ?? ''}
        options={boxStyleOptions(calloutStyles, labels.exerciseStyleBoxNone, resolved.box)}
        onChange={(v) => (v === '' ? onResetField('box') : onChange({ box: v }))}
        tooltip={labels.exerciseStyleBoxTooltip}
        isDefault={unset('box')}
        onReset={() => onResetField('box')}
      />

      <CollapsibleSection title={labels.exerciseStyleNumberGroup} sectionId={`${sectionId}.number`} variant="subsection">
        <ToggleSwitch label={labels.exerciseStyleNumberShow} checked={n.show} onChange={(v) => number({ show: v })} {...row('number', 'show')} />
        <SelectInput
          label={labels.exerciseStyleNumberLabel}
          value={labelMode}
          options={[
            { value: 'none', label: labels.exerciseStyleNumberLabelNone },
            { value: 'word', label: labels.exerciseStyleNumberLabelWord.replace('__word__', word) },
            { value: 'custom', label: labels.exerciseStyleNumberLabelCustom },
          ]}
          onChange={(v) => number({ label: v === 'word' ? true : v === 'custom' ? (n.label || word) : false })}
          tooltip={labels.exerciseStyleNumberLabelTooltip}
          {...row('number', 'label')}
        />
        {labelMode === 'custom' && (
          <TextInput label={labels.exerciseStyleNumberLabelText} value={n.label} onChange={(v) => number({ label: v })} {...row('number', 'label')} />
        )}
        <SelectInput
          label={labels.exerciseStyleNumberShape}
          value={n.shape}
          options={[
            { value: 'none', label: labels.exerciseStyleNumberShapeNone },
            { value: 'disc', label: labels.exerciseStyleNumberShapeDisc },
            { value: 'square', label: labels.exerciseStyleNumberShapeSquare },
            { value: 'rounded', label: labels.exerciseStyleNumberShapeRounded },
          ]}
          onChange={(v) => number({ shape: v as ExerciseNumberShape })}
          {...row('number', 'shape')}
        />
        <ColorPicker
          label={labels.colorLabel}
          value={n.color ?? (n.shape === 'none' ? mainColor : WHITE)}
          onChange={(v) => number({ color: v })}
          tooltip={labels.exerciseStyleNumberColorTooltip}
          // A shaped number is read against its shape, not the paper (#1244).
          {...(n.shape !== 'none' ? { contrastGround: { hex: n.background.hex, sizePt: dimensionToPx(bodyText.fontSize, 72) * (n.fontSize.unit === 'em' ? n.fontSize.value : 1) } } : {})}
          fieldId={`${fieldId}-number-color`}
          {...row('number', 'color')}
        />
        {n.shape !== 'none' && (
          <ColorPicker
            label={labels.exerciseStyleNumberBackground}
            value={n.background}
            onChange={(v) => number({ background: v })}
            fieldId={`${fieldId}-number-background`}
            {...row('number', 'background')}
          />
        )}
        <FontPicker label={labels.fontLabel} value={n.fontFamily ?? bodyText.fontFamily} onChange={(v) => number({ fontFamily: v })} {...row('number', 'fontFamily')} />
        <DimensionInput label={labels.sizeLabel} value={n.fontSize} onChange={(v) => number({ fontSize: v })} min={0.1} step={0.05} units={EM_UNITS} {...row('number', 'fontSize')} />
        <NumberInput label={labels.exerciseStyleFontWeight} value={n.fontWeight} onChange={(v) => number({ fontWeight: v })} min={100} max={900} step={100} {...row('number', 'fontWeight')} />
        <TextInput label={labels.exerciseStyleNumberSuffix} value={n.suffix} onChange={(v) => number({ suffix: v })} tooltip={labels.exerciseStyleNumberSuffixTooltip} widthCh={6} {...row('number', 'suffix')} />
        <TextInput label={labels.exerciseStyleNumberTemplate} value={n.template} onChange={(v) => number({ template: v })} tooltip={labels.exerciseStyleNumberTemplateTooltip} {...row('number', 'template')} />
        <SelectInput
          label={labels.exerciseStyleNumberFormat}
          value={n.format}
          options={counterFormats}
          onChange={(v) => number({ format: v as ResourceCounterFormat })}
          {...row('number', 'format')}
        />
        <SelectInput
          label={labels.exerciseStyleNumberResetOn}
          value={n.resetOn}
          options={resetOnOptions(labels)}
          onChange={(v) => number({ resetOn: v as ResourceCounterReset })}
          {...row('number', 'resetOn')}
        />
        <TextInput label={labels.exerciseStyleNumberCounter} value={n.counter} onChange={(v) => number({ counter: v })} tooltip={labels.exerciseStyleNumberCounterTooltip} {...row('number', 'counter')} />
      </CollapsibleSection>

      <CollapsibleSection title={labels.exerciseStyleInstructionGroup} sectionId={`${sectionId}.instruction`} variant="subsection">
        <ToggleSwitch label={labels.bold} tooltip={labels.boldHelp} checked={resolved.instruction.bold} onChange={(v) => instruction({ bold: v })} {...row('instruction', 'bold')} />
        <ToggleSwitch label={labels.italic} tooltip={labels.italicHelp} checked={resolved.instruction.italic ?? false} onChange={(v) => instruction({ italic: v })} {...row('instruction', 'italic')} />
        <ColorPicker label={labels.colorLabel} value={resolved.instruction.color ?? textColor} onChange={(v) => instruction({ color: v })} fieldId={`${fieldId}-instruction-color`} {...row('instruction', 'color')} />
        <FontPicker label={labels.fontLabel} value={resolved.instruction.fontFamily ?? bodyText.fontFamily} onChange={(v) => instruction({ fontFamily: v })} {...row('instruction', 'fontFamily')} />
        <DimensionInput label={labels.sizeLabel} value={resolved.instruction.fontSize ?? { value: 1, unit: 'em' }} onChange={(v) => instruction({ fontSize: v })} min={0.1} step={0.05} units={EM_UNITS} {...row('instruction', 'fontSize')} />
      </CollapsibleSection>

      <CollapsibleSection title={labels.exerciseStyleOptionsGroup} sectionId={`${sectionId}.options`} variant="subsection">
        <SelectInput
          label={labels.exerciseStyleOptionsLabels}
          value={resolved.options.labels}
          options={[{ value: 'none', label: labels.exerciseStyleOptionsLabelsNone }, ...counterFormats]}
          onChange={(v) => options({ labels: v as ExerciseOptionLabels })}
          {...row('options', 'labels')}
        />
        <TextInput label={labels.exerciseStyleOptionsPrefix} value={resolved.options.prefix} onChange={(v) => options({ prefix: v })} widthCh={6} {...row('options', 'prefix')} />
        <TextInput label={labels.exerciseStyleOptionsSuffix} value={resolved.options.suffix} onChange={(v) => options({ suffix: v })} widthCh={6} {...row('options', 'suffix')} />
        <SelectInput
          label={labels.exerciseStyleOptionsMarker}
          value={resolved.options.marker}
          options={[
            { value: 'none', label: labels.exerciseStyleOptionsMarkerNone },
            { value: 'box', label: labels.exerciseStyleOptionsMarkerBox },
            { value: 'circle', label: labels.exerciseStyleOptionsMarkerCircle },
          ]}
          onChange={(v) => options({ marker: v as ExerciseOptionsStyle['marker'] })}
          variant="segmented"
          tooltip={labels.exerciseStyleOptionsMarkerTooltip}
          {...row('options', 'marker')}
        />
        <SelectInput
          label={labels.exerciseStyleOptionsLayout}
          value={resolved.options.layout}
          options={[
            { value: 'stack', label: labels.exerciseStyleOptionsLayoutStack },
            { value: 'row', label: labels.exerciseStyleOptionsLayoutRow },
          ]}
          onChange={(v) => options({ layout: v as ExerciseOptionsStyle['layout'] })}
          variant="segmented"
          {...row('options', 'layout')}
        />
        {resolved.options.layout === 'row' && (
          <NumberInput label={labels.exerciseStyleOptionsColumns} value={resolved.options.columns ?? 4} onChange={(v) => options({ columns: v })} min={1} max={12} step={1} tooltip={labels.exerciseStyleOptionsColumnsTooltip} {...row('options', 'columns')} />
        )}
        <DimensionInput label={labels.exerciseStyleOptionsIndent} value={resolved.options.indent} onChange={(v) => options({ indent: v })} min={0} step={0.25} units={EM_UNITS} {...row('options', 'indent')} />
        <ToggleSwitch label={labels.exerciseStyleOptionsShuffle} tooltip={labels.exerciseStyleOptionsShuffleTooltip} checked={resolved.options.shuffle} onChange={(v) => options({ shuffle: v })} {...row('options', 'shuffle')} />
        <ToggleSwitch label={labels.exerciseStyleOptionsBracket} tooltip={labels.exerciseStyleOptionsBracketTooltip} checked={resolved.options.bracket} onChange={(v) => options({ bracket: v })} {...row('options', 'bracket')} />
      </CollapsibleSection>

      <CollapsibleSection title={labels.exerciseStyleBlankGroup} sectionId={`${sectionId}.blank`} variant="subsection">
        <SelectInput
          label={labels.exerciseStyleBlankLook}
          value={resolved.blank.look}
          options={[
            { value: 'line', label: labels.exerciseStyleBlankLookLine },
            { value: 'dots', label: labels.exerciseStyleBlankLookDots },
            { value: 'box', label: labels.exerciseStyleBlankLookBox },
            { value: 'none', label: labels.exerciseStyleBlankLookNone },
          ]}
          onChange={(v) => blank({ look: v as ExerciseBlankStyle['look'] })}
          {...row('blank', 'look')}
        />
        <SelectInput
          label={labels.exerciseStyleBlankWidth}
          value={blankWidthMode}
          options={[
            { value: 'longest', label: labels.exerciseStyleBlankWidthLongest },
            { value: 'answer', label: labels.exerciseStyleBlankWidthAnswer },
            { value: 'fixed', label: labels.exerciseStyleBlankWidthFixed },
          ]}
          onChange={(v) => blank({ width: v === 'fixed' ? { value: 6, unit: 'em' } : (v as 'answer' | 'longest') })}
          tooltip={labels.exerciseStyleBlankWidthTooltip}
          {...row('blank', 'width')}
        />
        {typeof resolved.blank.width === 'object' && (
          <DimensionInput label={labels.exerciseStyleBlankWidthLength} value={resolved.blank.width} onChange={(v) => blank({ width: v })} min={0.5} step={0.5} units={EM_UNITS} {...row('blank', 'width')} />
        )}
        <DimensionInput label={labels.exerciseStyleBlankExtra} value={resolved.blank.extra} onChange={(v) => blank({ extra: v })} min={0} step={0.25} units={EM_UNITS} tooltip={labels.exerciseStyleBlankExtraTooltip} {...row('blank', 'extra')} />
        <DimensionInput label={labels.exerciseStyleBlankMinWidth} value={resolved.blank.minWidth} onChange={(v) => blank({ minWidth: v })} min={0} step={0.5} units={EM_UNITS} {...row('blank', 'minWidth')} />
        <ColorPicker label={labels.exerciseStyleLineColor} value={resolved.blank.color ?? textColor} onChange={(v) => blank({ color: v })} fieldId={`${fieldId}-blank-color`} {...row('blank', 'color')} />
        <DimensionInput label={labels.exerciseStyleLineWeight} value={resolved.blank.weight} onChange={(v) => blank({ weight: v })} min={0} step={0.1} units={LINE_UNITS} {...row('blank', 'weight')} />
      </CollapsibleSection>

      <CollapsibleSection title={labels.exerciseStyleTrueFalseGroup} sectionId={`${sectionId}.trueFalse`} variant="subsection">
        <TextInput
          label={labels.exerciseStyleTrueFalseTrue}
          value={resolved.trueFalse.labels[0]}
          onChange={(v) => trueFalse({ labels: [v, resolved.trueFalse.labels[1]] })}
          widthCh={6}
          {...row('trueFalse', 'labels')}
        />
        <TextInput
          label={labels.exerciseStyleTrueFalseFalse}
          value={resolved.trueFalse.labels[1]}
          onChange={(v) => trueFalse({ labels: [resolved.trueFalse.labels[0], v] })}
          widthCh={6}
          {...row('trueFalse', 'labels')}
        />
        <SelectInput
          label={labels.exerciseStyleTrueFalseLook}
          value={resolved.trueFalse.look}
          options={[
            { value: 'boxes', label: labels.exerciseStyleTrueFalseLookBoxes },
            { value: 'bracket', label: labels.exerciseStyleTrueFalseLookBracket },
          ]}
          onChange={(v) => trueFalse({ look: v as ExerciseTrueFalseStyle['look'] })}
          variant="segmented"
          {...row('trueFalse', 'look')}
        />
        <SelectInput
          label={labels.exerciseStyleTrueFalsePlace}
          value={resolved.trueFalse.place}
          options={[
            { value: 'end', label: labels.exerciseStyleTrueFalsePlaceEnd },
            { value: 'start', label: labels.exerciseStyleTrueFalsePlaceStart },
          ]}
          onChange={(v) => trueFalse({ place: v as ExerciseTrueFalseStyle['place'] })}
          variant="segmented"
          {...row('trueFalse', 'place')}
        />
      </CollapsibleSection>

      <CollapsibleSection title={labels.exerciseStyleMatchGroup} sectionId={`${sectionId}.match`} variant="subsection">
        <SelectInput
          label={labels.exerciseStyleMatchLook}
          value={resolved.match.look}
          options={[
            { value: 'dots', label: labels.exerciseStyleMatchLookDots },
            { value: 'letters', label: labels.exerciseStyleMatchLookLetters },
          ]}
          onChange={(v) => match({ look: v as ExerciseMatchStyle['look'] })}
          variant="segmented"
          {...row('match', 'look')}
        />
        <DimensionInput label={labels.exerciseStyleMatchGap} value={resolved.match.gap} onChange={(v) => match({ gap: v })} min={0} step={0.5} units={EM_UNITS} {...row('match', 'gap')} />
        <DimensionInput label={labels.exerciseStyleMatchDotSize} value={resolved.match.dotSize} onChange={(v) => match({ dotSize: v })} min={0} step={0.05} units={EM_UNITS} {...row('match', 'dotSize')} />
        <ColorPicker label={labels.colorLabel} value={resolved.match.color} onChange={(v) => match({ color: v })} fieldId={`${fieldId}-match-color`} {...row('match', 'color')} />
      </CollapsibleSection>

      <CollapsibleSection title={labels.exerciseStyleBankGroup} sectionId={`${sectionId}.bank`} variant="subsection">
        <SelectInput
          label={labels.exerciseStyleBox}
          value={resolved.bank.box ?? ''}
          options={boxStyleOptions(calloutStyles, labels.exerciseStyleBankBoxDefault, resolved.bank.box)}
          onChange={(v) => (v === '' ? resetPart('bank', 'box') : bank({ box: v }))}
          {...row('bank', 'box')}
        />
        <SelectInput
          label={labels.exerciseStyleBankOrder}
          value={resolved.bank.order}
          options={[
            { value: 'shuffle', label: labels.exerciseStyleBankOrderShuffle },
            { value: 'alpha', label: labels.exerciseStyleBankOrderAlpha },
            { value: 'written', label: labels.exerciseStyleBankOrderWritten },
          ]}
          onChange={(v) => bank({ order: v as ExerciseBankStyle['order'] })}
          {...row('bank', 'order')}
        />
        <TextInput label={labels.exerciseStyleBankSeparator} value={resolved.bank.separator} onChange={(v) => bank({ separator: v })} widthCh={6} {...row('bank', 'separator')} />
      </CollapsibleSection>

      <CollapsibleSection title={labels.exerciseStyleAreaGroup} sectionId={`${sectionId}.area`} variant="subsection">
        <SelectInput
          label={labels.exerciseStyleAreaKind}
          value={resolved.area.kind}
          options={[
            { value: 'lines', label: labels.exerciseStyleAreaKindLines },
            { value: 'dots', label: labels.exerciseStyleAreaKindDots },
            { value: 'grid', label: labels.exerciseStyleAreaKindGrid },
            { value: 'seyes', label: labels.exerciseStyleAreaKindSeyes },
            { value: 'tianzige', label: labels.exerciseStyleAreaKindTianzige },
            { value: 'box', label: labels.exerciseStyleAreaKindBox },
            { value: 'none', label: labels.exerciseStyleAreaKindNone },
          ]}
          onChange={(v) => area({ kind: v as ExerciseAreaStyle['kind'] })}
          {...row('area', 'kind')}
        />
        <NumberInput label={labels.exerciseStyleAreaLines} value={resolved.area.lines} onChange={(v) => area({ lines: v })} min={1} max={40} step={1} tooltip={labels.exerciseStyleAreaLinesTooltip} {...row('area', 'lines')} />
        <DimensionInput
          label={labels.exerciseStyleAreaSpacing}
          value={resolved.area.spacing ?? bodyText.lineHeight}
          onChange={(v) => area({ spacing: v })}
          min={0}
          step={0.5}
          units={['pt', 'mm', 'em']}
          {...row('area', 'spacing')}
        />
        <ColorPicker label={labels.exerciseStyleLineColor} value={resolved.area.color} onChange={(v) => area({ color: v })} fieldId={`${fieldId}-area-color`} {...row('area', 'color')} />
        <DimensionInput label={labels.exerciseStyleLineWeight} value={resolved.area.weight} onChange={(v) => area({ weight: v })} min={0} step={0.1} units={LINE_UNITS} {...row('area', 'weight')} />
      </CollapsibleSection>

      <CollapsibleSection title={labels.exerciseStyleGridGroup} sectionId={`${sectionId}.grid`} variant="subsection">
        <DimensionInput label={labels.exerciseStyleGridCell} value={resolved.grid.cell} onChange={(v) => grid({ cell: v })} min={0.5} step={0.1} units={EM_UNITS} tooltip={labels.exerciseStyleGridCellTooltip} {...row('grid', 'cell')} />
        <FontPicker label={labels.fontLabel} value={resolved.grid.fontFamily ?? bodyText.fontFamily} onChange={(v) => grid({ fontFamily: v })} {...row('grid', 'fontFamily')} />
        <DimensionInput label={labels.sizeLabel} value={resolved.grid.fontSize ?? { value: 1, unit: 'em' }} onChange={(v) => grid({ fontSize: v })} min={0.1} step={0.05} units={EM_UNITS} {...row('grid', 'fontSize')} />
        <ColorPicker label={labels.colorLabel} value={resolved.grid.color ?? textColor} onChange={(v) => grid({ color: v })} fieldId={`${fieldId}-grid-color`} {...row('grid', 'color')} />
        <ColorPicker label={labels.exerciseStyleGridRule} value={resolved.grid.rule} onChange={(v) => grid({ rule: v })} fieldId={`${fieldId}-grid-rule`} {...row('grid', 'rule')} />
        <DimensionInput label={labels.exerciseStyleLineWeight} value={resolved.grid.ruleWidth} onChange={(v) => grid({ ruleWidth: v })} min={0} step={0.1} units={LINE_UNITS} {...row('grid', 'ruleWidth')} />
        <ColorPicker label={labels.exerciseStyleGridBlocked} value={resolved.grid.blocked ?? textColor} onChange={(v) => grid({ blocked: v })} tooltip={labels.exerciseStyleGridBlockedTooltip} fieldId={`${fieldId}-grid-blocked`} {...row('grid', 'blocked')} />
        <ToggleSwitch label={labels.exerciseStyleGridUppercase} checked={resolved.grid.uppercase} onChange={(v) => grid({ uppercase: v })} {...row('grid', 'uppercase')} />
      </CollapsibleSection>

      <CollapsibleSection title={labels.exerciseStyleArithmeticGroup} sectionId={`${sectionId}.arithmetic`} variant="subsection">
        <SelectInput
          label={labels.exerciseStyleArithmeticDivision}
          value={resolved.arithmetic.division}
          options={[
            { value: 'bracket', label: labels.exerciseStyleArithmeticDivisionBracket },
            { value: 'potence', label: labels.exerciseStyleArithmeticDivisionPotence },
            { value: 'inline', label: labels.exerciseStyleArithmeticDivisionInline },
          ]}
          onChange={(v) => arithmetic({ division: v as ExerciseArithmeticStyle['division'] })}
          tooltip={labels.exerciseStyleArithmeticDivisionTooltip}
          {...row('arithmetic', 'division')}
        />
        <NumberInput label={labels.exerciseStyleArithmeticColumns} value={resolved.arithmetic.columns} onChange={(v) => arithmetic({ columns: v })} min={1} max={8} step={1} {...row('arithmetic', 'columns')} />
        <ToggleSwitch label={labels.exerciseStyleArithmeticPartialProducts} checked={resolved.arithmetic.partialProducts} onChange={(v) => arithmetic({ partialProducts: v })} tooltip={labels.exerciseStyleArithmeticPartialProductsTooltip} {...row('arithmetic', 'partialProducts')} />
        <SelectInput
          label={labels.exerciseStyleArithmeticWorking}
          value={resolved.arithmetic.working}
          options={[
            { value: 'products', label: labels.exerciseStyleArithmeticWorkingProducts },
            { value: 'remainders', label: labels.exerciseStyleArithmeticWorkingRemainders },
          ]}
          onChange={(v) => arithmetic({ working: v as ExerciseArithmeticStyle['working'] })}
          tooltip={labels.exerciseStyleArithmeticWorkingTooltip}
          {...row('arithmetic', 'working')}
        />
      </CollapsibleSection>

      <CollapsibleSection title={labels.exerciseStyleLevelGroup} sectionId={`${sectionId}.level`} variant="subsection">
        <TextInput label={labels.exerciseStyleLevelGlyph} value={resolved.level.glyph} onChange={(v) => level({ glyph: v })} widthCh={4} tooltip={labels.exerciseStyleLevelGlyphTooltip} {...row('level', 'glyph')} />
        <TextInput label={labels.exerciseStyleLevelEmpty} value={resolved.level.empty} onChange={(v) => level({ empty: v })} widthCh={4} {...row('level', 'empty')} />
        <NumberInput label={labels.exerciseStyleLevelMax} value={resolved.level.max} onChange={(v) => level({ max: v })} min={1} max={10} step={1} {...row('level', 'max')} />
        <ColorPicker label={labels.colorLabel} value={resolved.level.color} onChange={(v) => level({ color: v })} fieldId={`${fieldId}-level-color`} {...row('level', 'color')} />
      </CollapsibleSection>

      <CollapsibleSection title={labels.exerciseStyleIconsGroup} sectionId={`${sectionId}.icons`} variant="subsection">
        <IconsFields
          icons={style.icons}
          bodyText={bodyText}
          iconResources={iconResources}
          fieldId={fieldId}
          onChange={(icons) => (Object.keys(icons).length > 0 ? onChange({ icons }) : onResetField('icons'))}
        />
      </CollapsibleSection>

      <CollapsibleSection title={labels.exerciseStyleAnswersGroup} sectionId={`${sectionId}.answers`} variant="subsection">
        <ColorPicker label={labels.colorLabel} value={resolved.answers.color} onChange={(v) => answers({ color: v })} tooltip={labels.exerciseStyleAnswersColorTooltip} fieldId={`${fieldId}-answers-color`} {...row('answers', 'color')} />
        <FontPicker label={labels.fontLabel} value={resolved.answers.fontFamily ?? bodyText.fontFamily} onChange={(v) => answers({ fontFamily: v })} {...row('answers', 'fontFamily')} />
        <ToggleSwitch label={labels.italic} tooltip={labels.italicHelp} checked={resolved.answers.italic ?? false} onChange={(v) => answers({ italic: v })} {...row('answers', 'italic')} />
      </CollapsibleSection>

      <CollapsibleSection title={labels.exerciseStyleSolutionsGroup} sectionId={`${sectionId}.solutions`} variant="subsection">
        <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>{labels.exerciseStyleSolutionsHint}</p>
        <SolutionsFields
          own={style.solutions}
          shown={{ ...book.solutions, ...style.solutions } as ResolvedExercisesConfig['solutions']}
          calloutStyles={calloutStyles}
          set={(partial: Partial<ExerciseSolutionsConfig>) => setPart('solutions', partial)}
          reset={(field: keyof ExerciseSolutionsConfig) => resetPart('solutions', field)}
        />
      </CollapsibleSection>

      <CollapsibleSection title={labels.exerciseStyleDigitalGroup} sectionId={`${sectionId}.digital`} variant="subsection">
        <ColorPicker label={labels.exerciseStyleDigitalCorrect} value={resolved.digital.correctColor} onChange={(v) => digital({ correctColor: v })} fieldId={`${fieldId}-digital-correct`} {...row('digital', 'correctColor')} />
        <ColorPicker label={labels.exerciseStyleDigitalWrong} value={resolved.digital.wrongColor} onChange={(v) => digital({ wrongColor: v })} fieldId={`${fieldId}-digital-wrong`} {...row('digital', 'wrongColor')} />
      </CollapsibleSection>

      <CollapsibleSection title={labels.exercisesAssessmentGroup} sectionId={`${sectionId}.assessment`} variant="subsection">
        <AssessmentFields
          shown={{
            maxChecks: resolved.digital.maxChecks ?? book.digital.maxChecks,
            reset: resolved.digital.reset ?? book.digital.reset,
            maxResets: resolved.digital.maxResets ?? book.digital.maxResets,
            showSolution: resolved.digital.showSolution ?? book.digital.showSolution,
          }}
          unset={(field) => partUnset('digital', field)}
          set={digital}
          reset={(field) => resetPart('digital', field)}
        />
      </CollapsibleSection>

      <CollapsibleSection title={labels.exerciseStyleSpacingGroup} sectionId={`${sectionId}.spacing`} variant="subsection">
        <DimensionInput label={labels.marginTop} value={resolved.marginTop} onChange={(v) => onChange({ marginTop: v })} min={0} step={0.25} units={EM_UNITS} isDefault={unset('marginTop')} onReset={() => onResetField('marginTop')} />
        <DimensionInput label={labels.marginBottom} value={resolved.marginBottom} onChange={(v) => onChange({ marginBottom: v })} min={0} step={0.25} units={EM_UNITS} isDefault={unset('marginBottom')} onReset={() => onResetField('marginBottom')} />
        <DimensionInput label={labels.exerciseStyleItemSpacing} value={resolved.itemSpacing} onChange={(v) => onChange({ itemSpacing: v })} min={0} step={0.05} units={EM_UNITS} isDefault={unset('itemSpacing')} onReset={() => onResetField('itemSpacing')} />
      </CollapsibleSection>
    </ItemCard>
    </SearchScope>
  );
}

interface IconsFieldsProps {
  icons: Record<string, ExerciseIcon> | undefined;
  bodyText: ResolvedBodyTextConfig;
  iconResources: Resource[];
  fieldId: string;
  onChange: (icons: Record<string, ExerciseIcon>) => void;
}

/** The activity icons a style defines (`icon="oral"` on a fence): each an
 *  id with a character or a picture, its colour and what it stands for. */
function IconsFields({ icons, bodyText, iconResources, fieldId, onChange }: IconsFieldsProps) {
  const labels = useSandboxLabels();
  const entries = Object.entries(icons ?? {});
  const write = (next: [string, ExerciseIcon][]) => onChange(Object.fromEntries(next));
  const setIcon = (id: string, partial: Partial<ExerciseIcon>) =>
    write(entries.map(([k, v]) => [k, k === id ? { ...v, ...partial } : v]));
  const resetIcon = (id: string, field: keyof ExerciseIcon) =>
    write(entries.map(([k, v]) => {
      if (k !== id) return [k, v];
      const next = { ...v };
      delete next[field];
      return [k, next];
    }));
  const renameIcon = (id: string, nextId: string) => {
    if (nextId === id || nextId.length === 0 || entries.some(([k]) => k === nextId)) return;
    write(entries.map(([k, v]) => [k === id ? nextId : k, v]));
  };
  const addIcon = () => {
    const id = uniqueId('icon', new Set(entries.map(([k]) => k)));
    write([...entries, [id, { glyph: '★' }]]);
  };
  const resourceOptions = (value: string | undefined) => {
    const out = [{ value: '', label: labels.exerciseStyleIconResourceNone }, ...iconResources.map((r) => ({ value: r.id, label: r.caption?.trim() ? `${r.caption.trim()} (${r.id})` : r.id }))];
    if (value && !iconResources.some((r) => r.id === value)) out.push({ value, label: value });
    return out;
  };

  return (
    <>
      <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>{labels.exerciseStyleIconsHint}</p>
      {entries.map(([id, icon]) => {
        const kind = icon.resourceId !== undefined ? 'resource' : 'glyph';
        const unsetIcon = (field: keyof ExerciseIcon) => icon[field] === undefined;
        return (
          <div key={id} className="mb-2 rounded border p-2" style={{ borderColor: 'var(--rule)' }}>
            <div className="mb-1 flex items-center gap-1">
              <IconIdInput id={id} onRename={(next) => renameIcon(id, next)} />
              <IconButton label={labels.exerciseStyleIconDelete} icon={<Trash2 size={13} />} destructive onClick={() => write(entries.filter(([k]) => k !== id))} />
            </div>
            <SelectInput
              label={labels.exerciseStyleIconKind}
              value={kind}
              options={[
                { value: 'glyph', label: labels.exerciseStyleIconKindGlyph },
                { value: 'resource', label: labels.exerciseStyleIconKindResource },
              ]}
              onChange={(v) => {
                const next = { ...icon };
                if (v === 'resource') {
                  delete next.glyph;
                  delete next.fontFamily;
                  next.resourceId = iconResources[0]?.id ?? '';
                } else {
                  delete next.resourceId;
                  next.glyph = icon.glyph ?? '★';
                }
                write(entries.map(([k, val]) => [k, k === id ? next : val]));
              }}
              variant="segmented"
            />
            {kind === 'glyph' ? (
              <>
                <TextInput label={labels.exerciseStyleIconGlyph} value={icon.glyph ?? ''} onChange={(v) => setIcon(id, { glyph: v })} widthCh={4} />
                <FontPicker label={labels.fontLabel} value={icon.fontFamily ?? bodyText.fontFamily} onChange={(v) => setIcon(id, { fontFamily: v })} isDefault={unsetIcon('fontFamily')} onReset={() => resetIcon(id, 'fontFamily')} />
              </>
            ) : (
              <SelectInput
                label={labels.exerciseStyleIconResource}
                value={icon.resourceId ?? ''}
                options={resourceOptions(icon.resourceId)}
                onChange={(v) => setIcon(id, { resourceId: v })}
              />
            )}
            <ColorPicker label={labels.colorLabel} value={icon.color ?? bodyText.color} onChange={(v) => setIcon(id, { color: v })} fieldId={`${fieldId}-icon-${id}-color`} isDefault={unsetIcon('color')} onReset={() => resetIcon(id, 'color')} />
            <NumberInput label={labels.sizeLabel} value={icon.size ?? 0.75} onChange={(v) => setIcon(id, { size: v })} min={0.3} max={3} step={0.05} suffix="em" isDefault={unsetIcon('size')} onReset={() => resetIcon(id, 'size')} />
            <TextInput label={labels.exerciseStyleIconAlt} value={icon.alt ?? ''} onChange={(v) => (v === '' ? resetIcon(id, 'alt') : setIcon(id, { alt: v }))} tooltip={labels.exerciseStyleIconAltTooltip} isDefault={unsetIcon('alt')} onReset={() => resetIcon(id, 'alt')} />
          </div>
        );
      })}
      <Button variant="outline" size="xs" icon={<Plus size={12} />} onClick={addIcon}>
        {labels.exerciseStyleIconAdd}
      </Button>
    </>
  );
}

/** An icon's id, renamed on blur or Enter (never to an empty one). */
function IconIdInput({ id, onRename }: { id: string; onRename: (next: string) => void }) {
  const labels = useSandboxLabels();
  const [draft, setDraft] = useState(id);
  const commit = () => {
    const next = slugifyStyleId(draft);
    setDraft(next.length > 0 ? next : id);
    if (next.length > 0 && next !== id) onRename(next);
  };
  return (
    <input
      dir="ltr"
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      aria-label={labels.exerciseStyleIconId}
      className={inputClass}
      style={inputStyle}
    />
  );
}

/** The styles `style` may be based on: not itself, nor one based on it
 *  (directly or further down), which would close a loop. */
function parentsOf(styles: readonly ExerciseStyleConfig[], style: ExerciseStyleConfig): { id: string; name: string }[] {
  const byId = new Map(styles.map((s) => [s.id, s]));
  const leadsTo = (s: ExerciseStyleConfig): boolean => {
    const seen = new Set<string>();
    for (let p: ExerciseStyleConfig | undefined = s; p && !seen.has(p.id); p = p.extends ? byId.get(p.extends) : undefined) {
      if (p.id === style.id) return true;
      seen.add(p.id);
    }
    return false;
  };
  return styles.filter((s) => s.id !== style.id && !leadsTo(s)).map((s) => ({ id: s.id, name: s.name || s.id }));
}

/** Config-panel section for the named exercise styles picked with
 *  `:::exercise{style="…"}` (#1226, `config.exerciseStyles`). While the
 *  config has no list, the built-in `exercise` style is shown so it can be
 *  edited in place. */
export const ExerciseStylesSection = memo(function ExerciseStylesSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.exerciseStyles);
  const rawBook = useSandboxSelector((s) => s.config.exercises);
  const calloutStyles = useSandboxSelector((s) => s.config.calloutStyles);
  const palette = useSandboxSelector((s) => s.config.colorPalette);
  const bodyTextRaw = useSandboxSelector((s) => s.config.bodyText);
  const locale = useSandboxSelector(exerciseLocaleOf);
  const resources = useSandboxResources();
  const chapters = useBookTexts();
  const activeChapterId = useSandboxSelector((s) => s.activeChapterId);
  const iconResources = resources.filter((r) => r.kind === 'svg' || r.kind === 'bitmap');
  const bodyText = resolveBodyTextConfig(bodyTextRaw);
  const styles: ExerciseStyleConfig[] = raw ?? DEFAULT_EXERCISE_STYLES;
  const resolved = resolveExerciseStylesConfig(styles, locale, palette);
  const book = resolveExercisesConfig(rawBook, locale);
  const mainColor = resolveColorValue(DEFAULT_MAIN_COLOR, palette, DEFAULT_MAIN_COLOR);
  const word = exerciseWords(locale).exercise;

  const write = (next: ExerciseStyleConfig[]) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { exerciseStyles: next.length > 0 ? next : undefined } });
  };

  const addStyle = () => {
    const id = uniqueId('exercise', new Set(styles.map((s) => s.id)));
    openCard('exerciseStyles', id);
    write([...styles, { id, name: labels.exerciseStyleNewName }]);
  };

  const duplicateStyle = (id: string) => {
    const index = styles.findIndex((s) => s.id === id);
    const source = styles[index];
    if (!source) return;
    const copy: ExerciseStyleConfig = structuredClone({ ...source, id: uniqueId(`${source.id}-copy`, new Set(styles.map((s) => s.id))) });
    openCard('exerciseStyles', copy.id);
    const next = styles.slice();
    next.splice(index + 1, 0, copy);
    write(next);
  };

  const updateStyle = (id: string, partial: Partial<ExerciseStyleConfig>) => {
    write(styles.map((s) => (s.id === id ? { ...s, ...partial } : s)));
  };

  const resetStyleField = (id: string, field: keyof ExerciseStyleConfig) => {
    write(
      styles.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s };
        delete next[field];
        return next;
      }),
    );
  };

  /** A style based on the renamed one names it by its new id, and so does
   *  every `:::exercise{style}` fence of the book (#1244). */
  const renameStyle = (id: string, nextId: string) => {
    if (styles.some((s) => s.id === nextId)) return;
    moveCardState('exerciseStyles', id, nextId);
    applyExerciseStyleRename(dispatch, planExerciseStyleRename(styles, chapters, id, nextId), activeChapterId);
  };

  /** A style based on the removed one takes its parent instead (or none). */
  const removeStyle = (id: string) => {
    const gone = styles.find((s) => s.id === id);
    write(styles.filter((s) => s.id !== id).map((s) => {
      if (s.extends !== id) return s;
      const next = { ...s };
      if (gone?.extends) next.extends = gone.extends;
      else delete next.extends;
      return next;
    }));
  };

  return (
    <CollapsibleSection
      title={labels.exerciseStylesSection}
      sectionId="exerciseStyles"
      hasOverrides={raw !== undefined}
      onReset={() => dispatch({ type: 'UPDATE_CONFIG', payload: { exerciseStyles: undefined } })}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.exerciseStylesResetConfirm}
    >
      <ItemCardListActions list="exerciseStyles" ids={styles.map((s) => s.id)} />
      {styles.map((style, i) => (
        <ExerciseStyleCard
          key={style.id}
          style={style}
          resolved={resolved[i]!}
          book={book}
          bodyText={bodyText}
          mainColor={mainColor}
          word={word}
          calloutStyles={calloutStyles}
          iconResources={iconResources}
          otherIds={new Set(styles.filter((s) => s.id !== style.id).map((s) => s.id))}
          parents={parentsOf(styles, style)}
          stored={raw !== undefined}
          onChange={(partial) => updateStyle(style.id, partial)}
          onResetField={(field) => resetStyleField(style.id, field)}
          onRename={(nextId) => renameStyle(style.id, nextId)}
          onDuplicate={() => duplicateStyle(style.id)}
          onRemove={() => removeStyle(style.id)}
        />
      ))}
      <Button variant="outline" size="xs" icon={<Plus size={12} />} onClick={addStyle} className="mt-1">
        {labels.exerciseStyleAdd}
      </Button>
    </CollapsibleSection>
  );
});

