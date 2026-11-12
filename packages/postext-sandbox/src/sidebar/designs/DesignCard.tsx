'use client';

import { useMemo, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { applyDesign, resolveBodyTextConfig, resolveColorValue, resolveLayoutConfig, resolvePageConfig, type ChapterStyleConfig, type DesignPart, type PostextConfig } from 'postext';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { Button, ConfirmPopover, IconButton, cn } from '../../ui/index.js';
import { PagePreview } from '../settings/PagePreview.js';
import { toPt } from '../../controls/inputs/units.js';
import { fill } from '../../print/fillTokens.js';
import { CHAPTER_STYLE_PARTS, type DesignHost } from '../../designs/designActions.js';
import type { DesignEntry } from '../../designs/designSources.js';
import { useLoadedDesign } from './useDesignEntries.js';
import { PartChoice } from './PartChoice.js';

const inputClass = 'rounded border border-(--pt-control-border) bg-(--background) px-2 py-1 text-xs text-(--foreground)';

/** One design of the gallery: a drawing of its page, its type and colours,
 *  and what can be done with it. */
export function DesignCard({ host, entry, book, active, styles, onTry, onAsStyle, onExport, onDelete }: {
  host: DesignHost;
  entry: DesignEntry;
  /** The book's design, for the drawing: the design's parts over it. */
  book: PostextConfig;
  /** Being tried on the book. */
  active: boolean;
  /** The book's chapter styles. */
  styles: readonly ChapterStyleConfig[];
  onTry: (parts: DesignPart[]) => void;
  onAsStyle: (parts: DesignPart[], target: { id: string } | { name: string }) => void;
  onExport: (parts: DesignPart[]) => void;
  onDelete?: () => void;
}) {
  const labels = useSandboxLabels();
  const ready = useLoadedDesign(host, entry);
  const [choosing, setChoosing] = useState<false | 'try' | 'style' | 'export'>(false);
  const [chosen, setChosen] = useState<DesignPart[]>(entry.parts);
  const styleParts = entry.parts.filter((p) => CHAPTER_STYLE_PARTS.includes(p));
  const [styleChosen, setStyleChosen] = useState<DesignPart[]>(styleParts);
  const [styleTarget, setStyleTarget] = useState('');
  const [styleName, setStyleName] = useState(entry.name);

  const look = useMemo(() => (ready ? applyDesign(book, ready.design) : null), [book, ready]);
  const layout = look ? resolveLayoutConfig(look.layout) : null;
  const page = look && layout ? resolvePageConfig(look.page, look.locale, layout.writingMode) : null;
  const body = look ? resolveBodyTextConfig(look.bodyText, look.locale) : null;
  const ink = look && body ? resolveColorValue(body.color, look.colorPalette, { hex: '#000000', model: 'hex' }).hex : '#000000';
  const palette = ready?.design.config.colorPalette ?? [];
  const kind = entry.kind === 'saved' ? labels.designsKindSaved : entry.kind === 'builtin' ? labels.designsKindBuiltin : labels.designsKindSample;

  return (
    <li className={cn('flex flex-col gap-2 rounded-lg border bg-(--surface) p-3', active ? 'border-(--brand)' : 'border-(--rule)')}>
      <div className="flex gap-3">
        {page && layout && body && <PagePreview page={page} layout={layout} lineHeightPt={toPt(body.lineHeight)} inkHex={ink} height={72} />}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-start justify-between gap-1">
            <span className="font-semibold" style={{ overflowWrap: 'anywhere' }}>{entry.name}</span>
            <span className="shrink-0 rounded bg-(--background) px-1 text-[0.6rem] text-(--slate)">{kind}</span>
          </div>
          {entry.description && <span className="text-xs text-(--slate)">{entry.description}</span>}
          {entry.source && <span className="text-xs text-(--slate)">{fill(labels.designsFrom, { book: entry.source })}</span>}
          {body && (
            <span className="truncate text-xs" style={{ fontFamily: `"${body.fontFamily}", serif` }}>{body.fontFamily} · {toPt(body.fontSize)}/{toPt(body.lineHeight)} pt</span>
          )}
          {palette.length > 0 && (
            <span role="img" className="flex items-center gap-0.5" aria-label={palette.map((p) => p.name).join(', ')}>
              {palette.slice(0, 8).map((p) => (
                <span key={p.id} title={p.name} className="inline-block h-3 w-3 rounded-sm border border-(--rule)" style={{ backgroundColor: p.value.hex }} />
              ))}
            </span>
          )}
        </div>
      </div>
      {choosing === 'try' || choosing === 'export' ? (
        <div className="flex flex-col gap-2">
          <PartChoice legend={choosing === 'try' ? labels.designsApplyIntro : labels.designsParts} available={entry.parts} value={chosen} onChange={setChosen} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setChoosing(false)}>{labels.designsCancel}</Button>
            <Button
              variant="primary"
              size="sm"
              disabled={chosen.length === 0}
              onClick={() => { (choosing === 'try' ? onTry : onExport)(chosen); setChoosing(false); }}
            >
              {choosing === 'try' ? labels.designsTryIn : labels.designsExport}
            </Button>
          </div>
        </div>
      ) : choosing === 'style' ? (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-xs text-(--slate)">{labels.designsAsStyleIntro}</p>
          <label className="flex flex-col gap-1 text-xs">
            {labels.designsAsStyleTarget}
            <select value={styleTarget} onChange={(e) => setStyleTarget(e.target.value)} className={inputClass}>
              <option value="">{labels.designsAsStyleNew}</option>
              {styles.map((st) => <option key={st.id} value={st.id}>{st.name ?? st.id}</option>)}
            </select>
          </label>
          {styleTarget === '' && (
            <label className="flex flex-col gap-1 text-xs">
              {labels.designsAsStyleName}
              <input type="text" value={styleName} onChange={(e) => setStyleName(e.target.value)} className={inputClass} />
            </label>
          )}
          <PartChoice legend={labels.designsApplyIntro} available={styleParts} value={styleChosen} onChange={setStyleChosen} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setChoosing(false)}>{labels.designsCancel}</Button>
            <Button
              variant="primary"
              size="sm"
              disabled={styleChosen.length === 0 || (styleTarget === '' && !styleName.trim())}
              onClick={() => { onAsStyle(styleChosen, styleTarget ? { id: styleTarget } : { name: styleName.trim() }); setChoosing(false); }}
            >
              {labels.designsAsStyleApply}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-1">
          <div className="flex flex-wrap gap-1">
            <Button variant="primary" size="sm" onClick={() => setChoosing('try')}>{labels.designsTry}</Button>
            {styleParts.length > 0 && <Button variant="outline" size="sm" onClick={() => setChoosing('style')}>{labels.designsAsStyle}</Button>}
          </div>
          <div className="flex gap-1">
            <IconButton label={`${labels.designsExport}: ${entry.name}`} icon={<Download size={14} aria-hidden="true" />} onClick={() => setChoosing('export')} />
            {onDelete && (
              <ConfirmPopover message={fill(labels.designsDeleteConfirm, { name: entry.name })} confirmLabel={labels.designsDelete} onConfirm={onDelete}>
                {({ open }) => <IconButton label={`${labels.designsDelete}: ${entry.name}`} icon={<Trash2 size={14} aria-hidden="true" />} onClick={open} />}
              </ConfirmPopover>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
