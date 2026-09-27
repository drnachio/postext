// ─── Kit · pdf v1 ── the same in every recipe that exports a PDF ──────────────
/** postext-pdf embeds TrueType bytes. Fetch the Fontsource file the screen
 *  used, snapping to a weight the family ships and falling back to upright
 *  when it has no italic: the PDF asks for every face a block could use. */
async function fontsourceProvider(family, weight, style) {
  const id = fontsourceId(family);
  const meta = await fontsourceMeta(family);
  const weights = meta?.weights?.length ? meta.weights : [400, 700];
  const w = weights.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a));
  const s = style === 'italic' && meta && !meta.styles.includes('italic') ? 'normal' : style;
  const res = await fetch(`https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/${id}-latin-${w}-${s}.woff2`);
  if (!res.ok) throw new Error(`Fontsource has no ${family} ${w} ${s} (${res.status})`);
  return decompressWoff2(new Uint8Array(await res.arrayBuffer()));
}

/** A "Build the PDF" button in the bar. Once built: "Open the PDF" (a new
 *  tab, since CodePen's preview frame cannot show PDFs) and a download link. */
function offerPdf(makePdf, filename) {
  viewer();
  const button = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Build the PDF' });
  button.dataset.postextPdf = filename;
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Building the PDF…';
    try {
      const bytes = await makePdf();
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const size = `${Math.max(1, Math.round(bytes.length / 1024))} KB`;
      button.replaceWith(
        Object.assign(document.createElement('a'), { href: url, target: '_blank', rel: 'noopener', textContent: 'Open the PDF ↗' }),
        Object.assign(document.createElement('a'), { href: url, download: filename, textContent: `Download ${filename} · ${size}` }));
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Build the PDF';
      kitFail(error);
    }
  });
  document.getElementById('pt-actions').append(button);
}
