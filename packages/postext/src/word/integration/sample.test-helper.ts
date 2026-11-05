// The sample book of the end-to-end tests: every construct the round trip
// must carry, over two chapters.

import type { WordChapterInput } from '../semantic/types.js';

export const CH1 = `# Introduction

Plain text with **bold**, *italic* and a [link](https://postext.dev) in it. The heart:index{term="Heart"} beats steadily all day long.

## Lists and notes

- first item
- second item

1. one
2. two

Text with a note[^n1] here.

:::callout{type="note"}
Inside the box there is a sentence.
:::

See figure :ref{id="fig1"} and table :ref{id="t1"}.

::resource{id="fig1"}

::resource{id="t1"}

Inline $x^2$ maths in a line.

$$
\\frac{a}{b}
$$

Last paragraph of the chapter.

[^n1]: The note text is short.
`;

export const CH2 = `# Second chapter

Another paragraph starts the 2^nd^ chapter, with H~2~O.\\
A forced break comes before this line.

A closing paragraph with *emphasis* ends it.
`;

export const SAMPLE: WordChapterInput[] = [
  { id: 'ch1', title: 'Introduction', markdown: CH1 },
  { id: 'ch2', title: 'Second chapter', markdown: CH2 },
];
