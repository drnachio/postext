'use client';

// Which layer a settings row's value comes from, in a book in several
// languages (#1209). A row does not know the setting it edits: its reset
// does. The reset is run with its writes caught (`captureWrites`), and
// the fields they would clear are the row's settings. Those are then
// looked up in the edition's own fields and in every edition's.

import { createContext, useContext } from 'react';
import { Link2, Languages, ArrowUpToLine } from 'lucide-react';
import { diffConfigLayers, overridePaths, type ConfigOverride, type PostextConfig } from 'postext';
import { useSandboxLabels, type SandboxAction } from '../context/SandboxContext.js';
import { captureWrites } from '../context/configScope.js';
import { ownPathsAt, type ConfigScope } from '../editions/configLayers.js';
import { Menu, MenuItem, MenuSeparator, cn } from '../ui/index.js';

export interface FieldLayerValue {
  scope: ConfigScope;
  /** The edition on screen. */
  locale: string;
  /** Every edition's tag, the book's order. */
  locales: readonly string[];
  languageName: (locale: string) => string;
  /** What the panel's sections read: the general settings in the "all
   *  languages" scope, the edition on screen otherwise. */
  editConfig: PostextConfig;
  /** Each edition's own fields, by tag (the one on screen included). */
  overrides: Record<string, ConfigOverride>;
  /** The edition on screen reads the general settings at `paths` again. */
  useGeneral: (paths: readonly string[]) => void;
  /** The edition on screen's value at `paths` becomes every language's. */
  promote: (paths: readonly string[]) => void;
  /** Edition `locale` reads the general settings at `paths` again. */
  useGeneralIn: (locale: string, paths: readonly string[]) => void;
  /** Whether {@link useGeneralIn} can change edition `locale` from here
   *  (the one on screen, or one a project keeps aside). */
  canChange: (locale: string) => boolean;
  /** The words of another kind of layer than a language's (a chapter
   *  style): what its own value, the base value and their actions are
   *  called, and the chip's mark. */
  wording?: { own: string; general: string; useGeneral: string; promote: string; mark: string };
}

export const FieldLayerContext = createContext<FieldLayerValue | null>(null);

export type FieldLayerState =
  /** The edition scope: a value of the edition's own. */
  | { kind: 'own'; paths: string[] }
  /** The edition scope: the general value, read by this edition. */
  | { kind: 'general'; paths: string[] }
  /** The general scope: the general value, and the editions that keep a
   *  value of their own instead. */
  | { kind: 'shared'; paths: string[]; keptBy: string[] };

/** The settings a set of captured writes would change. */
function writtenPaths(writes: readonly SandboxAction[], base: PostextConfig): string[] {
  const out = new Set<string>();
  for (const a of writes) {
    if (a.type === 'UPDATE_CONFIG') {
      for (const [key, value] of Object.entries(a.payload)) {
        const before = { [key]: (base as Record<string, unknown>)[key] } as PostextConfig;
        const after = (value === undefined ? {} : { [key]: value }) as PostextConfig;
        // Read from the side of the value before: a reset that clears a
        // whole section names each field it held, not the section.
        for (const p of overridePaths(diffConfigLayers(after, before))) out.add(p);
      }
    } else if (a.type === 'SET_CONFIG') {
      for (const p of overridePaths(diffConfigLayers(a.payload, base))) out.add(p);
    }
  }
  return [...out];
}

/** Where a row's value comes from, or null outside a book in several
 *  languages, for a row with no reset, or one at its default. */
export function fieldLayerOf(ctx: FieldLayerValue | null, onReset: (() => void) | undefined, isDefault: boolean | undefined): FieldLayerState | null {
  if (!ctx || !onReset || isDefault !== false) return null;
  const paths = writtenPaths(captureWrites(onReset), ctx.editConfig);
  if (paths.length === 0) return null;
  if (ctx.scope === 'edition') {
    const own = ownPathsAt(ctx.overrides[ctx.locale] ?? {}, paths);
    return own.length > 0 ? { kind: 'own', paths: own } : { kind: 'general', paths };
  }
  const keptBy = ctx.locales.filter((l) => ownPathsAt(ctx.overrides[l] ?? {}, paths).length > 0);
  return { kind: 'shared', paths, keptBy };
}

/** A language tag as a short mark (`es`, `pt-BR` → `PT`). */
export function languageMark(tag: string): string {
  return (tag.split(/[-_]/)[0] ?? tag).toUpperCase();
}

/** The languages that keep their own value, as the chip shows them: their
 *  marks up to two, a count beyond (the names are in its label). */
function keptMarks(tags: readonly string[]): string {
  return tags.length <= 2 ? tags.map(languageMark).join(' ') : String(tags.length);
}

/** The dot before a row's label: the general value (filled), this
 *  language's own (the edition colour), the general value read here
 *  (hollow). */
export function LayerDot({ state }: { state: FieldLayerState | null }) {
  if (!state || state.kind === 'shared') {
    return <span aria-hidden="true" className="me-1.5 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-(--brand) align-middle" />;
  }
  if (state.kind === 'own') {
    return <span aria-hidden="true" className="me-1.5 inline-block h-1.5 w-1.5 -translate-y-px rounded-full align-middle" style={{ background: 'var(--edition, var(--brand))' }} />;
  }
  return <span aria-hidden="true" className="me-1.5 inline-block h-1.5 w-1.5 -translate-y-px rounded-full border border-(--brand) align-middle" />;
}

/** What a row says about its layer, for screen readers, after its label. */
export function layerText(state: FieldLayerState | null, labels: ReturnType<typeof useSandboxLabels>, ctx: FieldLayerValue | null): string | null {
  if (!state || !ctx) return null;
  if (state.kind === 'own') return ctx.wording?.own ?? labels.configLayerOwn.replace('__language__', ctx.languageName(ctx.locale));
  if (state.kind === 'general') return ctx.wording?.general ?? labels.configLayerGeneral;
  if (state.keptBy.length > 0) return labels.configLayerKeptBy.replace('__languages__', state.keptBy.map(ctx.languageName).join(', '));
  return labels.configLayerGeneral;
}

const chipClass = 'inline-flex h-4 shrink-0 cursor-pointer items-center rounded px-1 text-[0.58rem] font-semibold tracking-wide tabular-nums leading-none transition-colors relative after:absolute after:-inset-1.5 pt-large:h-11 pt-large:px-2 pt-large:after:hidden focus-visible:outline-2 focus-visible:outline-offset-1 outline-(--brand)';

/** The chip beside a row's label with the layer's actions: on a value of
 *  this language's own, its tag (back to the general value, or make it
 *  every language's); on a general value some languages keep their own
 *  of, their tags (give them the general value). */
export function LayerChip({ state }: { state: FieldLayerState | null }) {
  const ctx = useContext(FieldLayerContext);
  const labels = useSandboxLabels();
  if (!ctx || !state) return null;
  if (state.kind === 'own') {
    const own = ctx.wording?.own ?? labels.configLayerOwn.replace('__language__', ctx.languageName(ctx.locale));
    return (
      <Menu
        label={own}
        trigger={(
          <button
            type="button"
            aria-label={`${own}: ${labels.configLayerActions}`}
            title={own}
            className={cn(chipClass, 'border')}
            style={{ color: 'var(--edition, var(--brand))', borderColor: 'var(--edition, var(--brand))' }}
          >
            {ctx.wording?.mark ?? languageMark(ctx.locale)}
          </button>
        )}
      >
        <MenuItem icon={<Link2 size={12} />} onClick={() => ctx.useGeneral(state.paths)}>{ctx.wording?.useGeneral ?? labels.configLayerUseGeneral}</MenuItem>
        <MenuItem icon={<ArrowUpToLine size={12} />} onClick={() => ctx.promote(state.paths)}>{ctx.wording?.promote ?? labels.configLayerPromote}</MenuItem>
      </Menu>
    );
  }
  if (state.kind === 'shared' && state.keptBy.length > 0) {
    const names = state.keptBy.map(ctx.languageName);
    const changeable = state.keptBy.filter(ctx.canChange);
    if (changeable.length === 0) {
      return (
        <span
          role="img"
          aria-label={labels.configLayerKeptBy.replace('__languages__', names.join(', '))}
          title={labels.configLayerKeptBy.replace('__languages__', names.join(', '))}
          className={cn(chipClass, 'cursor-default gap-0.5 border border-dashed border-(--slate) text-(--slate)')}
        >
          <Languages size={9} aria-hidden="true" />
          {keptMarks(state.keptBy)}
        </span>
      );
    }
    return (
      <Menu
        label={labels.configLayerKeptBy.replace('__languages__', names.join(', '))}
        trigger={(
          <button
            type="button"
            aria-label={`${labels.configLayerKeptBy.replace('__languages__', names.join(', '))}: ${labels.configLayerActions}`}
            title={labels.configLayerKeptBy.replace('__languages__', names.join(', '))}
            className={cn(chipClass, 'gap-0.5 border border-dashed border-(--slate) text-(--slate) hover:text-(--foreground)')}
          >
            <Languages size={9} aria-hidden="true" />
            {keptMarks(state.keptBy)}
          </button>
        )}
      >
        {changeable.map((l) => (
          <MenuItem key={l} icon={<Link2 size={12} />} onClick={() => ctx.useGeneralIn(l, state.paths)}>
            {labels.configLayerApplyIn.replace('__language__', ctx.languageName(l))}
          </MenuItem>
        ))}
        {changeable.length > 1 && (
          <>
            <MenuSeparator />
            <MenuItem icon={<Link2 size={12} />} onClick={() => { for (const l of changeable) ctx.useGeneralIn(l, state.paths); }}>
              {labels.configLayerApplyInAll}
            </MenuItem>
          </>
        )}
      </Menu>
    );
  }
  return null;
}
