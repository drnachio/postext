'use client';

// The book's own printer profiles (#1669): binding profiles copied from a
// built-in one and set to a printer's measures, paper profiles, and the
// file that carries them from one book or one person to another
// (`.postext-production.json`).

import { useRef, useState } from 'react';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import { exportProductionProfiles, importProductionProfiles, type ProductionConfig, type TrimMm } from 'postext/production';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { CollapsibleSection, SelectInput } from '../../controls/index.js';
import { downloadBytes } from '../../storage/persistence/files.js';
import { announce } from '../../ui/announcer.js';
import { Button, ConfirmPopover, IconButton } from '../../ui/index.js';
import { addBinding, addPaper, mergeProfiles, removeBinding, removePaper, updateBinding, updatePaper, versionsBoundWith } from '../profiles.js';
import { BUILT_IN_BINDING_PROFILES, type BindingProfile } from 'postext/production';
import { bindingProfiles } from '../versions.js';
import { profileName } from './coverLabels.js';
import { BindingProfileFields } from './BindingProfileFields.js';
import { PaperProfileFields } from './PaperProfileFields.js';

/** Files larger than this are no profiles file. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

export function ProfilesSection({ production, trim, write }: {
  production: ProductionConfig | undefined;
  trim: TrimMm;
  write: (next: ProductionConfig | undefined) => void;
}) {
  const labels = useSandboxLabels();
  // A built-in profile by its name in the reader's language.
  const shownName = (b: BindingProfile) => profileName(labels, b, BUILT_IN_BINDING_PROFILES.some((x) => x.id === b.id) && !(production?.bindings ?? []).some((x) => x.id === b.id));
  const own = production?.bindings ?? [];
  const papers = production?.papers ?? [];
  const [bindingId, setBindingId] = useState<string | null>(null);
  const [paperId, setPaperId] = useState<string | null>(null);
  const binding = own.find((b) => b.id === bindingId) ?? own[0];
  const paper = papers.find((p) => p.id === paperId) ?? papers[0];
  const fileRef = useRef<HTMLInputElement>(null);
  const bound = binding ? versionsBoundWith(production, binding.id) : [];

  const importFile = async (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      announce(labels.coverProfilesImportFailed);
      return;
    }
    try {
      const read = importProductionProfiles(JSON.parse(await file.text()));
      if (read.papers.length === 0 && read.bindings.length === 0) {
        announce(labels.coverProfilesImportFailed);
        return;
      }
      write(mergeProfiles(production, read.papers, read.bindings));
      announce(labels.coverProfilesImported
        .replace('__bindings__', String(read.bindings.length))
        .replace('__papers__', String(read.papers.length))
        .replace('__skipped__', String(read.issues.length)));
    } catch {
      announce(labels.coverProfilesImportFailed);
    }
  };

  return (
    <CollapsibleSection title={labels.coverProfiles} sectionId="cover-profiles">
      <p className="px-3 py-1 text-xs text-(--slate)">{labels.coverProfilesIntro}</p>
      <h3 className="px-3 pt-2 text-xs font-semibold">{labels.coverBindingProfiles}</h3>
      {binding && (
        <div className="flex items-center">
          <div className="flex-1">
            <SelectInput label={labels.coverProfile} value={binding.id} options={own.map((b) => ({ value: b.id, label: b.name || b.id }))} onChange={setBindingId} />
          </div>
          <ConfirmPopover
            message={bound.length > 0 ? labels.coverProfileInUse.replace('__versions__', bound.join(', ')) : labels.coverDeleteProfileConfirm.replace('__name__', binding.name || binding.id)}
            confirmLabel={labels.coverDeleteProfile}
            onConfirm={() => { if (bound.length === 0) { write(removeBinding(production, binding.id)); setBindingId(null); } }}
          >
            {({ open }) => <IconButton label={labels.coverDeleteProfile} icon={<Trash2 size={14} />} onClick={open} destructive />}
          </ConfirmPopover>
        </div>
      )}
      <SelectInput
        label={labels.coverNewProfileFrom}
        value=""
        isDefault
        options={[{ value: '', label: labels.coverNewProfileChoose }, ...bindingProfiles(production).map((b) => ({ value: b.id, label: shownName(b) }))]}
        onChange={(id) => {
          const from = bindingProfiles(production).find((b) => b.id === id);
          if (!from) return;
          const made = addBinding(production, from, labels.coverNewProfileName.replace('__name__', shownName(from)));
          write(made.production);
          setBindingId(made.id);
        }}
      />
      {binding && <BindingProfileFields profile={binding} trim={trim} onChange={(patch) => write(updateBinding(production, binding.id, patch))} />}

      <h3 className="px-3 pt-3 text-xs font-semibold">{labels.coverPaperProfiles}</h3>
      {paper && (
        <div className="flex items-center">
          <div className="flex-1">
            <SelectInput label={labels.coverPaper} value={paper.id} options={papers.map((p) => ({ value: p.id, label: p.name || p.id }))} onChange={setPaperId} />
          </div>
          <IconButton label={labels.coverDeletePaper} icon={<Trash2 size={14} />} destructive onClick={() => { write(removePaper(production, paper.id)); setPaperId(null); }} />
        </div>
      )}
      <div className="px-3 py-1">
        <Button variant="outline" size="sm" icon={<Plus size={13} />} onClick={() => { const made = addPaper(production, labels.coverNewPaperName); write(made.production); setPaperId(made.id); }}>{labels.coverAddPaper}</Button>
      </div>
      {paper && <PaperProfileFields paper={paper} onChange={(patch) => write(updatePaper(production, paper.id, patch))} />}

      <div className="flex flex-wrap gap-2 px-3 py-2">
        <Button
          variant="outline"
          size="sm"
          icon={<Download size={13} />}
          disabled={own.length === 0 && papers.length === 0}
          onClick={() => downloadBytes(new TextEncoder().encode(JSON.stringify(exportProductionProfiles(papers, own), null, 2)), 'profiles.postext-production.json', 'application/json')}
        >
          {labels.coverProfilesExport}
        </Button>
        <Button variant="outline" size="sm" icon={<Upload size={13} />} onClick={() => fileRef.current?.click()}>{labels.coverProfilesImport}</Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }}
        />
      </div>
    </CollapsibleSection>
  );
}
