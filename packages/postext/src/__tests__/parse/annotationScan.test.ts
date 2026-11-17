import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../../parse/index.js';
import { markAnnotations, type QueuedAnnotation } from '../../parse/annotations.js';

describe('annotation scan (#1608)', () => {
  it('leaves a text with colons and no annotation as it is', () => {
    const queue: QueuedAnnotation[] = [];
    for (const text of ['At 10:30: the rest [see: below]', 'a\\: b', ':rubi[x]', 'x :dots y']) {
      expect(markAnnotations(text, queue)).toBe(text);
    }
    expect(queue).toEqual([]);
    expect(markAnnotations('x :dots[y] z', queue)).not.toBe('x :dots[y] z');
    expect(queue).toHaveLength(1);
  });

  it('maps each annotated block of a chapter as it maps the block alone', () => {
    const blocks = [
      ':ruby[紅]{rt="hóng"}樓夢 one: two',
      'Plain text: with a colon and [brackets].',
      'x :name[賈寶玉] and {紅|hóng} y: z',
      '- item :dots[a] b\n- item {樓|lóu} c',
      'Closing: :book[石頭記] end',
    ];
    const chapter = blocks.join('\n\n');
    const whole = parseMarkdown(chapter);
    let at = 0;
    const alone = blocks.flatMap((text) => {
      const start = chapter.indexOf(text, at);
      at = start + text.length;
      return parseMarkdown(text).map((b) => ({ text: b.text, map: (b.sourceMap ?? []).map((o) => o + start) }));
    });
    expect(whole.every((b) => (b.sourceMap?.length ?? 0) > 0)).toBe(true);
    expect(whole.map((b) => ({ text: b.text, map: b.sourceMap ?? [] }))).toEqual(alone);
  });
});
