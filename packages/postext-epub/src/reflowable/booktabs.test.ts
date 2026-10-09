import { describe, expect, it } from 'vitest';
import { renderToEpub } from '..';
import { buildReflowablePublication } from '.';
import { booktabsSampleBook } from '../__tests__/sampleBook';

// Journal tables (#625): booktabs rules in the reflowable stylesheet, a
// named table style as a class.
describe('booktabs tables in a reflowable book', async () => {
  const pub = await buildReflowablePublication(booktabsSampleBook(), {
    layout: 'reflowable',
    metadata: { title: 'Tables', language: 'en-US', modified: new Date(Date.UTC(2026, 9, 9)) },
  });
  const css = pub.items.filter((i) => i.mediaType === 'text/css').map((i) => String(i.data)).join('\n');
  const xhtml = pub.items.filter((i) => i.mediaType === 'application/xhtml+xml').map((i) => String(i.data)).join('\n');
  const block = (selector: string) => {
    const at = css.indexOf(`\n${selector} {`);
    return at < 0 ? undefined : css.slice(at + 1, css.indexOf('}', at));
  };

  it('rules the table above and under, the header under, and no cell borders', () => {
    const table = block('table')!;
    expect(table).toMatch(/border-top: [\d.]+px solid #/);
    expect(table).toMatch(/border-bottom: [\d.]+px solid #/);
    expect(table).not.toMatch(/border: /);
    expect(block('th, td')).not.toMatch(/border/);
    expect(block('thead')).toMatch(/border-bottom: [\d.]+px solid #/);
  });

  it('trims the rule under a spanning head with a background line', () => {
    const span = block('thead > tr:not(:last-child) > th[colspan]')!;
    expect(span).toContain('background-image: linear-gradient(');
    expect(span).toMatch(/background-size: calc\(100% - 1em\) [\d.]+px/);
  });

  it('rules the group heads above, except the first body row', () => {
    expect(block('tbody > tr.pt-group:not(:first-child) > *')).toMatch(/border-top: [\d.]+px solid #/);
    expect(xhtml).toMatch(/<tr class="pt-group"><td colspan="3"[^>]*>Baselines<\/td><\/tr>/);
    expect(xhtml).toMatch(/<tr class="pt-group"><td colspan="3"[^>]*>Ours<\/td><\/tr>/);
  });

  it('sets a named table style as a class that undoes the booktabs rules', () => {
    expect(xhtml).toContain('<table id="res-t2" class="pt-table-grid">');
    expect(xhtml).toMatch(/<table id="res-t1">/);
    expect(block('table.pt-table-grid')).toMatch(/border: [\d.]+px solid #/);
    expect(block('table.pt-table-grid th, table.pt-table-grid td')).toMatch(/border: [\d.]+px solid #/);
    expect(block('table.pt-table-grid thead')).toContain('border-bottom: none');
    expect(block('table.pt-table-grid thead > tr:not(:last-child) > th[colspan]')).toContain('background-image: none');
    expect(block('table.pt-table-grid th')).toMatch(/background-color: #/);
    // The grid table's group heads are not marked.
    const t2 = xhtml.slice(xhtml.indexOf('<table id="res-t2"'));
    expect(t2.slice(0, t2.indexOf('</table>'))).not.toContain('pt-group');
  });

  it('renders a whole book', async () => {
    const bytes = await renderToEpub(booktabsSampleBook(), { layout: 'reflowable', metadata: { title: 'Tables', language: 'en-US' } });
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
