import { requestSettingsSection } from '../context/settingsNavigation.js';
import { saveSectionState, saveSettingsGroup } from '../storage/persistence.js';

/** Bring Design › Page & columns › Page templates into view (#863): a
 *  frame picked on the page opens its properties there. */
export function showPageTemplatesSection(frame?: string | null): void {
  saveSectionState('page:pageTemplates', true);
  // The request waits for the panel when it is closed; its group is the
  // one the panel opens on.
  if (!requestSettingsSection({ group: 'page', section: 'pageTemplates' })) saveSettingsGroup('page');
  if (typeof requestAnimationFrame === 'undefined' || typeof document === 'undefined') return;
  // The section mounts with its tab: waited for over a few frames.
  const show = (attempt: number): void => {
    const section = document.querySelector('[data-section-id="pageTemplates"]');
    if (!section && attempt < 10) {
      requestAnimationFrame(() => show(attempt + 1));
      return;
    }
    const target = (frame ? document.querySelector(`[data-frame="${CSS.escape(frame)}"]`) : null) ?? section;
    target?.scrollIntoView({ block: 'nearest' });
  };
  requestAnimationFrame(() => requestAnimationFrame(() => show(0)));
}
