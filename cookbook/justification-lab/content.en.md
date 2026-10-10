---
title: "Galley"
subtitle: "Notes from the type bench · No. 12"
author: "Galley"
---

# The river problem {kicker="Galley · No. 12 · Justification" standfirst="Justify a narrow column and its word spaces are the first thing to open up. How a line breaker that weighs the whole paragraph keeps the grey even, and the eight settings that govern it."}

Hold a newspaper page at arm’s length and half close your eyes. In a good column the text turns into an even grey. In a bad one, pale channels wander down through it, from a gap in one line to the gap below it. Printers call them rivers. They form when the spaces open up on several lines at once and happen to fall in line, and nothing opens spaces faster than a narrow measure.

A column of forty characters has five or six word spaces to a line. Carry one long word on to the next line and those few spaces must share its whole width between them: each may have to grow to twice its width, or more. In a column twice as wide, twice as many spaces take up the same width, and each grows half as much.

## Boxes, glue and penalties

In 1981, Donald E. Knuth and Michael F. Plass described a paragraph the way TeX still sees it. Words are boxes, fixed in width. The spaces between them are glue, with a natural width and a limit to how far it may stretch or shrink. Penalties mark the places where a line may end, each with a price: ending on a hyphen costs something, ending between two words costs nothing. The drawing at the head of this article shows one line in those terms, as measured and as set, with its glue stretched until the line fills the measure and the word that ran past it broken at a hyphen.

The breaker then prices every line by how far its glue had to move, cubing the figure so one very loose line costs more than a string of slightly loose ones, and then adds the penalties. Of all the ways to break the paragraph, it keeps the one whose total is lowest, looking back as far as the first line to find it.

## Greedy and total fit

The older method, first fit, survives on the web. It fills each line with as many words as will fit before moving on, and a line once set stays set, so one more short word taken now can leave the next line with a gap that no later break can close. The whole-paragraph method sets one line a little looser when that spares the next one a gap. Across a whole column the trade leaves fewer loose lines than first fit, and so fewer gaps that can line up into rivers.

## Fences for the glue

Two numbers fence the glue in: a space may shrink to 80 per cent of its natural width and grow to 160 per cent. Much tighter, and the breaker runs out of ways to fill a line; any looser, and the eye sees the gaps. Past the upper fence, every extra stretch costs more than any hyphen or short last line, so the breaker looks for another way to fill the line first.

:::callout{type="settings"}
minWordSpacing: 0.8

maxWordSpacing: 1.6
:::

:::callout{type="bench" title="Bench test · one paragraph, three settings"}
:::columns{count=2 breaks="3"}
:::callout{type="ragged" title="ragged · textAlign: 'left'"}
Unhyphenated justification in a narrow measure hands every shortfall to the few word spaces on the line. With hyphenation the line breaker can end a line inside a word too, and the slack is shared out in amounts too small to notice.
:::

:::callout{type="unhyphenated" title="justified · hyphenation: false"}
Unhyphenated justification in a narrow measure hands every shortfall to the few word spaces on the line. With hyphenation the line breaker can end a line inside a word too, and the slack is shared out in amounts too small to notice.
:::

:::callout{type="justified" title="justified · hyphenation: true"}
Unhyphenated justification in a narrow measure hands every shortfall to the few word spaces on the line. With hyphenation the line breaker can end a line inside a word too, and the slack is shared out in amounts too small to notice.
:::

The same words set three ways, in a measure a little narrower than these columns. Ragged text breaks only between words unless it is told to hyphenate. Justified without hyphens, a few spaces take up all the slack. With hyphens, the spaces stay even at the cost of a few broken words.
:::
:::

## Hyphens

Hyphens hand the breaker more places to end a line, and in a narrow measure they are not optional. Postext hyphenates with the TeX patterns of the document’s language, which it takes from an exact code: *en-us* for this issue and *es* for its Spanish edition. A code it lacks, such as *eu-ES*, falls back to American English with a warning. The patterns serve justified text only; ragged lines break only between words, so a narrow ragged column gets a deep rag.

## Widows, orphans and runts

A paragraph that breaks across columns leaves a line behind or carries one over. A lone first line at the foot of a column and a lone last line at the head of the next are the pair the style manuals forbid, though printers have never agreed which of the two is the widow. Postext settles it by position: avoidWidows applies at the foot of the column, avoidOrphans at its head.

:::callout{type="settings"}
widowPenalty: 1000

orphanPenalty: 1000

slackWeight: 10
:::

Each rule is a price in the breaker’s sums, weighed against the white space that obeying it would leave: a lone line costs its penalty, and the empty lines a split would leave at the foot of a column cost ten times the square of their number. The breaker takes the cheaper way.

A runt is a last line too short to stand alone: one word, or the tail of one, under a full paragraph. Postext prices it inside the line breaker, so a set of breaks that brings a second word down wins whenever the fences allow. When no other set of breaks stays inside the fences, it sets the paragraph one line shorter, tightening the spaces first and then, if it has to, the letters, by no more than ten thousandths of an em.

:::callout{type="settings"}
runtMinCharacters: 20

runtPenalty: 1000

maxRuntTracking: 10
:::

## What the eye forgives

A long word can still leave one line of a narrow column a shade looser than its neighbours, and a paragraph that must end somewhere will now and then end on a short line. The breaker can move the extra space from one line to another but cannot remove it. Near a long word it adds a trace to each of five lines rather than leave the whole amount in a single gap, where it would show as a hole in the grey of the column.

A line that still gapes is left to the editor, who can usually close it by changing one word in the sentence.

:::paragraphs{style="colophon"}
Galley is set in Petrona, Bricolage Grotesque and Source Code Pro (SIL Open Font License). Text and diagram: original, CC BY 4.0.
:::
