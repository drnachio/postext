import { prepareWithSegments, layoutNextLine } from '@chenglou/pretext';

const text = "Long article text that needs to flow around an embedded image...";
const prepared = prepareWithSegments(text, "16px Inter");

const imageBottom = 150;
const imageWidth = 120;
const columnWidth = 400;
const lineHeight = 24;

let cursor = { segmentIndex: 0, graphemeIndex: 0 };
let y = 0;

while (true) {
  const width = (y < imageBottom) ? columnWidth - imageWidth : columnWidth;
  const line = layoutNextLine(prepared, cursor, width);
  if (!line) break;
  // render line at (x, y)
  console.log(`Line at y=${y}, width=${width}: "${line.text}"`);
  cursor = line.end;
  y += lineHeight;
}
