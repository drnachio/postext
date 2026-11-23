'use client';

// One paper profile of the book's own (#1669): what the paper is called,
// who supplies it, and how it bulks (the spine is measured from it).

import type { FolioPaperType } from 'postext';
import type { PaperProfile } from 'postext/production';
import type { SandboxLabels } from '../../types/labels.js';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { NumberInput, SelectInput, TextInput } from '../../controls/index.js';

const TYPES: Record<FolioPaperType, keyof SandboxLabels> = {
  uncoated: 'folioPaperUncoated',
  bookWove: 'folioPaperBookWove',
  coatedMatte: 'folioPaperCoatedMatte',
  coatedSilk: 'folioPaperCoatedSilk',
  coatedGloss: 'folioPaperCoatedGloss',
  bible: 'folioPaperBible',
  newsprint: 'folioPaperNewsprint',
  cardStock: 'folioPaperCardStock',
  board: 'folioPaperBoard',
};

export function PaperProfileFields({ paper, onChange }: { paper: PaperProfile; onChange: (patch: Partial<PaperProfile>) => void }) {
  const labels = useSandboxLabels();
  const text = (v: string) => (v.trim() ? v : undefined);
  return (
    <div className="flex flex-col">
      <TextInput label={labels.coverPaperName} value={paper.name} onChange={(name) => onChange({ name })} widthCh={18} />
      <TextInput label={labels.coverPaperSupplier} value={paper.supplier ?? ''} onChange={(v) => onChange({ supplier: text(v) })} widthCh={18} />
      <TextInput label={labels.coverPaperCommercialName} tooltip={labels.coverPaperCommercialNameTooltip} value={paper.commercialName ?? ''} onChange={(v) => onChange({ commercialName: text(v) })} widthCh={18} />
      <SelectInput
        label={labels.folioPaperType}
        value={paper.type ?? 'bookWove'}
        options={(Object.keys(TYPES) as FolioPaperType[]).map((t) => ({ value: t, label: labels[TYPES[t]] }))}
        onChange={(t) => onChange({ type: t as FolioPaperType })}
      />
      <NumberInput label={labels.folioGrammage} tooltip={labels.folioGrammageTooltip} value={paper.grammage ?? 80} min={20} max={600} step={1} suffix="g/m²" onChange={(grammage) => onChange({ grammage })} />
      <NumberInput label={labels.folioBulk} tooltip={labels.folioBulkTooltip} value={paper.bulk ?? 0} min={0} max={4} step={0.05} onChange={(v) => onChange({ bulk: v > 0 ? v : undefined })} />
    </div>
  );
}
