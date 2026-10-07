import { describe, expect, it } from 'vitest';
import { resolvePrintConfig, stripPrintDefaults, DEFAULT_PRINT_CONFIG } from '../defaults/print';
import { stripConfigDefaults } from '../defaults';
import { collectConfigWarnings } from '../configWarnings';
import { resolveAllConfig } from '../pipeline/config';

describe('print config', () => {
  it('resolves to the defaults: no PDF/X, FOGRA39, relative with BPC', () => {
    const r = resolvePrintConfig();
    expect(r.standard).toBe('none');
    expect(r.outputProfile).toBe('fogra39');
    expect(r.renderingIntent).toBe('relative');
    expect(r.inkLimit).toBe(300);
    expect(r.black.richBlackColor).toEqual({ c: 60, m: 40, y: 40, k: 100 });
    expect(r.preflight.minImageResolution).toBe(300);
  });

  it('takes the ink limit from the profile unless overridden', () => {
    expect(resolvePrintConfig({ outputProfile: 'ifra26' }).inkLimit).toBe(230);
    expect(resolvePrintConfig({ outputProfile: 'ifra26', inkLimit: 240 }).inkLimit).toBe(240);
    expect(resolvePrintConfig({ outputProfile: 'custom', customProfile: { name: 'x', fileId: 'f', inkLimit: 320 } }).inkLimit).toBe(320);
  });

  it('falls back to the default profile for unknown ids and a custom choice without a file', () => {
    expect(resolvePrintConfig({ outputProfile: 'nope' }).outputProfile).toBe('fogra39');
    expect(resolvePrintConfig({ outputProfile: 'custom' }).outputProfile).toBe('fogra39');
  });

  it('keeps critical image resolution at or under the warning threshold', () => {
    expect(resolvePrintConfig({ preflight: { minImageResolution: 120 } }).preflight.criticalImageResolution).toBe(120);
  });

  it('strips defaults, keeping only overrides', () => {
    expect(stripPrintDefaults({ standard: 'none', outputProfile: 'fogra39', inkLimit: 300 })).toBeUndefined();
    expect(stripPrintDefaults({ outputProfile: 'ifra26', inkLimit: 230 })).toEqual({ outputProfile: 'ifra26' });
    expect(
      stripPrintDefaults({ standard: 'pdfx4', black: { richBlackMinSize: { value: 6, unit: 'mm' }, overprint: false } }),
    ).toEqual({ standard: 'pdfx4', black: { overprint: false } });
    expect(stripConfigDefaults({ print: { standard: 'none' } }).print).toBeUndefined();
  });

  it('is carried, resolved, in the VDT config', () => {
    expect(resolveAllConfig({ print: { standard: 'pdfx1a' } }).print?.standard).toBe('pdfx1a');
    expect(resolveAllConfig({}).print).toBeUndefined();
    expect(DEFAULT_PRINT_CONFIG.convertImages).toBe(true);
  });

  it('warns about unknown words', () => {
    const w = collectConfigWarnings({ print: { standard: 'pdfx3' as never, outputProfile: 'iso-coated', renderingIntent: 'absolute' as never } });
    expect(w.map((x) => 'path' in x && x.path)).toEqual(['print.standard', 'print.outputProfile', 'print.renderingIntent']);
  });
});
