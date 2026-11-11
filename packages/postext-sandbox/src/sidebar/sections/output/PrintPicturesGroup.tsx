'use client';

import { memo, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { parseIccProfile, resolvePrintImageColor } from 'postext';
import type { PrintConfig, PrintImageColorConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { CollapsibleSection, SelectInput } from '../../../controls/index.js';
import { putBlob } from '../../../storage/blobStore.js';

const GAINS = [10, 15, 20, 25, 30];

/** `print` with `imageColor` replaced (left out when empty). */
function withImageColor(raw: PrintConfig | undefined, imageColor: PrintImageColorConfig | undefined): PrintConfig | undefined {
  const next: PrintConfig = { ...raw };
  if (imageColor && Object.keys(imageColor).length > 0) next.imageColor = imageColor;
  else delete next.imageColor;
  return Object.keys(next).length > 0 ? next : undefined;
}

/** Print → Pictures (`print.imageColor`, #1484): how the book's pictures
 *  are read and printed — through their own profiles or as sRGB, through
 *  an assigned RGB profile, their greys on black, and CMYK pictures of
 *  another press. A picture's card sets its own over these. */
export const PrintPicturesGroup = memo(function PrintPicturesGroup() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.print);
  const own = raw?.imageColor ?? {};
  const cfg = resolvePrintImageColor(own);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const write = (imageColor: PrintImageColorConfig | undefined) => dispatch({ type: 'UPDATE_CONFIG', payload: { print: withImageColor(raw, imageColor) } });
  const set = (partial: PrintImageColorConfig) => write({ ...own, ...partial });
  const reset = (key: keyof PrintImageColorConfig) => {
    const next = { ...own };
    delete next[key];
    write(next);
  };

  const pickProfile = async (file: File) => {
    setError(null);
    const buffer = await file.arrayBuffer();
    try {
      if (parseIccProfile(new Uint8Array(buffer)).colorSpace !== 'RGB') throw new Error('not RGB');
    } catch {
      setError(labels.resourcePrintProfileInvalid);
      return;
    }
    const fileId = await putBlob(buffer, 'application/vnd.iccprofile');
    set({ assignedRgbProfile: { name: file.name.replace(/\.ic[cm]$/i, ''), fileId } });
  };

  const gain = cfg.grayDotGain;
  const gainOptions = [
    { value: 'none', label: labels.resourcePrintGrayNone },
    { value: 'profile', label: labels.resourcePrintGrayProfile },
    ...[...new Set([...GAINS, ...(typeof gain === 'number' ? [gain] : [])])].sort((a, b) => a - b)
      .map((g) => ({ value: String(g), label: labels.resourcePrintGrayGain.replace('__n__', String(g)) })),
  ];
  const assigned = cfg.assignedRgbProfile;

  return (
    <CollapsibleSection
      title={labels.printGroupPictures}
      sectionId="print-pictures"
      variant="subsection"
      onReset={() => write(undefined)}
      hasOverrides={Object.keys(own).length > 0}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <p className="mb-2 text-xs text-(--slate) [text-wrap:pretty]">{labels.printPicturesIntro}</p>
      <SelectInput stacked label={labels.printPicturesOwnProfile} value={cfg.embeddedProfile}
        options={[{ value: 'ignore', label: labels.resourcePrintColorIgnore }, { value: 'use', label: labels.resourcePrintColorUse }]}
        onChange={(v) => set({ embeddedProfile: v as 'use' | 'ignore' })} tooltip={labels.printPicturesOwnProfileTooltip}
        isDefault={own.embeddedProfile === undefined} onReset={() => reset('embeddedProfile')} />
      <div className="flex flex-col gap-1">
        <div className="text-xs text-(--slate)" title={labels.printPicturesAssignedTooltip}>{labels.printPicturesAssigned}</div>
        {assigned ? (
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-xs" title={assigned.name}>{assigned.name}</span>
            <button
              type="button"
              onClick={() => reset('assignedRgbProfile')}
              aria-label={labels.resourcePrintProfileRemove}
              title={labels.resourcePrintProfileRemove}
              className="inline-flex h-11 w-11 items-center justify-center rounded border-0 bg-transparent text-(--slate) hover:text-(--foreground)"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title={labels.printPicturesAssignedTooltip}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded border border-dashed text-xs"
            style={{ borderColor: 'var(--rule)', color: 'var(--slate)', padding: '8px' }}
          >
            <Upload size={14} aria-hidden="true" />
            <span>{labels.resourcePrintProfileUpload}</span>
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
        {error && <span role="alert" className="text-xs" style={{ color: 'var(--destructive)' }}>{error}</span>}
      </div>
      <SelectInput stacked label={labels.printPicturesGray} value={String(gain)} options={gainOptions}
        onChange={(v) => set({ grayDotGain: v === 'profile' || v === 'none' ? v : Number(v) })} tooltip={labels.printPicturesGrayTooltip}
        isDefault={own.grayDotGain === undefined} onReset={() => reset('grayDotGain')} />
      <SelectInput stacked label={labels.printPicturesCmyk} value={cfg.cmykProfile}
        options={[{ value: 'keep', label: labels.printPicturesCmykKeep }, { value: 'convert', label: labels.printPicturesCmykConvert }]}
        onChange={(v) => set({ cmykProfile: v as 'convert' | 'keep' })} tooltip={labels.printPicturesCmykTooltip}
        isDefault={own.cmykProfile === undefined} onReset={() => reset('cmykProfile')} />
    </CollapsibleSection>
  );
});
