import { describe, it, expect } from 'vitest';
import { navStrings } from './strings';

describe('navStrings', () => {
  it('names the navigation of a Japanese book in Japanese, never in Chinese', () => {
    for (const tag of ['ja', 'ja-JP', 'JA_jp']) {
      expect(navStrings(tag), tag).toMatchObject({ contents: '目次', cover: '表紙', bodymatter: '本文', index: '索引', bibliography: '参考文献' });
    }
    expect(navStrings('zh-Hans').contents).toBe('目录');
    expect(navStrings('ko').contents).toBe('Contents');
  });
});
