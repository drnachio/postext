'use client';

import { useEffect, useRef } from 'react';
import { SectionPageContext } from '../../controls/CollapsibleSection.js';
import type { SettingsFocus } from '../../context/settingsNavigation.js';
import { sectionsInGroup, type SettingsGroupId, type SettingsSectionId } from '../sections/registry.js';
import { SECTION_COMPONENTS } from '../sections/components.js';
import { PageGroupPreview } from '../settings/PageGroupPreview.js';
import { PreviewHighlightProvider } from '../settings/previewHighlight.js';
import { focusSettingsEntry } from '../settingsFocus.js';
import { sectionPanelId, sectionTabId } from './SectionTabs.js';

/** The sections whose page opens on the drawing of the page. */
const DRAWN: ReadonlySet<SettingsSectionId> = new Set(['page', 'layout', 'writing', 'cjk']);

/** The open section of a settings group: one section on screen at a time,
 *  the one its tab names. An entry asked for from outside (a design
 *  element picked on a page, #899) is brought into view once the section
 *  is mounted. */
export function GroupPage({ group, section, entry, onEntryShown }: {
  group: SettingsGroupId;
  section: SettingsSectionId;
  /** The entry of the section to bring into view and focus. */
  entry: SettingsFocus | null;
  onEntryShown: () => void;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const tabbed = sectionsInGroup(group).length > 1;
  const Section = SECTION_COMPONENTS[section];

  useEffect(() => {
    if (!entry) return;
    const raf = requestAnimationFrame(() => {
      const root = pageRef.current;
      if (root) focusSettingsEntry(root, root.parentElement, entry);
      onEntryShown();
    });
    return () => cancelAnimationFrame(raf);
  }, [entry, section, onEntryShown]);

  return (
    <PreviewHighlightProvider>
      <SectionPageContext value>
        <div
          ref={pageRef}
          {...(tabbed ? { role: 'tabpanel', id: sectionPanelId(section), 'aria-labelledby': sectionTabId(section) } : {})}
        >
          {DRAWN.has(section) && <div className="pt-3"><PageGroupPreview /></div>}
          <Section key={section} />
        </div>
      </SectionPageContext>
    </PreviewHighlightProvider>
  );
}
