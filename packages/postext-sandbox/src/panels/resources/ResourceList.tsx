'use client';

import { useEffect, useRef, useState } from 'react';
import { FileCode, Table as TableIcon, ImageIcon, Plus, ChevronDown } from 'lucide-react';
import type { Resource, ResourceKind, ResourceType } from 'postext';
import { useBlobObjectUrl } from './ResourcePreview';

interface ThumbProps {
  resource: Resource;
}

/** A small thumbnail: bitmap preview for images, glyphs for SVG/table. */
function Thumb({ resource }: ThumbProps) {
  const bitmapUrl = useBlobObjectUrl(
    resource.kind === 'bitmap' ? resource.bitmap?.fileId : undefined,
  );
  const svgUrl = useBlobObjectUrl(resource.kind === 'svg' ? resource.svg?.fileId : undefined);

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
    return svgUrl ? (
      <img src={svgUrl} alt="" style={{ ...box, objectFit: 'contain', padding: 3 }} />
    ) : (
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item = (label: string, kind: ResourceKind, Icon: typeof ImageIcon) => (
    <button
      type="button"
      onClick={() => {
        onNew(kind);
        setOpen(false);
      }}
      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs"
      style={{ color: 'var(--foreground)', background: 'none', border: 'none', cursor: 'pointer' }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface)')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      <Icon size={13} aria-hidden="true" />
      {label}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 rounded border px-2 py-1 text-xs"
        style={{
          borderColor: 'var(--rule)',
          backgroundColor: 'var(--surface)',
          color: 'var(--foreground)',
          cursor: 'pointer',
        }}
      >
        <Plus size={12} aria-hidden="true" />
        New
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 rounded border py-1 shadow-md"
          style={{
            minWidth: 150,
            backgroundColor: 'var(--background)',
            borderColor: 'var(--rule)',
          }}
        >
          {item('Upload image', 'bitmap', ImageIcon)}
          {item('Upload SVG', 'svg', FileCode)}
          {item('New table', 'table', TableIcon)}
        </div>
      )}
    </div>
  );
}

interface ResourceListProps {
  resources: Resource[];
  types: ResourceType[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: (kind: ResourceKind) => void;
}

/** Left column: a header with the "New" menu and resources grouped by their
 *  resource-type name. */
export function ResourceList({ resources, types, selectedId, onSelect, onNew }: ResourceListProps) {
  const typeById = new Map(types.map((t) => [t.id, t]));

  // Group resources by type name. Resources whose typeId is unknown fall into
  // an "Untyped" group so they remain reachable.
  const groups = new Map<string, { name: string; items: Resource[] }>();
  for (const r of resources) {
    const type = typeById.get(r.typeId);
    const key = type ? type.id : '__untyped__';
    const name = type ? type.name : 'Untyped';
    const group = groups.get(key);
    if (group) group.items.push(r);
    else groups.set(key, { name, items: [r] });
  }

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex items-center justify-between gap-2 border-b px-2 py-2"
        style={{ borderColor: 'var(--rule)' }}
      >
        <span className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>
          Resources
        </span>
        <NewMenu onNew={onNew} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {resources.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs" style={{ color: 'var(--slate)' }}>
            No resources yet. Use “New” to add one.
          </p>
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
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onSelect(r.id)}
                      aria-current={selected}
                      className="flex items-center gap-2 rounded px-1.5 py-1 text-left"
                      style={{
                        backgroundColor: selected ? 'var(--surface)' : 'transparent',
                        border: '1px solid',
                        borderColor: selected ? 'var(--rule)' : 'transparent',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        if (!selected) e.currentTarget.style.backgroundColor = 'var(--surface)';
                      }}
                      onMouseLeave={(e) => {
                        if (!selected) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <Thumb resource={r} />
                      <span className="flex min-w-0 flex-col">
                        <span
                          className="truncate text-xs"
                          style={{ color: 'var(--foreground)' }}
                          title={label}
                        >
                          {label}
                        </span>
                        <span
                          className="truncate text-xs"
                          style={{ color: 'var(--slate)', fontSize: 10 }}
                          title={r.id}
                        >
                          {r.id}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
