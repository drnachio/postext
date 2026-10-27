// The English cut of each narrated video, block by block.
import type { TranscriptBlock, TranscriptVideo } from "../transcripts";

export const TRANSCRIPTS_EN: Record<TranscriptVideo, TranscriptBlock[]> = {
  showreel: [
    {
      time: "0:00",
      scene: "A dark card reads “MAINZ · 1455” above a thin gold rule. Behind the headline “For five centuries, print learned to set a page.”, the year counts up from 1455 to 2026 in huge outline numerals, and printing terms land around it: Justification, Kerning, Widows, orphans, Balanced columns, Leading, Baseline grid, hy·phen·a·tion, Measure, Floats, Running heads, Rivers. The camera dives into the final full stop, which floods the screen with gold.",
      narration: "For five centuries, print learned how to set a page.",
    },
    {
      time: "0:05",
      scene: "Headline: “The web learned to lay out interfaces. It never learned to set a page.” A browser window at example.com/longform/article holds a three-column justified article, “Why the web can’t set a page”; red tags flag rivers of white space, a widow, an orphan, a picture landing on the text and an unbalanced last column. Beside it, a code chip reads “column-count: 3;”, then “…and little else.” and a crossed-out list of the same five faults. The window glitches and collapses.",
      narration: "The web learned to lay out interfaces. Never pages. So long-form text still breaks: rivers, widows, orphans, collisions.",
    },
    {
      time: "0:18",
      scene: "After a white flash and a sweep of blue, gold and red stripes, the Postext logo and wordmark rise into place with the tagline “The programmable typesetter for the web”. Below it: OPEN SOURCE · MIT LICENCE · v1.7.0 · RUNS IN YOUR BROWSER.",
      narration: "Meet Postext: the programmable typesetter for the web.",
    },
    {
      time: "0:24",
      scene: "Section 01 of 07, “Content in”: “Markdown says what things are.” A Markdown file, 03-why-postext.md, types itself out: a part directive, the heading “Why Postext” with a lead, a paragraph that cites figure fig-flow with :ref, a ::resource line and a :::callout block. Next to it, config.ts calls buildDocument with a two-column layout, justified body text and hyphenation for en-us, under the line “Configuration decides how they look. Nothing about layout lives in the text.”",
      narration: "You write semantic Markdown, which says what things are. A configuration decides how they look.",
    },
    {
      time: "0:32",
      scene: "Section 02, “Pretext measures”: “Measured without touching the DOM.” A heading, a paragraph and a callout are scanned one by one and dimension lines give their heights in points; a code panel shows prepare(text, '25px Lora') and layout(prepared, width, 38) returning a height and a line count. Two bars race through 10,000 paragraphs: “Browser reflow · DOM” barely moves while “Pretext · canvas metrics + arithmetic” fills at once, and a counter climbs to 600× above “faster text measurement than the DOM, so a whole book reflows as you type” and “Powered by @chenglou/pretext”.",
      narration: "Every paragraph is measured without touching the DOM, up to six hundred times faster, thanks to Pretext, the library that made it possible.",
    },
    {
      time: "0:42",
      scene: "Section 03, “Postext decides”: “Every line placed before a pixel is drawn.” A ring of seven segments lights up in turn, Structure, Measure, Place, Float, Refine, Balance and Rhythm, each with a one-line description, while a two-column page of the Postext guide assembles beside it: labelled blocks fly into their columns, a figure slides into place under the note “:ref{id=\"fig-flow\"} → column foot”, the opener band drops in, the lines appear, the columns level and a baseline grid sweeps down. The ring loops through iterations 1 to 3 and shows “Settled in 3 iterations” with a tick; a callout gives one line’s bounding box and baseline.",
      narration: "Then Postext decides. Seven passes place every line, float every figure and balance every column, looping until nothing moves.",
    },
    {
      time: "0:54",
      scene: "Section 04, “The virtual document”: “Change a word. Only what changed is set again.”, with the note “Like React’s virtual DOM, but for pages: the VDT, a virtual document tree.” Seven pages, p. 7 to p. 13, stand in a row; a caret marks an edit on p. 11, the rest of that column turns gold as DIRTY and a sliver spills onto p. 12, which gets a tick and SETTLED, while earlier pages read SKIPPED and later ones UNTOUCHED. Three bullets state the rule, and a panel headed renderToHtmlIndexed() marks the changed nodes of the document tree as PATCHED.",
      narration: "It all lives in a virtual document, like React's virtual DOM. Change a word, and only what changed is set again.",
    },
    {
      time: "1:03",
      scene: "“A long document? Only what’s on screen gets painted.” A column of book pages scrolls through a gold frame labelled VIEWPORT, with a 200-pixel margin above and below: pages inside are drawn in full, pages outside are dashed outlines. A large counter shows how many of the 48 pages are painted at that moment (IntersectionObserver · +200 px), next to “Geometry: every page. Pixels: only what you see.”",
      narration: "And in a long book, only the pages on screen are ever painted.",
    },
    {
      time: "1:10",
      scene: "Section 05, “Knuth–Plass justification”: “Every way to break the paragraph. At once.” On the left, a paragraph about line breaking is set first-fit, as a browser does it, and its loosest lines turn red. Below, every word becomes a point on a line: red arcs mark the greedy breaks, faint blue arcs try every feasible break and a gold path picks the best set. On the right, the Knuth–Plass version is evenly spaced, with the badness of each line, the formula “(1 + badness + penalty)²” and a lower total of demerits.",
      narration: "A browser breaks lines greedily, one at a time. Postext uses Knuth–Plass, the algorithm behind TeX. It weighs every way to break the whole paragraph, and keeps the most even.",
    },
    {
      time: "1:24",
      scene: "Section 06, “One layout, five outputs”: “What you see is what goes to press.” Under the code line const vdt = buildDocument(content, config); one page splits into five. Canvas (renderToCanvas(), pixel-accurate bitmaps) gets a magnifier over its pixel grid; HTML (renderToHtml(), selectable, resize-aware) gets every block outlined and tagged <h1>, <p>, <figure> and so on; PDF (renderToPdf(), print-ready, PDF/UA, CMYK) has four colour plates sliding into register, then crop marks and a colour bar. EPUB 3 (renderToEpub(), e-book, fixed or reflowable) shows the page in an e-reader tagged “Fixed layout”; the screen narrows to the size of a phone, the text reflows and the tag changes to “Reflowable”. Folio (postext-folio, a 3D book, pages that turn) opens the page into a two-page spread and turns a leaf over the spine.",
      narration: "One layout, five outputs: canvas, HTML, print-ready PDF, EPUB 3, fixed or reflowable, and a book in 3D. What you see is what goes to press.",
    },
    {
      time: "1:41",
      scene: "Section 07, “Why an open standard”: “LaTeX set the bar for print. Publishing now lives on every screen, too.” Two cards: LaTeX, 1984, with crosses against “Built for the printed page”, “Builds tied to one machine’s fonts & packages”, “Compile, wait, repeat” and “No editorial layout on the responsive web”; Postext, 2026, with ticks against “Web, print-ready PDF & EPUB 3 from one layout”, “One portable .postext file carries it all”, “Reflows live, as you type” and “Runs in any browser · zero servers · MIT”. The Postext card lights up.",
      narration: "LaTeX set the standard for print. But publishing now lives on every screen.",
    },
    {
      time: "1:48",
      scene: "Kicker “One file, the whole book”, headline “An open standard for publishing, beyond where LaTeX reaches.” A .postext file icon bursts into five parts: preset.json (configuration & design), chapters/*.md (one Markdown file per chapter), fonts/*.woff2 (the typefaces themselves), images/ · SVG (every picture, embedded) and resources (tables, figures & captions). Caption: “A plain ZIP: open, documented, MIT-licensed. Any tool can read and write it.”",
      narration: "Postext is an open standard: one portable file, documented and MIT-licensed, that any tool can read and write.",
    },
    {
      time: "1:58",
      scene: "“The showcase · set by the real engine”: a wall of book pages recedes in perspective while a counter reaches 48 pages. Text: “12 chapters, 3 parts, a cover, laid out in about half a second. Every page of the Postext guide, computed in a browser by postext v1.7.0 for this film. Nothing placed by hand.” Tags follow: Textbooks, Magazines, Literary editions, Catalogues.",
      narration: "That's why it can lay out books of hundreds of pages in tenths of a second.",
    },
    {
      time: "2:05",
      scene: "End card: the Postext logo with the tagline “The programmable typesetter for the web”, the address postext.dev, a terminal line that types “$ pnpm add postext”, and the footer “Open source · MIT · github.com/drnachio/postext”.",
      narration: "Postext. Open source, at postext.dev.",
    },
  ],
  tutorial: [
    {
      time: "0:00",
      scene: "Title card: the Postext logo, the kicker “Tutorial · 5 steps” and the title “Turn your publication into Postext with an AI agent. No code.”",
    },
    {
      time: "0:03",
      scene: "“Your publication already exists.” Three pages set by Postext, a book, a manual and a magazine, drop in one by one, labelled InDesign (IDML), Word (DOCX) and PDF. They gather on the left, a dashed gold arrow runs through an “AI agent” badge and a file icon named my-book.postext appears, under “An agent turns it into Postext. Five steps. A few well-written requests.”",
      narration: "You already have a publication: a book, a manual, a magazine. It lives in InDesign, in Word, or in a PDF. In this tutorial, an AI agent will turn it into Postext for you. No code: just five steps and a few well-written requests.",
    },
    {
      time: "0:23",
      scene: "“The plan”: five numbered cards appear as each step is named: 01 Prepare the folder, 02 Bring the vector originals, 03 Add a reference, 04 Ask the agent, 05 Check in the sandbox.",
      narration: "Here's the plan: prepare the folder, bring the original artwork, add a reference, ask the agent, and check the result.",
    },
    {
      time: "0:33",
      scene: "Step 01, the folder: “One project, one folder.” A large folder, my-book/, floats among ten loose files such as MinionPro-Regular.otf, cover.jpg, fig-2-1.ai, chapter-01.docx, map.svg, book.idml and chart.pdf. A window opens on the folder tree and each file flies into its subfolder as it is named: reference.pdf (how it must look, step 03), fonts/ (Minion Pro, Myriad…, .otf .ttf .woff2), images/ (photos, .jpg .png), artwork/ (vector originals, .ai .svg .pdf) and text/ (Word, InDesign IDML…).",
      narration: "Step one: put everything in a single folder on your computer. One project, one folder. Inside, give each kind of material its own subfolder: the fonts, the images, the illustrations, and the text files.",
    },
    {
      time: "0:50",
      scene: "The fonts/ row is highlighted and a card headed “Fonts” shows a large “Aa”, the styles Regular, Italic and Bold, the formats OTF, TTF and WOFF2, and the note “Only the fonts you include can be used.” Then “The tidier the folder, the less it guesses.”, while each subfolder in the tree gets a tick.",
      narration: "Don't forget the fonts. They give the design its voice, and the agent can only use the ones you include. The tidier the folder, the less the agent has to guess.",
    },
    {
      time: "1:03",
      scene: "Step 02, vector originals: “Bring the originals.” A diagram, a chart and a map are drawn as line art with their anchor points showing, and three file icons appear: .ai Illustrator, .svg SVG and .pdf PDF.",
      narration: "Step two: if your illustrations are vector graphics, like diagrams, charts or maps, find the original files: Illustrator, SVG, or PDF.",
    },
    {
      time: "1:14",
      scene: "Two panels show the same figure, a diagram in which Manuscript and Template both point to Pages, captioned “Fig. 2.1 Content and design meet.” On the left, “Cut from the PDF: a photo of the drawing” turns blurred and blocky as the view zooms in; on the right, “The original: the drawing itself” stays sharp. The left panel fades, the labels of the original are retyped in Spanish (Manuscrito, Plantilla, Páginas), crop marks frame it, and three ticks read “Sharp at any size”, “Labels are live text” and “Print master → press”.",
      narration: "A figure cut out of the finished PDF is little more than a photo of the drawing. The original is the drawing itself. With it, the agent rebuilds each figure: sharp at any size, with its labels still as real text, ready to be translated. And for print, the original goes to press untouched.",
    },
    {
      time: "1:37",
      scene: "Step 03, the reference: “Show how it should look.” In the folder tree, reference.pdf is highlighted and tagged “In the root”; a page flies out of it and becomes a large two-column book page marked reference.pdf.",
      narration: "Step three is essential: in the root of the folder, include a file that shows clearly how the finished product should look. A PDF is ideal.",
    },
    {
      time: "1:47",
      scene: "Measurements appear over the page: column outlines, a 9 mm gutter, a 20 mm margin, labels for the heading (Fraunces 28 pt), the body (Lora 9.4/13.6 pt) and a box (tinted, 1 rule), and baselines with 13.6 pt leading. A file, spec-sheet.md, fills in: page 210 × 280 mm; margins 24 · 20 · 22 · 20 mm, mirrored; 2 columns, gutter 9 mm; baseline grid 13.6 pt; body Lora 9.4 / 13.6 pt, justified; headings Fraunces 28 pt · Geist; openers with a 101 mm colour band; boxes with a tint and a left rule. Then the word “Guess” is struck through and “Measure.” lights up in gold.",
      narration: "The agent reads the design from those pages. It measures margins, columns, fonts and spacing, and writes them down as layout rules. Without a reference, it would have to guess. With one, it measures.",
    },
    {
      time: "2:03",
      scene: "Step 04, the agent: “Ask for it in plain words.” A window titled “Agent · ~/my-book” opens beside the badges Claude Code, Codex and “or any other agent”. A message from YOU types out: “Install the Postext skill: `npx skills add drnachio/postext --skill postext-port`”, and the agent answers “✓ Skill installed: postext-port”. A card for the postext-port skill lists “A proven workflow”, “Everything about Postext” and “Tools to check its own work”.",
      narration: "Step four: open your agent, Claude Code, Codex or whichever you use, in that folder, and ask it to install the Postext skill. A skill is a package of expert know-how. This one teaches the agent how to bring a publication into Postext, and gives it the tools to check its own work.",
    },
    {
      time: "2:24",
      scene: "The next request types out: “Use the postext-port skill to convert this book to Postext. The design is in reference.pdf, the fonts are in fonts/ and the original illustrations are in artwork/: use them instead of cutting figures out of the PDF. Start with chapter 1 only, and show me the spec sheet before you build it.” Beside it, reference.pdf, fonts/ and artwork/ light up in the folder tree as the prompt names them, and a card reading “Ch. 1” pops up.",
      narration: "Then ask for what you want, in plain words. Tell it where the reference, the fonts and the originals are, and ask it to start with a single chapter.",
    },
    {
      time: "2:37",
      scene: "A grid of twelve dimmed book pages; the first is outlined in gold. A circular arrow counts polishing rounds on it until a tick appears, then the other eleven light up. Below: Sample chapter → Polish → Extend.",
      narration: "If the content is long, start with a sample chapter. Polish it until it's perfect, and only then extend it to the rest.",
    },
    {
      time: "2:46",
      scene: "The agent asks “Faithful copy or redesign?”, “Which languages?” and “Print, screen, or both?”. A checklist runs through Take inventory, Measure the design, Extract the text, Fonts and images, Compare page by page and Pack the file, and the file my-book.postext appears. A third request types out: “Chapter 1 is approved. Convert the remaining chapters with the same design, compare each one with reference.pdf, and pack everything into a single .postext file.” The agent replies “✓ 12 chapters · 0 warnings · my-book.postext”.",
      narration: "The agent will ask a few questions: a faithful copy or a redesign, which languages, print or screen. Then it measures, extracts, assembles and checks. And it hands you a Postext file. Once the sample is right, extending it to the whole book is just one more request.",
    },
    {
      time: "3:14",
      scene: "Step 05, the sandbox: “Check it, page by page.” A browser window types the address postext.dev/sandbox. The pointer clicks Books in the side bar, then New, then “Open a .postext file…”; the file flies in, “My book, 12 chapters · 184 pages” appears at the top of the list and its first pages open in the Canvas view; the view tabs read Canvas, HTML, PDF, Folio and EPUB 3.",
      narration: "Step five: open the Postext sandbox at postext.dev. In Books, choose New, and open your file.",
    },
    {
      time: "3:24",
      scene: "The reference page and the Postext page stand side by side, labelled Reference and Postext, and a gold line scans down both. The Checks panel opens with a badge of 3 and lists Widow (p. 4), Loose line (p. 7) and Figure does not fit (p. 9); red boxes mark each problem on the Postext page.",
      narration: "Go through it page by page, next to your reference. The Checks panel points out problems for you: widows, loose lines, figures that don't fit.",
    },
    {
      time: "3:35",
      scene: "Two rows of page wireframes, “Reference · PDF” and “Postext · reflowed”. In the reflowed row a figure travels from the first page to the top of the second, and a dashed line links its two positions. Text: “Same rules, not the same pages. The content flows: a figure or a page break may land elsewhere.” Then an equals sign joins each pair of pages under “What must match”: Margins and baseline grid, Typography, Figure and box styles, Clean pages: no widows, even columns. A red panel marked ≠ reads “Hand-made craft decisions: not rules, so they can’t set changing content”.",
      narration: "One thing to keep in mind: the pages don't need to be identical to your PDF. Postext has learned the layout rules, and your content now flows, so a figure or a page break may land somewhere else. What should match is the quality: the same production values. When we lay out by hand, we make small craft decisions that aren't rules. And only rules can set content that keeps changing.",
    },
    {
      time: "4:03",
      scene: "The agent window returns with a fourth request: “In the sandbox, chapter 2, page 7: the “Remember” box is split across two columns, and the running head is missing. Checks shows 3 loose lines. Fix it and pack the file again.” A screenshot is attached, screenshot-ch2-p7.png. Then a loop between Sandbox (check) and Agent (fix) runs through rounds 1 to 3 while the warning count drops from 3 to 0, and ends with a tick and “Exactly right.”",
      narration: "Then tell the agent what you see, as precisely as you can: the chapter, the page, and what's wrong. A screenshot helps. Open the new version, check again, and repeat. Each round gets closer, until it's exactly right.",
    },
    {
      time: "4:23",
      scene: "“Not just a Postext version.” The my-book.postext file splits in two along a gold line. On the left, Content (what it says): chapters/en/02-the-cell.md, with the heading “The cell”, a sentence citing figure fig-cell and a “remember” callout. On the right, Form (how it looks): a template deduced from your original, with page 210 × 280 mm mirrored, 2 columns with a 9 mm gutter, body Lora 9.4/13.6 justified, numbered Fraunces headings, “remember” boxes with tint and rule, and figures floated to the column top.",
      narration: "And this is the best part: you haven't just made a Postext version of your content. You've separated content from form. The text lives in clean chapters. The design lives in a template, with layout rules deduced from your original.",
    },
    {
      time: "4:39",
      scene: "Chips light up for Correct, Extend and Translate above a row of book pages: a line is highlighted and a shimmer crosses the pages, two more pages slide in, and the pages flip over to the Spanish edition. A request types out: “Add a Spanish edition: translate the chapters, captions and diagram labels, and keep the same design.” Caption: “Same rules. New content. Pages set themselves.” Then “One file, the whole book.”: a .postext icon branches to a page with crop marks (Print-ready PDF), an e-reader with the text reflowed to its screen (EPUB e-book), a browser window (Web reader) and a pair of pages (Every page, set).",
      narration: "So when your content changes, when you correct it, extend it or translate it, you don't have to think about the layout. Postext sets it again, following the same rules. One file for the whole book: a print-ready PDF, an EPUB e-book, a reader for the web, and pages that set themselves.",
    },
    {
      time: "5:03",
      scene: "End card: the Postext logo, the tagline “The programmable typesetter for the web”, postext.dev, a pill reading “The prompts from this video are in the description ↓” and the footer “Open source · MIT · github.com/drnachio/postext”.",
      narration: "Postext. Open source, at postext.dev. You'll find the example prompts in the description.",
    },
  ],
};
