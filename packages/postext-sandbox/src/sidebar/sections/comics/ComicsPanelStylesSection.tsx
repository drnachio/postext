'use client';

import { memo } from 'react';
import { Plus } from 'lucide-react';
import type { NamedPanelStyleConfig } from 'postext';
import { useSandboxLabels } from '../../../context/SandboxContext';
import { CollapsibleSection } from '../../../controls';
import { Button } from '../../../ui';
import { SearchScope } from '../../search/SearchScope';
import { nextFreeId, removeById, renameById, resetFieldById, setComicsField, slugifyStyleId, upsertById } from './comicsConfig';
import { ComicsCardHeader } from './ComicsCardHeader';
import { PanelStyleFields, useComics } from './comicsShared';

/** Comics → Panel styles: named panel looks a page (`:::page{style=…}`) or
 *  a panel (`::panel{style=…}`) picks. Each inherits the fields it leaves
 *  unset from the default panel style. */
export const ComicsPanelStylesSection = memo(function ComicsPanelStylesSection() {
  const labels = useSandboxLabels();
  const { raw, resolved, write } = useComics();
  const styles: NamedPanelStyleConfig[] = raw?.panelStyles ?? [];
  const setList = (next: NamedPanelStyleConfig[]) => write(setComicsField(raw, 'panelStyles', next));

  return (
    <CollapsibleSection
      title={labels.comicsPanelStylesSection}
      sectionId="comicsPanelStyles"
      hasOverrides={styles.length > 0}
      onReset={() => setList([])}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.comicsPanelStylesResetConfirm}
    >
      {styles.length === 0 && <p className="mb-2 text-xs text-(--slate)">{labels.comicsPanelStylesEmpty}</p>}
      {styles.map((style) => {
        const r = resolved.panelStyles.find((s) => s.id === style.id) ?? { ...resolved.panel, id: style.id, name: style.id };
        return (
          <SearchScope key={style.id} title={`${style.name ?? ''} ${style.id}`} overridden>
            <div className="mb-3 rounded border border-(--rule) p-2">
              <ComicsCardHeader
                title={style.name || style.id}
                id={style.id}
                sanitizeId={slugifyStyleId}
                otherIds={new Set(styles.filter((s) => s.id !== style.id).map((s) => s.id))}
                idLabel={labels.idLabel}
                idHelp={labels.styleIdHelp}
                idAria={labels.comicsPanelStyleIdAria}
                idHint={labels.comicsPanelStyleUsageHint.replaceAll('__id__', style.id)}
                idDuplicateHint={labels.comicsStyleIdDuplicate}
                onRename={(nextId) => setList(renameById(styles, style.id, nextId))}
                name={style.name}
                nameLabel={labels.comicsStyleNameLabel}
                nameHelp={labels.styleNameHelp}
                nameAria={labels.comicsPanelStyleNameAria}
                onName={(name) => setList(upsertById(styles, style.id, { name }))}
                deleteLabel={labels.comicsStyleDelete}
                deleteConfirm={labels.comicsPanelStyleDeleteConfirm}
                onRemove={() => setList(removeById(styles, style.id))}
              />
              <PanelStyleFields
                raw={style}
                resolved={r}
                onChange={(partial) => setList(upsertById<NamedPanelStyleConfig>(styles, style.id, partial))}
                onResetField={(field) => setList(resetFieldById(styles, style.id, field))}
                fieldIdPrefix={`comics-panelStyle-${style.id}`}
              />
            </div>
          </SearchScope>
        );
      })}
      <Button
        variant="outline"
        size="xs"
        icon={<Plus size={12} />}
        onClick={() => setList([...styles, { id: nextFreeId('panel', styles.map((s) => s.id)), name: labels.comicsPanelStyleNewName }])}
        className="mt-1"
      >
        {labels.comicsPanelStyleAdd}
      </Button>
    </CollapsibleSection>
  );
});
