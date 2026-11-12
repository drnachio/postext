'use client';

import { useState } from 'react';
import { DESIGN_PARTS, type DesignPart, type MissingStyle } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext.js';
import { Button, Select, announce, type SelectOption } from '../../ui/index.js';
import { downloadBytes } from '../../storage/persistence.js';
import { fill } from '../../print/fillTokens.js';
import { useDesignHost } from '../../designs/designHost.js';
import { useDesignTrial } from '../../designs/designTrial.js';
import { bookDesignConfig, deleteDesign, designAsChapterStyle, discardDesign, exportDesign, keepDesign, saveDesign, tryDesign } from '../../designs/designActions.js';
import { POSTEXT_MIME } from '../../presets/zip.js';
import { useDesignEntries } from './useDesignEntries.js';
import { DesignCard } from './DesignCard.js';
import { PartChoice } from './PartChoice.js';
import { DesignImportButton } from './DesignImportButton.js';

const THIS_BOOK = '__this-book__';
const inputClass = 'rounded border border-(--pt-control-border) bg-(--background) px-2 py-1 text-xs text-(--foreground)';

/** The style ids a design lacks, as a list for the notice. */
function missingList(missing: readonly MissingStyle[]): string {
  return missing.map((m) => m.id).join(', ');
}

/**
 * The designs (#1523), a page of the Design panel: the gallery (saved
 * designs, the ones the Sandbox ships and the sample books'), the design
 * being tried with Keep and Discard, and the book's design saved or
 * exported as a design file, whole or by parts.
 */
export function DesignsPage() {
  const labels = useSandboxLabels();
  const host = useDesignHost();
  // Only what the page shows: the whole state would draw it again on every keystroke.
  const config = useSandboxSelector((s) => s.config);
  const configLayers = useSandboxSelector((s) => s.configLayers);
  const activeProjectId = useSandboxSelector((s) => s.activeProjectId);
  const activePresetId = useSandboxSelector((s) => s.activePresetId);
  const projects = useSandboxSelector((s) => s.projects);
  const entries = useDesignEntries(host);
  const trial = useDesignTrial({ activeProjectId, activePresetId });
  const book = trial?.before ?? bookDesignConfig({ config, configLayers });
  const [from, setFrom] = useState<string>(THIS_BOOK);
  const [name, setName] = useState('');
  const [parts, setParts] = useState<DesignPart[]>([...DESIGN_PARTS]);
  const [busy, setBusy] = useState(false);

  const fromOptions: SelectOption[] = [
    { value: THIS_BOOK, label: labels.designsThisBook },
    ...projects.filter((p) => p.id !== activeProjectId).map((p) => ({ value: p.id, label: p.name })),
  ];

  const busyRun = async (work: () => Promise<void>, failed: string) => {
    setBusy(true);
    try {
      await work();
    } catch {
      announce(failed);
    } finally {
      setBusy(false);
    }
  };

  const save = () => busyRun(async () => {
    const { entry } = await saveDesign(host, { name, parts, ...(from !== THIS_BOOK ? { from } : {}) });
    setName('');
    announce(fill(labels.designsSaved, { name: entry.name }));
  }, labels.designsSaveFailed);

  const download = (made: { bytes: Uint8Array; fileName: string }) => {
    downloadBytes(made.bytes, made.fileName, POSTEXT_MIME);
    announce(fill(labels.designsExported, { file: made.fileName }));
  };

  const exportBook = () => busyRun(async () => download(await exportDesign(host, { parts, ...(name.trim() ? { name } : {}) })), labels.designsSaveFailed);

  const tryOn = (entryId: string, chosen: DesignPart[]) => busyRun(async () => {
    const t = await tryDesign(host, entryId, chosen);
    announce(fill(labels.designsTrying, { name: t.name }) + (t.missing.length > 0 ? ` ${fill(labels.designsMissing, { list: missingList(t.missing) })}` : ''));
  }, labels.designsLoadFailed);

  const asStyle = (entryId: string, chosen: DesignPart[], target: { id: string } | { name: string }) => busyRun(async () => {
    const done = await designAsChapterStyle(host, entryId, chosen, target);
    announce(fill(labels.designsAsStyleDone, { name: done.name, id: done.id }));
  }, labels.designsLoadFailed);

  const keep = () => {
    const t = keepDesign(host);
    if (t) announce(fill(labels.designsKept, { name: t.name }));
  };

  const discard = () => {
    if (discardDesign(host)) announce(labels.designsDiscarded);
  };

  return (
    <div className="flex flex-col gap-4 px-3 py-3" style={{ fontSize: 13, lineHeight: '19px' }}>
      <div className="flex items-start justify-between gap-2">
        <p className="m-0 text-xs text-(--slate)">{labels.designsIntro}</p>
        <DesignImportButton />
      </div>

      {trial && (
        <div role="status" className="flex flex-col gap-2 rounded-md border border-(--brand) p-2 text-xs">
          <span>{fill(labels.designsTrying, { name: trial.name })}</span>
          {configLayers && <span className="text-(--slate)">{labels.designsMultilingual}</span>}
          {trial.missing.length > 0 && <span>{fill(labels.designsMissing, { list: missingList(trial.missing) })}</span>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={discard}>{labels.designsDiscard}</Button>
            <Button variant="primary" size="sm" onClick={keep}>{labels.designsKeep}</Button>
          </div>
        </div>
      )}

      <section className="flex flex-col gap-2" aria-busy={busy || entries === null}>
        <h3 className="m-0 text-[0.72rem] font-semibold tracking-[0.12em] text-(--slate) pt-caps">{labels.designsGallery}</h3>
        {entries === null && <p className="m-0 text-xs text-(--slate)">{labels.designsLoading}</p>}
        {entries !== null && !entries.some((e) => e.kind === 'saved') && <p className="m-0 text-xs text-(--slate)">{labels.designsEmpty}</p>}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {(entries ?? []).map((entry) => (
            <DesignCard
              key={entry.id}
              host={host}
              entry={entry}
              book={book}
              active={trial?.entryId === entry.id}
              styles={book.chapterStyles ?? []}
              onTry={(chosen) => void tryOn(entry.id, chosen)}
              onAsStyle={(chosen, target) => void asStyle(entry.id, chosen, target)}
              onExport={(chosen) => void busyRun(async () => download(await exportDesign(host, { entryId: entry.id, parts: chosen })), labels.designsLoadFailed)}
              {...(entry.kind === 'saved' ? {
                onDelete: () => void deleteDesign(entry.id).then(() => announce(fill(labels.designsDeleted, { name: entry.name }))),
              } : {})}
            />
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-(--rule) p-3">
        <h3 className="m-0 text-xs font-semibold">{labels.designsSaveHeading}</h3>
        {fromOptions.length > 1 && (
          <label className="flex flex-col gap-1 text-xs">
            {labels.designsSaveFrom}
            <Select size="sm" value={from} onValueChange={setFrom} options={fromOptions} ariaLabel={labels.designsSaveFrom} />
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs">
          {labels.designsName}
          <input
            type="text"
            value={name}
            placeholder={labels.designsNamePlaceholder}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) void save(); }}
            className={inputClass}
          />
        </label>
        <PartChoice legend={labels.designsParts} available={DESIGN_PARTS} value={parts} onChange={setParts} />
        <p className="m-0 text-xs text-(--slate)">{labels.designsExportIntro}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => void exportBook()} disabled={busy || parts.length === 0 || from !== THIS_BOOK}>
            {labels.designsExport}
          </Button>
          <Button variant="primary" size="sm" onClick={() => void save()} disabled={busy || !name.trim() || parts.length === 0}>
            {labels.designsSave}
          </Button>
        </div>
      </section>
    </div>
  );
}
