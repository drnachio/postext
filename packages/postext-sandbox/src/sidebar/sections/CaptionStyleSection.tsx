'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { resolveBodyTextConfig, resolveCaptionStyleConfig } from 'postext';
import type { CaptionStyleConfig } from 'postext';
import { CollapsibleSection } from '../../controls';
import { CaptionStyleFields } from './CaptionStyleFields';

/** Config-panel section for styling resource captions: the shared caption
 *  typography, placement (above/below the body), an optional background bar,
 *  independent weight/slant/colour for the numbered label and the
 *  description, and the smaller resource note. Unset fields inherit the body
 *  text. Resource types may override any of these per type (see
 *  `ResourceTypesSection`). */
export const CaptionStyleSection = memo(function CaptionStyleSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.captionStyle);
  const bodyTextRaw = useSandboxSelector((s) => s.config.bodyText);
  const bodyText = resolveBodyTextConfig(bodyTextRaw);
  const cs = resolveCaptionStyleConfig(raw, bodyText);

  const update = (partial: Partial<CaptionStyleConfig>) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { captionStyle: { ...raw, ...partial } } });
  };
  const resetSection = () => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { captionStyle: undefined } });
  };
  const resetField = (field: keyof CaptionStyleConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { captionStyle: Object.keys(next).length > 0 ? next : undefined },
    });
  };

  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;

  return (
    <CollapsibleSection
      title={labels.captionStyleSection}
      sectionId="captionStyle"
      onReset={resetSection}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <CaptionStyleFields
        raw={raw}
        resolved={cs}
        update={update}
        resetField={resetField}
        sectionIdPrefix="captionStyle"
        fieldIdPrefix="captionStyle"
      />
    </CollapsibleSection>
  );
});
