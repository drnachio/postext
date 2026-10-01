/**
 * Text alternatives for the narrated videos (WCAG 1.2.3 and 1.2.8): what is said, verbatim from the captions, and
 * what is shown, from the animation sources. One list of blocks per video and locale; `es` follows the Spanish cut
 * (its own timings and on-screen text), `zh` translates the English transcript, because Chinese pages play the English cut.
 */
export type TranscriptVideo = "showreel" | "tutorial";
export type TranscriptLocale = "en" | "es" | "zh";
export interface TranscriptBlock {
  /** Start time in the cut, "m:ss". */
  time: string;
  /** What is on screen, in plain present-tense prose (optional when nothing new appears). */
  scene?: string;
  /** What the narrator says in this stretch, verbatim from the captions. */
  narration?: string;
}

export const TRANSCRIPTS: Record<TranscriptVideo, Record<TranscriptLocale, TranscriptBlock[]>> = {
  showreel: {
    en: [
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
        scene: "Section 06, “One layout, three renderers”: “What you see is what goes to press.” Under the code line const vdt = buildDocument(content, config); one page splits into three. Canvas (renderToCanvas(), pixel-accurate bitmaps) gets a magnifier over its pixel grid; HTML (renderToHtml(), selectable, resize-aware) gets every block outlined and tagged <h1>, <p>, <figure> and so on; PDF (renderToPdf(), print-ready, PDF/UA, CMYK) has four colour plates sliding into register, then crop marks and a colour bar.",
        narration: "One layout, three renderers: canvas, HTML and print-ready PDF. What you see is what goes to press.",
      },
      {
        time: "1:35",
        scene: "Section 07, “Why an open standard”: “LaTeX set the bar for print. Publishing now lives on every screen, too.” Two cards: LaTeX, 1984, with crosses against “Built for the printed page”, “Builds tied to one machine’s fonts & packages”, “Compile, wait, repeat” and “No editorial layout on the responsive web”; Postext, 2026, with ticks against “Web, canvas & print-ready PDF from one layout”, “One portable .postext file carries it all”, “Reflows live, as you type” and “Runs in any browser · zero servers · MIT”. The Postext card lights up.",
        narration: "LaTeX set the standard for print. But publishing now lives on every screen.",
      },
      {
        time: "1:41",
        scene: "Kicker “One file, the whole book”, headline “An open standard for publishing, beyond where LaTeX reaches.” A .postext file icon bursts into five parts: preset.json (configuration & design), chapters/*.md (one Markdown file per chapter), fonts/*.woff2 (the typefaces themselves), images/ · SVG (every picture, embedded) and resources (tables, figures & captions). Caption: “A plain ZIP: open, documented, MIT-licensed. Any tool can read and write it.”",
        narration: "Postext is an open standard: one portable file, documented and MIT-licensed, that any tool can read and write.",
      },
      {
        time: "1:51",
        scene: "“The showcase · set by the real engine”: a wall of book pages recedes in perspective while a counter reaches 48 pages. Text: “12 chapters, 3 parts, a cover, laid out in about half a second. Every page of the Postext guide, computed in a browser by postext v1.7.0 for this film. Nothing placed by hand.” Tags follow: Textbooks, Magazines, Literary editions, Catalogues.",
        narration: "That's why it can lay out books of hundreds of pages in tenths of a second.",
      },
      {
        time: "1:58",
        scene: "End card: the Postext logo with the tagline “The programmable typesetter for the web”, the address postext.dev, a terminal line that types “$ pnpm add postext”, and the footer “Open source · MIT · github.com/drnachio/postext”.",
        narration: "Postext. Open source, at postext.dev.",
      },
    ],
    es: [
      {
        time: "0:00",
        scene: "Sobre fondo oscuro, «MAGUNCIA · 1455» encima de un filete dorado. Detrás del titular «Durante cinco siglos, la imprenta aprendió a componer la página.», el año avanza de 1455 a 2026 en grandes cifras perfiladas y alrededor caen términos del oficio: Justificación, Kerning, Viudas, huérfanas, Columnas equilibradas, Interlineado, Retícula base, guio·na·do, Medida, Flotantes, Cabeceras, Ríos. La cámara se mete en el punto final, que llena la pantalla de dorado.",
        narration: "Durante cinco siglos, la imprenta aprendió a componer la página.",
      },
      {
        time: "0:06",
        scene: "Titular: «La web aprendió a maquetar interfaces. Nunca aprendió a componer una página.» Una ventana de navegador en example.com/longform/article muestra un artículo justificado a tres columnas, «Por qué falla la web»; etiquetas rojas señalan ríos de blanco, una huérfana, una viuda, una imagen que cae sobre el texto y una última columna desequilibrada. Al lado, una pastilla de código dice «column-count: 3;», seguida de «…y poco más.» y de una lista tachada con los mismos cinco defectos. La ventana se distorsiona y se desploma.",
        narration: "La web aprendió a maquetar interfaces. Nunca páginas. Por eso el texto largo sigue rompiéndose: ríos, viudas, huérfanas, colisiones.",
      },
      {
        time: "0:19",
        scene: "Tras un destello blanco y un barrido de franjas azul, dorada y roja, el logotipo de Postext sube a su sitio con el lema «El tipógrafo programable para la web». Debajo: CÓDIGO ABIERTO · LICENCIA MIT · v1.7.0 · FUNCIONA EN TU NAVEGADOR.",
        narration: "Esto es Postext: el tipógrafo programable para la web.",
      },
      {
        time: "0:25",
        scene: "Sección 01 de 07, «Entra el contenido»: «Markdown dice qué es cada cosa.» Un archivo Markdown, 03-por-que-postext.md, se escribe solo: una directiva de parte, el título «Por qué Postext» con entradilla, un párrafo que cita la figura fig-flow con :ref, una línea ::resource y un bloque :::callout. Al lado, config.ts llama a buildDocument con maquetación a dos columnas, texto justificado y guionado para «es», bajo la frase «La configuración decide cómo se ve. El texto no contiene ni una decisión de maquetación.»",
        narration: "Escribes Markdown semántico, que dice qué es cada cosa. La configuración decide cómo se ve.",
      },
      {
        time: "0:33",
        scene: "Sección 02, «Pretext mide»: «Medido sin tocar el DOM.» Un título, un párrafo y un recuadro se escanean uno tras otro y unas cotas dan su altura en puntos; un panel de código muestra prepare(text, '25px Lora') y layout(prepared, width, 38), que devuelve una altura y un número de líneas. Dos barras compiten con 10.000 párrafos: «Reflow del navegador · DOM» apenas avanza y «Pretext · canvas + aritmética» se llena al instante, y un contador sube hasta 600× sobre «más rápido que el DOM midiendo texto, para que un libro entero se recomponga al escribir» e «Impulsado por @chenglou/pretext».",
        narration: "Cada párrafo se mide sin tocar el DOM, hasta seiscientas veces más rápido, gracias a Pretext, la librería que lo ha hecho posible.",
      },
      {
        time: "0:43",
        scene: "Sección 03, «Postext decide»: «Cada línea colocada antes de pintar un píxel.» Un anillo de siete segmentos se ilumina por turnos, Estructura, Medición, Colocación, Flotantes, Refinado, Equilibrio y Ritmo, cada uno con una línea de explicación, mientras al lado se monta una página a dos columnas de la guía de Postext: los bloques etiquetados vuelan a sus columnas, una figura se desplaza a su sitio con la nota «:ref{id=\"fig-flow\"} → pie de columna», cae la banda de apertura, aparecen las líneas, las columnas se nivelan y baja la retícula base. El anillo recorre las iteraciones 1 a 3 y muestra «Estable en 3 iteraciones» con una marca; un recuadro da la caja y la línea base de una línea.",
        narration: "Después, Postext decide. Siete pasadas colocan cada línea, llevan cada figura a su sitio y equilibran las columnas, hasta que nada se mueve.",
      },
      {
        time: "0:55",
        scene: "Sección 04, «El documento virtual»: «Cambia una palabra. Solo se recompone lo que cambia.», con la nota «Como el virtual DOM de React, pero para páginas: el VDT, un árbol de documento virtual.» Siete páginas, de la p. 7 a la p. 13, en fila; un cursor marca una edición en la p. 11, el resto de esa columna se vuelve dorado como SUCIO y una franja pasa a la p. 12, que recibe una marca y ESTABLE, mientras las anteriores dicen SE SALTA y las siguientes INTACTA. Tres viñetas explican la regla y un panel titulado renderToHtmlIndexed() marca como PARCHEADO los nodos del árbol que han cambiado.",
        narration: "Todo vive en un documento virtual, como el virtual DOM de React. Cambias una palabra, y solo se recompone lo que cambia.",
      },
      {
        time: "1:05",
        scene: "«¿Un documento largo? Solo se pinta lo que está en pantalla.» Una columna de páginas pasa por un marco dorado rotulado VIEWPORT, con un margen de 200 píxeles arriba y abajo: las páginas de dentro se dibujan enteras y las de fuera son contornos discontinuos. Un contador grande indica cuántas de las 48 páginas están pintadas en cada momento (IntersectionObserver · +200 px), junto a «Geometría: todas las páginas. Píxeles: solo lo que ves.»",
        narration: "Y en un libro largo, solo se pintan las páginas que están en pantalla.",
      },
      {
        time: "1:12",
        scene: "Sección 05, «Justificación Knuth–Plass»: «Todas las formas de cortar el párrafo. A la vez.» A la izquierda, un párrafo sobre el corte de líneas compuesto de forma voraz, como lo hace el navegador, con sus líneas más abiertas en rojo. Debajo, cada palabra es un punto sobre una recta: arcos rojos para los cortes voraces, arcos azules tenues que prueban todos los cortes posibles y un camino dorado con la mejor combinación. A la derecha, la versión Knuth–Plass, de espaciado uniforme, con la fealdad de cada línea, la fórmula «(1 + fealdad + penalización)²» y una suma de deméritos menor.",
        narration: "Un navegador corta las líneas de forma voraz, una a una. Postext usa Knuth-Plass, el algoritmo de TeX: sopesa todas las formas de cortar el párrafo entero y se queda con la más uniforme.",
      },
      {
        time: "1:27",
        scene: "Sección 06, «Una maquetación, tres renderizadores»: «Lo que ves es lo que va a imprenta.» Bajo la línea de código const vdt = buildDocument(content, config); una página se divide en tres. Canvas (renderToCanvas(), mapas de bits exactos al píxel) lleva una lupa sobre su rejilla de píxeles; HTML (renderToHtml(), seleccionable y adaptable) recuadra cada bloque con su etiqueta <h1>, <p>, <figure>, etc.; en PDF (renderToPdf(), para imprenta, PDF/UA, CMYK) cuatro planchas de color entran en registro y aparecen marcas de corte y una tira de color.",
        narration: "Una maquetación, tres renderizadores: canvas, HTML y PDF para imprenta. Lo que ves es lo que se imprime.",
      },
      {
        time: "1:38",
        scene: "Sección 07, «Por qué un estándar abierto»: «LaTeX marcó el listón del papel. Hoy la edición vive también en cada pantalla.» Dos tarjetas: LaTeX, 1984, con aspas junto a «Pensado para la página impresa», «Atado a las fuentes y paquetes de una máquina», «Compilar, esperar, repetir» y «Sin maquetación editorial en la web adaptable»; Postext, 2026, con marcas junto a «Web, canvas y PDF de imprenta, una maquetación», «Un solo archivo .postext lo lleva todo», «Se recompone en vivo mientras escribes» y «En cualquier navegador · sin servidores · MIT». La tarjeta de Postext se ilumina.",
        narration: "LaTeX marcó el estándar del papel. Pero hoy la edición vive en todas las pantallas.",
      },
      {
        time: "1:46",
        scene: "Rótulo «Un archivo, el libro entero» y titular «Un estándar abierto para la edición, más allá de donde llega LaTeX». Un icono de archivo .postext se abre en cinco piezas: preset.json (configuración y diseño), chapters/*.md (un Markdown por capítulo), fonts/*.woff2 (las propias tipografías), images/ · SVG (cada imagen, incluida) y resources (tablas, figuras y pies). Pie: «Un ZIP corriente: abierto, documentado y con licencia MIT. Cualquier herramienta puede leerlo y escribirlo.»",
        narration: "Postext es un estándar abierto: un único archivo portátil, documentado y con licencia MIT, que cualquier herramienta puede leer y escribir.",
      },
      {
        time: "1:58",
        scene: "«La muestra · compuesta por el motor real»: un muro de páginas de la edición española de la guía se aleja en perspectiva mientras un contador llega a 48 páginas. Texto: «12 capítulos, 3 partes y una portada, maquetados en torno a medio segundo. Cada página de la guía de Postext, calculada en un navegador por postext v1.7.0 para esta pieza. Nada colocado a mano.» Después, etiquetas: Libros de texto, Revistas, Ediciones literarias, Catálogos.",
        narration: "Por eso es capaz de maquetar libros de cientos de páginas en décimas de segundo.",
      },
      {
        time: "2:06",
        scene: "Cierre: el logotipo de Postext con el lema «El tipógrafo programable para la web», la dirección postext.dev, una línea de terminal que escribe «$ pnpm add postext» y el pie «Código abierto · MIT · github.com/drnachio/postext».",
        narration: "Postext. Código abierto, en postext.dev.",
      },
    ],
    zh: [
      {
        time: "0:00",
        scene: "深色画面上写着“MAINZ · 1455”（美因茨，1455年），下方一道金色细线。标题“For five centuries, print learned to set a page.”（五个世纪以来，印刷术学会了编排一页）背后，年份以巨大的空心数字从1455跳到2026，四周落下一个个排版术语：Justification（两端对齐）、Kerning（字偶距）、Widows（寡行）、orphans（孤行）、Balanced columns（分栏平衡）、Leading（行距）、Baseline grid（基线网格）、hy·phen·a·tion（断词连字）、Measure（行长）、Floats（浮动体）、Running heads（书眉）、Rivers（字间河流）。镜头推进句末的句点，金色铺满画面。",
        narration: "五个世纪以来，印刷术学会了如何编排一页。",
      },
      {
        time: "0:05",
        scene: "标题：“The web learned to lay out interfaces. It never learned to set a page.”（网页学会了布局界面，却从未学会编排一页。）地址为example.com/longform/article的浏览器窗口里是一篇三栏两端对齐的文章，题为“Why the web can’t set a page”；红色标签依次指出字间河流、寡行、孤行、压在文字上的图片和失衡的最后一栏。旁边的代码块写着“column-count: 3;”，接着是“…and little else.”（……仅此而已）和一份逐项打叉的五种缺陷清单。窗口闪烁失真，随即坍缩消失。",
        narration: "网页学会的是布局界面，从来不是页面。所以长文本至今仍会出问题：字间河流、寡行、孤行、图文碰撞。",
      },
      {
        time: "0:18",
        scene: "白光一闪，蓝、金、红三道斜条扫过，Postext标志和字标升起，配上标语“The programmable typesetter for the web”（为网页而生的可编程排版引擎）。下方是OPEN SOURCE · MIT LICENCE · v1.7.0 · RUNS IN YOUR BROWSER（开源、MIT许可、v1.7.0、在浏览器中运行）。",
        narration: "这就是Postext：为网页而生的可编程排版引擎。",
      },
      {
        time: "0:24",
        scene: "第01/07节“Content in”（内容输入）：“Markdown says what things are.”（Markdown只描述内容是什么。）Markdown文件03-why-postext.md逐字打出：一条部分指令、带导语的标题“Why Postext”、一段用:ref引用图fig-flow的文字、一行::resource和一个:::callout块。旁边的config.ts调用buildDocument，设置双栏版式、两端对齐的正文和en-us断词，下方写着“Configuration decides how they look. Nothing about layout lives in the text.”（配置决定它们的样子；排版决策从不写进正文。）",
        narration: "你用语义化的Markdown写作，它说明内容是什么。配置决定它们的样子。",
      },
      {
        time: "0:32",
        scene: "第02节“Pretext measures”（Pretext测量）：“Measured without touching the DOM.”（测量文本，无需触碰DOM。）一个标题、一个段落和一个提示框依次被扫描，尺寸线标出它们以点为单位的高度；代码面板显示prepare(text, '25px Lora')和layout(prepared, width, 38)，返回高度和行数。两条进度条比赛处理10,000个段落：“Browser reflow · DOM”几乎不动，“Pretext · canvas metrics + arithmetic”瞬间填满；计数器升到600×，配文“faster text measurement than the DOM, so a whole book reflows as you type”（比DOM更快的文本测量，整本书随输入实时重排）和“Powered by @chenglou/pretext”。",
        narration: "每个段落的测量都无需触碰DOM，速度最高快六百倍，这要归功于Pretext，正是这个库让这一切成为可能。",
      },
      {
        time: "0:42",
        scene: "第03节“Postext decides”（Postext决策）：“Every line placed before a pixel is drawn.”（绘制任何像素之前，每一行都已就位。）一个七段圆环依次亮起：Structure、Measure、Place、Float、Refine、Balance、Rhythm（结构、测量、放置、浮动、精修、平衡、节奏），每段配一句说明；旁边，Postext指南的一张双栏页面逐步组装：带标签的块飞入各栏，一张图移到位置上，旁注“:ref{id=\"fig-flow\"} → column foot”（移到栏底），章首色带落下，文字行出现，各栏齐平，基线网格向下铺开。圆环循环迭代1到3次，显示“Settled in 3 iterations”（3次迭代后稳定）和一个对勾；一个标注框给出其中一行的边界框和基线。",
        narration: "然后由Postext来决策。七个步骤安排每一行、让每张图浮动到位、平衡每一栏，循环往复，直到不再有任何变化。",
      },
      {
        time: "0:54",
        scene: "第04节“The virtual document”（虚拟文档）：“Change a word. Only what changed is set again.”（改一个词，只重排改变的部分。）注释写着“Like React’s virtual DOM, but for pages: the VDT, a virtual document tree.”（就像React的虚拟DOM，只不过面向页面：VDT，虚拟文档树。）七页（p. 7至p. 13）排成一行；光标在p. 11标出一处编辑，该栏其余部分变成金色并标为DIRTY（脏），一小块溢到p. 12，p. 12随后打勾并标为SETTLED（已稳定），之前的页面标为SKIPPED（跳过），之后的标为UNTOUCHED（未变）。三条要点说明这条规则，标题为renderToHtmlIndexed()的面板把文档树中改动的节点标为PATCHED（已修补）。",
        narration: "一切都存在于一个虚拟文档中，就像React的虚拟DOM。改一个词，只有改变的部分会重新排版。",
      },
      {
        time: "1:03",
        scene: "“A long document? Only what’s on screen gets painted.”（长文档？只绘制屏幕上可见的部分。）一列书页滚过一个标有VIEWPORT的金色框，框的上下各留200像素余量：框内的页面完整绘制，框外的只是虚线轮廓。一个大计数器显示48页中此刻已绘制的页数（IntersectionObserver · +200 px），旁边写着“Geometry: every page. Pixels: only what you see.”（几何：每一页。像素：只画你看到的。）",
        narration: "在一本长书里，只有屏幕上的页面才会被绘制。",
      },
      {
        time: "1:10",
        scene: "第05节“Knuth–Plass justification”（Knuth–Plass两端对齐）：“Every way to break the paragraph. At once.”（同时考虑整段的所有断行方式。）左边，一段讲断行的英文按浏览器的首次适配方式排出，最松的几行标红。下方，每个词成为一条线上的一个点：红色弧线是贪心断点，淡蓝色弧线尝试所有可行断点，金色路径选出最佳组合。右边是Knuth–Plass版本，间距均匀，每行标出劣度，并给出公式“(1 + badness + penalty)²”和更低的缺陷值总和。",
        narration: "浏览器以贪心方式断行，一次一行。Postext使用Knuth–Plass，也就是TeX背后的算法。它权衡整段所有可能的断行方式，保留最均匀的那一种。",
      },
      {
        time: "1:24",
        scene: "第06节“One layout, three renderers”（一次排版，三种渲染）：“What you see is what goes to press.”（所见即所印。）在代码行const vdt = buildDocument(content, config);下方，一页分成三页。Canvas（renderToCanvas()，像素级精确的位图）配一个放大镜，显示像素网格；HTML（renderToHtml()，可选中、随尺寸自适应）给每个块加上边框和<h1>、<p>、<figure>等标签；PDF（renderToPdf()，可付印、PDF/UA、CMYK）的四块分色版滑动对准套印，随后出现裁切标记和色标条。",
        narration: "一次排版，三种渲染器：canvas、HTML和可付印的PDF。所见即所印。",
      },
      {
        time: "1:35",
        scene: "第07节“Why an open standard”（为什么需要开放标准）：“LaTeX set the bar for print. Publishing now lives on every screen, too.”（LaTeX为印刷树立了标杆，如今出版也存在于每一块屏幕上。）两张卡片：LaTeX（1984）一侧逐条打叉：为印刷页面而设计；构建依赖某台机器的字体与宏包；编译、等待、重复；网页上没有编辑级排版。Postext（2026）一侧逐条打勾：一次排版输出网页、canvas与付印级PDF；一个可移植的.postext文件承载一切；边输入边实时重排；任何浏览器即可运行，无需服务器，MIT许可。Postext卡片亮起。",
        narration: "LaTeX为印刷树立了标准。但如今，出版存在于每一块屏幕上。",
      },
      {
        time: "1:41",
        scene: "小标题“One file, the whole book”（一个文件，整本书），标题“An open standard for publishing, beyond where LaTeX reaches.”（一个开放的出版标准，走到LaTeX未及之处。）一个.postext文件图标展开成五部分：preset.json（配置与设计）、chapters/*.md（每章一个Markdown文件）、fonts/*.woff2（字体文件本身）、images/ · SVG（所有图片，全部内嵌）和resources（表格、图片与图注）。说明文字：“A plain ZIP: open, documented, MIT-licensed. Any tool can read and write it.”（一个普通的ZIP：开放、有文档、MIT许可，任何工具都能读写。）",
        narration: "Postext是一个开放标准：一个可移植的文件，有完整文档，采用MIT许可，任何工具都能读写。",
      },
      {
        time: "1:51",
        scene: "“The showcase · set by the real engine”（案例 · 由真实引擎排版）：一面书页墙在透视中后退，计数器升到48页。文字：“12 chapters, 3 parts, a cover, laid out in about half a second. Every page of the Postext guide, computed in a browser by postext v1.7.0 for this film. Nothing placed by hand.”（12章、3个部分、一个封面，排版约需半秒；Postext指南的每一页都由postext v1.7.0在浏览器中为本片计算生成，无一手工摆放。）随后出现标签：Textbooks、Magazines、Literary editions、Catalogues（教材、杂志、文学版本、展览图录）。",
        narration: "正因如此，它能在十分之几秒内排完数百页的书。",
      },
      {
        time: "1:58",
        scene: "片尾：Postext标志和标语“The programmable typesetter for the web”（为网页而生的可编程排版引擎），网址postext.dev，一行终端命令打出“$ pnpm add postext”，页脚为“Open source · MIT · github.com/drnachio/postext”。",
        narration: "Postext。开源，访问postext.dev。",
      },
    ],
  },
  tutorial: {
    en: [
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
        scene: "Step 05, the sandbox: “Check it, page by page.” A browser window types the address postext.dev/sandbox. The pointer clicks Books in the side bar, then New, then “Open a .postext file…”; the file flies in, “My book, 12 chapters · 184 pages” appears at the top of the list and its first pages open in the Canvas view.",
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
        scene: "Chips light up for Correct, Extend and Translate above a row of book pages: a line is highlighted and a shimmer crosses the pages, two more pages slide in, and the pages flip over to the Spanish edition. A request types out: “Add a Spanish edition: translate the chapters, captions and diagram labels, and keep the same design.” Caption: “Same rules. New content. Pages set themselves.” Then “One file, the whole book.”: a .postext icon branches to a page with crop marks (Print-ready PDF), a browser window (Web reader) and a pair of pages (Every page, set).",
        narration: "So when your content changes, when you correct it, extend it or translate it, you don't have to think about the layout. Postext sets it again, following the same rules. One file for the whole book: a print-ready PDF, a reader for the web, and pages that set themselves.",
      },
      {
        time: "5:01",
        scene: "End card: the Postext logo, the tagline “The programmable typesetter for the web”, postext.dev, a pill reading “The prompts from this video are in the description ↓” and the footer “Open source · MIT · github.com/drnachio/postext”.",
        narration: "Postext. Open source, at postext.dev. You'll find the example prompts in the description.",
      },
    ],
    es: [
      {
        time: "0:00",
        scene: "Cabecera: el logotipo de Postext, el rótulo «Tutorial · 5 pasos» y el título «Convierte tu publicación en Postext con un agente de IA. Sin programar.»",
      },
      {
        time: "0:03",
        scene: "«Tu publicación ya existe.» Tres páginas compuestas con Postext, un libro, un manual y una revista, caen una tras otra con sus etiquetas: InDesign (IDML), Word (DOCX) y PDF. Se agrupan a la izquierda, una flecha dorada discontinua pasa por una insignia «Agente de IA» y aparece un icono de archivo, mi-libro.postext, bajo «Un agente la convierte en Postext. Cinco pasos. Unas cuantas peticiones bien escritas.»",
        narration: "Ya tienes una publicación: un libro, un manual, una revista. Vive en InDesign, en Word o en un PDF. En este tutorial, un agente de inteligencia artificial la convertirá en Postext por ti. Sin programar: cinco pasos y unas cuantas peticiones bien escritas.",
      },
      {
        time: "0:23",
        scene: "«El plan»: cinco tarjetas numeradas aparecen a medida que se nombra cada paso: 01 Prepara la carpeta, 02 Reúne los originales vectoriales, 03 Añade una referencia, 04 Pídeselo al agente, 05 Revisa en el sandbox.",
        narration: "El plan: preparar la carpeta, reunir los originales vectoriales, añadir una referencia, pedírselo al agente y revisar el resultado.",
      },
      {
        time: "0:35",
        scene: "Paso 01, la carpeta: «Un proyecto, una carpeta.» Una carpeta grande, mi-libro/, flota entre diez archivos sueltos como MinionPro-Regular.otf, portada.jpg, fig-2-1.ai, capitulo-01.docx, mapa.svg, libro.idml y grafico.pdf. Se abre una ventana con el árbol de la carpeta y cada archivo vuela a su subcarpeta al nombrarse: referencia.pdf (cómo debe quedar, paso 03), fuentes/ (Minion Pro, Myriad…, .otf .ttf .woff2), imagenes/ (fotografías, .jpg .png), ilustraciones/ (originales vectoriales, .ai .svg .pdf) y textos/ (Word, InDesign IDML…).",
        narration: "Paso uno: reúne todo en una sola carpeta en tu ordenador. Un proyecto, una carpeta. Dentro, dale a cada tipo de material su propia subcarpeta: las tipografías, las imágenes, las ilustraciones y los textos.",
      },
      {
        time: "0:51",
        scene: "La fila fuentes/ se resalta y una tarjeta titulada «Tipografías» muestra un «Aa» grande, los estilos Redonda, Cursiva y Negrita, los formatos OTF, TTF y WOFF2 y la nota «Solo se pueden usar las que incluyas.» Después, «Cuanto más ordenada, menos adivina.», mientras cada subcarpeta del árbol recibe una marca.",
        narration: "No te olvides de las tipografías: son la voz del diseño, y el agente solo puede usar las que incluyas. Cuanto más ordenada esté la carpeta, menos tendrá que adivinar el agente.",
      },
      {
        time: "1:04",
        scene: "Paso 02, originales vectoriales: «Reúne los originales.» Un diagrama, un gráfico y un mapa se dibujan en trazo, con sus puntos de ancla a la vista, y aparecen tres iconos de archivo: .ai Illustrator, .svg SVG y .pdf PDF.",
        narration: "Paso dos: si tus ilustraciones son vectoriales, como diagramas, gráficos o mapas, busca los archivos originales: Illustrator, SVG o PDF.",
      },
      {
        time: "1:15",
        scene: "Dos paneles muestran la misma figura, un diagrama en el que Manuscrito y Plantilla apuntan a Páginas, con el pie «Fig. 2.1 Contenido y diseño se encuentran.» A la izquierda, «Recortada del PDF: una foto del dibujo» se vuelve borrosa y pixelada al ampliarse; a la derecha, «El original: el dibujo mismo» sigue nítido. El panel izquierdo se apaga, los rótulos del original se reescriben en inglés (Manuscript, Template, Pages), unas marcas de corte lo enmarcan y tres marcas dicen «Nítida a cualquier tamaño», «Rótulos como texto real» y «Original → imprenta».",
        narration: "Una figura recortada del PDF final es poco más que una foto del dibujo. El original es el dibujo mismo. Con el original, el agente recompone cada figura: nítida a cualquier tamaño, con sus rótulos como texto real, listos para traducir. Y en imprenta, el original va tal cual.",
      },
      {
        time: "1:37",
        scene: "Paso 03, la referencia: «Muestra cómo debe quedar.» En el árbol de la carpeta se resalta referencia.pdf con la etiqueta «En la raíz»; de él sale una página que se convierte en una página de libro grande, a dos columnas, marcada referencia.pdf.",
        narration: "El paso tres es esencial: en la raíz de la carpeta, pon un archivo que muestre con claridad cómo debe verse el producto final. Lo ideal es un PDF.",
      },
      {
        time: "1:47",
        scene: "Sobre la página aparecen las medidas: el contorno de las columnas, un medianil de 9 mm, un margen de 20 mm, etiquetas para el título (Fraunces 28 pt), el texto (Lora 9,4/13,6 pt) y un recuadro (fondo, 1 filete), y las líneas base con un interlineado de 13,6 pt. Un archivo, ficha-de-especificaciones.md, se va rellenando: página 210 × 280 mm; márgenes 24 · 20 · 22 · 20 mm, simétricos; 2 columnas, medianil 9 mm; retícula base 13,6 pt; texto Lora 9,4 / 13,6 pt, justificado; títulos Fraunces 28 pt · Geist; aperturas con banda de color de 101 mm; recuadros con fondo y filete izquierdo. Después la palabra «Adivinar» se tacha y «Medir.» se enciende en dorado.",
        narration: "El agente lee el diseño en esas páginas: mide márgenes, columnas, tipografías y espacios, y los anota como reglas de maquetación. Sin referencia, tendría que adivinar. Con ella, mide.",
      },
      {
        time: "2:03",
        scene: "Paso 04, el agente: «Pídeselo con tus palabras.» Se abre una ventana titulada «Agente · ~/mi-libro» junto a las insignias Claude Code, Codex y «o cualquier otro agente». En la ventana se escribe un mensaje firmado TÚ: «Instala la skill de Postext: `npx skills add drnachio/postext --skill postext-port`», y el agente responde «✓ Skill instalada: postext-port». Una tarjeta de la skill postext-port enumera «Un método probado», «Todo sobre Postext» y «Herramientas para revisar su trabajo».",
        narration: "Paso cuatro: abre tu agente, Claude Code, Codex o el que uses, en esa carpeta, y pídele que instale la skill de Postext. Una skill es un paquete de conocimiento experto. Esta le enseña al agente a convertir una publicación a Postext, y le da herramientas para revisar su propio trabajo.",
      },
      {
        time: "2:24",
        scene: "Se escribe la siguiente petición: «Usa la skill postext-port para convertir este libro a Postext. El diseño está en referencia.pdf, las tipografías en fuentes/ y las ilustraciones originales en ilustraciones/: úsalas en lugar de recortar las figuras del PDF. Empieza solo por el capítulo 1 y enséñame la ficha de especificaciones antes de construirlo.» Al lado, referencia.pdf, fuentes/ e ilustraciones/ se iluminan en el árbol de la carpeta a medida que el mensaje las nombra, y aparece una tarjeta con «Cap. 1».",
        narration: "Después, pídele lo que quieres con tus palabras. Dile dónde están la referencia, las tipografías y los originales, y que empiece por un solo capítulo.",
      },
      {
        time: "2:37",
        scene: "Una cuadrícula de doce páginas atenuadas; la primera se recuadra en dorado. Una flecha circular cuenta las vueltas de depuración sobre ella hasta que aparece una marca, y entonces se iluminan las otras once. Debajo: Capítulo de muestra → Depurar → Extender.",
        narration: "Si el contenido es largo, empieza por un capítulo de muestra. Depúralo hasta que esté perfecto, y solo entonces extiéndelo al resto.",
      },
      {
        time: "2:46",
        scene: "El agente pregunta «¿Copia fiel o rediseño?», «¿Qué idiomas?» y «¿Papel, pantalla o ambos?». Una lista de tareas avanza por Hacer inventario, Medir el diseño, Extraer el texto, Tipografías e imágenes, Comparar página a página y Empaquetar el archivo, y aparece el archivo mi-libro.postext. Se escribe una tercera petición: «El capítulo 1 está aprobado. Convierte el resto de capítulos con el mismo diseño, compara cada uno con referencia.pdf y empaquétalo todo en un único archivo .postext.» El agente responde «✓ 12 capítulos · 0 avisos · mi-libro.postext».",
        narration: "El agente te hará unas preguntas: copia fiel o rediseño, qué idiomas, papel o pantalla. Después mide, extrae, ensambla y comprueba, y te entrega un archivo Postext. Cuando la muestra esté bien, extenderla al libro entero es solo una petición más.",
      },
      {
        time: "3:11",
        scene: "Paso 05, el sandbox: «Revísalo página a página.» En una ventana de navegador se escribe la dirección postext.dev/es/sandbox. El puntero pulsa Libros en la barra lateral, luego Nuevo y luego «Abrir un archivo .postext…»; el archivo entra volando, «Mi libro, 12 capítulos · 184 páginas» aparece arriba de la lista y sus primeras páginas se abren en la vista Canvas.",
        narration: "Paso cinco: abre el sandbox de Postext, en postext.dev. En Libros, elige Nuevo y abre tu archivo.",
      },
      {
        time: "3:20",
        scene: "La página de referencia y la de Postext quedan una junto a otra, rotuladas Referencia y Postext, y una línea dorada las recorre de arriba abajo. Se abre el panel Revisión con un contador de 3 y la lista Viuda (p. 4), Línea abierta (p. 7) y La figura no cabe (p. 9); unos recuadros rojos marcan cada problema en la página de Postext.",
        narration: "Revísalo página a página junto a tu referencia. El panel Revisión te señala los problemas: viudas, líneas abiertas, figuras que no caben.",
      },
      {
        time: "3:31",
        scene: "Dos filas de páginas esquemáticas, «Referencia · PDF» y «Postext · fluido». En la fila fluida, una figura viaja de la primera página a la cabeza de la segunda y una línea discontinua une sus dos posiciones. Texto: «Las mismas reglas, no las mismas páginas. El contenido fluye: una figura o un salto de página pueden caer en otro sitio.» Después, un signo igual une cada pareja de páginas bajo «Lo que debe coincidir»: Márgenes y retícula base, Tipografía, Estilo de figuras y recuadros, Páginas limpias: sin viudas, columnas equilibradas. Un panel rojo con el signo ≠ dice «Decisiones artesanales a mano: no son reglas, no sirven para contenido que cambia».",
        narration: "Ten en cuenta una cosa: las páginas no tienen por qué ser idénticas a las del PDF. Postext ha entendido las reglas de maquetación y tu contenido ahora es fluido, así que una figura o un salto de página pueden caer en otro sitio. Lo que debe coincidir es la calidad: los mismos valores de producción. Cuando maquetamos a mano, tomamos pequeñas decisiones de artesanía que no son reglas. Y solo con reglas se puede maquetar un contenido que cambia.",
      },
      {
        time: "4:01",
        scene: "Vuelve la ventana del agente con una cuarta petición: «En el sandbox, capítulo 2, página 7: el recuadro «Recuerda» se parte en dos columnas y falta la cornisa. Revisión marca 3 líneas abiertas. Corrígelo y vuelve a empaquetar el archivo.» Se adjunta una captura, captura-cap2-p7.png. Después, un bucle entre Sandbox (revisar) y Agente (corregir) da las vueltas 1 a 3 mientras el número de avisos baja de 3 a 0, y termina con una marca y «Perfecto.»",
        narration: "Luego cuéntale al agente lo que ves, con la mayor precisión posible: el capítulo, la página y qué falla. Una captura de pantalla ayuda. Abre la nueva versión, vuelve a revisar y repite. Cada vuelta se acerca más, hasta que queda perfecto.",
      },
      {
        time: "4:20",
        scene: "«No solo una versión Postext.» El archivo mi-libro.postext se parte en dos por una línea dorada. A la izquierda, Contenido (qué dice): chapters/es/02-la-celula.md, con el título «La célula», una frase que cita la figura fig-celula y un recuadro «recuerda». A la derecha, Forma (cómo se ve): una plantilla deducida de tu original, con página de 210 × 280 mm simétrica, 2 columnas con medianil de 9 mm, texto Lora 9,4/13,6 justificado, títulos en Fraunces numerados, recuadros «recuerda» con fondo y filete, y figuras a la cabeza de columna.",
        narration: "Y esto es lo mejor: no solo tienes tu contenido en Postext. Has separado el contenido de la forma. El texto vive en capítulos limpios; el diseño, en una plantilla con las reglas de maquetación deducidas de tu original.",
      },
      {
        time: "4:35",
        scene: "Se encienden las pastillas Corregir, Ampliar y Traducir sobre una fila de páginas: se resalta una línea y un destello recorre las páginas, entran dos páginas más y las páginas se dan la vuelta para mostrar la edición en inglés. Se escribe una petición: «Añade una edición en inglés: traduce los capítulos, los pies de figura y los rótulos de los diagramas, y mantén el mismo diseño.» Pie: «Mismas reglas. Contenido nuevo. Las páginas se componen solas.» Después, «Un archivo, todo el libro.»: un icono .postext se ramifica hacia una página con marcas de corte (PDF para imprenta), una ventana de navegador (Lector web) y una pareja de páginas (Cada página, compuesta).",
        narration: "Así, cuando tu contenido cambie, cuando lo corrijas, lo amplíes o lo traduzcas, no tendrás que preocuparte por el formato. Postext lo vuelve a componer con las mismas reglas. Un solo archivo para todo el libro: un PDF listo para imprenta, un lector para la web y páginas que se componen solas.",
      },
      {
        time: "4:57",
        scene: "Cierre: el logotipo de Postext, el lema «El tipógrafo programable para la web», postext.dev, una pastilla con «Los prompts de este vídeo están en la descripción ↓» y el pie «Código abierto · MIT · github.com/drnachio/postext».",
        narration: "Postext. Código abierto, en postext.dev. Tienes los prompts de ejemplo en la descripción.",
      },
    ],
    zh: [
      {
        time: "0:00",
        scene: "片头：Postext标志、小标题“Tutorial · 5 steps”（教程 · 5个步骤）和标题“Turn your publication into Postext with an AI agent. No code.”（用AI智能体把你的出版物转换成Postext，无需编程。）",
      },
      {
        time: "0:03",
        scene: "“Your publication already exists.”（你的出版物已经存在。）三张由Postext排版的页面，一本书、一本手册和一本杂志，依次落下，分别标着InDesign（IDML）、Word（DOCX）和PDF。它们聚到左侧，一条金色虚线箭头穿过“AI agent”（AI智能体）徽标，随后出现名为my-book.postext的文件图标，上方写着“An agent turns it into Postext. Five steps. A few well-written requests.”（智能体把它转换成Postext。五个步骤，几条写得清楚的请求。）",
        narration: "你已经有一份出版物：一本书、一本手册、一本杂志。它存在于InDesign、Word或PDF中。在本教程中，一个AI智能体会替你把它转换成Postext。无需编程：只要五个步骤和几条写得清楚的请求。",
      },
      {
        time: "0:23",
        scene: "“The plan”（计划）：每说到一个步骤，就出现一张编号卡片：01 Prepare the folder（准备文件夹）、02 Bring the vector originals（带上矢量原稿）、03 Add a reference（加入参考）、04 Ask the agent（向智能体提出请求）、05 Check in the sandbox（在沙盒中检查）。",
        narration: "计划是这样的：准备文件夹，带上原始图稿，加入一份参考，向智能体提出请求，然后检查结果。",
      },
      {
        time: "0:33",
        scene: "第01步，文件夹：“One project, one folder.”（一个项目，一个文件夹。）一个大文件夹my-book/悬浮在十个散乱的文件之间，例如MinionPro-Regular.otf、cover.jpg、fig-2-1.ai、chapter-01.docx、map.svg、book.idml和chart.pdf。一个窗口打开，显示文件夹树，每说到一类材料，对应的文件就飞进子文件夹：reference.pdf（成品应有的样子，见第03步）、fonts/（Minion Pro、Myriad等，.otf .ttf .woff2）、images/（照片，.jpg .png）、artwork/（矢量原稿，.ai .svg .pdf）和text/（Word、InDesign IDML等）。",
        narration: "第一步：把所有东西放进电脑上的同一个文件夹。一个项目，一个文件夹。在里面，给每类材料单独建一个子文件夹：字体、图片、插图和文本文件。",
      },
      {
        time: "0:50",
        scene: "fonts/一行被高亮，一张题为“Fonts”（字体）的卡片显示一个大大的“Aa”、Regular、Italic、Bold三种字形（常规、斜体、粗体）、OTF、TTF、WOFF2三种格式，以及说明“Only the fonts you include can be used.”（只能使用你提供的字体。）接着出现“The tidier the folder, the less it guesses.”（文件夹越整齐，它猜得越少。），文件夹树中的每个子文件夹都打上对勾。",
        narration: "别忘了字体。字体赋予设计声音，而智能体只能使用你提供的字体。文件夹越整齐，智能体需要猜测的就越少。",
      },
      {
        time: "1:03",
        scene: "第02步，矢量原稿：“Bring the originals.”（带上原稿。）一幅示意图、一张图表和一张地图以线稿绘出，露出锚点，随后出现三个文件图标：.ai Illustrator、.svg SVG和.pdf PDF。",
        narration: "第二步：如果你的插图是矢量图形，比如示意图、图表或地图，请找到原始文件：Illustrator、SVG或PDF。",
      },
      {
        time: "1:14",
        scene: "两个面板展示同一张图：Manuscript（书稿）和Template（模板）都指向Pages（页面）的示意图，图注为“Fig. 2.1 Content and design meet.”（图2.1 内容与设计相遇）。左边“Cut from the PDF: a photo of the drawing”（从PDF裁下：图的照片）随着放大变得模糊、出现马赛克；右边“The original: the drawing itself”（原稿：图本身）始终清晰。左侧面板淡出，原稿上的标签被重新输入为西班牙语（Manuscrito、Plantilla、Páginas），四角出现裁切标记，三条带对勾的文字依次出现：“Sharp at any size”（任意尺寸都清晰）、“Labels are live text”（标签是真正的文字）、“Print master → press”（印刷原稿直接付印）。",
        narration: "从成品PDF里裁下来的图，不过是这幅图的一张照片。原始文件才是图本身。有了它，智能体可以重建每一张图：任意尺寸都清晰，标签仍是真正的文字，随时可以翻译。用于印刷时，原始文件原封不动地送去付印。",
      },
      {
        time: "1:37",
        scene: "第03步，参考：“Show how it should look.”（展示它应有的样子。）文件夹树中的reference.pdf被高亮，并标上“In the root”（在根目录）；一张页面从中飞出，放大成一张标有reference.pdf的双栏书页。",
        narration: "第三步至关重要：在文件夹的根目录，放一个能清楚展示成品应有样子的文件。PDF最理想。",
      },
      {
        time: "1:47",
        scene: "页面上出现各种测量：栏框、9 mm栏间距、20 mm页边距，标题（Fraunces 28 pt）、正文（Lora 9.4/13.6 pt）和提示框（底色加一条线）的标注，以及行距13.6 pt的基线。一个名为spec-sheet.md的文件逐行填写：页面210 × 280 mm；页边距24 · 20 · 22 · 20 mm，左右对称；2栏，栏间距9 mm；基线网格13.6 pt；正文Lora 9.4 / 13.6 pt，两端对齐；标题Fraunces 28 pt · Geist；章首页带101 mm色带；提示框为底色加左侧竖线。随后“Guess”（猜）被划掉，“Measure.”（测量）以金色亮起。",
        narration: "智能体从这些页面中读取设计。它测量页边距、分栏、字体和间距，并把它们记录为排版规则。没有参考，它只能猜；有了参考，它就能测量。",
      },
      {
        time: "2:03",
        scene: "第04步，智能体：“Ask for it in plain words.”（用平实的话提出请求。）一个标题为“Agent · ~/my-book”的窗口打开，旁边是Claude Code、Codex和“or any other agent”（或任何其他智能体）几个徽标。YOU（你）发出的消息逐字打出：“Install the Postext skill: `npx skills add drnachio/postext --skill postext-port`”（安装Postext技能），智能体回答“✓ Skill installed: postext-port”（技能已安装）。一张postext-port技能卡片列出“A proven workflow”（成熟的工作流程）、“Everything about Postext”（关于Postext的一切）和“Tools to check its own work”（检查自身工作的工具）。",
        narration: "第四步：在那个文件夹里打开你的智能体，Claude Code、Codex或你用的任何一个，让它安装Postext技能。技能是一套专家知识包。这一个教智能体如何把出版物转换成Postext，并给它检查自己工作的工具。",
      },
      {
        time: "2:24",
        scene: "下一条请求逐字打出：“Use the postext-port skill to convert this book to Postext. The design is in reference.pdf, the fonts are in fonts/ and the original illustrations are in artwork/: use them instead of cutting figures out of the PDF. Start with chapter 1 only, and show me the spec sheet before you build it.”（大意：用postext-port技能把这本书转换成Postext；设计在reference.pdf，字体在fonts/，原始插图在artwork/，请使用它们而不是从PDF里裁图；先只做第1章，动手之前先给我看规格表。）旁边的文件夹树中，reference.pdf、fonts/和artwork/随着消息提到它们依次亮起，并弹出一张写着“Ch. 1”（第1章）的卡片。",
        narration: "然后用平实的话说出你想要什么。告诉它参考文件、字体和原始图稿在哪里，并让它先从一个章节开始。",
      },
      {
        time: "2:37",
        scene: "一个由十二张暗淡书页组成的网格，第一张被金色框住。一个环形箭头在它上面计数打磨的轮次，直到出现对勾，然后其余十一张依次亮起。下方：Sample chapter → Polish → Extend（样章 → 打磨 → 扩展）。",
        narration: "如果内容很长，先做一个样章。把它打磨到完美，然后再扩展到其余部分。",
      },
      {
        time: "2:46",
        scene: "智能体提问：“Faithful copy or redesign?”（忠实复刻还是重新设计？）、“Which languages?”（哪些语言？）、“Print, screen, or both?”（印刷、屏幕，还是两者兼有？）。一份清单依次完成Take inventory、Measure the design、Extract the text、Fonts and images、Compare page by page、Pack the file（清点材料、测量设计、提取文本、字体与图片、逐页比对、打包文件），随后出现文件my-book.postext。第三条请求逐字打出：“Chapter 1 is approved. Convert the remaining chapters with the same design, compare each one with reference.pdf, and pack everything into a single .postext file.”（大意：第1章已通过；用同样的设计转换其余章节，逐一与reference.pdf比对，全部打包成一个.postext文件。）智能体回复“✓ 12 chapters · 0 warnings · my-book.postext”（12章，0条警告）。",
        narration: "智能体会问几个问题：忠实复刻还是重新设计，哪些语言，印刷还是屏幕。然后它会测量、提取、组装并检查，最后交给你一个Postext文件。样章做好之后，扩展到整本书只需再提一个请求。",
      },
      {
        time: "3:14",
        scene: "第05步，沙盒：“Check it, page by page.”（逐页检查。）浏览器窗口中输入地址postext.dev/sandbox。指针先点侧栏的Books（书籍），再点New（新建），然后点“Open a .postext file…”（打开.postext文件）；文件飞入，“My book, 12 chapters · 184 pages”（我的书，12章，184页）出现在列表顶部，前几页在Canvas视图中打开。",
        narration: "第五步：打开postext.dev上的Postext沙盒。在Books中选择New，然后打开你的文件。",
      },
      {
        time: "3:24",
        scene: "参考页面和Postext页面并排摆放，分别标为Reference（参考）和Postext，一条金线从上到下扫过两页。Checks（检查）面板打开，角标显示3，列出Widow（寡行，p. 4）、Loose line（松散行，p. 7）和Figure does not fit（图放不下，p. 9）；Postext页面上用红框标出每个问题。",
        narration: "对照你的参考，一页一页地检查。Checks面板会为你指出问题：寡行、松散的行、放不下的图。",
      },
      {
        time: "3:35",
        scene: "两排页面线框图：“Reference · PDF”（参考 · PDF）和“Postext · reflowed”（Postext · 重排后）。在重排的一排里，一张图从第一页移到第二页顶部，一条虚线连起它的两个位置。文字：“Same rules, not the same pages. The content flows: a figure or a page break may land elsewhere.”（规则相同，页面不必相同；内容是流动的，图片或分页可能落在别处。）接着，每对页面之间出现一个等号，上方标题为“What must match”（必须一致的）：页边距与基线网格、字体排印、图片与提示框样式、干净的页面（没有寡行，各栏齐平）。一个带≠符号的红色面板写着“Hand-made craft decisions: not rules, so they can’t set changing content”（手工的工艺决定不是规则，无法排版不断变化的内容）。",
        narration: "有一点要记住：页面不必与你的PDF完全相同。Postext已经学会了排版规则，你的内容现在是流动的，所以图片或分页可能落在别的位置。应该一致的是质量：同样的制作水准。手工排版时，我们会做一些并非规则的细小工艺决定。而只有规则才能排版不断变化的内容。",
      },
      {
        time: "4:03",
        scene: "智能体窗口再次出现，第四条请求逐字打出：“In the sandbox, chapter 2, page 7: the “Remember” box is split across two columns, and the running head is missing. Checks shows 3 loose lines. Fix it and pack the file again.”（大意：在沙盒第2章第7页，“Remember”提示框被拆到两栏，书眉缺失；Checks显示3处松散行；请修正并重新打包。）附上一张截图screenshot-ch2-p7.png。随后，Sandbox（check，检查）与Agent（fix，修正）之间的循环转过第1到第3轮，警告数从3降到0，最后出现对勾和“Exactly right.”（完全正确。）",
        narration: "然后尽可能准确地告诉智能体你看到了什么：哪一章、哪一页、哪里有问题。附上截图会有帮助。打开新版本，再检查一遍，重复这个过程。每一轮都更接近，直到完全正确。",
      },
      {
        time: "4:23",
        scene: "“Not just a Postext version.”（不只是一个Postext版本。）文件my-book.postext沿一条金线一分为二。左边是Content（内容，“what it says”）：chapters/en/02-the-cell.md，含标题“The cell”（细胞）、一句引用图fig-cell的文字和一个“remember”提示框。右边是Form（形式，“how it looks”）：从原件推导出的模板，包括210 × 280 mm对称页面、2栏9 mm栏间距、Lora 9.4/13.6两端对齐正文、带编号的Fraunces标题、带底色和竖线的“remember”提示框，以及浮动到栏顶的图片。",
        narration: "最棒的是：你得到的不只是内容的Postext版本。你把内容和形式分开了。文本存放在干净的章节里。设计存放在一个模板里，其排版规则是从你的原件中推导出来的。",
      },
      {
        time: "4:39",
        scene: "一排书页上方，Correct、Extend、Translate（修改、扩充、翻译）三个标签依次亮起：一行被高亮，一道光扫过书页；又滑入两页；随后书页翻转为西班牙语版。一条请求逐字打出：“Add a Spanish edition: translate the chapters, captions and diagram labels, and keep the same design.”（大意：增加西班牙语版，翻译各章、图注和示意图标签，保持同样的设计。）说明文字：“Same rules. New content. Pages set themselves.”（规则不变，内容更新，页面自动排好。）接着是“One file, the whole book.”（一个文件，整本书）：一个.postext图标分出三支，分别通向一张带裁切标记的页面（Print-ready PDF，可付印PDF）、一个浏览器窗口（Web reader，网页阅读器）和一对页面（Every page, set，每一页都已排好）。",
        narration: "所以当你的内容发生变化，当你修改、扩充或翻译它时，你不必考虑排版。Postext会按照同样的规则重新排版。一个文件承载整本书：可付印的PDF、网页阅读器，以及自动排好的页面。",
      },
      {
        time: "5:01",
        scene: "片尾：Postext标志、标语“The programmable typesetter for the web”（为网页而生的可编程排版引擎）、postext.dev、一个写着“The prompts from this video are in the description ↓”（本视频中的提示词见说明）的胶囊框，以及页脚“Open source · MIT · github.com/drnachio/postext”。",
        narration: "Postext。开源，访问postext.dev。示例提示词见视频说明。",
      },
    ],
  },
};
