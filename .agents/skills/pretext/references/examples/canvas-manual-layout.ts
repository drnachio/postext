import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext';

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d')!;

const text = "Draw this text on a canvas with proper line wrapping and layout.";
const prepared = prepareWithSegments(text, "18px Inter");
const { lines } = layoutWithLines(prepared, 320, 26);

lines.forEach((line, i) => {
  ctx.fillText(line.text, 0, i * 26);
});
