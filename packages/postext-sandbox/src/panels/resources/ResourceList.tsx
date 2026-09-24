'use client';

import { FileCode, Table as TableIcon, ImageIcon, Plus, ChevronDown, FolderOpen, Search, X } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import type { Resource, ResourceKind, ResourceType } from 'postext';
import { useSandboxLabels } from '../../context/SandboxContext';
import { useBlobObjectUrl } from './ResourcePreview';
import { Button, EmptyState, HighlightedText, IconButton, ListRow, Menu, MenuItem, PanelBody, PanelHeader } from '../../ui';
import { compileMatcher, normalizeText } from '../../sidebar/search/normalize';

interface ThumbProps {
  resource: Resource;
}

/** A small thumbnail: bitmap preview for images, glyphs for SVG/table. SVGs
 *  get a glyph on purpose: previewing them means decoding each file and
 *  inlining its fonts for every row, which made a long list sluggish. */
function Thumb({ resource }: ThumbProps) {
  const bitmapUrl = useBlobObjectUrl(
    resource.kind === 'bitmap' ? resource.bitmap?.fileId : undefined,
  );

  const box: React.CSSProperties = {
    width: 36,
    height: 36,
    flexShrink: 0,
    borderRadius: 4,
    backgroundColor: 'var(--surface)',
    color: 'var(--slate)',
    overflow: 'hidden',
  };

  if (resource.kind === 'bitmap') {
    return bitmapUrl ? (
      <img src={bitmapUrl} alt="" style={{ ...box, objectFit: 'cover' }} />
    ) : (
      <span className="flex items-center justify-center" style={box}>
        <ImageIcon size={16} aria-hidden="true" />
      </span>
    );
  }
  if (resource.kind === 'svg') {
    return (
      <span className="flex items-center justify-center" style={box}>
        <FileCode size={16} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="flex items-center justify-center" style={box}>
      <TableIcon size={16} aria-hidden="true" />
    </span>
  );
}

interface NewMenuProps {
  onNew: (kind: ResourceKind) => void;
}

/** "New" dropdown: Upload image / Upload SVG / New table. */
function NewMenu({ onNew }: NewMenuProps) {
  const labels = useSandboxLabels();
  return (
    <Menu
      trigger={
        <Button variant="outline" size="xs" icon={<Plus size={12} />} trailingIcon={<ChevronDown size={12} />}>
          {labels.resourceNew}
        </Button>
      }
    >
      <MenuItem icon={<ImageIcon size={13} />} onClick={() => onNew('bitmap')}>{labels.resourceUploadImage}</MenuItem>
      <MenuItem icon={<FileCode size={13} />} onClick={() => onNew('svg')}>{labels.resourceUploadSvg}</MenuItem>
      <MenuItem icon={<TableIcon size={13} />} onClick={() => onNew('table')}>{labels.resourceNewTable}</MenuItem>
    </Menu>
  );
}

interface ResourceListProps {
  resources: Resource[];
  types: ResourceType[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: (kind: ResourceKind) => void;
}

/** Main view: a header with the "New" menu and resources grouped by their
 *  resource-type name. Selecting a resource swaps this for the detail view. */
export function ResourceList({ resources, types, selectedId, onSelect, onNew }: ResourceListProps) {
  const labels = useSandboxLabels();
  const typeById = new Map(types.map((t) => [t.id, t]));
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const matcher = useMemo(() => compileMatcher(deferredQuery), [deferredQuery]);
  const filtering = matcher.tokens.length > 0;
  const shown = filtering
    ? resources.filter((r) => matcher.test(normalizeText(`${r.caption ?? ''} ${r.id}`)))
    : resources;

  // Group resources by type name. Resources whose typeId is unknown fall into
  // an "Untyped" group so they remain reachable.
  const groups = new Map<string, { name: string; items: Resource[] }>();
  for (const r of shown) {
    const type = typeById.get(r.typeId);
    const key = type ? type.id : '__untyped__';
    const name = type ? type.name : labels.resourceUntyped;
    const group = groups.get(key);
    if (group) group.items.push(r);
    else groups.set(key, { name, items: [r] });
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title={labels.navResources} count={resources.length > 0 ? resources.length : undefined} actions={<NewMenu onNew={onNew} />} />
      {resources.length > 6 && (
        <div className="shrink-0 border-b border-(--rule) px-3 py-2">
          <div className="flex h-7 items-center gap-1.5 rounded-md border border-(--rule) bg-(--surface) px-2 focus-within:border-(--brand)">
            <Search size={13} aria-hidden="true" className="shrink-0 text-(--slate)" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.preventDefault(); setQuery(''); } }}
              placeholder={labels.resourcesSearchPlaceholder}
              aria-label={labels.resourcesSearchPlaceholder}
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-xs text-(--foreground) outline-none placeholder:text-(--slate) [&::-webkit-search-cancel-button]:hidden"
            />
            {query && <IconButton size={18} label={labels.settingsSearchClear} icon={<X size={12} />} tooltip={false} onClick={() => setQuery('')} />}
          </div>
        </div>
      )}
      <PanelBody padded>
        {resources.length === 0 ? (
          <EmptyState
            icon={<FolderOpen size={28} />}
            title={labels.resourcesEmpty}
            description={labels.resourcesEmptyDescription}
            action={
              <Button variant="outline" size="xs" icon={<ImageIcon size={12} />} onClick={() => onNew('bitmap')}>
                {labels.resourceUploadImage}
              </Button>
            }
          />
        ) : shown.length === 0 ? (
          <EmptyState icon={<Search size={28} />} title={labels.resourcesSearchNoResults.replace('__query__', deferredQuery)} />
        ) : (
          [...groups.values()].map((group) => (
            <section key={group.name} className="mb-3" aria-label={group.name}>
              <h3 className="mb-1 flex items-center gap-1.5 px-1 text-[0.6rem] font-semibold tracking-[0.12em] text-(--slate) uppercase">
                {group.name}
                <span className="font-normal tabular-nums">{group.items.length}</span>
              </h3>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {group.items.map((r) => {
                  const selected = r.id === selectedId;
                  const label = r.caption?.trim() || r.id;
                  return (
                    <li key={r.id}>
                      <ListRow
                        selected={selected}
                        onSelect={() => onSelect(r.id)}
                        ariaLabel={label}
                        leading={<Thumb resource={r} />}
                        title={<HighlightedText text={label} tokens={matcher.tokens} />}
                        subtitle={<HighlightedText text={r.id} tokens={matcher.tokens} />}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </PanelBody>
    </div>
  );
}
