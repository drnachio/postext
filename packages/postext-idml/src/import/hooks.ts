// What the things anchored in a story's text become: a table is a table
// resource set where it stands, a picture a resource, an anchored text
// frame a box (a callout) holding its own story, a group the things it
// holds.

import type { IdmlPageItem, IdmlParagraph } from '../model/document.js';
import { boxHeight, boxWidth, pathExtent } from '../model/geometry.js';
import { blocksOf, joinChunks, type BlockEnv } from './blocks.js';
import type { Context } from './context.js';
import { LINE_BREAK } from './escape.js';
import { inlineOf, type InlineEnv, type InlineHooks } from './inline.js';
import { boxLook, calloutStyleFor } from './objects.js';
import { pictureResource } from './pictures.js';
import { tableResource } from './tables.js';
import { pt } from './values.js';

/** The hooks of a text set as `target`. */
export function makeHooks(ctx: Context, target: BlockEnv['target']): InlineHooks {
  let depth = 0;
  const hooks: InlineHooks = {
    table(table, env) {
      const after: string[] = [];
      const id = tableResource(ctx, table, env, after);
      return [`::resource{id="${id}"}`, ...after];
    },

    item(item, env, inline) {
      const blocks: string[] = [];
      const walk = (it: IdmlPageItem): string | undefined => {
        const where = it.anchored?.position ?? 'InlinePosition';
        if (it.graphic) {
          const frame = pathExtent(it.paths);
          const id = pictureResource(ctx, it, { placement: { position: 'here', span: 'column', align: 'left', ...(frame && boxWidth(frame) > 0 ? { width: pt(boxWidth(frame)) } : {}) } });
          if (id) blocks.push(`::resource{id="${id}"}`);
          if (inline && where === 'InlinePosition') ctx.rep.add('inlinePicture', 'warning', 'A picture set in a line of text stands on a line of its own after its paragraph: Postext sets pictures as blocks', it.graphic.link?.name ?? 'picture');
          else if (where === 'Anchored') ctx.rep.add('anchoredObjectPosition', 'warning', 'An object anchored outside its text (in the margin, at an offset) is set in the text after the paragraph of its anchor', it.graphic.link?.name ?? 'picture');
          return undefined;
        }
        if (it.textFrame?.story) {
          const story = ctx.doc.stories.get(it.textFrame.story);
          if (!story) {
            ctx.rep.add('missingStory', 'loss', 'A text frame names a story the package does not hold', it.textFrame.story);
            return undefined;
          }
          if (depth >= 5) {
            ctx.rep.add('deepAnchoring', 'loss', 'Frames anchored in frames more than five deep are left out', it.textFrame.story);
            return undefined;
          }
          depth++;
          ctx.counts.stories++;
          const style = calloutStyleFor(ctx, it, boxLook(ctx, it, 'anchored frame'));
          const inner = blocksOf(ctx, story.paragraphs, { notes: env.notes, carry: env.carry, hooks, target: 'box', ...(env.pageName !== undefined ? { pageName: env.pageName } : {}) });
          depth--;
          if (inner.length) blocks.push(`:::callout{type="${style}"}\n${joinChunks(inner)}\n:::`);
          if (where === 'Anchored') ctx.rep.add('anchoredObjectPosition', 'warning', 'An object anchored outside its text (in the margin, at an offset) is set in the text after the paragraph of its anchor', 'text frame');
          return undefined;
        }
        if (it.kind === 'Group' || it.children.length) {
          for (const c of it.children) walk(c);
          return undefined;
        }
        // A small filled shape in a line is a colour key.
        const box = pathExtent(it.paths);
        const look = boxLook(ctx, it, 'anchored shape');
        if (box && look.fill && it.kind === 'Rectangle' && boxWidth(box) <= 24 && boxHeight(box) <= 24) {
          const size = Math.round(Math.max(boxWidth(box), boxHeight(box)) * 100) / 100;
          return `:swatch{color="${look.fill.paletteId ?? look.fill.hex}" size=${size}pt border=none}`;
        }
        ctx.rep.add('anchoredShape', 'loss', 'A shape anchored in the text (a line, an oval, an empty frame) is left out', it.kind);
        return undefined;
      };
      const mark = walk(item);
      return mark ? { inline: mark, blocks } : { blocks };
    },

    note(paragraphs, env) {
      return noteLine(ctx, paragraphs, env);
    },
  };
  void target;
  return hooks;
}

/** The paragraphs of a note as one line: a note is one paragraph in
 *  Postext, so its paragraphs are parted by forced breaks. */
function noteLine(ctx: Context, paragraphs: IdmlParagraph[], env: InlineEnv): string {
  const lines: string[] = [];
  for (const para of paragraphs) {
    const look = ctx.looks.of(para);
    const { leadIn: _host, ...rest } = env;
    void _host;
    const r = inlineOf(ctx, para, { ...rest, look });
    // The note's own number and the tab or space after it come first.
    const text = r.text.replace(/^(?:\s|:tab(?:\{[^}]*\})?)+/, '').trim();
    if (text) lines.push(text);
  }
  if (lines.length > 1) ctx.rep.add('noteParagraphs', 'info', 'A note of several paragraphs is one paragraph with forced line breaks', lines[0]);
  return lines.join(LINE_BREAK);
}
