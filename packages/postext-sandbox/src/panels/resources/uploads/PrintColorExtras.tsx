'use client';

// A picture's own print colour settings past its profile (#front A):
// how its greys meet the press's dot gain, and a profile assigned to it
// (an `.icc` file read in place of the one it carries).

import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { parseIccProfile, type Resource } from 'postext';
import { useSandboxLabels } from '../../../context/SandboxContext.js';
import { putBlob } from '../../../storage/blobStore.js';
import { Field, inputClass, inputStyle } from '../ResourceDetail/Field.js';

type PrintColor = NonNullable<Resource['printColor']>;

const GAINS = [10, 15, 20, 25, 30];

export function PrintColorExtras({ resource, onChange }: { resource: Resource; onChange: (printColor: PrintColor | undefined) => void }) {
  const labels = useSandboxLabels();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const own = resource.printColor ?? {};
  const gain = own.grayDotGain;
  const assigned = own.assignedRgbProfile;
  const without = <K extends keyof PrintColor>(key: K): PrintColor => {
    const { [key]: _drop, ...rest } = own;
    void _drop;
    return rest;
  };

  const pickProfile = async (file: File) => {
    setError(null);
    const buffer = await file.arrayBuffer();
    try {
      const profile = parseIccProfile(new Uint8Array(buffer));
      if (profile.colorSpace !== 'RGB') throw new Error('not RGB');
    } catch {
      setError(labels.resourcePrintProfileInvalid);
      return;
    }
    const fileId = await putBlob(buffer, 'application/vnd.iccprofile');
    onChange({ ...own, assignedRgbProfile: { name: file.name.replace(/\.ic[cm]$/i, ''), fileId } });
  };

  return (
    <>
      <Field label={labels.resourcePrintGrayLabel}>
        <select
          value={gain === undefined ? '' : String(gain)}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === '' ? without('grayDotGain') : { ...own, grayDotGain: v === 'profile' || v === 'none' ? v : Number(v) });
          }}
          aria-label={labels.resourcePrintGrayLabel}
          className={inputClass}
          style={inputStyle}
        >
          <option value="">{labels.resourcePrintColorBook}</option>
          <option value="profile">{labels.resourcePrintGrayProfile}</option>
          <option value="none">{labels.resourcePrintGrayNone}</option>
          {GAINS.map((g) => (
            <option key={g} value={String(g)}>{labels.resourcePrintGrayGain.replace('__n__', String(g))}</option>
          ))}
        </select>
      </Field>
      <Field label={labels.resourcePrintProfileLabel} hint={labels.resourcePrintProfileHint}>
        <div className="flex items-center gap-1.5">
          {assigned ? (
            <>
              <span className="min-w-0 flex-1 truncate text-xs" title={assigned.name}>{assigned.name}</span>
              <button
                type="button"
                onClick={() => onChange(without('assignedRgbProfile'))}
                aria-label={labels.resourcePrintProfileRemove}
                title={labels.resourcePrintProfileRemove}
                className="inline-flex h-6 w-6 items-center justify-center rounded border-0 bg-transparent text-(--slate) hover:text-(--foreground)"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} className={inputClass} style={{ ...inputStyle, cursor: 'pointer', textAlign: 'start' }}>
              {labels.resourcePrintProfileUpload}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".icc,.icm,application/vnd.iccprofile"
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void pickProfile(file);
            }}
          />
        </div>
        {error && <p role="alert" className="mt-1 text-[11px] text-(--destructive)">{error}</p>}
      </Field>
    </>
  );
}
