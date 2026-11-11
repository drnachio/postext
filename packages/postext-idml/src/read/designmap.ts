// `designmap.xml`: the document itself. It names the other parts
// (`<idPkg:Story src="…"/>`) and holds what belongs to the whole
// document: languages, layers, sections, hyperlinks and their
// destinations, bookmarks, the index, conditions, text variables,
// cross-reference formats and numbering lists.

import { bool, children, isElement, localName, num, property, textOf, type XmlElement, type XmlInstruction } from '../xml/read.js';
import type { IdmlCondition, IdmlDestination, IdmlDocument, IdmlHyperlink, IdmlLayer, IdmlNumberingList, IdmlParts, IdmlSection, IdmlTopic } from '../model/document.js';
import { languageTag } from './languages.js';
import { plainName, refOf } from './props.js';

export type DesignMap = Pick<
  IdmlDocument,
  'domVersion' | 'product' | 'name' | 'cmykProfile' | 'rgbProfile' | 'languages' | 'layers' | 'sections' | 'hyperlinks' | 'destinations' | 'bookmarks' | 'topics' | 'conditions' | 'textVariables' | 'crossReferenceFormats' | 'numberingLists' | 'storyList' | 'parts'
>;

/** `product="21.6(57)"` of the `<?aid … ?>` instruction before the root. */
export function productOf(prolog: readonly XmlInstruction[]): string | undefined {
  for (const pi of prolog) {
    if (pi.pi !== 'aid') continue;
    const m = /(?:^|\s)product\s*=\s*"([^"]*)"/.exec(pi.data);
    if (m) return m[1];
  }
  return undefined;
}

function bookmarksOf(el: XmlElement): IdmlDocument['bookmarks'] {
  // As deep as the XML, which the parser limits.
  return children(el, 'Bookmark').map((b) => ({ name: b.attrs.Name ?? '', destination: refOf(b.attrs.Destination) ?? '', children: bookmarksOf(b) }));
}

function topicsOf(el: XmlElement, path: string[], out: Map<string, IdmlTopic>): void {
  for (const t of children(el, 'Topic')) {
    const self = t.attrs.Self;
    const name = t.attrs.Name ?? '';
    if (self && !out.has(self)) {
      out.set(self, {
        self,
        name,
        sortOrder: t.attrs.SortOrder ?? '',
        path,
        crossReferences: children(t, 'CrossReference').map((x) => {
          const custom = plainName(x.attrs.CustomTypeString);
          return { type: x.attrs.CrossReferenceType ?? '', topic: refOf(x.attrs.ReferencedTopic) ?? '', ...(custom ? { customText: custom } : {}) };
        }),
      });
    }
    topicsOf(t, [...path, name], out);
  }
}

const DESTINATIONS: Record<string, IdmlDestination['kind']> = {
  HyperlinkURLDestination: 'url',
  HyperlinkPageDestination: 'page',
  HyperlinkExternalPageDestination: 'external',
  HyperlinkTextDestination: 'text',
  ParagraphDestination: 'paragraph',
};

function destinationOf(el: XmlElement, kind: IdmlDestination['kind']): IdmlDestination {
  const d: IdmlDestination = { self: el.attrs.Self ?? '', name: el.attrs.Name ?? '', kind };
  if (kind === 'url' && el.attrs.DestinationURL !== undefined) d.url = el.attrs.DestinationURL;
  const page = refOf(el.attrs.DestinationPage);
  if (kind === 'page' && page) d.page = page;
  if (kind === 'external') {
    if (el.attrs.DocumentPath) d.documentPath = plainName(el.attrs.DocumentPath);
    const index = num(el, 'DestinationPageIndex');
    if (index !== undefined) d.pageIndex = index;
  }
  return d;
}

function hyperlinkOf(el: XmlElement): IdmlHyperlink {
  // The destination is a property (`type="object"`); older packages wrote
  // it as an attribute.
  const destination = refOf(textOf(property(el, 'Destination')).trim()) ?? refOf(el.attrs.Destination);
  return { self: el.attrs.Self ?? '', name: el.attrs.Name ?? '', source: refOf(el.attrs.Source) ?? '', ...(destination ? { destination } : {}), hidden: el.attrs.Hidden === 'true' };
}

function sectionOf(el: XmlElement): IdmlSection {
  const start = num(el, 'PageNumberStart');
  return {
    self: el.attrs.Self ?? '',
    pageStart: refOf(el.attrs.PageStart) ?? '',
    length: Math.max(0, Math.round(num(el, 'Length') ?? 0)),
    continueNumbering: bool(el, 'ContinueNumbering') ?? true,
    ...(start !== undefined ? { pageNumberStart: start } : {}),
    pageNumberStyle: textOf(property(el, 'PageNumberStyle')).trim() || el.attrs.PageNumberStyle || 'Arabic',
    prefix: el.attrs.SectionPrefix ?? '',
    includePrefix: bool(el, 'IncludeSectionPrefix') ?? false,
    marker: el.attrs.Marker ?? '',
  };
}

const layerOf = (el: XmlElement): IdmlLayer => ({
  self: el.attrs.Self ?? '',
  name: el.attrs.Name ?? '',
  visible: el.attrs.Visible !== 'false',
  locked: el.attrs.Locked === 'true',
  printable: el.attrs.Printable !== 'false',
  ignoreWrap: el.attrs.IgnoreWrap === 'true',
});

/** The document element of `designmap.xml`. */
export function designMapOf(doc: XmlElement, prolog: readonly XmlInstruction[]): DesignMap {
  const parts: IdmlParts = { masterSpreads: [], spreads: [], stories: [] };
  const out: DesignMap = {
    domVersion: doc.attrs.DOMVersion ?? '',
    languages: new Map(),
    layers: [],
    sections: [],
    hyperlinks: [],
    destinations: new Map(),
    bookmarks: bookmarksOf(doc),
    topics: new Map(),
    conditions: new Map<string, IdmlCondition>(),
    textVariables: new Map(),
    crossReferenceFormats: new Map(),
    numberingLists: new Map<string, IdmlNumberingList>(),
    storyList: (doc.attrs.StoryList ?? '').split(/\s+/).filter(Boolean),
    parts,
  };
  const product = productOf(prolog);
  if (product) out.product = product;
  if (doc.attrs.Name) out.name = doc.attrs.Name;
  if (doc.attrs.CMYKProfile) out.cmykProfile = plainName(doc.attrs.CMYKProfile);
  if (doc.attrs.RGBProfile) out.rgbProfile = plainName(doc.attrs.RGBProfile);

  for (const el of doc.children) {
    if (!isElement(el)) continue;
    const name = localName(el.name);
    const self = el.attrs.Self;
    const src = el.attrs.src;
    // The parts: elements of the packaging namespace with a `src`.
    if (src !== undefined && el.name.includes(':')) {
      switch (name) {
        case 'Graphic': parts.graphic = src; break;
        case 'Fonts': parts.fonts = src; break;
        case 'Styles': parts.styles = src; break;
        case 'Preferences': parts.preferences = src; break;
        case 'Tags': parts.tags = src; break;
        case 'BackingStory': parts.backingStory = src; break;
        case 'MasterSpread': parts.masterSpreads.push(src); break;
        case 'Spread': parts.spreads.push(src); break;
        case 'Story': parts.stories.push(src); break;
        default:
      }
      continue;
    }
    const destination = DESTINATIONS[name];
    if (destination) {
      if (self && !out.destinations.has(self)) out.destinations.set(self, destinationOf(el, destination));
      continue;
    }
    switch (name) {
      case 'Language': {
        if (!self) break;
        const plain = plainName(el.attrs.Name);
        const tag = languageTag(plain);
        out.languages.set(self, { name: plain, ...(tag ? { tag } : {}) });
        break;
      }
      case 'Layer':
        out.layers.push(layerOf(el));
        break;
      case 'Section':
        out.sections.push(sectionOf(el));
        break;
      case 'Hyperlink':
        out.hyperlinks.push(hyperlinkOf(el));
        break;
      case 'Index':
        topicsOf(el, [], out.topics);
        break;
      case 'Condition':
        if (self && !out.conditions.has(self)) out.conditions.set(self, { self, name: el.attrs.Name ?? '', visible: el.attrs.Visible !== 'false' });
        break;
      case 'TextVariable':
        if (self && !out.textVariables.has(self)) out.textVariables.set(self, { name: el.attrs.Name ?? '', type: el.attrs.VariableType ?? '' });
        break;
      case 'CrossReferenceFormat':
        if (self && !out.crossReferenceFormats.has(self)) {
          out.crossReferenceFormats.set(self, {
            name: el.attrs.Name ?? '',
            blocks: children(el, 'BuildingBlock').map((b) => {
              const text = plainName(b.attrs.CustomText);
              return { type: b.attrs.BlockType ?? '', ...(text ? { text } : {}) };
            }),
          });
        }
        break;
      case 'NumberingList':
        if (self && !out.numberingLists.has(self)) {
          out.numberingLists.set(self, { self, name: plainName(el.attrs.Name), continueAcrossStories: el.attrs.ContinueNumbersAcrossStories === 'true', continueAcrossDocuments: el.attrs.ContinueNumbersAcrossDocuments === 'true' });
        }
        break;
      default:
    }
  }
  return out;
}

/** Title and first creator of `META-INF/metadata.xml` (the XMP packet). */
export function metadataOf(root: XmlElement): { title?: string; author?: string } {
  // The packet is shallow and regular: description → `dc:title` →
  // `rdf:Alt` → `rdf:li`. Walked with a stack, since a packet is not ours.
  const find = (from: XmlElement, local: string): XmlElement | undefined => {
    const stack: XmlElement[] = [from];
    while (stack.length) {
      const e = stack.pop()!;
      if (e !== from && localName(e.name) === local) return e;
      for (let i = e.children.length - 1; i >= 0; i--) {
        const c = e.children[i];
        if (isElement(c)) stack.push(c);
      }
    }
    return undefined;
  };
  const first = (holder: string): string | undefined => {
    const h = find(root, holder);
    const li = h ? find(h, 'li') : undefined;
    const text = (li ? textOf(li) : '').trim();
    return text || undefined;
  };
  const title = first('title');
  const author = first('creator');
  return { ...(title ? { title } : {}), ...(author ? { author } : {}) };
}

