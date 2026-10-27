// What the Body text section writes to the config: its fields, the
// hyphenation settings and the alignment, which may drop the justified-only
// hyphenation settings.
import { type BodyTextConfig, type HyphenationConfig, isCjkLanguage } from 'postext';
import type { SandboxAction } from '../../../../context/SandboxContext/state.js';

/** What createBodyTextWriters takes from the section. */
export interface BodyTextWritersDeps {
  dispatch: React.Dispatch<SandboxAction>;
  raw: BodyTextConfig | undefined;
  effectiveDocumentLocale: string;
}

export function createBodyTextWriters(deps: BodyTextWritersDeps) {
  const {
    dispatch, raw, effectiveDocumentLocale
  } = deps;
  const updateBodyText = (partial: Partial<BodyTextConfig>) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { bodyText: { ...raw, ...partial } },
    });
  };

  // The document language is kept: it is set under Writing system.
  const resetBodyText = () => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { bodyText: undefined },
    });
  };

  const resetField = (field: keyof BodyTextConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { bodyText: hasKeys ? next : undefined },
    });
  };

  const updateHyphenation = (partial: Partial<HyphenationConfig>) => {
    const next: HyphenationConfig = { ...raw?.hyphenation, ...partial };
    // Chinese, Japanese and Korean have no patterns: turning hyphenation on
    // in such a document names the language of its Latin words, English
    // until the author picks another.
    if (partial.enabled === true && isCjkLanguage(next.locale ?? effectiveDocumentLocale)) next.locale = 'en-us';
    updateBodyText({ hyphenation: next });
  };

  const handleTextAlignChange = (value: string) => {
    const textAlign = value as BodyTextConfig['textAlign'];
    // Going ragged drops the justified-only hyphenation settings, unless
    // ragged text hyphenates too.
    if (textAlign === 'left' && !raw?.hyphenation?.ragged) {
      const next: BodyTextConfig = { ...raw, textAlign };
      delete next.hyphenation;
      const hasKeys = Object.keys(next).length > 0;
      dispatch({
        type: 'UPDATE_CONFIG',
        payload: { bodyText: hasKeys ? next : undefined },
      });
    } else {
      updateBodyText({ textAlign });
    }
  };
  return {
    updateBodyText, resetBodyText, resetField, updateHyphenation, handleTextAlignChange
  };
}
