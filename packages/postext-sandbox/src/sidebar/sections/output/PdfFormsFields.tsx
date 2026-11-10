'use client';

// The form fields of the PDF (`pdfGeneration.forms`, #1491): how chips with
// a `field` write numbers (currency, its side, the separators) in the PDF
// and on the canvas, and the face the PDF's fields show values in.

import type { PdfFormFieldFont, PdfFormsConfig } from 'postext';
import { useSandboxLabels } from '../../../context/SandboxContext.js';
import { FieldGroup, FontPicker, NestedGroup, NumberInput, SelectInput, TextInput, ToggleSwitch } from '../../../controls/index.js';

type FontChoice = 'chip' | 'helvetica' | 'family';
type SeparatorChoice = 'auto' | '0' | '1' | '2' | '3';

/** The kind of face a `font` setting names. */
export function fontChoiceOf(font: PdfFormFieldFont | undefined): FontChoice {
  if (font === undefined || font === 'chip') return 'chip';
  return font === 'helvetica' ? 'helvetica' : 'family';
}

/** `forms` with `partial` applied: a field set to undefined is dropped, and
 *  nothing left is undefined (no empty object in the configuration). */
export function nextForms(forms: PdfFormsConfig | undefined, partial: Partial<PdfFormsConfig>): PdfFormsConfig | undefined {
  const next: Record<string, unknown> = { ...forms, ...partial };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  return Object.keys(next).length > 0 ? (next as PdfFormsConfig) : undefined;
}

export interface PdfFormsFieldsProps {
  forms: PdfFormsConfig | undefined;
  onChange: (forms: PdfFormsConfig | undefined) => void;
  /** The family a face of the document's fonts starts from. */
  defaultFamily: string;
}

export function PdfFormsFields({ forms, onChange, defaultFamily }: PdfFormsFieldsProps) {
  const labels = useSandboxLabels();
  const set = (partial: Partial<PdfFormsConfig>) => onChange(nextForms(forms, partial));
  const font = forms?.font;
  const choice = fontChoiceOf(font);
  const face = typeof font === 'object' ? font : undefined;
  const setFace = (partial: Partial<{ family: string; weight: number; style: 'normal' | 'italic' }>) => {
    const merged = { family: face?.family ?? defaultFamily, ...face, ...partial };
    if (merged.weight === undefined || merged.weight === 400) delete (merged as { weight?: number }).weight;
    if (merged.style !== 'italic') delete (merged as { style?: string }).style;
    set({ font: merged });
  };

  const separatorOptions: { value: SeparatorChoice; label: string }[] = [
    { value: 'auto', label: labels.pdfFormsSeparatorsAuto },
    { value: '0', label: '1,234.56' },
    { value: '1', label: '1234.56' },
    { value: '2', label: '1.234,56' },
    { value: '3', label: '1234,56' },
  ];
  const fontOptions: { value: FontChoice; label: string }[] = [
    { value: 'chip', label: labels.pdfFormsFontChip },
    { value: 'helvetica', label: labels.pdfFormsFontHelvetica },
    { value: 'family', label: labels.pdfFormsFontOther },
  ];

  return (
    <FieldGroup title={labels.pdfForms} description={labels.pdfFormsDescription}>
      <TextInput
        label={labels.pdfFormsCurrency}
        value={forms?.currency ?? '€'}
        onChange={(v) => set({ currency: v === '' ? undefined : v })}
        placeholder="€"
        widthCh={6}
        tooltip={labels.pdfFormsCurrencyTooltip}
        isDefault={forms?.currency === undefined}
        onReset={() => set({ currency: undefined })}
      />
      <SelectInput
        label={labels.pdfFormsCurrencyPosition}
        value={forms?.currencyBefore === false ? 'after' : 'before'}
        options={[
          { value: 'before', label: labels.pdfFormsCurrencyBefore },
          { value: 'after', label: labels.pdfFormsCurrencyAfter },
        ]}
        onChange={(v) => set({ currencyBefore: v === 'after' ? false : undefined })}
        tooltip={labels.pdfFormsCurrencyPositionTooltip}
        isDefault={forms?.currencyBefore === undefined}
        onReset={() => set({ currencyBefore: undefined })}
      />
      <SelectInput
        label={labels.pdfFormsSeparators}
        value={forms?.separatorStyle === undefined ? 'auto' : String(forms.separatorStyle)}
        options={separatorOptions}
        onChange={(v) => set({ separatorStyle: v === 'auto' ? undefined : (Number(v) as 0 | 1 | 2 | 3) })}
        tooltip={labels.pdfFormsSeparatorsTooltip}
        isDefault={forms?.separatorStyle === undefined}
        onReset={() => set({ separatorStyle: undefined })}
      />
      <SelectInput
        label={labels.pdfFormsFont}
        value={choice}
        options={fontOptions}
        onChange={(v) => {
          if (v === 'chip') set({ font: undefined });
          else if (v === 'helvetica') set({ font: 'helvetica' });
          else setFace({});
        }}
        tooltip={labels.pdfFormsFontTooltip}
        isDefault={font === undefined}
        onReset={() => set({ font: undefined })}
      />
      {face && (
        <NestedGroup>
          <FontPicker
            label={labels.pdfFormsFontFamily}
            value={face.family}
            onChange={(family) => setFace({ family })}
            searchPlaceholder={labels.headingFontSearch}
            noResultsLabel={labels.headingFontNoResults}
          />
          <NumberInput
            label={labels.pdfFormsFontWeight}
            value={face.weight ?? 400}
            onChange={(weight) => setFace({ weight })}
            min={100}
            max={900}
            step={100}
            isDefault={face.weight === undefined}
            onReset={() => setFace({ weight: 400 })}
          />
          <ToggleSwitch
            label={labels.pdfFormsFontItalic}
            checked={face.style === 'italic'}
            onChange={(italic) => setFace({ style: italic ? 'italic' : 'normal' })}
            isDefault={face.style === undefined}
            onReset={() => setFace({ style: 'normal' })}
          />
        </NestedGroup>
      )}
    </FieldGroup>
  );
}
