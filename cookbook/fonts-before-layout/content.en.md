---
title: "House Specimen"
author: "Pellow Lane Press"
---

# Three faces, proofed {kicker="Pellow Lane Press · House specimen Nº 3" lead="Our text, display and label faces at work, and proof that each of them had arrived before these lines were set." glyphs="Ag" label="Noto Serif Display 900 italic · 240 pt" faces="Text: Ysabeau Office · Labels: IBM Plex Mono"}

A compositor in a metal shop could only set a line in a face that was in the case. Postext measures every word with the fonts the browser holds at that moment and keeps the widths, so a face that arrives a second late leaves the page broken for a fallback, with no warning. These pages were built three times: once to learn which faces the layout asks for, again once all of them had loaded, and a last time to print their list on page 3 and, on page 4, what the first build got wrong.

## Seven sizes of the text face

Ysabeau, drawn by Christian Thalmann, carries the letterforms of the Garamond tradition into a low-contrast sans serif. Its Office cut sets tabular lining figures and a level hyphen by default.

:::paragraphs{style="s7"}
:chip[7 pt]{style="size-1"} Credits and map legends, where small print needs open counters.
:::

:::paragraphs{style="s8"}
:chip[8 pt]{style="size-1"} Captions and table notes, where the tabular figures keep 1,048 and 2,096 in step.
:::

:::paragraphs{style="s9"}
:chip[9 pt]{style="size-1"} A reference column set close; the long ascenders keep the lines apart.
:::

:::paragraphs{style="s10"}
:chip[10 pt]{style="size"} Notes and asides, a size below the text they sit beside.
:::

:::paragraphs{style="s11"}
:chip[11 pt]{style="size"} The text of this booklet, eleven on fifteen and a half.
:::

:::paragraphs{style="s12"}
:chip[12 pt]{style="size"} A standfirst, or a first reader for children.
:::

:::paragraphs{style="s14"}
:chip[14 pt]{style="size"} A heading, or a line on a poster.
:::

## Beyond Latin-1

Spanish needs nothing beyond the latin file of each face. Polish and Czech need more: ż, ł, ř and ů live in a second file, latin-ext, which the browser fetches only when a load or a line asks for those letters.

:::paragraphs{style="pangram"}
:chip[es]{style="size"} El veloz murciélago hindú comía feliz cardillo y kiwi.

:chip[pl]{style="size"} Zażółć gęślą jaźń.

:chip[cs]{style="size"} Příliš žluťoučký kůň úpěl ďábelské ódy.
:::

:::pagebreak

## The proof

The script compiled the table below from the layout. After the first build, it walked the finished pages for every font they had asked for, in the text, headings, chips, tables, captions, opener and running heads. It loaded each face that had not arrived, emptied the measurement cache and built the pages again, then wrote down what it had found.

::resource{id="faces"}

Some faces in the table set nothing in this booklet. Beside the face of every block of text, table and caption, Postext names a bold, an italic and a bold italic, whether the text uses them or not, and a PDF export asks for all of them. The script loads each one it has a file for.

Before loading anything, the script also checked that every face some text is set in had a file of its own. It could not rely on the browser’s check, which answers yes for a family nobody declared and for any bold it can fake by thickening the regular.

:::pagebreak

## What the first build got wrong

The first build ran before any of these files had arrived, so the browser measured its words in a fallback face. Drawn in the real faces, its lines no longer fit the measure.

::resource{id="proof"}

The fallback widths stay in the measurement cache, and a second build made without emptying it breaks every line where the first one did.

:::paragraphs{style="colophon"}
Set in Ysabeau Office, Noto Serif Display and IBM Plex Mono (SIL OFL 1.1) · Text: original, CC BY 4.0 · Pellow Lane Press is imaginary.
:::
