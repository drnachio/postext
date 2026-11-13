'use client';

import { memo, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { authoredSpotColors, finishSheen, spotInks } from 'postext';
import type { CmykPercent, InkFinish, InkSheen, PrintConfig, PrintInk, SpotInk } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import type { SandboxLabels } from '../../../types/labels.js';
import { CollapsibleSection, ItemCard, ItemCardListActions, NestedGroup, NumberInput, SelectInput, TextInput, ToggleSwitch, openCard } from '../../../controls/index.js';
import { Button, ConfirmPopover, IconButton } from '../../../ui/index.js';
import { SearchScope } from '../../search/SearchScope.js';
import {
  addInk,
  formatAliases,
  inkKey,
  inkOverprint,
  overprintValue,
  parseAliases,
  removeInk,
  resetInkField,
  setInkChannel,
  unlistedInks,
  updateInk,
  withInks,
  type InkOverprint,
} from '../../../print/inkTableEdits.js';
import { FINISH_KINDS, finishKindLabel, finishText, finishWithKind, finishWithSheen, sheenLabel, sheensFor, type FinishChoice } from '../../../controls/color/inkFinish.js';
import { usedInkFinishes } from '../../../print/usedInkFinishes.js';

const LIST = 'printInks';
/** What a new alternate starts from when no colour of the book names the ink. */
const BLACK: CmykPercent = { c: 0, m: 0, y: 0, k: 100 };

/** Print → Ink table (`print.inks`): one card per ink with the name the
 *  colours give it, its other names, the plate name in the PDF, whether it
 *  prints on its own plate or in CMYK, its alternate and its overprint. The
 *  inks the book's colours use and the table lacks are offered to add. */
export const PrintInksGroup = memo(function PrintInksGroup() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const raw: PrintConfig | undefined = config.print;
  const inks: PrintInk[] = raw?.inks ?? [];
  const used = useMemo(() => spotInks(authoredSpotColors(config).values()).inks, [config]);
  // The finish each ink has in the colours that name it (#1570).
  const usedFinishes = useMemo(() => usedInkFinishes(config), [config]);
  const offered = unlistedInks(used.map((i) => i.name), inks);

  const write = (next: PrintInk[]) => dispatch({ type: 'UPDATE_CONFIG', payload: { print: withInks(raw, next) } });
  const add = (name: string) => {
    openCard(LIST, String(inks.length));
    write(addInk(inks, name));
  };

  return (
    <CollapsibleSection
      title={labels.printGroupInks}
      sectionId="print-inks"
      variant="subsection"
      onReset={() => write([])}
      hasOverrides={inks.length > 0}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <p className="mb-2 text-xs text-(--slate) [text-wrap:pretty]">{inks.length === 0 ? labels.printInksEmpty : labels.printInksIntro}</p>
      <ItemCardListActions list={LIST} ids={inks.map((_, i) => String(i))} />
      {inks.map((ink, index) => (
        <InkCard
          key={index}
          ink={ink}
          index={index}
          known={used.find((u) => inkKey(u.name) === inkKey(ink.name))}
          colourFinish={usedFinishes.get(inkKey(ink.name))}
          labels={labels}
          onChange={(partial) => write(updateInk(inks, index, partial))}
          onReset={(key) => write(resetInkField(inks, index, key))}
          onChannel={(channel, v, seed) => write(setInkChannel(inks, index, channel, v, seed))}
          onRemove={() => write(removeInk(inks, index))}
        />
      ))}
      {offered.length > 0 && (
        <div className="mt-1 mb-1">
          <div className="mb-1 text-xs text-(--slate)">{labels.printInksUsed}</div>
          <div className="flex flex-wrap gap-1">
            {offered.map((name) => {
              const finish = usedFinishes.get(inkKey(name));
              return (
                <Button
                  key={name}
                  variant="outline"
                  size="xs"
                  icon={<Plus size={12} aria-hidden="true" />}
                  aria-label={labels.printInkAddUsed.replace('__ink__', name) + (finish ? ` (${finishText(finish, labels)})` : '')}
                  onClick={() => add(name)}
                >
                  <span dir="auto">{name}</span>
                  {finish && <span className="text-(--slate)">{`· ${finishText(finish, labels)}`}</span>}
                </Button>
              );
            })}
          </div>
        </div>
      )}
      <Button variant="outline" size="xs" icon={<Plus size={12} aria-hidden="true" />} onClick={() => add('')} className="mt-1">
        {labels.printInkAdd}
      </Button>
    </CollapsibleSection>
  );
});

interface InkCardProps {
  ink: PrintInk;
  index: number;
  /** The ink as the book's colours define it, when one names it. */
  known: SpotInk | undefined;
  /** The finish the colours that name the ink give it. */
  colourFinish: InkFinish | undefined;
  labels: SandboxLabels;
  onChange: (partial: Partial<PrintInk>) => void;
  onReset: (key: Exclude<keyof PrintInk, 'name'>) => void;
  onChannel: (channel: keyof CmykPercent, value: number, seed: CmykPercent) => void;
  onRemove: () => void;
}

function InkCard({ ink, index, known, colourFinish, labels, onChange, onReset, onChannel, onRemove }: InkCardProps) {
  const title = ink.name.trim() || labels.printInkUnnamed;
  const pdfName = ink.pdfName?.trim();
  const seed = known ? known.cmyk : BLACK;
  const cmyk = ink.cmyk ?? seed;
  const outputOptions = [
    { value: 'spot', label: labels.printInkOutputSpot },
    { value: 'process', label: labels.printInkOutputProcess },
  ];
  const overprintOptions: { value: InkOverprint; label: string }[] = [
    { value: 'colours', label: labels.printInkOverprintColours },
    { value: 'overprint', label: labels.printInkOverprintOn },
    { value: 'knockout', label: labels.printInkOverprintOff },
  ];
  return (
    <SearchScope title={`${ink.name} ${(ink.aliases ?? []).join(' ')} ${pdfName ?? ''}`} overridden>
      <ItemCard
        list={LIST}
        id={String(index)}
        title={title}
        subtitle={pdfName && pdfName !== ink.name.trim() ? pdfName : undefined}
        actions={
          <ConfirmPopover message={labels.printInkRemoveConfirm} onConfirm={onRemove}>
            {({ open }) => <IconButton label={`${labels.printInkRemove}: ${title}`} icon={<Trash2 size={13} />} destructive onClick={open} />}
          </ConfirmPopover>
        }
      >
        <TextInput label={labels.printInkName} value={ink.name} onChange={(v) => onChange({ name: v })}
          placeholder="PANTONE 286 C" tooltip={labels.printInkNameTooltip} isDefault={false} />
        <AliasesInput aliases={ink.aliases} label={labels.printInkAliases} tooltip={labels.printInkAliasesTooltip}
          onChange={(aliases) => onChange({ aliases })} onReset={() => onReset('aliases')} />
        <TextInput label={labels.printInkPdfName} value={ink.pdfName ?? ''} onChange={(v) => onChange({ pdfName: v })}
          placeholder={ink.name.trim() || undefined} tooltip={labels.printInkPdfNameTooltip} isDefault={ink.pdfName === undefined}
          onReset={() => onReset('pdfName')} />
        <SelectInput stacked label={labels.printInkOutput} value={ink.output ?? 'spot'} options={outputOptions}
          onChange={(v) => onChange({ output: v === 'process' ? 'process' : 'spot' })} tooltip={labels.printInkOutputTooltip}
          isDefault={ink.output === undefined} onReset={() => onReset('output')} />
        <ToggleSwitch label={labels.printInkCmykSet} checked={ink.cmyk !== undefined}
          onChange={(on) => (on ? onChange({ cmyk: { ...seed } }) : onReset('cmyk'))}
          tooltip={labels.printInkCmykSetTooltip} isDefault={ink.cmyk === undefined} onReset={() => onReset('cmyk')} />
        {ink.cmyk && (
          <NestedGroup>
            {(['c', 'm', 'y', 'k'] as const).map((ch) => (
              <NumberInput key={ch} label={ch.toUpperCase()} value={cmyk[ch]} onChange={(v) => onChannel(ch, v, seed)} min={0} max={100} step={5}
                tooltip={labels.printInkCmykSetTooltip} isDefault={false} onReset={() => onReset('cmyk')} />
            ))}
          </NestedGroup>
        )}
        <InkFinishFields finish={ink.finish} colourFinish={colourFinish} labels={labels}
          onChange={(finish) => (finish ? onChange({ finish }) : onReset('finish'))} />
        <SelectInput stacked label={labels.printInkOverprint} value={inkOverprint(ink)} options={overprintOptions}
          onChange={(v) => onChange({ overprint: overprintValue(v as InkOverprint) })} tooltip={labels.printInkOverprintTooltip}
          isDefault={ink.overprint === undefined} onReset={() => onReset('overprint')} />
      </ItemCard>
    </SearchScope>
  );
}

/** The ink's finish and sheen (`PrintInk.finish`), over what the colours
 *  that name it say: unset, the card shows theirs. */
function InkFinishFields({ finish, colourFinish, labels, onChange }: {
  finish: InkFinish | undefined;
  colourFinish: InkFinish | undefined;
  labels: SandboxLabels;
  onChange: (finish: InkFinish | undefined) => void;
}) {
  const colours = colourFinish ? `${labels.printInkFinishColours} (${finishText(colourFinish, labels)})` : labels.printInkFinishColours;
  const kindOptions = [
    { value: 'colours', label: colours },
    ...FINISH_KINDS.map((k) => ({ value: k, label: finishKindLabel(k, labels) })),
  ];
  const sheens = finish ? sheensFor(finish.kind) : [];
  const defaultSheen = finish ? finishSheen({ kind: finish.kind }) : undefined;
  const sheenOptions = [
    { value: 'default', label: defaultSheen ? labels.inkSheenDefault.replace('__sheen__', sheenLabel(defaultSheen, labels).toLocaleLowerCase()) : labels.inkFinishNone },
    ...sheens.map((s) => ({ value: s, label: sheenLabel(s, labels) })),
  ];
  return (
    <>
      <SelectInput stacked label={labels.inkFinish} value={finish?.kind ?? 'colours'} options={kindOptions}
        onChange={(v) => onChange(v === 'colours' ? undefined : finishWithKind(finish, v as FinishChoice))}
        tooltip={labels.inkFinishTooltip} isDefault={finish === undefined} onReset={() => onChange(undefined)} />
      {finish && sheens.length > 0 && (
        <SelectInput stacked label={labels.inkSheen} value={finish.sheen ?? 'default'} options={sheenOptions}
          onChange={(v) => onChange(finishWithSheen(finish, v === 'default' ? undefined : (v as InkSheen)))}
          tooltip={labels.inkSheenTooltip} isDefault={finish.sheen === undefined} onReset={() => onChange(finishWithSheen(finish, undefined))} />
      )}
    </>
  );
}

/** The aliases as one comma-separated line. What is typed stays as typed
 *  (a trailing comma, a space) while it reads back as the stored list; a
 *  change from elsewhere (reset, undo) replaces it. */
function AliasesInput({ aliases, label, tooltip, onChange, onReset }: {
  aliases: string[] | undefined;
  label: string;
  tooltip: string;
  onChange: (aliases: string[]) => void;
  onReset: () => void;
}) {
  const stored = formatAliases(aliases);
  const [draft, setDraft] = useState(stored);
  const [seen, setSeen] = useState(stored);
  if (stored !== seen) {
    setSeen(stored);
    setDraft(stored);
  }
  const type = (text: string) => {
    setDraft(text);
    const next = parseAliases(text);
    setSeen(formatAliases(next));
    onChange(next);
  };
  return (
    <TextInput label={label} value={draft} onChange={type} placeholder="Pantone 286C, Corporate blue"
      tooltip={tooltip} isDefault={stored === ''} onReset={onReset} />
  );
}
