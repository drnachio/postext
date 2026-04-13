// ---------------------------------------------------------------------------
// Minimal block-level markdown tokenizer
// ---------------------------------------------------------------------------

export type ContentBlockType = 'heading' | 'paragraph' | 'blockquote';

export interface InlineSpan {
  text: string;
  bold: boolean;
}

export interface ContentBlock {
  type: ContentBlockType;
  text: string;
  spans: InlineSpan[];
  level?: number; // heading level 1-6
}

const HEADING_RE = /^(#{1,6})\s+(.+)$/;

/**
 * Strip inline markdown formatting for plain-text extraction.
 * Handles bold, italic, code, links, and images.
 */
function stripInlineFormatting(text: string): string {
  return text
    .replace(/!\[.*?\]\(.*?\)/g, '')        // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/\*\*(.+?)\*\*/g, '$1')         // bold
    .replace(/__(.+?)__/g, '$1')              // bold alt
    .replace(/\*(.+?)\*/g, '$1')             // italic
    .replace(/_(.+?)_/g, '$1')               // italic alt
    .replace(/`(.+?)`/g, '$1')              // inline code
    .trim();
}

/**
 * Strip non-bold inline formatting (images, links, italic, code) but keep text.
 */
function stripNonBoldFormatting(text: string): string {
  return text
    .replace(/!\[.*?\]\(.*?\)/g, '')        // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/`(.+?)`/g, '$1');             // inline code
}

/**
 * Parse inline formatting to produce spans with bold flag.
 * Strips non-bold formatting first, then extracts bold regions.
 */
function parseInlineFormatting(text: string): InlineSpan[] {
  const cleaned = stripNonBoldFormatting(text);
  const spans: InlineSpan[] = [];

  // Match **bold** and __bold__ patterns
  const boldRe = /\*\*(.+?)\*\*|__(.+?)__/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = boldRe.exec(cleaned)) !== null) {
    // Text before the bold marker
    if (match.index > lastIndex) {
      const before = stripItalicFormatting(cleaned.slice(lastIndex, match.index));
      if (before.length > 0) {
        spans.push({ text: before, bold: false });
      }
    }
    // The bold text itself
    const boldText = stripItalicFormatting(match[1] ?? match[2]!);
    if (boldText.length > 0) {
      spans.push({ text: boldText, bold: true });
    }
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last bold
  if (lastIndex < cleaned.length) {
    const remaining = stripItalicFormatting(cleaned.slice(lastIndex));
    if (remaining.length > 0) {
      spans.push({ text: remaining, bold: false });
    }
  }

  // If no spans were produced (empty text), return a single empty span
  if (spans.length === 0) {
    const trimmed = stripItalicFormatting(cleaned).trim();
    if (trimmed.length > 0) {
      spans.push({ text: trimmed, bold: false });
    }
  }

  return spans;
}

/**
 * Strip italic markers (* and _) from text.
 */
function stripItalicFormatting(text: string): string {
  return text
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1');
}

/**
 * Join spans into a single plain text string.
 */
function spansToText(spans: InlineSpan[]): string {
  return spans.map((s) => s.text).join('').trim();
}

/**
 * Merge consecutive blockquote lines into a single block, and consecutive
 * non-blank, non-special lines into paragraphs.
 */
export function parseMarkdown(markdown: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const rawLines = markdown.split('\n');

  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i]!;
    const trimmed = line.trim();

    // Skip blank lines
    if (trimmed === '') {
      i++;
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(HEADING_RE);
    if (headingMatch) {
      const text = stripInlineFormatting(headingMatch[2]!);
      blocks.push({
        type: 'heading',
        text,
        spans: [{ text, bold: false }],
        level: headingMatch[1]!.length,
      });
      i++;
      continue;
    }

    // Blockquote — collect consecutive > lines
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < rawLines.length) {
        const ql = rawLines[i]!.trim();
        if (!ql.startsWith('>')) break;
        quoteLines.push(ql.replace(/^>\s?/, ''));
        i++;
      }
      const spans = parseInlineFormatting(quoteLines.join(' '));
      blocks.push({
        type: 'blockquote',
        text: spansToText(spans),
        spans,
      });
      continue;
    }

    // Paragraph — collect consecutive non-blank, non-special lines
    const paraLines: string[] = [];
    while (i < rawLines.length) {
      const pl = rawLines[i]!.trim();
      if (pl === '' || pl.match(HEADING_RE) || pl.startsWith('>')) break;
      paraLines.push(pl);
      i++;
    }
    if (paraLines.length > 0) {
      const spans = parseInlineFormatting(paraLines.join(' '));
      blocks.push({
        type: 'paragraph',
        text: spansToText(spans),
        spans,
      });
    }
  }

  return blocks;
}
