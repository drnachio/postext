'use client';

import { useId, useState } from 'react';
import { Shapes } from 'lucide-react';
import type { ResourceSafeArea } from 'postext';
import { useSandboxLabels } from '../../../context/SandboxContext.js';
import { Button } from '../../../ui/index.js';
import { getBlob } from '../../../storage/blobStore.js';
import { readSvgSymbols } from './svgSymbols.js';

interface SvgSymbolsReaderProps {
  /** The picture's SVG file. */
  fileId: string | undefined;
  /** Add the zones found that the picture lacks; the number added. */
  onAdd: (found: ResourceSafeArea[]) => number;
}

const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs';

/** The "symbols of the drawing" row of the Avoid zones mode (#994): name
 *  the elements that are a map's dots and icons by an id prefix or a class
 *  and a zone is added over each one. */
export function SvgSymbolsReader({ fileId, onAdd }: SvgSymbolsReaderProps) {
  const labels = useSandboxLabels();
  const uid = useId();
  const [prefix, setPrefix] = useState('');
  const [className, setClassName] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const read = async () => {
    const record = fileId ? await getBlob(fileId).catch(() => null) : null;
    const found = record ? readSvgSymbols(new TextDecoder().decode(record.bytes), { idPrefix: prefix.trim(), className: className.trim() }) : undefined;
    if (!found) {
      setStatus(labels.resourceSymbolsUnreadable);
      return;
    }
    const added = onAdd(found);
    setStatus(added > 0 ? labels.resourceSymbolsAdded.replace('__n__', String(added)) : labels.resourceSymbolsNone);
  };

  return (
    <section aria-labelledby={`${uid}-title`} className="flex flex-col gap-1.5 rounded-md border p-2 text-xs" style={{ borderColor: 'var(--pt-control-border)' }}>
      <h3 id={`${uid}-title`} className="m-0 text-xs font-semibold">{labels.resourceSymbolsTitle}</h3>
      <p className="m-0 text-(--slate)">{labels.resourceSymbolsHelp}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${uid}-prefix`} className="shrink-0 text-(--slate)">{labels.resourceSymbolsPrefix}</label>
        <input id={`${uid}-prefix`} dir="ltr" type="text" spellCheck={false} autoCapitalize="off" autoComplete="off" value={prefix} onChange={(e) => setPrefix(e.target.value)} className={inputClass} style={{ borderColor: 'var(--pt-control-border)', color: 'var(--foreground)' }} />
        <label htmlFor={`${uid}-class`} className="shrink-0 text-(--slate)">{labels.resourceSymbolsClass}</label>
        <input id={`${uid}-class`} dir="ltr" type="text" spellCheck={false} autoCapitalize="off" autoComplete="off" value={className} onChange={(e) => setClassName(e.target.value)} className={inputClass} style={{ borderColor: 'var(--pt-control-border)', color: 'var(--foreground)' }} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" icon={<Shapes size={13} aria-hidden="true" />} disabled={!prefix.trim() && !className.trim()} onClick={() => { void read(); }}>
          {labels.resourceSymbolsRead}
        </Button>
        {status && <span role="status" className="text-(--slate)">{status}</span>}
      </div>
    </section>
  );
}
