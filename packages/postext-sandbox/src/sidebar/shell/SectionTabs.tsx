'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronsRight } from 'lucide-react';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { IconButton, Menu, MenuItem, cn, useUiRtl } from '../../ui/index.js';
import type { SettingsSectionEntry, SettingsSectionId } from '../sections/registry.js';

/** The id of a section's tab and of the panel it shows. */
export const sectionTabId = (id: SettingsSectionId) => `pt-settings-tab-${id}`;
export const sectionPanelId = (id: SettingsSectionId) => `pt-settings-panel-${id}`;

/** The sections of a settings group as a strip of tabs on one line. A
 *  strip too long for the panel scrolls (its cut ends fade), keeps the
 *  open tab in view, and gains a menu of every section at its end.
 *  Tab semantics with roving focus: the arrow keys move and open. */
export function SectionTabs({ sections, active, changed, onSelect }: {
  sections: readonly SettingsSectionEntry[];
  active: SettingsSectionId;
  /** The sections that hold a changed setting: a mark on their tab. */
  changed: ReadonlySet<SettingsSectionId>;
  onSelect: (id: SettingsSectionId) => void;
}) {
  const labels = useSandboxLabels();
  const rtl = useUiRtl();
  const stripRef = useRef<HTMLDivElement>(null);
  const [cut, setCut] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    // scrollLeft runs negative in a right-to-left strip.
    const pos = Math.abs(el.scrollLeft);
    const max = el.scrollWidth - el.clientWidth;
    const next = { start: pos > 1, end: pos < max - 1 };
    setCut((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, []);

  useEffect(() => {
    const el = stripRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  // The open tab stays in view. Only the strip scrolls: scrollIntoView
  // would also shift the overflow-hidden frames around the sidebar.
  useLayoutEffect(() => {
    const el = stripRef.current;
    const tab = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && tab) {
      const strip = el.getBoundingClientRect();
      const box = tab.getBoundingClientRect();
      const margin = 24;
      if (box.left < strip.left + margin) el.scrollLeft += box.left - strip.left - margin;
      else if (box.right > strip.right - margin) el.scrollLeft += box.right - strip.right + margin;
    }
    measure();
  }, [active, sections, measure]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = sections.findIndex((s) => s.id === active);
    let next: number | null = null;
    if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) next = (index + 1) % sections.length;
    else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) next = (index - 1 + sections.length) % sections.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = sections.length - 1;
    if (next === null) return;
    e.preventDefault();
    const id = sections[next]!.id;
    onSelect(id);
    requestAnimationFrame(() => document.getElementById(sectionTabId(id))?.focus());
  };

  const fade = cut.start || cut.end
    ? `linear-gradient(to ${rtl ? 'left' : 'right'}, ${cut.start ? 'transparent, #000 24px' : '#000, #000'}, ${cut.end ? '#000 calc(100% - 24px), transparent' : '#000'})`
    : undefined;

  return (
    <div className="flex shrink-0 items-stretch border-b border-(--rule)">
      <div
        ref={stripRef}
        role="tablist"
        aria-label={labels.settingsJumpTo}
        onKeyDown={onKeyDown}
        onScroll={measure}
        className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto px-1.5 [scrollbar-width:none]"
        style={fade ? { maskImage: fade, WebkitMaskImage: fade } : undefined}
      >
        {sections.map((s) => {
          const selected = s.id === active;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              id={sectionTabId(s.id)}
              aria-selected={selected}
              aria-controls={sectionPanelId(s.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(s.id)}
              className={cn(
                'relative inline-flex h-8 pt-large:h-11 shrink-0 cursor-pointer items-center gap-1 px-1.5 text-[0.72rem] whitespace-nowrap transition-colors',
                'focus-visible:outline-2 focus-visible:-outline-offset-2 outline-(--brand)',
                'after:absolute after:inset-x-1.5 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors',
                selected
                  ? 'font-medium text-(--foreground) after:bg-(--brand)'
                  : 'text-(--slate) hover:text-(--foreground) hover:after:bg-(--rule)',
              )}
            >
              {String(labels[s.labelKey])}
              {changed.has(s.id) && (
                <>
                  <span aria-hidden="true" className="inline-block h-1 w-1 rounded-full bg-(--brand)" />
                  <span className="sr-only"> ({labels.settingsModifiedField})</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      {(cut.start || cut.end) && (
        <div className="flex shrink-0 items-center pe-1">
          <Menu
            align="end"
            trigger={<IconButton label={labels.settingsAllSections} icon={<ChevronsRight size={13} className="rtl:-scale-x-100" />} />}
          >
            {sections.map((s) => (
              <MenuItem
                key={s.id}
                selected={s.id === active}
                onClick={() => onSelect(s.id)}
                trailing={changed.has(s.id) ? <span aria-hidden="true" className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-(--brand)" /> : undefined}
              >
                {String(labels[s.labelKey])}
              </MenuItem>
            ))}
          </Menu>
        </div>
      )}
    </div>
  );
}
