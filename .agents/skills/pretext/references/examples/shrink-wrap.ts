import { prepareWithSegments, walkLineRanges } from '@chenglou/pretext';

const text = "Find the tightest container width that still fits this multiline text.";
const prepared = prepareWithSegments(text, "16px Inter");

let maxLineWidth = 0;
walkLineRanges(prepared, 9999, line => {
  if (line.width > maxLineWidth) maxLineWidth = line.width;
});

// maxLineWidth is the minimum container width that fits the text
console.log(`Shrink-wrap width: ${maxLineWidth}px`);
