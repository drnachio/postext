// `Resources/Styles.xml`: the five kinds of style, each under a root
// group (`RootParagraphStyleGroup`…) that may hold groups in groups.
//
// A style's `Self` is its kind and its path (`ParagraphStyle/Heads%3aH1`:
// the group separator `:` is escaped), and its `Name` is the same path
// unescaped (`Heads:H1`). The style it is based on is the `BasedOn`
// property: a `Self` when it is `type="object"`, and a bare name when it
// is `type="string"`, which is how InDesign writes its own root styles
// (`$ID/[No paragraph style]`).

import { child, isElement, localName, textOf, type XmlElement } from '../xml/read.js';
import type { IdmlStyle, IdmlWarning, StyleKind } from '../model/document.js';
import { listRecords, plainName, propsOf } from './props.js';

const KINDS: Record<string, StyleKind> = { ParagraphStyle: 'paragraph', CharacterStyle: 'character', ObjectStyle: 'object', TableStyle: 'table', CellStyle: 'cell' };
const GROUPS: Record<string, StyleKind> = {
  RootParagraphStyleGroup: 'paragraph', ParagraphStyleGroup: 'paragraph',
  RootCharacterStyleGroup: 'character', CharacterStyleGroup: 'character',
  RootObjectStyleGroup: 'object', ObjectStyleGroup: 'object',
  RootTableStyleGroup: 'table', TableStyleGroup: 'table',
  RootCellStyleGroup: 'cell', CellStyleGroup: 'cell',
};

export type StyleMaps = Record<StyleKind, Map<string, IdmlStyle>>;

export const emptyStyles = (): StyleMaps => ({ paragraph: new Map(), character: new Map(), object: new Map(), table: new Map(), cell: new Map() });

/** A name as it stands in a `Self`: InDesign escapes `%` and `:`. */
const escaped = (name: string): string => name.replace(/%/g, '%25').replace(/:/g, '%3a');

function nestedOf(el: XmlElement): NonNullable<IdmlStyle['nested']> {
  const out: NonNullable<IdmlStyle['nested']> = [];
  const props = propsOf(el).properties;
  const text = (e: XmlElement | undefined): string | undefined => (e ? textOf(e) : undefined);
  const number = (e: XmlElement | undefined): number | undefined => {
    const n = e ? Number(textOf(e)) : NaN;
    return Number.isFinite(n) ? n : undefined;
  };
  for (const r of listRecords(props.AllNestedStyles)) {
    const delimiter = text(r.Delimiter);
    const repetition = number(r.Repetition);
    out.push({ kind: 'nested', characterStyle: text(r.AppliedCharacterStyle) ?? '', ...(delimiter !== undefined ? { delimiter } : {}), ...(repetition !== undefined ? { repetition } : {}), inclusive: text(r.Inclusive) === 'true' });
  }
  for (const r of listRecords(props.AllLineStyles)) {
    const lines = number(r.LineCount);
    out.push({ kind: 'line', characterStyle: text(r.AppliedCharacterStyle) ?? '', ...(lines !== undefined ? { repetition: lines } : {}) });
  }
  for (const r of listRecords(props.AllGREPStyles)) {
    const expression = text(r.GrepExpression);
    out.push({ kind: 'grep', characterStyle: text(r.AppliedCharacterStyle) ?? '', ...(expression !== undefined ? { expression } : {}) });
  }
  return out;
}

function styleOf(el: XmlElement, element: string, kind: StyleKind, groups: string[]): IdmlStyle {
  const p = propsOf(el);
  // An object style's text frame options (insets, first baseline,
  // vertical justification) are a child of the style, not a property:
  // kept with the properties, as written, for the frames that apply it.
  const framePreference = kind === 'object' ? child(el, 'TextFramePreference') : undefined;
  if (framePreference) p.properties.TextFramePreference = framePreference;
  const self = el.attrs.Self ?? '';
  const full = plainName(el.attrs.Name);
  // `Name` carries the group path; the style's own name is what follows it.
  const prefix = groups.length ? `${groups.join(':')}:` : '';
  const name = prefix && full.startsWith(prefix) ? full.slice(prefix.length) : full;
  const style: IdmlStyle = { ...p, kind, self, name, groups, root: /^\[(No |None\])/.test(full) && self.includes('/$ID/') };
  const based = p.properties.BasedOn;
  if (based) {
    const value = textOf(based);
    const ref = based.attrs.type === 'object' || value.startsWith(`${element}/`) ? value : `${element}/${value}`;
    if (value && value !== 'n' && ref !== self) style.basedOn = ref;
  }
  if (kind === 'paragraph') {
    const nested = nestedOf(el);
    if (nested.length) style.nested = nested;
  }
  return style;
}

export function stylesOf(root: XmlElement, warnings: IdmlWarning[], part?: string): StyleMaps {
  const maps = emptyStyles();
  // Groups nest as deep as the XML, which the parser limits.
  const group = (el: XmlElement, groups: string[]): void => {
    for (const c of el.children) {
      if (!isElement(c)) continue;
      const element = localName(c.name);
      const kind = KINDS[element];
      if (kind) {
        const style = styleOf(c, element, kind, groups);
        if (!style.self) continue;
        if (maps[kind].has(style.self)) warnings.push({ code: 'duplicateId', message: `Style ${style.self.slice(0, 80)} is written twice; the first one is kept`, ...(part ? { part } : {}) });
        else maps[kind].set(style.self, style);
      } else if (element in GROUPS && !element.startsWith('Root')) group(c, [...groups, plainName(c.attrs.Name)]);
    }
  };
  for (const c of root.children) if (isElement(c) && localName(c.name) in GROUPS) group(c, []);

  // A based-on written by name: find the style it names.
  for (const kind of Object.keys(maps) as StyleKind[]) {
    const map = maps[kind];
    let byName: Map<string, string> | undefined;
    for (const style of map.values()) {
      const ref = style.basedOn;
      if (!ref || map.has(ref)) continue;
      const slash = ref.indexOf('/');
      const bare = ref.slice(slash + 1);
      const alt = `${ref.slice(0, slash + 1)}${escaped(bare)}`;
      if (map.has(alt)) {
        style.basedOn = alt;
        continue;
      }
      if (!byName) {
        byName = new Map();
        for (const s of map.values()) byName.set([...s.groups, s.name].join(':'), s.self);
      }
      const named = byName.get(plainName(bare));
      if (named && named !== style.self) style.basedOn = named;
      else delete style.basedOn;
    }
  }
  return maps;
}

