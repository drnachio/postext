import { createFolio } from 'https://esm.sh/postext-folio';

// Any pages will do: image URLs, <img> or <canvas> elements, and "" for a
// blank page. Here, eight pages drawn on canvases.
function drawPage(n) {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 840;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fbf8f1';
  ctx.fillRect(0, 0, 600, 840);
  ctx.fillStyle = `hsl(${n * 45} 45% 45%)`;
  ctx.fillRect(60, 80, 480, 320);
  ctx.fillStyle = '#222';
  ctx.font = 'bold 56px Georgia, serif';
  ctx.fillText(`Plate ${n}`, 60, 480);
  ctx.font = '22px Georgia, serif';
  for (let line = 0; line < 8; line++) ctx.fillRect(60, 530 + line * 30, line === 7 ? 260 : 480, 3);
  ctx.textAlign = 'center';
  ctx.fillText(String(n), 300, 800);
  return { src: canvas, alt: `Plate ${n}` };
}

const pages = Array.from({ length: 8 }, (_, i) => drawPage(i + 1));
// A blank page at the end, drawn as paper.
pages.push('');

const status = document.getElementById('status');
createFolio(document.getElementById('book'), {
  pages,
  firstPageRecto: true, // page 1 opens alone, on the right
  binding: 'left', // 'right' lays a right-to-left book mirrored
  paper: '#fbf8f1',
  onChange: (state) => {
    status.textContent = `Showing ${state.pages.map((i) => i + 1).join('–')} of ${pages.length}`;
  },
});
status.textContent = 'Drag a page by its edge, click it, or use ← →';
