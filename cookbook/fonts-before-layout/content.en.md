---
title: "House Specimen"
author: "Pellow Lane Press"
---

# Three faces, proofed {kicker="Pellow Lane Press · House specimen Nº 3" lead="Our text, display and label faces at work, and proof that each of them had arrived before these lines were set." glyphs="Ag" label="Noto Serif Display 900 italic · 240 pt" faces="Text: Ysabeau Office · Labels: IBM Plex Mono"}

A compositor in a metal shop could only set a line in a face that was in the case. Postext measures every word with the fonts the browser holds at that moment, so a page built a second too early is broken for a fallback face. These pages were built three times: once too early, on purpose, with no font file in the browser; again once Postext had loaded every face the design asks for; and a last time to print their list on page 3 and, on page 4, what the early build got wrong.

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

The table below is Postext’s own report. Before it measured a line of the second build, it read the design and the text for every face they ask for, in the text, headings, chips, table, captions, opener and running heads, and loaded each one for the letters these pages set. Once the pages were laid out it looked at the faces their lines were set in, and found none missing.

::resource{id="faces"}

Some faces in the table set nothing in this booklet. Postext loads the regular, the italic, the bold and the bold italic of the text face, because any paragraph may ask for them with a pair of asterisks. The two italics of the mono face were declared and never asked for, so the browser fetched no file for them.

A face with no file would not pass unnoticed. The browser sets a family nobody declared in a system face and fakes a missing bold by thickening the regular; Postext names both in its report and among the warnings of the finished document.

:::pagebreak

## What the early build got wrong

The early build ran before the browser had any of these files, so its words were measured in a fallback face. Drawn in the real faces, its lines no longer fit the measure.

::resource{id="proof"}

When the faces arrived, Postext dropped every width it had measured in their families, and the next build measured each word again.

:::paragraphs{style="colophon"}
Set in Ysabeau Office, Noto Serif Display and IBM Plex Mono (SIL OFL 1.1) · Text: original, CC BY 4.0 · Pellow Lane Press is imaginary.
:::
