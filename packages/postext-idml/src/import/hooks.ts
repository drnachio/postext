// What the things anchored in a story's text become: a table is a table
// resource set where it stands, a picture a resource, an anchored text
// frame a box (a callout) holding its own story, a group the things it
// holds.

import type { IdmlPageItem, IdmlParagraph } from '../model/document.js';
import { boxHeight, boxWidth, pathExtent } from '../model/geometry.js';
import { blocksOf, joinChunks, type BlockEnv } from './blocks.js';
import type { Context } from './context.js';
import { attributeValue, LINE_BREAK } from './escape.js';
import { inlineOf, type InlineEnv, type InlineHooks } from './inline.js';
import { ownText } from './looks.js';
import { besideColumn, inSideColumn } from './fidelity/anchored.js';
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
      // A box at the side of the column stands before the paragraph of
      // its anchor, whose text runs beside it.
      let before = false;
      const walk = (it: IdmlPageItem): string | undefined => {
        // Set in a frame of its own on the page (composed pages).
        if (ctx.placedAnchors.has(it)) return undefined;
        const where = it.anchored?.position ?? 'InlinePosition';
        // A custom-anchored object of a flowing text hangs at its side of
        // the column, the text running beside it.
        const flowing = where === 'Anchored' && target === 'flow' && depth === 0 && env.where === 'body';
        // One that stands in the side column of a column-and-a-half book
        // is a float of that column (a gloss), set before the paragraph
        // of its anchor, which it faces.
        const side = flowing && !!it.textFrame?.story && inSideColumn(ctx, it);
        const beside = flowing && !side ? besideColumn(ctx, it) : undefined;
        if (beside || side) before = true;
        if (it.graphic) {
          const frame = pathExtent(it.paths);
          const name = it.graphic.link?.name ?? 'picture';
          // In a table cell or a caption a small picture stands in its line.
          if (inline && where === 'InlinePosition' && env.where === 'snippet' && frame && boxHeight(frame) > 0 && env.look.cf.pointSize > 0) {
            const id = pictureResource(ctx, it);
            if (id) {
              ctx.rep.add('inlinePictureIcon', 'info', 'A picture set in a line of a table cell or a caption stands in its line as an inline symbol (:icon) of its height', name);
              return `:icon[${(it.altText ?? '').replace(/[\[\]\\{}\n]/g, ' ').trim()}]{resource="${id}" size=${Math.max(0.1, Math.round((boxHeight(frame) / env.look.cf.pointSize) * 100) / 100)}}`;
            }
            return undefined;
          }
          const id = pictureResource(ctx, it, { placement: { position: 'here', span: 'column', align: beside?.side ?? (env.look.pf.align === 'center' ? 'center' : env.look.pf.align === 'right' ? 'right' : 'left'), ...(frame && boxWidth(frame) > 0 ? { width: pt(boxWidth(frame)) } : {}), ...(beside ? { wrap: beside.side } : {}) } });
          if (id) blocks.push(`::resource{id="${id}"}`);
          if (inline && where === 'InlinePosition') ctx.rep.add('inlinePicture', 'warning', 'A picture set in a line of running text stands on a line of its own right after its paragraph, at its own width: Postext sets pictures in a line only in table cells, captions and labels', name);
          else if (beside) ctx.rep.add('anchoredObjectBeside', 'warning', 'An object anchored beside its text (custom position) stands at that side of the column at the paragraph of its anchor, whose text runs beside it; one InDesign hangs out in the margin stands inside the column (layout: "pages" gives it a frame of its own where it stands)', name);
          else if (where === 'Anchored') ctx.rep.add('anchoredObjectPosition', 'warning', 'An object anchored at a custom position that is as wide as its column, centred, or anchored in a box, a note or a table is set as a block of the text right after the paragraph of its anchor', name);
          return undefined;
        }
        if (it.textFrame?.story) {
          const story = ctx.doc.stories.get(it.textFrame.story);
          if (!story) {
            ctx.rep.add('missingStory', 'loss', 'A text frame names a story the package does not hold: the frame is left out', it.textFrame.story);
            return undefined;
          }
          if (depth >= 5) {
            ctx.rep.add('deepAnchoring', 'loss', 'Frames anchored in frames more than five deep are left out: the text about them is set without them', it.textFrame.story);
            return undefined;
          }
          depth++;
          ctx.counts.stories++;
          const style = calloutStyleFor(ctx, it, boxLook(ctx, it, 'anchored frame'));
          const inner = blocksOf(ctx, story.paragraphs, { notes: env.notes, carry: env.carry, hooks, target: 'box', ...(env.pageName !== undefined ? { pageName: env.pageName } : {}) });
          depth--;
          const sample = ctx.sample(story.paragraphs.find((p) => p.runs.length) ?? story.paragraphs[0] ?? { attrs: {}, properties: {}, runs: [] }) || 'text frame';
          // A first paragraph in the box's title style (a Postext export
          // names it "<box> title") is the box's title.
          const head = inner[0];
          const lead = story.paragraphs.find((p) => ownText(p).trim());
          const leadStyle = lead?.paragraphStyle ? (ctx.doc.styles.paragraph.get(lead.paragraphStyle)?.name ?? '') : '';
          const title = head?.kind === 'heading' && head.title && / title$/i.test(leadStyle) && inner.length > 1 ? attributeValue(head.title).text : undefined;
          if (title !== undefined) inner.shift();
          if (inner.length) blocks.push(`:::callout{type="${style}"${title !== undefined ? ` title="${title}"` : ''}${side ? ' span="side"' : beside ? ` wrap="${beside.side}" width=${beside.share}` : ''}}\n${joinChunks(inner)}\n:::`);
          if (side) ctx.rep.add('sideColumnFloats', 'info', 'A frame anchored in the text at a custom position in the side column of a column-and-a-half book is a box floated into that column (span="side"), set before the paragraph of its anchor', sample);
          else if (beside) ctx.rep.add('anchoredObjectBeside', 'warning', 'An object anchored beside its text (custom position) stands at that side of the column at the paragraph of its anchor, whose text runs beside it; one InDesign hangs out in the margin stands inside the column (layout: "pages" gives it a frame of its own where it stands)', sample);
          else if (where === 'Anchored') ctx.rep.add('anchoredObjectPosition', 'warning', 'An object anchored at a custom position that is as wide as its column, centred, or anchored in a box, a note or a table is set as a block of the text right after the paragraph of its anchor', sample);
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
        ctx.rep.add('anchoredShape', 'loss', 'A shape anchored in the text (a line, an oval, an empty frame) is left out: the line it stood in closes up', it.kind);
        return undefined;
      };
      const mark = walk(item);
      return mark ? { inline: mark, blocks } : { blocks, ...(before ? { before } : {}) };
    },

    note(paragraphs, env) {
      return noteLine(ctx, paragraphs, env);
    },
  };
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
