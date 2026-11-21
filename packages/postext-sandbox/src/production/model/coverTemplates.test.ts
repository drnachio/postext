import { describe, expect, it } from 'vitest';
import type { CoverDesignSettings } from './bookProduction.js';
import type { CoverGallery } from '../library/coverGallery.js';
import type { LogoRecord } from '../library/logoLibrary.js';
import { applyTemplate, designParts, exportTemplates, importTemplates, templateFromDesign } from './coverTemplates.js';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const design: CoverDesignSettings = {
  background: '#123456',
  zones: { spine: '#000000' },
  textColor: '#ffffff',
  zoneStyles: { front: { title: { fontSize: 36, align: 'center' } } },
  elements: [{ id: 'photo', kind: 'image', resourceId: 'cover:pic-1', zone: 'front', x: 0, y: 0, width: 50, height: 50 }],
  logos: [{ id: 'l1', kind: 'image', logoId: 'seal', resourceId: 'logo:seal', zone: 'back', x: 5, y: 5, width: 20, height: 10, clearance: 3 }],
};
const gallery: CoverGallery = {
  projectId: 'a',
  pictures: [
    { id: 'pic-1', name: 'Foto', mime: 'image/png', bytes: png, width: 10, height: 10, updatedAt: 1 },
    { id: 'pic-2', name: 'Otra', mime: 'image/png', bytes: png, width: 10, height: 10, updatedAt: 1 },
  ],
  traces: [],
};
const logos: LogoRecord[] = [
  { id: 'seal', name: 'Sello', group: 'publisher', clearance: 3, mime: 'image/png', bytes: png, width: 10, height: 10, updatedAt: 1 },
  { id: 'other', name: 'Otro', group: 'seal', clearance: 3, mime: 'image/png', bytes: png, width: 10, height: 10, updatedAt: 1 },
];

describe('cover templates', () => {
  it('keep the parts asked that have something in them, with what they place', () => {
    expect(designParts(design)).toEqual(['background', 'elements', 'texts', 'logos']);
    const t = templateFromDesign(design, ['background', 'logos', 'effects'], { gallery, logos }, 'Colección roja', 't1', 5);
    expect(t.parts).toEqual(['background', 'logos']);
    expect(t.design).toEqual({ background: '#123456', zones: { spine: '#000000' }, logos: design.logos });
    // The photo is an element, not kept: its picture stays out.
    expect(t.pictures).toEqual([]);
    expect(t.logos.map((l) => l.id)).toEqual(['seal']);
    const whole = templateFromDesign(design, ['background', 'elements', 'texts', 'effects', 'logos', 'finishes'], { gallery, logos }, 'Todo');
    expect(whole.pictures.map((p) => p.id)).toEqual(['pic-1']);
  });

  it('lay the parts asked over a book’s design, leaving the rest', () => {
    const t = templateFromDesign(design, ['background', 'elements', 'texts', 'logos'], { gallery, logos }, 'Serie');
    const book: CoverDesignSettings = { background: '#ffffff', textColor: '#000000', effects: [{ id: 'veil', kind: 'box', color: '#000000', opacity: 0.4, zone: 'front', x: 0, y: 0, width: 10, height: 10 }] };
    const empty: CoverGallery = { projectId: 'b', pictures: [], traces: [] };
    const laid = applyTemplate(t, ['background', 'elements'], book, empty);
    expect(laid.design.background).toBe('#123456');
    expect(laid.design.zones).toEqual({ spine: '#000000' });
    expect(laid.design.elements).toEqual(design.elements);
    // Not asked: the book's type and effects stay, the template's logos do not come.
    expect(laid.design.textColor).toBe('#000000');
    expect(laid.design.effects).toEqual(book.effects);
    expect(laid.design.logos).toBeUndefined();
    expect(laid.gallery.pictures.map((p) => p.id)).toEqual(['pic-1']);
    expect(laid.logos).toEqual([]);
    // A part the template does not keep is left alone.
    expect(applyTemplate(t, ['finishes'], book, empty).design).toEqual(book);
    expect(applyTemplate(t, ['logos'], book, empty).logos.map((l) => l.id)).toEqual(['seal']);
  });

  it('travel as a file and come back', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
    const t = { ...templateFromDesign(design, ['background', 'elements', 'logos'], { gallery, logos }, 'Serie', 't1', 5), thumbnail: jpeg };
    const back = importTemplates(JSON.parse(JSON.stringify(exportTemplates([t]))), 5);
    expect(Array.from(back.templates[0]!.thumbnail!)).toEqual(Array.from(jpeg));
    expect(back.ok).toBe(true);
    expect(back.templates[0]).toMatchObject({ id: 't1', name: 'Serie', parts: ['background', 'elements', 'logos'], design: t.design });
    expect(Array.from(back.templates[0]!.pictures[0]!.bytes)).toEqual(Array.from(png));
    expect(back.templates[0]!.logos[0]!.id).toBe('seal');
    expect(importTemplates({ format: 'other' }).ok).toBe(false);
  });
});
