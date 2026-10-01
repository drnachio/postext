import { buildDocument } from 'https://esm.sh/postext';
import { createFolioFromDocument } from 'https://esm.sh/postext-folio';

const paragraph = `The lantern hung from a nail by the door, and every evening someone lit it. Nobody remembered who had put the nail there, or why the lantern was never moved. The light it gave was small, but it was enough to find the step.`;

// Thirty-six short sections: about ten pages to turn.
const markdown = ['# The Lantern']
  .concat(Array.from({ length: 36 }, (_, i) => `## Evening ${i + 1}\n\n${paragraph} ${paragraph}\n\n${paragraph}`))
  .join('\n\n');

const config = {
  page: { sizePreset: '17x24', dpi: 150 },
  layout: { layoutType: 'double' },
  bodyText: { fontFamily: 'EB Garamond', fontSize: { value: 10, unit: 'pt' } },
};

// Postext measures text with the fonts the browser has loaded,
// so wait for every face the document uses before laying it out.
await Promise.all([
  document.fonts.load('16px "EB Garamond"'),
  document.fonts.load('bold 16px "EB Garamond"'),
  document.fonts.load('italic 16px "EB Garamond"'),
  document.fonts.load('bold 16px "Open Sans"'), // the default heading face
]);

const doc = buildDocument({ markdown }, config);
const status = document.getElementById('status');

// The book: drag a page by its edge, click it, or use ← → and the buttons.
// Pages are painted at the size they are shown, around the open spread only.
createFolioFromDocument(document.getElementById('book'), doc, {
  onChange: ({ pages }) => {
    status.textContent = `${doc.pages.length} pages · open at ${pages.map((i) => i + 1).join('–')}`;
  },
});
status.textContent = `${doc.pages.length} pages · drag a page by its edge to turn it`;
