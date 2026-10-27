// #1063, the issue's "done when": a tree diagram with three connectors and a
// card joined to its tab built from scratch with the template editor's own
// edits (the frames picked one after the other, as on the page or in the
// editor's list), laid out by the engine. The handles the canvas draws sit
// on the lines the engine lays.

import { describe, expect, it } from 'vitest';
import { buildDocument, createMeasurementCache, type CalloutStyleConfig, type DesignConnectorElement, type PostextConfig, type VDTBlock, type VDTDesignPathBlock, type VDTPathCommand } from 'postext';
import { createTemplate, updateTemplate } from './templateEdits.js';
import { newConnector, pickConnectorFrame, updateDecorationElement, type ConnectorPickPhase } from './connectorEdits.js';
import { connectorHandles } from './connectorHandles.js';
import { joinedTabPatch } from '../sidebar/sections/callouts/CalloutStylesSection.js';
import { setCorner, unlinkCorners } from '../sidebar/sections/running/HeaderFooterSection/shapeEdits.js';

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const mm = (value: number) => ({ value, unit: 'mm' as const });

/** Clicks on frames, the first the start, as the canvas makes them. */
function picked(el: DesignConnectorElement, clicks: string[]): DesignConnectorElement {
  let phase: ConnectorPickPhase = 'from';
  for (const name of clicks) ({ element: el, phase } = pickConnectorFrame(el, phase, name));
  return el;
}

function book(): { config: PostextConfig; markdown: string } {
  // A new template, its frames drawn on the page (here: written as the
  // drop writes them, anchored to each other).
  let templates = createTemplate([], 'Tree').templates;
  const id = templates[0]!.id;
  templates = updateTemplate(templates, id, 'base', {
    header: false,
    frames: [
      { name: 'root', width: mm(50), placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(60), y: mm(5) } } },
      { name: 'a', width: mm(50), placement: { anchor: { to: '#root', edge: 'below' }, offset: { x: mm(-45), y: mm(15) } } },
      { name: 'b', width: mm(50), placement: { anchor: { to: '#a', edge: 'align-top' }, offset: { x: mm(90) } } },
      { name: 'a1', width: mm(25), placement: { anchor: { to: '#a', edge: 'below' }, offset: { x: mm(-5), y: mm(15) } } },
      { name: 'a2', width: mm(25), placement: { anchor: { to: '#a1', edge: 'align-top' }, offset: { x: mm(30) } } },
      { name: 'b1', width: mm(40), placement: { anchor: { to: '#b', edge: 'below' }, offset: { y: mm(15) } } },
      { name: 'card', style: 'card', width: mm(120), placement: { anchor: { to: '#a1', edge: 'below' }, offset: { y: mm(20) } } },
    ],
  });
  // Three connectors added to the decoration and picked.
  const lines = [
    picked(newConnector('connector1', ['root', 'a']), ['root', 'a', 'b']),
    picked(newConnector('connector2', ['root', 'a']), ['a', 'a1', 'a2']),
    picked(newConnector('connector3', ['root', 'a']), ['b', 'b1']),
  ];
  templates = updateTemplate(templates, id, 'base', { decoration: { elements: lines } });
  templates = updateDecorationElement(templates, id, 'base', 'connector1', (el) => ({ ...el, routing: 'tree' } as DesignConnectorElement));
  templates = updateDecorationElement(templates, id, 'base', 'connector2', (el) => ({ ...el, routing: 'tree', endCap: 'arrow' } as DesignConnectorElement));
  // The card's style: rounded on its top corners only, its tab joined.
  const card: CalloutStyleConfig = {
    id: 'card',
    background: { hex: '#ffffff', model: 'hex' },
    border: { enabled: true, color: { hex: '#2f6b3a', model: 'hex' }, width: mm(0.5) },
    borderRadius: setCorner(setCorner(unlinkCorners(mm(3), mm(3)), mm(3), 'bottomLeft', mm(0)), mm(3), 'bottomRight', mm(0)),
    label: { position: 'top-left', height: mm(7), inset: mm(6), color: { hex: '#2f6b3a', model: 'hex' }, ...joinedTabPatch(true) },
  };
  const config: PostextConfig = {
    page: { width: mm(200), height: mm(260), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } },
    header: { elements: [] },
    footer: { elements: [] },
    calloutStyles: [card],
    pageTemplates: templates,
  };
  const frame = (slot: string, text: string, attrs = '') => `:::frame{slot="${slot}"${attrs}}\n${text}\n:::\n`;
  const markdown = [
    `::::page{template="${id}"}`,
    frame('root', 'Living things'),
    frame('a', 'Animals'),
    frame('b', 'Plants'),
    frame('a1', 'Birds'),
    frame('a2', 'Fish'),
    frame('b1', 'Trees'),
    frame('card', 'Every living thing feeds, grows and has young.', ' label="Remember"'),
    '::::',
    '',
  ].join('\n');
  return { config, markdown };
}

const ends = (b: VDTDesignPathBlock) => b.subpaths.flatMap((sp) => sp.filter((c): c is Extract<VDTPathCommand, { x: number }> => c.op !== 'Z').map((c) => ({ x: c.x, y: c.y })));

describe('a tree diagram and a joined card built in the template editor (#1063)', () => {
  const { config, markdown } = book();
  const doc = buildDocument({ markdown }, config, createMeasurementCache());
  const page = doc.pages.find((p) => p.composed)!;
  const c = page.composed!;

  it('lays out the three connectors as lines of the decoration', () => {
    const paths = (c.decoration?.blocks ?? []).filter((b): b is VDTDesignPathBlock => b.kind === 'path');
    expect(paths.map((p) => p.elementId)).toEqual(['connector1', 'connector2', 'connector3']);
    expect(paths[1]!.markers?.filter((m) => m.kind === 'arrow')).toHaveLength(2);
  });

  it('draws each handle on its line: the start and every end', () => {
    const frames = new Map(c.frames.map((f) => [f.name, f.rect]));
    const elements = (config.pageTemplates![0]!.decoration!.elements as DesignConnectorElement[]);
    for (const el of elements) {
      const block = c.decoration!.blocks.find((b) => b.elementId === el.id) as VDTDesignPathBlock;
      const handles = connectorHandles(el, { frames });
      expect(handles.length).toBe(1 + (Array.isArray(el.to) ? el.to.length : 1));
      for (const h of handles) {
        // An arrow's line stops inside its head: the mark's tip is the end.
        const near = [...ends(block), ...(block.markers ?? []).map((m) => ({ x: m.x, y: m.y }))]
          .some((p) => Math.hypot(p.x - h.x, p.y - h.y) < 0.5);
        expect(near, `${el.id} ${String(h.end)} ${h.name}`).toBe(true);
      }
    }
  });

  it('joins the card to its tab: one fill and one border round both', () => {
    const card = doc.blocks.find((b): b is VDTBlock => b.type === 'callout' && b.callout?.styleId === 'card')!;
    const parts = (card.designOverlay?.blocks ?? []).filter((b): b is VDTDesignPathBlock => b.kind === 'path').map((b) => b.boxPart);
    expect(parts).toEqual(['fill', 'border']);
  });
});
