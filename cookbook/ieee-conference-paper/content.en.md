---
title: "Optimal Line Breaking in the Browser"
author: "Irene Valcárcel, Tomás Brandt and Aiko Nwosu"
---

# Optimal Line Breaking in the Browser: \\ What It Costs and When It Pays {style="paper" venue="DocWeb ’26 · Workshop on Document Engineering for the Web" a1="Irene Valcárcel\nDept. of Computer Science\nUniversidad de Almenara\nAlmenara, Spain\nivalcarcel@almenara.example" a2="Tomás Brandt\nTypesetting Group\nNorthgate College\nDunmore, United Kingdom\ntbrandt@northgate.example" a3="Aiko Nwosu\nSchool of Design\nHarrow Hill Institute\nHarrow Hill, Canada\nanwosu@harrowhill.example"}

:::callout{type="abstract"}
***Abstract*—**Browsers break justified text one line at a time, and the loose lines this leaves are the main complaint against justified text on screen. The total-fit method used by TeX chooses the breaks of a whole paragraph at once and avoids most of them, but it is thought too slow for a page that reflows on every resize. We set a corpus of 2,400 paragraphs in four languages at six column widths with both methods, in a script that runs in the browser, and measured the time per paragraph and the spacing of every line. Total fit took 0.21 ms per paragraph on a mid-range laptop, 3.4 times the first-fit time, and cut the share of lines whose spaces stretch past one and a half times their natural width from 11.8% to 1.9%. The gain is largest in narrow columns and in German. We conclude that the cost is affordable for text that is laid out once per resize, and give a rule for when first fit is good enough.

***Index Terms*—**line breaking, justification, hyphenation, typesetting, web browsers, performance
:::

## Introduction {#sec:intro}

A paragraph that a browser justifies is broken one line at a time. Each line takes as many words as fit, and the space left over is shared out between them. The method is fast and predictable, and it is the reason justified text on the web has a reputation for rivers and loose lines: a line followed by a long word must take that word's room as space, and nothing earlier in the paragraph can help it.

Printers have had a better method for forty years. @knuthplass1981 treat the paragraph as a whole. Every possible break is a node in a graph, every line a weighted edge, and the breaks are those of the path with the least total penalty, so that a slightly tight line early on can save a very loose one later. Liang's hyphenation patterns, Plass's work on page breaking and TeX itself came out of the same project at Stanford [@liang1983; @plass1981; @knuth1984], and the method is still the reference against which other line breakers are judged.

It has not reached the browser. The usual reason given is speed: a page that reflows whenever its window changes size cannot afford a search over every paragraph. We test that reason. :ref{id="sec:related"} places the question among earlier work, :ref{id="sec:method"} describes the corpus and the timing harness, and :ref{id="sec:results"}, on :ref{id="sec:results" style=page}, gives the measurements. :ref{id="sec:discussion"} turns them into a rule a page designer can apply.

## Related work {#sec:related}

The total-fit algorithm was described in full by @knuthplass1981, with the box, glue and penalty model that later implementations kept. The search is quadratic in the worst case, but a feasible break can only lie within a line's width of the one before it, and the active list of candidate breaks stays short in practice. The authors report times for a mainframe of the day; we know of no measurement on a modern browser engine.

Hyphenation is the other half of the problem. The patterns of @liang1983 find most of the permissible breaks of an English word from a table of a few thousand entries, and they are the basis of the hyphenation dictionaries that browsers and word processors still ship. A total-fit breaker that cannot hyphenate loses most of its advantage in narrow columns, which is why we measure the two together.

Typographic practice sets the target. @bringhurst2004 asks for a measure of 45 to 75 characters and treats word spaces that open past their natural width as the first sign of a badly set paragraph. Studies of reading suggest why: the eye moves in saccades of seven to nine characters, and an irregular texture changes where it lands [@rayner1998]. On screen, @dyson2001 found that line length affects reading speed and comprehension differently, which warns against judging a layout by one number alone. We report the spacing of the lines rather than a reading measure, and leave the second to future work.

## Method {#sec:method}

The corpus has 2,400 paragraphs, 600 in each of English, Spanish, German and French, drawn from public-domain novels and essays. Paragraphs shorter than four lines at the widest measure were left out, since a paragraph that short gives a line breaker little to choose from.

Each paragraph was set at six column widths, from 30 to 80 characters of the text face, with two line breakers: first fit, which takes the longest line that fits, and total fit as described in [-@knuthplass1981]. Both used the same Liang patterns for each language, the same glue (a space of a third of an em that may stretch by half and shrink by a third) and the same text face, measured once per word with the canvas text API. The script that does it runs in the browser, with no server.

For each setting we recorded the time to break the paragraph, excluding the measurement of words, which both methods share, and the stretch ratio of every line but the last. A line whose ratio passes 1.5 is counted as loose. The timings come from a laptop with a mid-range processor of 2023, in the current stable version of three browsers, each paragraph timed fifty times after a warm-up of ten.

## Results {#sec:results}

Total fit took 0.21 ms per paragraph on average, against 0.062 ms for first fit, a ratio of 3.4. The ratio grew with the width of the column, from 2.6 at 30 characters to 4.1 at 80, since a wider line admits more candidate breaks. The slowest paragraph, a German one of 31 lines at 80 characters, took 1.9 ms. A long article of 120 paragraphs is broken in about 25 ms, well inside the time a browser gives itself to answer a resize.

The spacing improved in every language and at every width. Over the whole corpus the share of loose lines fell from 11.8% to 1.9%. In columns of 30 to 40 characters, the measure of a two-column page on a phone, it fell from 27% to 4.6%. German gained the most, from 16.3% to 2.2%, because its long compounds leave first fit with the hardest choices; English gained the least, from 8.9% to 1.6%. The number of hyphenated lines rose by a fifth with total fit, which accepts a hyphen where it saves a loose line further down.

At 70 characters and more, first fit left fewer than 4% of its lines loose in every language. At that measure the difference between the methods is hard to see on the page, and a reader shown both settings of the same paragraph side by side could rarely tell which was which.

## Discussion {#sec:discussion}

The cost of total fit is a few tenths of a millisecond per paragraph, and the text of an ordinary page is broken in less time than the browser spends painting it. For text that is laid out once and then read, as in an article, a book chapter or a paper like this one, the cost is no argument against it. Live editing is a different case: there only the paragraph being edited needs breaking again, and the time for one paragraph is small.

The results also give a rule for when first fit is enough. In a single column of 70 characters or more, a reader will rarely meet a loose line with either method, and a designer who cannot choose the line breaker loses little. In narrow columns, and in languages with long words, the difference is large and visible, and total fit with hyphenation is the method to ask for. This matches the advice of the printers [@bringhurst2004, chap. 2], who allow a narrow column to go ragged rather than set it justified without care.

## Conclusion

We measured the cost of breaking paragraphs as TeX does in a browser and found it small: 0.21 ms per paragraph, 3.4 times the cost of the browser's own method, for six times fewer loose lines. The case against total fit on screen rests on speed, and on present hardware speed no longer supports it.

## Acknowledgment {style="back"}

The authors thank the readers of the DocWeb ’26 committee for their comments on the draft. Set in STIX Two Text and Schibsted Grotesk (SIL OFL). Text: original, CC BY 4.0. The authors, institutions and measurements are invented for this example.

## References {style="back"}

:::bibliography{title=""}

:::references{format=bibtex}
@article{knuthplass1981,
  author = {Knuth, Donald E. and Plass, Michael F.}, title = {Breaking paragraphs into lines},
  journal = {Software: Practice and Experience}, volume = 11, number = 11,
  pages = {1119--1184}, year = 1981, doi = {10.1002/spe.4380111102}}
@phdthesis{liang1983,
  author = {Liang, Franklin Mark}, title = {Word Hy-phen-a-tion by Com-put-er},
  school = {Stanford University}, address = {Stanford, CA}, year = 1983}
@phdthesis{plass1981,
  author = {Plass, Michael Frederick},
  title = {Optimal Pagination Techniques for Automatic Typesetting Systems},
  school = {Stanford University}, address = {Stanford, CA}, year = 1981}
@book{knuth1984,
  author = {Knuth, Donald E.}, title = {The {TeX}book}, publisher = {Addison-Wesley},
  address = {Reading, MA}, year = 1984}
@book{bringhurst2004,
  author = {Bringhurst, Robert}, title = {The Elements of Typographic Style}, edition = {3rd},
  publisher = {Hartley \& Marks}, address = {Point Roberts, WA}, year = 2004}
@article{rayner1998,
  author = {Rayner, Keith},
  title = {Eye movements in reading and information processing: 20 years of research},
  journal = {Psychological Bulletin}, volume = 124, number = 3, pages = {372--422}, year = 1998,
  doi = {10.1037/0033-2909.124.3.372}}
@article{dyson2001,
  author = {Dyson, Mary C. and Haselgrove, Mark},
  title = {The influence of reading speed and line length on the effectiveness of reading from screen},
  journal = {International Journal of Human-Computer Studies}, volume = 54, number = 4,
  pages = {585--612}, year = 2001, doi = {10.1006/ijhc.2001.0458}}
:::
