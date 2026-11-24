import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import type { SandboxAction, SandboxState } from '../context/SandboxContext.js';
import { designDispatch, designScope, designWriteAction } from './designWrite.js';
import { editionOverride } from './configLayers.js';

// #1700: a change to the design made outside the Design panel goes where
// the panel's scope says.

const pt = (value: number) => ({ value, unit: 'pt' as const });
const mm = (value: number) => ({ value, unit: 'mm' as const });

const TEMPLATES: NonNullable<PostextConfig['pageTemplates']> = [
  { id: 'map', frames: [{ name: 'picture', flow: true }, { name: 'note' }] },
  { id: 'plain', frames: [{ name: 'text', flow: true }] },
];
const shared = { bodyText: { fontSize: pt(11) }, pageTemplates: TEMPLATES } as PostextConfig;
const edition = { locale: 'es', bodyText: { fontSize: pt(11), fontFamily: 'Lora' }, pageTemplates: TEMPLATES } as PostextConfig;
const book = (scope: 'all' | 'edition' = 'all', config: PostextConfig = edition, general: PostextConfig = shared) => ({ config, configLayers: { shared: general, scope } });
const update = (payload: Partial<PostextConfig>): SandboxAction => ({ type: 'UPDATE_CONFIG', payload, history: { merge: false } });

const pointed = TEMPLATES.map((t) => (t.id === 'map' ? { ...t, decoration: { elements: [{ id: 'p1', kind: 'connector' as const, from: { to: '#note' }, to: { to: '#picture', anchor: 'x' } }] } } : t)) as NonNullable<PostextConfig['pageTemplates']>;

describe('a change to the design made outside the Design panel', () => {
  it('is left as it is in a book in one language, and with the panel on the edition alone', () => {
    const action = update({ pageTemplates: pointed });
    expect(designWriteAction({ config: edition, configLayers: null }, action)).toBe(action);
    expect(designWriteAction(book('edition'), action)).toBe(action);
    expect(designScope({ config: edition, configLayers: null })).toBeUndefined();
    expect(designScope(book('edition'))).toBe('edition');
  });

  it('goes into the general settings with the panel on every language, the edition keeping what it has of its own', () => {
    const written = designWriteAction(book(), update({ pageTemplates: pointed }));
    expect(written).toMatchObject({ type: 'SET_CONFIG', history: { merge: false } });
    if (written.type !== 'SET_CONFIG') throw new Error('not a write');
    expect(written.shared).toEqual({ ...shared, pageTemplates: pointed });
    expect(written.payload).toEqual({ ...edition, pageTemplates: pointed });
    expect(editionOverride(written.shared!, written.payload)).toEqual({ locale: 'es', bodyText: { fontFamily: 'Lora' } });
  });

  it('writes what the change changes, not what the edition has of its own beside it', () => {
    // The edition sets the note's width itself; a pointer added to the
    // template leaves that an own field, and the general frames alone.
    const own = TEMPLATES.map((t) => (t.id === 'plain' ? { ...t, frames: [{ name: 'text', flow: true, width: mm(90) }] } : t)) as NonNullable<PostextConfig['pageTemplates']>;
    const next = own.map((t) => (t.id === 'map' ? pointed[0]! : t));
    const written = designWriteAction(book('all', { ...edition, pageTemplates: own }), update({ pageTemplates: next }));
    if (written.type !== 'SET_CONFIG') throw new Error('not a write');
    expect(written.shared!.pageTemplates).toEqual(pointed);
    expect(written.payload.pageTemplates).toEqual(next);
  });

  it('gives the edition the value written where it had one of its own', () => {
    const general = { ...shared, bodyText: { fontSize: pt(11), fontFamily: 'Inter' } } as PostextConfig;
    const written = designWriteAction(book('all', edition, general), update({ bodyText: { fontSize: pt(11), fontFamily: 'EB Garamond' } }));
    if (written.type !== 'SET_CONFIG') throw new Error('not a write');
    expect(written.shared!.bodyText).toEqual({ fontSize: pt(11), fontFamily: 'EB Garamond' });
    expect(editionOverride(written.shared!, written.payload)).toEqual({ locale: 'es' });
  });

  it('takes a setting out of the general settings, and keeps the language the edition\'s', () => {
    const removed = designWriteAction(book(), update({ pageTemplates: undefined }));
    if (removed.type !== 'SET_CONFIG') throw new Error('not a write');
    expect(removed.shared).toEqual({ bodyText: { fontSize: pt(11) } });
    expect('pageTemplates' in removed.payload).toBe(false);

    const whole = designWriteAction(book(), { type: 'SET_CONFIG', payload: { ...edition, locale: 'ca', bodyText: { fontSize: pt(12), fontFamily: 'Lora' } } });
    if (whole.type !== 'SET_CONFIG') throw new Error('not a write');
    expect(whole.shared).toEqual({ ...shared, bodyText: { fontSize: pt(12) } });
    expect(whole.payload.locale).toBe('ca');
  });

  it('leaves a built-in resource type\'s wording to each language', () => {
    const types = [{ id: 'figure', name: 'Figura', plural: 'Figuras', captionPrefix: 'Figura', numbering: 'decimal' }] as unknown as NonNullable<PostextConfig['resourceTypes']>;
    const general = { ...shared, resourceTypes: [{ id: 'figure', numbering: 'decimal' }] } as unknown as PostextConfig;
    const state = book('all', { ...edition, resourceTypes: types }, general);
    const written = designWriteAction(state, update({ resourceTypes: [...types, { id: 'map', name: 'Mapa' }] as never }));
    if (written.type !== 'SET_CONFIG') throw new Error('not a write');
    const figure = (written.shared!.resourceTypes as unknown as Record<string, unknown>[]).find((t) => t.id === 'figure')!;
    expect(figure.name).toBeUndefined();
    expect((written.shared!.resourceTypes as unknown as Record<string, unknown>[]).find((t) => t.id === 'map')).toEqual({ id: 'map', name: 'Mapa' });
  });

  it('passes what is no write of the design, and a write that already names the general settings', () => {
    const panel: SandboxAction = { type: 'SET_PANEL', payload: 'config' };
    expect(designWriteAction(book(), panel)).toBe(panel);
    const both: SandboxAction = { type: 'SET_CONFIG', payload: edition, shared };
    expect(designWriteAction(book(), both)).toBe(both);
    const none = update({ bodyText: edition.bodyText });
    expect(designWriteAction(book(), none)).toBe(none);
  });

  it('builds a write on the one before it while the store has not caught up', () => {
    const state = { ...book() } as SandboxState;
    const sent: SandboxAction[] = [];
    const dispatch = designDispatch({ getSnapshot: () => state, dispatch: (a) => sent.push(a) });
    dispatch(update({ pageTemplates: pointed }));
    dispatch(update({ bodyText: { fontSize: pt(12), fontFamily: 'Lora' } }));
    const last = sent[1]!;
    if (last.type !== 'SET_CONFIG') throw new Error('not a write');
    expect(last.shared).toEqual({ bodyText: { fontSize: pt(12) }, pageTemplates: pointed });
    expect(last.payload).toEqual({ ...edition, bodyText: { fontSize: pt(12), fontFamily: 'Lora' }, pageTemplates: pointed });
  });
});
