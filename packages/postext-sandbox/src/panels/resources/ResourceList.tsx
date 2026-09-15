'use client';

import { FileCode, Table as TableIcon, ImageIcon, Plus, ChevronDown, FolderOpen } from 'lucide-react';
import type { Resource, ResourceKind, ResourceType } from 'postext';
import { useSandboxLabels } from '../../context/SandboxContext';
import { useBlobObjectUrl } from './ResourcePreview';
import { Button, EmptyState, ListRow, Menu, MenuItem, PanelBody, PanelHeader } from '../../ui';

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

  // Group resources by type name. Resources whose typeId is unknown fall into
  // an "Untyped" group so they remain reachable.
  const groups = new Map<string, { name: string; items: Resource[] }>();
  for (const r of resources) {
    const type = typeById.get(r.typeId);
    const key = type ? type.id : '__untyped__';
    const name = type ? type.name : labels.resourceUntyped;
    const group = groups.get(key);
    if (group) group.items.push(r);
    else groups.set(key, { name, items: [r] });
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title={labels.resources} count={resources.length > 0 ? resources.length : undefined} actions={<NewMenu onNew={onNew} />} />
      <PanelBody padded>
        {resources.length === 0 ? (
          <EmptyState icon={<FolderOpen size={28} />} title={labels.resourcesEmpty} />
        ) : (
          [...groups.values()].map((group) => (
            <div key={group.name} className="mb-3">
              <div
                className="mb-1 px-1 text-xs font-medium uppercase tracking-wide"
                style={{ color: 'var(--slate)', fontSize: 10 }}
              >
                {group.name}
              </div>
              <div className="flex flex-col gap-1">
                {group.items.map((r) => {
                  const selected = r.id === selectedId;
                  const label = r.caption?.trim() || r.id;
                  return (
                    <ListRow
                      key={r.id}
                      selected={selected}
                      onSelect={() => onSelect(r.id)}
                      ariaLabel={label}
                      leading={<Thumb resource={r} />}
                      title={label}
                      subtitle={r.id}
                    />
                  );
                })}
              </div>
            </div>
          ))
        )}
      </PanelBody>
    </div>
  );
}
