'use client';

/**
 * The cover's checks (./coverChecks.ts) as a list: what must be put right
 * first, then what is worth a look, each naming its item; in the designer
 * a line picks that item.
 */

import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { fill } from '../print/fillTokens.js';
import type { CoverCheck, CoverCheckKind } from './model/coverChecks.js';
import type { Labels } from './productionUi.js';

const TEXT: Record<CoverCheckKind, keyof Labels> = {
  offSheet: 'coverCheckOffSheet',
  missingPicture: 'coverCheckMissingPicture',
  crossesFold: 'coverCheckCrossesFold',
  shortOfBleed: 'coverCheckShortOfBleed',
  clearance: 'coverCheckClearance',
  overBarcode: 'coverCheckOverBarcode',
  transparency: 'coverCheckTransparency',
  finishNoShape: 'coverCheckFinishNoShape',
  finishOffSheet: 'coverCheckFinishOffSheet',
  finishNoInk: 'coverCheckFinishNoInk',
  textOverflow: 'coverCheckTextOverflow',
  endpaperHinge: 'coverCheckEndpaperHinge',
};

export function CoverChecksList({ checks, labels, nameOf, onPick }: {
  checks: readonly CoverCheck[];
  labels: Labels;
  /** The name of a check's item (or zone). */
  nameOf: (check: CoverCheck) => string;
  /** Pick the check's item (the designer). */
  onPick?: (check: CoverCheck) => void;
}) {
  if (checks.length === 0) {
    return (
      <p className="m-0 flex items-center gap-1.5 text-xs">
        <CheckCircle2 size={13} aria-hidden="true" className="shrink-0 text-(--brand)" />
        {labels.coverChecksOk}
      </p>
    );
  }
  const errors = checks.filter((c) => c.severity === 'error').length;
  return (
    <div className="flex flex-col gap-1 text-xs">
      <p className="m-0 font-semibold">{fill(labels.coverChecksCount, { errors: String(errors), warnings: String(checks.length - errors) })}</p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {checks.map((c, i) => {
          const Icon = c.severity === 'error' ? AlertCircle : AlertTriangle;
          const text = fill(String(labels[TEXT[c.kind]]), { item: nameOf(c), mm: (c.mm ?? 0).toLocaleString() });
          const body = (
            <>
              <Icon size={13} aria-hidden="true" className={c.severity === 'error' ? 'mt-0.5 shrink-0 text-(--destructive)' : 'mt-0.5 shrink-0 text-(--brand)'} />
              <span>{text}</span>
            </>
          );
          return (
            <li key={`${c.kind}-${c.id ?? c.zone}-${i}`}>
              {onPick && c.id ? (
                <button type="button" onClick={() => onPick(c)} className="flex w-full cursor-pointer items-start gap-1.5 rounded border-0 bg-transparent p-0.5 text-start text-(--foreground) hover:bg-(--surface)">
                  {body}
                </button>
              ) : (
                <span className="flex items-start gap-1.5 p-0.5">{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
