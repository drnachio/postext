import type { LinksConfig, ResolvedLinksConfig } from '../../types.js';
import { colorsEqual, dimensionsEqual } from '../shared.js';

export const DEFAULT_LINKS_CONFIG: ResolvedLinksConfig = {
  print: 'none',
  show: 'url',
  urlDisplay: 'full',
  repeat: 'every',
  visibleUrls: 'skip',
  qr: {
    size: { value: 15, unit: 'mm' },
    errorCorrection: 'M',
    quietZone: 1,
    side: 'end',
    gap: { value: 1, unit: 'em' },
  },
};

const PRINT: ReadonlySet<string> = new Set(['none', 'inline', 'notes']);
const SHOW: ReadonlySet<string> = new Set(['url', 'qr', 'both']);
const ECL: ReadonlySet<string> = new Set(['L', 'M', 'Q', 'H']);

function pick<T extends string>(value: unknown, allowed: ReadonlySet<string>, fallback: T): T {
  return typeof value === 'string' && allowed.has(value) ? value as T : fallback;
}

export function resolveLinksConfig(partial?: LinksConfig): ResolvedLinksConfig {
  const d = DEFAULT_LINKS_CONFIG;
  const qr = partial?.qr ?? {};
  const quiet = qr.quietZone;
  return {
    print: pick(partial?.print, PRINT, d.print),
    show: pick(partial?.show, SHOW, d.show),
    urlDisplay: partial?.urlDisplay === 'short' ? 'short' : 'full',
    repeat: partial?.repeat === 'first' ? 'first' : 'every',
    visibleUrls: partial?.visibleUrls === 'note' ? 'note' : 'skip',
    qr: {
      size: qr.size && qr.size.value > 0 ? qr.size : d.qr.size,
      errorCorrection: pick(qr.errorCorrection, ECL, d.qr.errorCorrection),
      quietZone: typeof quiet === 'number' && Number.isFinite(quiet) ? Math.max(0, Math.min(8, Math.round(quiet))) : d.qr.quietZone,
      ...(qr.color ? { color: qr.color } : {}),
      side: qr.side === 'start' ? 'start' : 'end',
      gap: qr.gap && qr.gap.value >= 0 ? qr.gap : d.qr.gap,
    },
  };
}

export function stripLinksDefaults(links?: LinksConfig): LinksConfig | undefined {
  if (!links) return undefined;
  const d = DEFAULT_LINKS_CONFIG;
  const out: LinksConfig = {};
  for (const key of ['print', 'show', 'urlDisplay', 'repeat', 'visibleUrls'] as const) {
    if (links[key] !== undefined && links[key] !== d[key]) (out as Record<string, unknown>)[key] = links[key];
  }
  const qr = links.qr;
  if (qr) {
    const oq: NonNullable<LinksConfig['qr']> = {};
    if (qr.size && !dimensionsEqual(qr.size, d.qr.size)) oq.size = qr.size;
    if (qr.errorCorrection !== undefined && qr.errorCorrection !== d.qr.errorCorrection) oq.errorCorrection = qr.errorCorrection;
    if (qr.quietZone !== undefined && qr.quietZone !== d.qr.quietZone) oq.quietZone = qr.quietZone;
    if (qr.color && (!d.qr.color || !colorsEqual(qr.color, d.qr.color))) oq.color = qr.color;
    if (qr.side !== undefined && qr.side !== d.qr.side) oq.side = qr.side;
    if (qr.gap && !dimensionsEqual(qr.gap, d.qr.gap)) oq.gap = qr.gap;
    if (Object.keys(oq).length > 0) out.qr = oq;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
