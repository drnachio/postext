'use client';

/**
 * The paper of the book's text block in the Cover panel, shared by every
 * version: the main paper (a profile of the library, or the book design's
 * own) and the inserts on other papers, each by its pages, which the
 * spine counts on their own paper. When the text changes paper with
 * `:::paper` and no insert says so, the spine cannot know: it is said.
 */

import { Plus, Trash2 } from 'lucide-react';
import type { PaperProfile, PostextConfig } from 'postext';
import { Button, IconButton, NumberField, Select } from '../ui/index.js';
import { fill } from '../print/fillTokens.js';
import { bookMainPaper, type BookPaper } from './model/bookProduction.js';
import { Fold } from './Fold.js';
import type { Labels } from './productionUi.js';

const OWN = '__design__';
const MANUAL = '__manual__';

export function PaperSection({ paper, papers, config, usesPaperFences, labels, onChange }: {
  paper: BookPaper | undefined;
  papers: readonly PaperProfile[];
  config: PostextConfig;
  /** Whether the text sets pages on another paper with `:::paper`. */
  usesPaperFences: boolean;
  labels: Labels;
  onChange: (next: BookPaper | undefined) => void;
}) {
  const own = bookMainPaper(config);
  const main = bookMainPaper(config, paper, papers);
  const inserts = paper?.inserts ?? [];
  const set = (next: BookPaper) => {
    const out: BookPaper = { ...next };
    if (!out.profileId) delete out.profileId;
    if (!out.inserts?.length) delete out.inserts;
    onChange(Object.keys(out).length ? out : undefined);
  };
  const setInsert = (i: number, patch: Partial<NonNullable<BookPaper['inserts']>[number]>) =>
    set({ ...paper, inserts: inserts.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const g = (v: number) => v.toLocaleString();
  const note = `${main.name ?? labels.productionPaperOwn} · ${g(main.grammage)} g/m²${inserts.length ? ` · +${inserts.length}` : ''}`;

  return (
    <Fold title={labels.productionPaper} note={note} defaultOpen={usesPaperFences && inserts.length === 0}>
      <label className="flex flex-col gap-1 text-xs">
        {labels.productionPaperMain}
        <Select
          size="sm"
          value={paper?.profileId && papers.some((p) => p.id === paper.profileId) ? paper.profileId : OWN}
          onValueChange={(id) => set({ ...paper, ...(id === OWN ? { profileId: '' } : { profileId: id }) })}
          options={[
            { value: OWN, label: fill(labels.productionPaperFromDesign, { grammage: g(own.grammage), bulk: g(own.bulk) }) },
            ...papers.map((p) => ({ value: p.id, label: p.grammage ? `${p.name} · ${p.grammage} g/m²` : p.name })),
          ]}
          ariaLabel={labels.productionPaperMain}
        />
      </label>
      {papers.length === 0 && <p className="m-0 text-xs text-(--slate)">{labels.productionPaperNoProfiles}</p>}

      <h4 className="m-0 mt-1 text-xs font-semibold">{labels.productionInserts}</h4>
      <p className="m-0 text-xs text-(--slate)">{labels.productionInsertsHint}</p>
      {usesPaperFences && inserts.length === 0 && <p role="note" className="m-0 text-xs">{labels.productionPaperFences}</p>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0 text-xs">
        {inserts.map((ins, i) => {
          const profile = papers.find((p) => p.name === ins.name && p.grammage === ins.grammage);
          return (
            <li key={i} className="flex flex-col gap-1.5 border-t border-(--rule) pt-2">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1">
                  <span>{labels.productionInsertPages}</span>
                  <NumberField value={ins.pages} min={1} step={2} widthCh={5} onValueChange={(v) => setInsert(i, { pages: Math.max(1, Math.round(v)) })} ariaLabel={labels.productionInsertPages} />
                </label>
                <div className="min-w-0 flex-1">
                  <Select
                    size="sm"
                    value={profile?.id ?? MANUAL}
                    onValueChange={(id) => {
                      const p = papers.find((x) => x.id === id);
                      if (!p) return;
                      const r = bookMainPaper(config, { profileId: p.id }, papers);
                      setInsert(i, { name: p.name, grammage: r.grammage, bulk: r.bulk });
                    }}
                    options={[{ value: MANUAL, label: ins.name ?? labels.productionInsertManual }, ...papers.map((p) => ({ value: p.id, label: p.name }))]}
                    ariaLabel={labels.productionInsertPaper}
                  />
                </div>
                <IconButton label={labels.productionInsertDelete} icon={<Trash2 size={14} aria-hidden="true" />} onClick={() => set({ ...paper, inserts: inserts.filter((_, j) => j !== i) })} />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1">
                  <span>{labels.productionInsertGrammage}</span>
                  <NumberField value={ins.grammage} min={20} step={5} widthCh={5} onValueChange={(v) => setInsert(i, { grammage: Math.max(1, v) })} ariaLabel={labels.productionInsertGrammage} />
                </label>
                <label className="flex items-center gap-1">
                  <span>{labels.productionInsertBulk}</span>
                  <NumberField value={ins.bulk} min={0.5} step={0.05} widthCh={5} onValueChange={(v) => setInsert(i, { bulk: Math.max(0.1, v) })} ariaLabel={labels.productionInsertBulk} />
                </label>
              </div>
            </li>
          );
        })}
      </ul>
      <div>
        <Button variant="outline" size="sm" icon={<Plus size={13} />} onClick={() => set({ ...paper, inserts: [...inserts, { pages: 16, grammage: 115, bulk: 0.9, name: labels.productionInsertManual }] })}>
          {labels.productionInsertAdd}
        </Button>
      </div>
    </Fold>
  );
}
