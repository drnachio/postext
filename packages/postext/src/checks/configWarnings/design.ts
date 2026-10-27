// Checks on design elements and boxes: fence conditions, text over,
// connectors, unknown keys, path data, box shapes, anchors, box style
// chains and label icons (#1276: split out of configWarnings.ts).
import type { PostextConfig, DesignPathElement, CalloutLabelIconConfig } from '../../types.js';
import type { ConfigWarning } from '../../vdt.js';
import { configDesignSlots } from '../../design/slots.js';
import { type UnknownKey, designElementUnknownKeys, DOTTED_PATH } from '../../design/elementKeys.js';
import { FENCE_CONDITION_SLOTS } from '../../design/fenceCondition.js';
import { parseSvgPath, pathViewBox } from '../../design/svgPath.js';
import { CONNECTOR_ROUTINGS, CONNECTOR_CAPS, connectorPaintsOver, CONNECTOR_SIDES } from '../../design/connector.js';
import { closestKey } from '../../util/closestKey.js';
import { calloutStyleChain, labelIconKind, labelIconScale } from '../../defaults/boxes/calloutStyles.js';
import { opacityWarning } from '../../composed/validate.js';

/** A design element's page-fence condition (#1087): a `when` / `unless`
 *  that names no attribute (not a string, or empty), or one written in a
 *  slot that does not read it (a heading, part, contents row or box design),
 *  is `unknownConfigValue` with `used: ''`: the element is drawn as if it
 *  had none. */
export function collectFenceConditionWarnings(config: PostextConfig): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  for (const slot of configDesignSlots(config)) {
    slot.slot.elements.forEach((el, i) => {
      const e = el as unknown as Record<string, unknown> | null;
      if (!e || typeof e !== 'object') return;
      for (const key of ['when', 'unless'] as const) {
        const v = e[key];
        if (v === undefined) continue;
        const named = typeof v === 'string' && v.trim() !== '';
        if (named && FENCE_CONDITION_SLOTS.has(slot.kind)) continue;
        out.push({ kind: 'unknownConfigValue', path: `${slot.path}.elements[${i}].${key}`, value: typeof v === 'string' ? v : JSON.stringify(v) ?? String(v), used: '' });
      }
    });
  }
  return out;
}

/** A decoration text's `over` (#1189) that is not a boolean
 *  (`unknownConfigValue`, read as unset: over the frames in a module
 *  template, under them in a page template). */
export function collectTextOverWarnings(config: PostextConfig): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  const templates = (config as { pageTemplates?: unknown }).pageTemplates;
  for (const slot of configDesignSlots(config)) {
    if (slot.kind !== 'decoration') continue;
    slot.slot.elements.forEach((el, i) => {
      const e = el as unknown as Record<string, unknown> | null;
      if (!e || typeof e !== 'object' || e.kind !== 'text' || e.over === undefined || typeof e.over === 'boolean') return;
      const owner = Array.isArray(templates) ? templates.find((t, k) => slot.owner === `pageTemplates[${k}]` && t) as { role?: unknown } | undefined : undefined;
      out.push({ kind: 'unknownConfigValue', path: `${slot.path}.elements[${i}].over`, value: String(e.over), used: String(owner?.role === 'module') });
    });
  }
  return out;
}

/** Connectors (#1056): one outside a page template's decoration (a
 *  running head, a heading design, a part page, a box design has no frames
 *  to join: not drawn), and a `routing`, `startCap` / `endCap`, an `over`
 *  that is not a boolean (#1076) or an end's `side` / `at` outside its
 *  choices (`unknownConfigValue`). */
export function collectConnectorWarnings(config: PostextConfig): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  const word = (path: string, value: unknown, choices: readonly string[], used: string): void => {
    if (value === undefined || (typeof value === 'string' && choices.includes(value))) return;
    const suggestion = typeof value === 'string' ? closestKey(value, choices) : undefined;
    out.push({ kind: 'unknownConfigValue', path, value: String(value), used, ...(suggestion ? { suggestion } : {}) });
  };
  for (const slot of configDesignSlots(config)) {
    slot.slot.elements.forEach((el, i) => {
      const e = el as unknown as Record<string, unknown> | null;
      if (!e || typeof e !== 'object' || e.kind !== 'connector') return;
      const path = `${slot.path}.elements[${i}]`;
      if (slot.kind !== 'decoration') {
        out.push({ kind: 'unknownConfigValue', path: `${path}.kind`, value: 'connector', used: '' });
        return;
      }
      word(`${path}.routing`, e.routing, CONNECTOR_ROUTINGS, 'elbow');
      word(`${path}.startCap`, e.startCap, CONNECTOR_CAPS, 'none');
      word(`${path}.endCap`, e.endCap, CONNECTOR_CAPS, 'none');
      const opacity = opacityWarning(e.opacity, `${path}.opacity`);
      if (opacity) out.push(opacity);
      // Over the frames or under them (#1076): a boolean; anything else is
      // read as unset (over when an end names a picture's anchor).
      if (e.over !== undefined && typeof e.over !== 'boolean') {
        const used = connectorPaintsOver({ from: e.from, to: e.to } as Parameters<typeof connectorPaintsOver>[0]);
        out.push({ kind: 'unknownConfigValue', path: `${path}.over`, value: String(e.over), used: String(used) });
      }
      const end =(raw: unknown, at: string): void => {
        if (!raw || typeof raw !== 'object') return;
        const r = raw as Record<string, unknown>;
        word(`${at}.side`, r.side, CONNECTOR_SIDES, '');
        // An anchor of the frame's picture (#1057): a name; which names the
        // picture has is known only once the page is laid out.
        if (r.anchor !== undefined && (typeof r.anchor !== 'string' || r.anchor.trim() === '')) {
          out.push({ kind: 'unknownConfigValue', path: `${at}.anchor`, value: String(r.anchor), used: '' });
        }
        const pos = r.at;
        if (pos === undefined) return;
        if (typeof pos === 'number' && Number.isFinite(pos)) {
          if (pos < 0 || pos > 1) out.push({ kind: 'unknownConfigValue', path: `${at}.at`, value: String(pos), used: String(Math.max(0, Math.min(1, pos))) });
        } else word(`${at}.at`, pos, SIDE_POSITIONS, 'center');
      };
      end(e.from, `${path}.from`);
      if (Array.isArray(e.to)) e.to.forEach((t, k) => end(t, `${path}.to[${k}]`));
      else end(e.to, `${path}.to`);
    });
  }
  return out;
}

/** The keys of every design element (#1122): a key its kind does not
 *  have, at the element, in its placement (anchor, offset, size, a
 *  `{ to, edge }` size), a connector's ends and a text's or box's nested
 *  looks (`unknownConfigKey`, the key ignored). A path element's keys
 *  (#1060) are checked here too. */
export function collectDesignKeyWarnings(config: PostextConfig): ConfigWarning[] {
  const found: UnknownKey[] = [];
  for (const slot of configDesignSlots(config)) {
    slot.slot.elements.forEach((el, i) => designElementUnknownKeys(el, `${slot.path}.elements[${i}]`, DOTTED_PATH, found));
  }
  return found.map((k) => ({ kind: 'unknownConfigKey', path: k.path, value: k.value, used: '', ...(k.suggestion ? { suggestion: k.suggestion } : {}) }));
}

/** The longest piece of bad path data a warning repeats. */
const PATH_DATA_SAMPLE = 60;

/** The path elements of every design slot (#1060): path data that cannot
 *  be read (its
 *  first characters in `value`) and a `viewBox` that is no pair of
 *  positive numbers (`unknownConfigValue`, `used` empty: the element draws
 *  nothing); a `preserveAspectRatio` other than `none` and `meet`
 *  (`used: 'none'`). */
export function collectDesignPathWarnings(config: PostextConfig): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  for (const slot of configDesignSlots(config)) {
    slot.slot.elements.forEach((el, i) => {
      if (!el || typeof el !== 'object' || (el as { kind?: unknown }).kind !== 'path') return;
      const path = `${slot.path}.elements[${i}]`;
      const e = el as DesignPathElement;
      const d = e.d as unknown;
      const parsed = typeof d === 'string' ? parseSvgPath(d) : undefined;
      if (!parsed?.ok) {
        const text = typeof d === 'string' ? d : String(d);
        const sample = text.length > PATH_DATA_SAMPLE ? `${text.slice(0, PATH_DATA_SAMPLE - 1)}…` : text;
        out.push({ kind: 'unknownConfigValue', path: `${path}.d`, value: sample, used: '' });
      }
      if (e.viewBox !== undefined && !pathViewBox(e.viewBox)) {
        out.push({ kind: 'unknownConfigValue', path: `${path}.viewBox`, value: JSON.stringify(e.viewBox) ?? String(e.viewBox), used: '' });
      }
      const par = e.preserveAspectRatio as unknown;
      if (par !== undefined && par !== 'none' && par !== 'meet') {
        const suggestion = closestKey(String(par), ['none', 'meet']);
        out.push({ kind: 'unknownConfigValue', path: `${path}.preserveAspectRatio`, value: String(par), used: 'none', ...(suggestion ? { suggestion } : {}) });
      }
    });
  }
  return out;
}

const CORNER_KEYS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;
const SIDE_KEYS = ['top', 'right', 'bottom', 'left'] as const;
const BORDER_SIDE_KEYS = ['enabled', 'color', 'width'] as const;
const LABEL_POSITIONS = ['top-right', 'top-left', 'top-start', 'top-end', 'bottom-right', 'bottom-left', 'bottom-start', 'bottom-end'] as const;

/** The keys of `value` (a plain object) that are not in `known`, as
 *  `unknownConfigKey` warnings under `path`. */
function unknownKeys(value: unknown, known: readonly string[], path: string, out: ConfigWarning[]): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const [key, v] of Object.entries(value)) {
    if (v === undefined || known.includes(key)) continue;
    const suggestion = closestKey(key, known);
    out.push({ kind: 'unknownConfigKey', path: `${path}.${key}`, value: key, used: '', ...(suggestion ? { suggestion } : {}) });
  }
}

/** A corner radius that names its corners and a border per side (#1059):
 *  keys they do not have. */
function shapeKeyWarnings(radius: unknown, sides: unknown, radiusPath: string, sidesPath: string, out: ConfigWarning[]): void {
  if (radius && typeof radius === 'object' && !('value' in radius && 'unit' in radius)) unknownKeys(radius, CORNER_KEYS, radiusPath, out);
  if (!sides || typeof sides !== 'object' || Array.isArray(sides)) return;
  unknownKeys(sides, SIDE_KEYS, sidesPath, out);
  for (const k of SIDE_KEYS) unknownKeys((sides as Record<string, unknown>)[k], BORDER_SIDE_KEYS, `${sidesPath}.${k}`, out);
}

/** Box shapes (#1059): a box style's `borderRadius` corners and
 *  `border.sides`, a design box's `borderRadius` and `borderSides` (keys
 *  they do not have: `unknownConfigKey`); a label tab's `position` outside
 *  its choices, and a joined tab with an `offset` (it stands on the edge:
 *  the offset is not read) — `unknownConfigValue`. */
export function collectBoxShapeWarnings(config: PostextConfig): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  (config.calloutStyles ?? []).forEach((s, i) => {
    if (!s || typeof s !== 'object') return;
    const path = `calloutStyles[${i}]`;
    shapeKeyWarnings(s.borderRadius, (s.border as { sides?: unknown } | undefined)?.sides, `${path}.borderRadius`, `${path}.border.sides`, out);
    const label = s.label as { position?: unknown; joined?: unknown; offset?: unknown } | undefined;
    if (!label || typeof label !== 'object') return;
    const position = label.position;
    if (position !== undefined && !(LABEL_POSITIONS as readonly unknown[]).includes(position)) {
      const suggestion = typeof position === 'string' ? closestKey(position, LABEL_POSITIONS) : undefined;
      const used = typeof position === 'string' && position.startsWith('bottom-') ? 'bottom-left' : 'top-left';
      out.push({ kind: 'unknownConfigValue', path: `${path}.label.position`, value: String(position), used, ...(suggestion ? { suggestion } : {}) });
    }
    const offset = label.offset as { value?: unknown } | undefined;
    if (label.joined === true && offset && typeof offset === 'object' && typeof offset.value === 'number' && offset.value !== 0) {
      out.push({ kind: 'unknownConfigValue', path: `${path}.label.offset`, value: String(offset.value), used: '0' });
    }
  });
  for (const slot of configDesignSlots(config)) {
    slot.slot.elements.forEach((el, i) => {
      if (!el || typeof el !== 'object') return;
      const path = `${slot.path}.elements[${i}]`;
      // A box element's `style`, a text element's `box`.
      for (const key of ['style', 'box'] as const) {
        const box = (el as unknown as Record<string, unknown>)[key];
        if (!box || typeof box !== 'object') continue;
        const b = box as { borderRadius?: unknown; borderSides?: unknown };
        shapeKeyWarnings(b.borderRadius, b.borderSides, `${path}.${key}.borderRadius`, `${path}.${key}.borderSides`, out);
      }
    });
  }
  return out;
}

const SIDE_POSITIONS = ['start', 'center', 'end'] as const;
const SIZE_TO_EDGES = ['top', 'bottom', 'left', 'right', 'center'] as const;

/** The points along a side and the edges of a size of every design
 *  element (#1055): an `anchor.at` that is no side position — a word other
 *  than `start`, `center` and `end` (ignored: the edge's own point), a
 *  number outside 0…1 (held there) — and a `{ to, edge }` size whose edge
 *  is none of `top`, `bottom`, `left`, `right` and `center` (`'fill'`). */
export function collectDesignAnchorWarnings(config: PostextConfig): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  for (const slot of configDesignSlots(config)) {
    slot.slot.elements.forEach((el, i) => {
      const placement = (el as { placement?: unknown } | null)?.placement;
      if (!placement || typeof placement !== 'object') return;
      const path = `${slot.path}.elements[${i}].placement`;
      const anchor = (placement as { anchor?: unknown }).anchor;
      const at = anchor && typeof anchor === 'object' ? (anchor as { at?: unknown }).at : undefined;
      if (at !== undefined) {
        if (typeof at === 'number' && Number.isFinite(at)) {
          if (at < 0 || at > 1) out.push({ kind: 'unknownConfigValue', path: `${path}.anchor.at`, value: String(at), used: String(Math.max(0, Math.min(1, at))) });
        } else if (typeof at !== 'string' || !(SIDE_POSITIONS as readonly string[]).includes(at)) {
          const suggestion = typeof at === 'string' ? closestKey(at, SIDE_POSITIONS) : undefined;
          out.push({ kind: 'unknownConfigValue', path: `${path}.anchor.at`, value: String(at), used: '', ...(suggestion ? { suggestion } : {}) });
        }
      }
      const size = (placement as { size?: unknown }).size;
      if (!size || typeof size !== 'object') return;
      for (const key of ['width', 'height', 'maxWidth'] as const) {
        const v = (size as Record<string, unknown>)[key];
        if (!v || typeof v !== 'object' || !('to' in v)) continue;
        const edge = (v as { edge?: unknown }).edge;
        if (typeof edge === 'string' && (SIZE_TO_EDGES as readonly string[]).includes(edge)) continue;
        const suggestion = typeof edge === 'string' ? closestKey(edge, SIZE_TO_EDGES) : undefined;
        out.push({ kind: 'unknownConfigValue', path: `${path}.size.${key}.edge`, value: String(edge), used: 'fill', ...(suggestion ? { suggestion } : {}) });
      }
    });
  }
  return out;
}

/** Box styles based on another (#905): an `extends` that names no style
 *  (`calloutStyleExtendsUnknown`) or that comes back to the style
 *  (`calloutStyleExtendsCycle`, once per loop, on its first style). */
export function collectCalloutStyleWarnings(config: PostextConfig): ConfigWarning[] {
  const styles = config.calloutStyles ?? [];
  if (!styles.some((s) => s?.extends !== undefined)) return [];
  const out: ConfigWarning[] = [];
  const ids = styles.map((s) => s?.id).filter((id): id is string => typeof id === 'string');
  const loops = new Set<string>();
  styles.forEach((s, i) => {
    if (!s || s.extends === undefined) return;
    const path = `calloutStyles[${i}].extends`;
    const parent = String(s.extends);
    if (!ids.includes(parent)) {
      const suggestion = closestKey(parent, ids.filter((id) => id !== s.id));
      out.push({ kind: 'calloutStyleExtendsUnknown', path, value: parent, used: '', ...(suggestion ? { suggestion } : {}) });
      return;
    }
    const { cycle } = calloutStyleChain(styles, i);
    if (!cycle || cycle[0] !== i) return;
    const key = [...cycle.slice(0, -1)].sort((a, b) => a - b).join(',');
    if (loops.has(key)) return;
    loops.add(key);
    out.push({ kind: 'calloutStyleExtendsCycle', path, value: cycle.map((k) => styles[k]!.id).join(' → '), used: '' });
  });
  return out;
}

const LABEL_ICON_KEYS = {
  kind: true, resourceId: true, width: true, gap: true, placement: true, tint: true,
  glyph: true, fontFamily: true, fontWeight: true, scale: true, color: true, shape: true, strokeWidth: true,
} satisfies Record<keyof CalloutLabelIconConfig, true>;

/** The icon of a box style's label tab (#981, #995, #1054): a key it does
 *  not have (`unknownConfigKey`), and a `kind`, `placement` or `scale`
 *  the engine does not read (`unknownConfigValue`, with what it reads
 *  instead). */
export function collectLabelIconWarnings(config: PostextConfig): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  (config.calloutStyles ?? []).forEach((s, i) => {
    const icon = (s as { label?: { icon?: unknown } } | undefined)?.label?.icon;
    if (!icon || typeof icon !== 'object' || Array.isArray(icon)) return;
    const path = `calloutStyles[${i}].label.icon`;
    const names = Object.keys(LABEL_ICON_KEYS);
    for (const [key, value] of Object.entries(icon)) {
      if (value === undefined || Object.prototype.hasOwnProperty.call(LABEL_ICON_KEYS, key)) continue;
      const suggestion = closestKey(key, names);
      out.push({ kind: 'unknownConfigKey', path: `${path}.${key}`, value: key, used: '', ...(suggestion ? { suggestion } : {}) });
    }
    const ic = icon as CalloutLabelIconConfig;
    const kind = ic.kind as unknown;
    if (kind !== undefined && kind !== 'resource' && kind !== 'glyph' && kind !== 'shape') {
      const suggestion = closestKey(String(kind), ['resource', 'glyph', 'shape']);
      out.push({ kind: 'unknownConfigValue', path: `${path}.kind`, value: String(kind), used: labelIconKind(ic), ...(suggestion ? { suggestion } : {}) });
    }
    const placement = ic.placement as unknown;
    if (placement !== undefined && placement !== 'beside' && placement !== 'inside') {
      const suggestion = closestKey(String(placement), ['beside', 'inside']);
      out.push({ kind: 'unknownConfigValue', path: `${path}.placement`, value: String(placement), used: 'beside', ...(suggestion ? { suggestion } : {}) });
    }
    const shape = ic.shape as unknown;
    if (shape !== undefined && shape !== 'ring' && shape !== 'dot') {
      const suggestion = closestKey(String(shape), ['ring', 'dot']);
      out.push({ kind: 'unknownConfigValue', path: `${path}.shape`, value: String(shape), used: 'ring', ...(suggestion ? { suggestion } : {}) });
    }
    if (ic.scale !== undefined && labelIconScale(ic.scale) !== ic.scale) {
      out.push({ kind: 'unknownConfigValue', path: `${path}.scale`, value: String(ic.scale), used: String(labelIconScale(ic.scale)) });
    }
  });
  return out;
}
