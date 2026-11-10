import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { configKeyOf, layoutCacheKey } from './layoutKeys.js';

const base = (): PostextConfig => ({ bodyText: { fontSize: { value: 11, unit: 'pt' } } as never });

describe('settings that never shape a page stay out of the layout key', () => {
  it('ignores the space the Canvas leaves between pages (canvasViewer, #1002)', () => {
    const plain = base();
    const gapped: PostextConfig = { ...base(), canvasViewer: { pageGap: 0, rowGap: 80 } };
    expect(configKeyOf(gapped)).toBe(configKeyOf(plain));
    const key = (config: PostextConfig) => layoutCacheKey({ markdown: '# A', metadata: null, config, resources: [], continuation: undefined, continuationKey: '', outlineKey: '' });
    expect(key(gapped)).toBe(key(plain));
  });

  it('ignores how form fields write numbers (pdfGeneration.forms, #1491)', () => {
    const plain: PostextConfig = { ...base(), pdfGeneration: { outlines: false } };
    const forms: PostextConfig = { ...base(), pdfGeneration: { outlines: false, forms: { currency: 'USD', separatorStyle: 0 } } };
    expect(configKeyOf(forms)).toBe(configKeyOf(plain));
    expect(forms.pdfGeneration?.forms).toEqual({ currency: 'USD', separatorStyle: 0 });
  });

  it('still tells a setting that shapes pages apart', () => {
    const other: PostextConfig = { bodyText: { fontSize: { value: 12, unit: 'pt' } } as never };
    expect(configKeyOf(other)).not.toBe(configKeyOf(base()));
  });
});
