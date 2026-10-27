// What the Headings section writes to the config: the section's fields,
// its balancing fields and the per-level overrides, set and reset.
import type { HeadingsConfig, HeadingLevelConfig } from 'postext';
import type { SandboxAction } from '../../../../context/SandboxContext/state.js';

/** What createHeadingsWriters takes from the section. */
export interface HeadingsWritersDeps {
  dispatch: React.Dispatch<SandboxAction>;
  raw: HeadingsConfig | undefined;
}

export function createHeadingsWriters(deps: HeadingsWritersDeps) {
  const {
    dispatch, raw
  } = deps;
  const updateHeadings = (partial: Partial<HeadingsConfig>) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { headings: { ...raw, ...partial } },
    });
  };

  const resetHeadings = () => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { headings: undefined },
    });
  };

  const resetBalancingField = (
    field: 'enabled' | 'maxLinesPerHeading' | 'maxLinesBeforeLoose' | 'stretchAfterLists' | 'maxLinesAfterList' | 'stretchAfterDisplays' | 'stretchAfterFloats'
      | 'maxLinesAfterFloat' | 'stretchAfterWideFloats' | 'looseParagraphs' | 'maxLooseParagraphs' | 'trackParagraphs' | 'maxTracking' | 'fillShortColumns'
      | 'trailing' | 'trailingStep' | 'beforeSpan' | 'closingBox' | 'gridLines',
  ) => {
    if (!raw?.balancing) return;
    const next = { ...raw.balancing };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { headings: { ...raw, balancing: hasKeys ? next : undefined } },
    });
  };

  const resetField = (field: keyof HeadingsConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { headings: hasKeys ? next : undefined },
    });
  };

  const updateLevel = (level: number, partial: Partial<HeadingLevelConfig>) => {
    const currentLevels = raw?.levels ?? [];
    const existing = currentLevels.find((l) => l.level === level);
    const updated = existing
      ? { ...existing, ...partial }
      : { level, ...partial };
    const newLevels = existing
      ? currentLevels.map((l) => (l.level === level ? updated : l))
      : [...currentLevels, updated];
    updateHeadings({ levels: newLevels });
  };

  const resetLevelField = (level: number, field: keyof HeadingLevelConfig) => {
    if (!raw?.levels) return;
    if (field === 'fontSize') {
      // When resetting via the section reset button, remove the entire level
      const newLevels = raw.levels.filter((l) => l.level !== level);
      if (newLevels.length > 0) {
        updateHeadings({ levels: newLevels });
      } else {
        const next = { ...raw };
        delete next.levels;
        const hasKeys = Object.keys(next).length > 0;
        dispatch({
          type: 'UPDATE_CONFIG',
          payload: { headings: hasKeys ? next : undefined },
        });
      }
      return;
    }
    const existing = raw.levels.find((l) => l.level === level);
    if (!existing) return;
    const next = { ...existing };
    delete next[field];
    const hasFields = Object.keys(next).filter((k) => k !== 'level').length > 0;
    if (hasFields) {
      const newLevels = raw.levels.map((l) => (l.level === level ? next : l));
      updateHeadings({ levels: newLevels });
    } else {
      const newLevels = raw.levels.filter((l) => l.level !== level);
      if (newLevels.length > 0) {
        updateHeadings({ levels: newLevels });
      } else {
        const r = { ...raw };
        delete r.levels;
        const hasKeys = Object.keys(r).length > 0;
        dispatch({
          type: 'UPDATE_CONFIG',
          payload: { headings: hasKeys ? r : undefined },
        });
      }
    }
  };
  return {
    updateHeadings, resetHeadings, resetBalancingField, resetField, updateLevel, resetLevelField
  };
}
