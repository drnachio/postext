'use client';

import { memo, useEffect, useState } from 'react';
import { DEFAULT_CONTENT_IN_CONFIG_CHECK, resolveContentInConfigCheck } from 'postext';
import type { ChecksConfig, ContentInConfigCheckConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { CollapsibleSection, FieldRow, NumberInput, ToggleSwitch } from '../../../controls/index.js';
import { useFieldIds } from '../../../controls/fieldContext.js';
import { cn } from '../../../ui/cn.js';

/** The phrases of the allow list, one per line. Kept as typed while the
 *  box has the focus, written to the config when it loses it. */
function AllowList({ value, onCommit }: { value: string[]; onCommit: (next: string[]) => void }) {
  const ids = useFieldIds();
  const joined = value.join('\n');
  const [draft, setDraft] = useState(joined);
  useEffect(() => setDraft(joined), [joined]);
  return (
    <textarea
      dir="auto"
      id={ids?.controlId}
      aria-describedby={ids?.descriptionId}
      rows={Math.max(2, value.length + 1)}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft.split('\n').map((l) => l.trim()).filter(Boolean);
        if (next.join('\n') !== joined) onCommit(next);
      }}
      className={cn(
        'w-full rounded-md border border-(--pt-control-border) bg-(--surface) px-2 py-1 text-xs text-(--foreground) outline-none',
        'hover:border-(--slate) focus:border-(--brand) focus:outline-2 focus:outline-offset-1 focus:outline-(--brand)',
      )}
    />
  );
}

/** The content check (#849): design texts of the configuration that hold
 *  the book's text instead of placeholders. Writes `checks.contentInConfig`;
 *  no page is laid out again. */
export const ChecksSection = memo(function ChecksSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.checks);
  const own = raw?.contentInConfig;
  const cfg = resolveContentInConfigCheck(own);
  const D = DEFAULT_CONTENT_IN_CONFIG_CHECK;

  const write = (contentInConfig: ContentInConfigCheckConfig | undefined) => {
    const next: ChecksConfig = { ...raw };
    if (contentInConfig && Object.keys(contentInConfig).length > 0) next.contentInConfig = contentInConfig;
    else delete next.contentInConfig;
    dispatch({ type: 'UPDATE_CONFIG', payload: { checks: Object.keys(next).length > 0 ? next : undefined } });
  };
  const update = (partial: Partial<ContentInConfigCheckConfig>) => write({ ...own, ...partial });
  const resetField = (key: keyof ContentInConfigCheckConfig) => {
    if (!own) return;
    const next = { ...own };
    delete next[key];
    write(next);
  };

  return (
    <CollapsibleSection
      title={labels.checksSection}
      sectionId="checks"
      onReset={() => dispatch({ type: 'UPDATE_CONFIG', payload: { checks: undefined } })}
      hasOverrides={own !== undefined && Object.keys(own).length > 0}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <ToggleSwitch label={labels.checksContentEnabled} checked={cfg.enabled} onChange={(v) => update({ enabled: v })}
        tooltip={labels.checksContentEnabledTooltip} isDefault={cfg.enabled === D.enabled} onReset={() => resetField('enabled')} />
      {cfg.enabled && (
        <>
          <NumberInput label={labels.checksContentMaxWords} value={cfg.maxWords} onChange={(v) => update({ maxWords: v })} min={0} max={50} step={1}
            tooltip={labels.checksContentMaxWordsTooltip} isDefault={cfg.maxWords === D.maxWords} onReset={() => resetField('maxWords')} />
          <NumberInput label={labels.checksContentMaxChars} value={cfg.maxChars} onChange={(v) => update({ maxChars: v })} min={0} max={500} step={1}
            tooltip={labels.checksContentMaxCharsTooltip} isDefault={cfg.maxChars === D.maxChars} onReset={() => resetField('maxChars')} />
          <FieldRow label={labels.checksContentAllow} tooltip={labels.checksContentAllowTooltip} stacked
            isDefault={cfg.allow.length === 0} onReset={() => resetField('allow')}>
            <AllowList value={cfg.allow} onCommit={(next) => update({ allow: next.length > 0 ? next : undefined })} />
          </FieldRow>
        </>
      )}
    </CollapsibleSection>
  );
});
