// The values each kind of flow colour takes under a part's palette
// overrides, memoised per config (#1278: split out of partPalette.ts).
import type { PostextConfig, ResourceType, ColorPaletteEntry, ColorValue, CaptionStyleConfig } from '../../../types.js';
import { resolveAllConfig } from '../../config.js';
import { mergeCaptionStyle } from '../../../defaults/resources/captionStyle.js';
import { type FlowColorValues, type FlowColorKind, withHash, walkColorPairs, kindsOfPath } from './colorKinds.js';

/**
 * The values each kind of flow colour takes under `overrides` (palette id →
 * hex), for the base values of `config`'s palette that two or more entries
 * share: `config` is resolved with its own palette and with the overridden
 * one, and every colour setting of the flow is read in both. Settings of a
 * kind that resolve to one base value may disagree under the overrides (two
 * entries that share it, or an entry and a colour written out); the set
 * then holds each value.
 */
export function flowColorValues(
  config: PostextConfig | undefined,
  overrides: Readonly<Record<string, string>>,
  resourceTypes?: readonly ResourceType[],
): FlowColorValues {
  if (!config) return new Map();
  // Memoised per configuration object (resolved configurations are cached
  // the same way) and override map: every build of a chapter asks again.
  const key = JSON.stringify(Object.entries(overrides).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  let memo = valuesMemo.get(config);
  if (!memo) valuesMemo.set(config, (memo = new Map()));
  let hit = memo.get(key);
  if (!hit || hit.resourceTypes !== resourceTypes) {
    hit = { resourceTypes, values: computeFlowColorValues(config, overrides, resourceTypes) };
    memo.set(key, hit);
  }
  return hit.values;
}

const valuesMemo = new WeakMap<PostextConfig, Map<string, { resourceTypes: readonly ResourceType[] | undefined; values: FlowColorValues }>>();

/** Forget the colour values memoised for `config` (changed in place,
 *  #629: `invalidateConfig`). */
export function forgetFlowColorValues(config: PostextConfig): void {
  valuesMemo.delete(config);
}

function computeFlowColorValues(
  config: PostextConfig,
  overrides: Readonly<Record<string, string>>,
  resourceTypes: readonly ResourceType[] | undefined,
): FlowColorValues {
  const out = new Map<string, Map<FlowColorKind, Set<string>>>();
  const palette = config.colorPalette;
  if (!palette || palette.length === 0) return out;
  const counts = new Map<string, number>();
  for (const e of palette) {
    const key = e.value.hex.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const shared = new Set([...counts].filter(([, n]) => n > 1).map(([hex]) => hex));
  if (shared.size === 0) return out;
  const next: ColorPaletteEntry[] = palette.map((e) => {
    const hex = overrides[e.id];
    return hex ? { ...e, value: { ...e.value, hex: withHash(hex) } } : e;
  });
  const before = resolveAllConfig(config);
  const after = resolveAllConfig({ ...config, colorPalette: next });
  const record = (kinds: readonly FlowColorKind[], a: ColorValue, b: ColorValue): void => {
    const key = a.hex.toLowerCase();
    if (kinds.length === 0 || !shared.has(key)) return;
    let byKind = out.get(key);
    if (!byKind) out.set(key, (byKind = new Map()));
    for (const kind of kinds) {
      let values = byKind.get(kind);
      if (!values) byKind.set(kind, (values = new Set()));
      values.add(b.hex.toLowerCase());
    }
  };
  walkColorPairs(before, after, [], (path, a, b) => record(kindsOfPath(path, before), a, b));
  // Captions of a resource type resolve their overrides at layout time.
  for (const type of resourceTypes ?? []) {
    const cs: CaptionStyleConfig | undefined = type.captionStyle;
    if (!cs) continue;
    walkColorPairs(
      mergeCaptionStyle(before.captionStyle, cs, before.colorPalette),
      mergeCaptionStyle(after.captionStyle, cs, after.colorPalette),
      [],
      (path, a, b) => record([`caption:${path.join('.')}@${type.id}`], a, b),
    );
  }
  return out;
}
