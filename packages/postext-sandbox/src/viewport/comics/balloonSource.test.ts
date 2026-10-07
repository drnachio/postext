import { describe, expect, it } from 'vitest';
import { buildDocument, type PostextConfig, type Resource, type VDTComicPage } from 'postext';
import { applyTextChanges, changesApply, invertTextChanges } from '../../book/textChanges';
import {
  comicBalloonItem,
  formatPinPercent,
  formatRotate,
  pinBalloonChanges,
  pinLineChanges,
  pinValue,
  rotateLineChanges,
  unpinBalloonChanges,
  unpinLineChanges,
} from './balloonSource';
import { balloonGroup, boxCentre, pinToPage } from './balloonDrag';

class StubCtx {
  font = '';
  measureText(s: string): { width: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number } {
    return { width: s.length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

/** A page holding `lines` in one panel; the line `line` of it read back. */
function page(lines: string): string {
  return `# Chapter\n\n:::page\n::panel\n${lines}\n:::\n`;
}

const comicOf = (md: string) => {
  const start = md.indexOf(':::page');
  return { sourceStart: start, sourceEnd: md.indexOf('\n:::\n', start) + 5 };
};

function itemOf(md: string, line: string) {
  const item = comicBalloonItem(md, comicOf(md), md.indexOf(line));
  expect(item).not.toBeNull();
  return item!;
}

const AT = { x: 0.375, y: 0.2 };

function pinned(lines: string, line = lines.split('\n')[0]!, at = AT): string {
  const md = page(lines);
  const changes = pinLineChanges(md, itemOf(md, line), at);
  expect(changesApply(md, changes)).toBe(true);
  return applyTextChanges(md, changes).split('::panel\n')[1]!.split('\n:::')[0]!;
}

function unpinned(lines: string, line = lines.split('\n')[0]!): string | null {
  const md = page(lines);
  const changes = unpinLineChanges(md, itemOf(md, line));
  if (!changes) return null;
  expect(changesApply(md, changes)).toBe(true);
  return applyTextChanges(md, changes).split('::panel\n')[1]!.split('\n:::')[0]!;
}

describe('pin values', () => {
  it('writes percents with one decimal at most', () => {
    expect(pinValue({ x: 0.375, y: 0.2 })).toBe('37.5% 20%');
    expect(pinValue({ x: 0.12345, y: 1 })).toBe('12.3% 100%');
    expect(pinValue({ x: -0.0001, y: 0.99999 })).toBe('0% 100%');
    expect(formatPinPercent(-0.04)).toBe('0');
  });

  it('writes a rotation between -180 and 180 degrees', () => {
    expect(formatRotate(-8)).toBe('-8');
    expect(formatRotate(350)).toBe('-10');
    expect(formatRotate(12.34)).toBe('12.3');
    expect(formatRotate(180)).toBe('180');
  });
});

describe('pinning a script line (#571)', () => {
  it('adds the braces after the key of a bare line', () => {
    expect(pinned('ana: Did you hear that?')).toBe('ana{at="37.5% 20%"}: Did you hear that?');
  });

  it('adds the attribute after the flags the line has', () => {
    expect(pinned('ana{whisper}: Psst.')).toBe('ana{whisper at="37.5% 20%"}: Psst.');
    expect(pinned('ana{ whisper }: Psst.')).toBe('ana{ whisper at="37.5% 20%"}: Psst.');
    expect(pinned('ana{}: Psst.')).toBe('ana{at="37.5% 20%"}: Psst.');
  });

  it('replaces a pin in place, the least of it, keeping the other attributes', () => {
    const md = page('ana{at="30% 20%" shout}: Run!');
    const changes = pinLineChanges(md, itemOf(md, 'ana'), AT);
    expect(changes).toEqual([{ from: md.indexOf('30% 20%') + 1, to: md.indexOf('30% 20%') + 2, insert: '7.5', expect: '0' }]);
    expect(pinned('ana{at="30% 20%" shout}: Run!')).toBe('ana{at="37.5% 20%" shout}: Run!');
    expect(pinned("ana{shout at='1% 2%'}: Run!")).toBe("ana{shout at='37.5% 20%'}: Run!");
    expect(pinned('ana{at="37.5% 20%"}: Run!')).toBe('ana{at="37.5% 20%"}: Run!');
  });

  it('turns a corner keyword into a pin', () => {
    expect(pinned('caption{at=top-start}: Lyon, 1943.')).toBe('caption{at="37.5% 20%"}: Lyon, 1943.');
    expect(pinned('caption{at=bottom butt}: Later.')).toBe('caption{at="37.5% 20%" butt}: Later.');
  });

  it('keeps a full-width colon, Japanese keys and corner quotes', () => {
    expect(pinned('アナ：今の聞こえた？')).toBe('アナ{at="37.5% 20%"}：今の聞こえた？');
    expect(pinned('ana{shout}：止まれ！')).toBe('ana{shout at="37.5% 20%"}：止まれ！');
    expect(pinned('ana{at＝「10% 10%」}：何でもない')).toBe('ana{at＝「37.5% 20%」}：何でもない');
  });

  it('pins an Arabic line (the key in Arabic, the text right to left)', () => {
    expect(pinned('سارة: هل سمعت ذلك؟')).toBe('سارة{at="37.5% 20%"}: هل سمعت ذلك؟');
    expect(pinned('sara{whisper}: لا شيء، يقول…')).toBe('sara{whisper at="37.5% 20%"}: لا شيء، يقول…');
  });

  it('pins the right line among several, continuation lines left alone', () => {
    const lines = 'ana: One.\nben: Two,\n  and more.\nana: Three.';
    expect(pinned(lines, 'ben')).toBe('ana: One.\nben{at="37.5% 20%"}: Two,\n  and more.\nana: Three.');
  });

  it('gives a bare `at` a value', () => {
    expect(pinned('ana{at}: Hm.')).toBe('ana{at="37.5% 20%"}: Hm.');
  });

  it('refuses stray text and lines that are gone', () => {
    const md = page('Just some text.');
    expect(comicBalloonItem(md, comicOf(md), md.indexOf('Just'))).toBeNull();
    expect(pinBalloonChanges(md, comicOf(md), md.indexOf('Just'), AT)).toBeNull();
    expect(pinBalloonChanges(md, { sourceStart: 3, sourceEnd: 9 }, 12, AT)).toBeNull();
  });
});

describe('unpinning a script line (#571)', () => {
  it('takes the braces off when nothing else is in them', () => {
    expect(unpinned('ana{at="20% 30%"}: Hi.')).toBe('ana: Hi.');
    expect(unpinned('caption{at=top-end}: Later.')).toBe('caption: Later.');
    expect(unpinned('アナ{ at＝「10% 20%」 }：はい')).toBe('アナ：はい');
  });

  it('keeps the other attributes and their spacing', () => {
    expect(unpinned('ana{whisper at="20% 30%"}: Hi.')).toBe('ana{whisper}: Hi.');
    expect(unpinned('ana{at="20% 30%" whisper}: Hi.')).toBe('ana{whisper}: Hi.');
    expect(unpinned('ana{whisper at = "20% 30%" tail=none}: Hi.')).toBe('ana{whisper tail=none}: Hi.');
    expect(unpinned('سارة{at="20% 30%" join=false}: مرحبا')).toBe('سارة{join=false}: مرحبا');
  });

  it('does nothing on a line that is not pinned', () => {
    expect(unpinned('ana{whisper}: Hi.')).toBeNull();
    expect(unpinned('ana: Hi.')).toBeNull();
    const md = page('ana{to="10% 10%"}: Hi.');
    expect(unpinBalloonChanges(md, comicOf(md), md.indexOf('ana'))).toBeNull();
  });
});

describe('rotating a sound effect (#571)', () => {
  const rotated = (lines: string, deg: number) => {
    const md = page(lines);
    const changes = rotateLineChanges(md, itemOf(md, 'sfx'), deg);
    return applyTextChanges(md, changes).split('::panel\n')[1]!.split('\n:::')[0]!;
  };
  it('replaces or adds `rotate`', () => {
    expect(rotated('sfx{at="62% 40%" rotate=-8}: KRAK', 12)).toBe('sfx{at="62% 40%" rotate=12}: KRAK');
    expect(rotated('sfx: BAM', 15)).toBe('sfx{rotate=15}: BAM');
    expect(rotated('sfx{rotate="5"}: BAM', 0)).toBe('sfx{rotate="0"}: BAM');
  });
});

describe('a pin written and laid out again', () => {
  const config: PostextConfig = { page: { sizePreset: '17x24' } };
  const picture = (id: string, extra: Partial<Resource> = {}): Resource => ({
    id,
    typeId: 'figure',
    kind: 'bitmap',
    createdAt: 0,
    updatedAt: 0,
    bitmap: { fileId: `file-${id}`, format: 'png', width: 1600, height: 1000 },
    ...extra,
  });
  const resources = [picture('room')];
  const layout = (md: string): VDTComicPage => buildDocument({ markdown: md, resources }, config).pages.find((p) => p.comic)!.comic!;

  for (const mirror of [false, true]) {
    it(`puts the balloon's centre on the pin${mirror ? ' (mirrored art)' : ''}`, () => {
      const md = `:::page{split="50 / *"}\n::panel{art=room${mirror ? ' mirror' : ''}}\nana: Did you hear that?\nben: Nothing.\n::panel\ncaption{at=top-start}: Later.\n:::\n`;
      const comic = layout(md);
      const ana = comic.balloons.find((b) => b.speaker === 'ana')!;
      const panel = comic.panels[0]!;
      expect(panel.art!.mirrored).toBe(mirror);
      const at = { x: 0.6, y: 0.3 };
      const changes = pinBalloonChanges(md, comic, ana.sourceStart, at)!;
      const next = applyTextChanges(md, changes);
      expect(next).toContain('ana{at="60% 30%"}: Did you hear that?');
      const again = layout(next);
      const moved = again.balloons.find((b) => b.speaker === 'ana')!;
      const target = pinToPage(again.panels[0]!, at);
      expect(Math.hypot(boxCentre(moved.bbox).x - target.x, boxCentre(moved.bbox).y - target.y)).toBeLessThan(1.5);
      // The panel's picture did not move: the pin is the same page point.
      expect(pinToPage(panel, at).x).toBeCloseTo(target.x, 3);
      // Undo puts the text back.
      expect(applyTextChanges(next, invertTextChanges(changes))).toBe(md);
    });
  }

  it('moves a joined group by pinning its first line', () => {
    const md = ':::page\n::panel{art=room}\nben: Listen to me.\nben: We leave tonight. Pack only what you can carry.\n:::\n';
    const comic = layout(md);
    const group = balloonGroup(comic, comic.balloons[1]!);
    expect(group).toHaveLength(2);
    const next = applyTextChanges(md, pinBalloonChanges(md, comic, group[0]!.sourceStart, { x: 0.5, y: 0.25 })!);
    expect(next).toContain('ben{at="50% 25%"}: Listen to me.\nben: We leave');
    const again = layout(next);
    expect(again.balloons[0]!.group).toBe(again.balloons[1]!.group);
  });

  it('pins a caption placed by a corner keyword in the cell of a panel without art', () => {
    const md = ':::page{split="50 / *"}\n::panel{art=room}\nana: Hi.\n::panel\ncaption{at=top-start}: Later.\n:::\n';
    const comic = layout(md);
    const cap = comic.balloons.find((b) => b.kind === 'caption')!;
    const next = applyTextChanges(md, pinBalloonChanges(md, comic, cap.sourceStart, { x: 0.5, y: 0.5 })!);
    expect(next).toContain('caption{at="50% 50%"}: Later.');
    const moved = layout(next).balloons.find((b) => b.kind === 'caption')!;
    const cell = comic.panels[1]!.bbox;
    expect(boxCentre(moved.bbox).x).toBeCloseTo(cell.x + cell.width / 2, 0);
    expect(boxCentre(moved.bbox).y).toBeCloseTo(cell.y + cell.height / 2, 0);
  });
});
