/**
 * The cover of the Cover panel on Folio's 3D book: what of it shows on a
 * book lying open on the desk. Its spine, painted from the composed sheet
 * (the best proof that the spine fits); the colour of its boards, taken
 * from the front cover; and its binding (a hardcover, a paperback glued or
 * sewn) and material (a printed case, cloth), which win over what the
 * book's Folio settings guessed.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { BUILT_IN_BINDING_PROFILES, type BindingProfile, type FolioBindingConfig, type FolioConfig, type ProductionVersion } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext.js';
import { useLayoutWorker } from '../../worker/useLayoutWorker.js';
import { bookTrimMm, coverDocumentInput, pickSheet } from '../model/bookProduction.js';
import { cropCanvas, paintSheet, sheetRectPx } from './sheetPainter.js';
import { useCoverGallery, useCoverWorkspace, useLogos, useProfiles } from './useProduction.js';

/** Folio's binding for a version: its style and, on a case, its
 *  material. */
export function folioBindingOf(version: ProductionVersion, library: readonly BindingProfile[]): Pick<FolioBindingConfig, 'type' | 'coverMaterial'> | undefined {
  const id = typeof version.binding === 'string' ? version.binding : version.binding.id;
  const profile = typeof version.binding === 'string'
    ? BUILT_IN_BINDING_PROFILES.find((p) => p.id === id) ?? library.find((p) => p.id === id)
    : version.binding;
  if (!profile) return undefined;
  if (profile.style === 'caseFlat' || profile.style === 'caseRound') return { type: 'hardcover', coverMaterial: version.caseMaterial === 'cloth' ? 'cloth' : 'paper' };
  return { type: profile.style === 'sewnSoftcover' ? 'sewn' : 'paperback', coverMaterial: 'paper' };
}

/** The book's Folio settings with its cover's binding over them: a book
 *  with a version in the Cover panel is bound as that version is (in a
 *  case or a soft cover, of its material, its boards the front cover's
 *  colour), whatever the presentation guessed before; the desk, the light
 *  and the paper stay the book's. Its spine picture, when the settings
 *  name one, too. */
export function folioWithCover(folio: FolioConfig | undefined, cover: { binding?: Pick<FolioBindingConfig, 'type' | 'coverMaterial'>; color?: string } | null): FolioConfig | undefined {
  if (!cover?.binding) return folio;
  const own = folio?.binding ?? {};
  const binding: FolioBindingConfig = {
    ...own,
    ...cover.binding,
    // The cover is drawn as a case round the pages, not as the book's
    // first and last pages.
    cover: 'case',
    ...(cover.color ? { coverColor: { hex: cover.color, model: 'hex' as const } } : {}),
  };
  return { ...folio, binding };
}

/** The colour most of a painted region is, `#rrggbb`: its pixels' colours
 *  coarsened, the commonest averaged (text and small pictures do not
 *  sway it). */
export function dominantColour(data: Uint8ClampedArray): string | undefined {
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4 * 7) {
    if (data[i + 3]! < 200) continue;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bin.n++;
    bin.r += r;
    bin.g += g;
    bin.b += b;
    bins.set(key, bin);
  }
  let best: { n: number; r: number; g: number; b: number } | undefined;
  for (const bin of bins.values()) if (!best || bin.n > best.n) best = bin;
  if (!best) return undefined;
  const hex = (v: number) => Math.round(v / best!.n).toString(16).padStart(2, '0');
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
}

export interface FolioCover {
  binding?: Pick<FolioBindingConfig, 'type' | 'coverMaterial'>;
  /** The boards' colour: the front cover's commonest. */
  color?: string;
  /** The spine as painted, head up and the front cover to the right. */
  spine?: HTMLCanvasElement;
}

/** The active version's cover for Folio, painted again (a moment after)
 *  when it changes; null when the book has no version yet. */
export function useFolioCover(): FolioCover | null {
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const bookResources = useSandboxSelector((s) => s.resources);
  const { record, version, sheets } = useCoverWorkspace();
  const library = useLogos();
  const [gallery] = useCoverGallery();
  const stored = useProfiles();
  const bindings = useMemo(() => stored.flatMap((p) => (p.kind === 'binding' ? [p.profile] : [])), [stored]);
  const { build } = useLayoutWorker('preview');
  const [painted, setPainted] = useState<{ color?: string; spine?: HTMLCanvasElement } | null>(null);
  const binding = useMemo(() => (version ? folioBindingOf(version, bindings) : undefined), [version, bindings]);
  const sheet = useMemo(() => (sheets ? pickSheet(sheets, 'cover', bookTrimMm(config)) : null), [sheets, config]);
  const input = useMemo(
    () => (sheet && version && record
      ? coverDocumentInput(sheet, version, record.texts, config, record.design, bookResources, { logos: library, gallery, workIsbnLabel: labels.productionWorkIsbnCaption })
      : null),
    [sheet, version, record, config, bookResources, library, gallery, labels.productionWorkIsbnCaption],
  );
  const seq = useRef(0);
  useEffect(() => {
    if (!input || !sheet) {
      setPainted(null);
      return;
    }
    const n = ++seq.current;
    const t = setTimeout(() => {
      void (async () => {
        try {
          // Painted at about 150 dpi: enough for a spine seen on the desk.
          const scale = Math.min(1, 150 / ((input.config.page?.dpi as number | undefined) ?? 96));
          const painted = await paintSheet(input, build, scale);
          if (!painted || n !== seq.current) return;
          const zone = (name: string) => {
            const z = sheet.zones.find((x) => x.name === name);
            return z ? sheetRectPx(sheet, painted.doc, z.rect, scale) : undefined;
          };
          const spineAt = zone('spine');
          const frontAt = zone('front');
          const spine = spineAt && spineAt.w >= 1 && spineAt.h >= 1 ? cropCanvas(painted.canvas, spineAt) : undefined;
          const ctx = painted.canvas.getContext('2d', { willReadFrequently: true });
          const color = ctx && frontAt ? dominantColour(ctx.getImageData(Math.round(frontAt.x), Math.round(frontAt.y), Math.max(1, Math.round(frontAt.w)), Math.max(1, Math.round(frontAt.h))).data) : undefined;
          if (n === seq.current) setPainted({ ...(color ? { color } : {}), ...(spine ? { spine } : {}) });
        } catch {
          if (n === seq.current) setPainted(null);
        }
      })();
    }, 400);
    return () => clearTimeout(t);
  }, [build, input, sheet]);
  return useMemo(() => (version ? { ...(binding ? { binding } : {}), ...painted } : null), [version, binding, painted]);
}
