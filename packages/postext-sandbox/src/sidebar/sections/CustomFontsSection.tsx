'use client';

import { memo, useCallback, useRef, useState } from 'react';
import { Pencil, Plus, Trash2, Upload } from 'lucide-react';
import type { CustomFontFamily, CustomFontVariant, CustomFontStyle } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { CollapsibleSection } from '../../controls';
import { ConfirmPopover } from '../../panels/ConfirmPopover';
import type { SandboxLabels } from '../../types';
import {
  deleteFontFile,
  formatFromFilename,
  generateFontFileId,
  putFontFile,
} from '../../storage/fontStorage';

function newFamilyName(existing: CustomFontFamily[], base: string): string {
  if (!existing.some((f) => f.name === base)) return base;
  let i = 2;
  while (existing.some((f) => f.name === `${base} ${i}`)) i++;
  return `${base} ${i}`;
}

const WEIGHTS: number[] = [100, 200, 300, 400, 500, 600, 700, 800, 900];

const COMPACT_CONTROL: React.CSSProperties = {
  borderColor: 'var(--rule)',
  backgroundColor: 'var(--surface)',
  color: 'var(--foreground)',
  padding: '2px 4px',
  borderRadius: 4,
  borderWidth: 1,
  borderStyle: 'solid',
  fontSize: 11,
};

export const CustomFontsSection = memo(function CustomFontsSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const customFonts: CustomFontFamily[] = useSandboxSelector((s) => s.config.customFonts ?? []);

  const [editingName, setEditingName] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const writeFamilies = useCallback(
    (next: CustomFontFamily[]) => {
      dispatch({
        type: 'UPDATE_CONFIG',
        payload: { customFonts: next.length > 0 ? next : undefined },
      });
    },
    [dispatch],
  );

  const updateFamily = useCallback(
    (name: string, partial: Partial<CustomFontFamily>) => {
      const next = customFonts.map((f) => (f.name === name ? { ...f, ...partial } : f));
      writeFamilies(next);
    },
    [customFonts, writeFamilies],
  );

  const addFamily = () => {
    const name = newFamilyName(customFonts, labels.customFontsNewFamilyName);
    writeFamilies([...customFonts, { name, variants: [] }]);
    setDraftName(name);
    setEditingName(name);
  };

  const deleteFamily = async (name: string) => {
    const fam = customFonts.find((f) => f.name === name);
    if (fam) {
      await Promise.all(
        fam.variants.map((v) => deleteFontFile(v.fileId).catch(() => undefined)),
      );
    }
    writeFamilies(customFonts.filter((f) => f.name !== name));
  };

  const commitRename = (currentName: string) => {
    const trimmed = draftName.trim();
    setEditingName(null);
    if (!trimmed || trimmed === currentName) return;
    if (customFonts.some((f) => f.name === trimmed)) return;
    const next = customFonts.map((f) =>
      f.name === currentName ? { ...f, name: trimmed } : f,
    );
    writeFamilies(next);
  };

  const addVariantFile = async (
    familyName: string,
    file: File,
    weight: number,
    style: CustomFontStyle,
  ) => {
    const format = formatFromFilename(file.name);
    if (!format) {
      setErrors((e) => ({ ...e, [familyName]: labels.customFontsVariantUnsupported }));
      return;
    }
    const fileId = generateFontFileId();
    const buffer = await file.arrayBuffer();
    await putFontFile({ fileId, fileName: file.name, format, buffer });
    const fam = customFonts.find((f) => f.name === familyName);
    if (!fam) return;
    const overlap = fam.variants.find((v) => v.weight === weight && v.style === style);
    if (overlap) {
      await deleteFontFile(overlap.fileId).catch(() => undefined);
    }
    const withoutOverlap = fam.variants.filter(
      (v) => !(v.weight === weight && v.style === style),
    );
    const variant: CustomFontVariant = { weight, style, fileId, format };
    updateFamily(familyName, { variants: [...withoutOverlap, variant] });
    setErrors((e) => {
      if (!(familyName in e)) return e;
      const rest = { ...e };
      delete rest[familyName];
      return rest;
    });
  };

  const updateVariant = (
    familyName: string,
    index: number,
    partial: Partial<CustomFontVariant>,
  ) => {
    const fam = customFonts.find((f) => f.name === familyName);
    if (!fam) return;
    const variants = fam.variants.map((v, i) => (i === index ? { ...v, ...partial } : v));
    updateFamily(familyName, { variants });
  };

  const removeVariant = async (familyName: string, index: number) => {
    const fam = customFonts.find((f) => f.name === familyName);
    if (!fam) return;
    const target = fam.variants[index];
    if (target) {
      await deleteFontFile(target.fileId).catch(() => undefined);
    }
    const variants = fam.variants.filter((_, i) => i !== index);
    updateFamily(familyName, { variants });
  };

  const hasOverrides = customFonts.length > 0;

  return (
    <CollapsibleSection
      title={labels.customFonts}
      sectionId="customFonts"
      hasOverrides={hasOverrides}
      onReset={() => writeFamilies([])}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      {customFonts.length === 0 && (
        <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>
          {labels.customFontsNone}
        </p>
      )}
      {customFonts.map((family) => {
        const isEditing = editingName === family.name;
        return (
          <div
            key={family.name}
            className="mb-3 rounded border"
            style={{ borderColor: 'var(--rule)' }}
          >
            <div
              className="flex items-center gap-1 border-b px-2 py-1.5"
              style={{ borderColor: 'var(--rule)' }}
            >
              {isEditing ? (
                <input
                  type="text"
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitRename(family.name);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingName(null);
                    }
                  }}
                  onBlur={() => commitRename(family.name)}
                  placeholder={labels.customFontsFamilyNamePlaceholder}
                  aria-label={labels.customFontsFamilyName}
                  className="min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs"
                  style={{ borderColor: 'var(--rule)', color: 'var(--foreground)' }}
                />
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftName(family.name);
                      setEditingName(family.name);
                    }}
                    aria-label={labels.customFontsEditFamilyName}
                    title={labels.customFontsEditFamilyName}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                    style={{ color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    <Pencil size={11} aria-hidden="true" />
                  </button>
                  <span
                    className="min-w-0 flex-1 truncate text-xs font-medium"
                    style={{
                      color: 'var(--foreground)',
                      fontFamily: `"${family.name}", sans-serif`,
                    }}
                    title={family.name}
                  >
                    {family.name}
                  </span>
                </>
              )}
              <ConfirmPopover
                message={labels.customFontsDeleteFamilyConfirm}
                onConfirm={() => { void deleteFamily(family.name); }}
              >
                {({ open }) => (
                  <button
                    type="button"
                    onClick={open}
                    aria-label={labels.customFontsDeleteFamily}
                    title={labels.customFontsDeleteFamily}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                    style={{ color: 'var(--destructive)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                )}
              </ConfirmPopover>
            </div>

            <div className="px-2 py-2">
              {family.variants.map((variant, index) => (
                <VariantRow
                  key={`${variant.fileId}-${index}`}
                  labels={labels}
                  variant={variant}
                  onWeightChange={(w) => updateVariant(family.name, index, { weight: w })}
                  onStyleChange={(s) => updateVariant(family.name, index, { style: s })}
                  onDelete={() => { void removeVariant(family.name, index); }}
                />
              ))}

              <UploadVariantButton
                labels={labels}
                onPick={(file, weight, style) => {
                  void addVariantFile(family.name, file, weight, style);
                }}
              />
              {errors[family.name] && (
                <p className="mt-1 text-xs" style={{ color: 'var(--destructive)' }}>
                  {errors[family.name]}
                </p>
              )}
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={addFamily}
        className="mt-1 flex items-center gap-1 rounded border px-2 py-1 text-xs"
        style={{
          borderColor: 'var(--rule)',
          backgroundColor: 'var(--surface)',
          color: 'var(--foreground)',
          cursor: 'pointer',
        }}
      >
        <Plus size={12} aria-hidden="true" />
        {labels.customFontsAddFamily}
      </button>
    </CollapsibleSection>
  );
});

function VariantRow({
  labels,
  variant,
  onWeightChange,
  onStyleChange,
  onDelete,
}: {
  labels: SandboxLabels;
  variant: CustomFontVariant;
  onWeightChange: (w: number) => void;
  onStyleChange: (s: CustomFontStyle) => void;
  onDelete: () => void;
}) {
  return (
    <div className="mb-1.5 flex items-center gap-1">
      <select
        aria-label={labels.customFontsVariantWeight}
        value={String(variant.weight)}
        onChange={(e) => onWeightChange(Number(e.target.value))}
        style={COMPACT_CONTROL}
      >
        {WEIGHTS.map((w) => (
          <option key={w} value={String(w)}>{w}</option>
        ))}
      </select>
      <select
        aria-label={labels.customFontsVariantStyle}
        value={variant.style}
        onChange={(e) => onStyleChange(e.target.value as CustomFontStyle)}
        style={COMPACT_CONTROL}
      >
        <option value="normal">{labels.customFontsVariantStyleNormal}</option>
        <option value="italic">{labels.customFontsVariantStyleItalic}</option>
      </select>
      <span
        className="min-w-0 flex-1 truncate text-[10px]"
        style={{ color: 'var(--slate)' }}
        title={variant.format}
      >
        .{variant.format}
      </span>
      <button
        type="button"
        onClick={onDelete}
        aria-label={labels.customFontsVariantDelete}
        title={labels.customFontsVariantDelete}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
        style={{ color: 'var(--destructive)', background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <Trash2 size={12} aria-hidden="true" />
      </button>
    </div>
  );
}

function UploadVariantButton({
  labels,
  onPick,
}: {
  labels: SandboxLabels;
  onPick: (file: File, weight: number, style: CustomFontStyle) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingWeight, setPendingWeight] = useState<number>(400);
  const [pendingStyle, setPendingStyle] = useState<CustomFontStyle>('normal');

  return (
    <div className="mt-1 flex items-center gap-1">
      <select
        aria-label={labels.customFontsVariantWeight}
        value={String(pendingWeight)}
        onChange={(e) => setPendingWeight(Number(e.target.value))}
        style={COMPACT_CONTROL}
      >
        {WEIGHTS.map((w) => (
          <option key={w} value={String(w)}>{w}</option>
        ))}
      </select>
      <select
        aria-label={labels.customFontsVariantStyle}
        value={pendingStyle}
        onChange={(e) => setPendingStyle(e.target.value as CustomFontStyle)}
        style={COMPACT_CONTROL}
      >
        <option value="normal">{labels.customFontsVariantStyleNormal}</option>
        <option value="italic">{labels.customFontsVariantStyleItalic}</option>
      </select>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex shrink-0 items-center gap-1 rounded border px-2 py-1 text-xs"
        style={{
          borderColor: 'var(--rule)',
          backgroundColor: 'var(--surface)',
          color: 'var(--foreground)',
          cursor: 'pointer',
        }}
        aria-label={labels.customFontsUploadVariant}
      >
        <Upload size={11} aria-hidden="true" />
        {labels.customFontsUploadVariant}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file, pendingWeight, pendingStyle);
          e.target.value = '';
        }}
        className="hidden"
        aria-hidden="true"
      />
    </div>
  );
}
