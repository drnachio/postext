/**
 * Text alternatives for the narrated videos (WCAG 1.2.3 and 1.2.8): what is said, verbatim from the captions, and
 * what is shown, from the animation sources. One list of blocks per video and locale; each follows its own cut. The
 * Spanish and Chinese cuts have their own narration, timings and on-screen text, and the Chinese one is set vertically
 * (竖排), with scenes of its own where the English film is about space-separated text.
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
        scene: "全片竖排，文字自上而下、自右向左读。深色画面右侧，一道金色细线下竖写着“毕昇 · 约1045”。一个个活字从上方落进字格，排成三列竖行，从右往左依次是“从毕昇的活字到今天，”“印刷术用了近千年，”“学会排好一页。”，最后一列为金色。背后，年份以巨大的空心数字从1045跳到2026，四周落下排版行话：避头尾、标点挤压、版心、孤字、栏距、天头、字格、中西间距、开明式、竖排、书眉、行长。镜头推进末尾竖排的句号，金色铺满画面。",
        narration: "从毕昇的活字到今天，印刷术用了近千年，学会如何排好一页。",
      },
      {
        time: "0:08",
        scene: "两列竖排标题：“网页学会了布局界面，”“却从未学会排好一页。”，第二列为红色。地址为example.com/longform/article的浏览器窗口里，是一篇三栏横排的中文文章，题为“为什么网页排不好一页”，按浏览器的方式逐行塞满。随着旁白，红色标记依次落在问题上，标签为：标点在行首、段末孤字、标点不挤压（引号和句号各占一整格）、中西文挤在一起（Postext和HTML前后不留空隙）、分栏失衡（第三栏只有两行）。旁边的代码块写着“column-count: 3;”，下面是“……仅此而已。”和一份逐项打叉的清单，列着同样五个问题。窗口闪烁失真，随即坍缩消失。",
        narration: "网页学会了布局界面，却从未学会排好一页。所以网页上的中文长文依然粗糙：标点跑到行首，段末只剩一个孤字，标点不挤压，中西文挤在一起。",
      },
      {
        time: "0:25",
        scene: "白光一闪，蓝、金、红三道条纹扫过，Postext标志和字标升起，下方是标语“为网页而生的可编程排版引擎”，“可编程”为金色。再下面一行是“开源 · MIT 许可 · v1.11.1 · 在浏览器中运行”。",
        narration: "这就是Postext：为网页而生的可编程排版引擎。",
      },
      {
        time: "0:32",
        scene: "从这里起，每一节的节标题都竖排在画面右缘，内容排在它的左边。第01/07节“01 · 内容输入”：“Markdown 只描述内容是什么。”Markdown文件03-why-postext.md逐字打出：一条部分指令{number=\"I\" title=\"基础\"}、带导语的标题“# 为什么是 Postext”、一段用:ref引用图fig-flow的中文、一行::resource和一个:::callout块，块里写着“改一个词：页面会自动重排。”。旁边的config.ts调用buildDocument，设置双栏版式、两端对齐和断词，下方写着“配置决定它们的样子。排版决策从不写进正文。”",
        narration: "你用语义化的Markdown写作，它只描述内容是什么，配置决定它的样子。",
      },
      {
        time: "0:39",
        scene: "第02节“02 · PRETEXT 测量”：“测量文本，无需触碰 DOM。”标题“为什么是 Postext”、一段正文和一个提示框依次被扫描，尺寸线标出它们以pt为单位的高度；代码面板显示prepare(text, '25px Lora')和layout(prepared, width, 38)，返回高度和行数。两条进度条比赛处理10,000段：“浏览器重排 · DOM”几乎不动，“PRETEXT · CANVAS 度量 + 算术”瞬间填满；计数器升到600×，配文“比 DOM 更快的文本测量，整本书随着输入实时重排。”和“基于 @chenglou/pretext”。",
        narration: "每个段落都在不触碰DOM的情况下完成测量，速度最高快六百倍。这要归功于Pretext，是这个库让这一切成为可能。",
      },
      {
        time: "0:50",
        scene: "第03节“03 · POSTEXT 决策”：“绘制任何像素之前，每一行都已就位。”一个七段圆环依次亮起：结构、测量、放置、浮动、精修、平衡、节奏，每段配一句说明，如“图片移到栏首或栏尾”“Knuth–Plass，杜绝寡行孤行”“对齐基线网格”。旁边，Postext指南中文竖排版的一页逐步组装：带标签的块飞入各栏，一张图移到位置上，旁注“:ref{id=\"fig-flow\"} → 栏底”，章首色带落下，文字行出现，各栏齐平（“分栏齐平”）。圆环循环迭代1到3次，显示“3 次迭代后稳定”和一个对勾；一个标注框给出其中一行的位置：行 · 页 · 栏。",
        narration: "接下来，由Postext做决定。七个步骤放置每一行、安排每一张图、平衡每一栏，循环往复，直到不再有任何变化。",
      },
      {
        time: "1:03",
        scene: "第04节“04 · 虚拟文档”：“改一个词。只重排改变的部分。”注释写着“就像 React 的虚拟 DOM，只不过面向页面：VDT，虚拟文档树。”中文竖排指南的七页（p. 7至p. 13）排成一行，从右往左读。光标在p. 11标出一处编辑，该栏其余部分变成金色，一小块溢到p. 12，p. 12随后打勾；之前的页面标为“跳过”，之后的标为“未变”。三条要点说明这条规则，标题为renderToHtmlIndexed()的面板把文档树中改动的节点标为“已修补”。",
        narration: "这一切都存在于一个虚拟文档中，就像React的虚拟DOM。改一个字，只会重排发生变化的部分。",
      },
      {
        time: "1:13",
        scene: "“长文档？只绘制屏幕上可见的部分。”一列书页滚过一个标有VIEWPORT的金色框，框的上下各留200像素余量：框内的页面完整绘制，框外的只是虚线轮廓。一个大计数器显示59页中此刻已绘制的页数，下面是“当前已绘制的页数”和“IntersectionObserver · +200 px”；旁边写着“几何：每一页。像素：只画你看到的。”和“页面滚入视口时绘制，离开视口时释放。”",
        narration: "而在一本长书里，只有屏幕上的页面才会被绘制。",
      },
      {
        time: "1:20",
        scene: "第05节“05 · 中文排版规范”：“每一行，都守中文的规矩。”同一段中文先按“浏览器 · 塞满就换行”的方式排出，随着旁白，问题逐一标红：句号和逗号落在行首，引号和句号各占一整格，Postext和汉字之间没有空隙，最后一行只剩一个字。接着，“POSTEXT · 中文排版规范”把同一段重新排好，下方四个标签依次亮起：避头尾、标点挤压、中西间距、不留孤字，每条规则改动的地方都标成金色。最后，浏览器那一栏让位给同样的文字，改成竖排，下方写着“竖排：同样的规则”。",
        narration: "浏览器断行只管把一行塞满，标点落在哪里都不管。Postext遵循中文排版规范：避头尾、标点挤压、中西文间距，绝不让段落以一个孤字收尾。横排竖排，都是一样的规则。",
      },
      {
        time: "1:38",
        scene: "第06节“06 · 一次排版，三种渲染”：“所见即所印。”在代码行const vdt = buildDocument(content, config);下方，中文竖排指南的一页分成三页。Canvas（renderToCanvas()，像素级精确的位图）配一个放大镜，显示像素网格；HTML（renderToHtml()，可选中、随尺寸自适应）给每个块加上边框和<h1>、<p>、<figure>等标签；PDF（renderToPdf()，可付印 · PDF/UA · CMYK）的四块分色版滑动对准套印，随后出现裁切标记和色标条。",
        narration: "一次排版，三种渲染：canvas、HTML以及可付印的PDF。所见即所印。",
      },
      {
        time: "1:47",
        scene: "第07节，节标题和两句话竖排在右缘：“07 · 为什么需要开放标准”“LaTeX 为印刷树立了标杆。”“如今，出版发生在每一块屏幕上。”两张卡片：LaTeX（1984）一侧逐条打叉：为印刷页面而设计；构建依赖某台机器的字体与宏包；编译、等待、重复；网页上没有编辑级排版。Postext（2026）一侧逐条打勾：一次排版，输出网页、canvas 与付印级 PDF；一个可移植的 .postext 文件承载一切；边输入边实时重排；任何浏览器即可运行 · 无需服务器 · MIT。Postext卡片亮起。",
        narration: "LaTeX为印刷树立了标杆，但如今，出版发生在每一块屏幕上。",
      },
      {
        time: "1:54",
        scene: "“07 · 一个文件，整本书”：“一个开放的出版标准，走到 LaTeX 未及之处。”一个.postext文件图标展开成五部分：preset.json（配置与设计）、chapters/*.md（每章一个 Markdown 文件）、fonts/*.woff2（字体文件本身）、images/ · SVG（所有图片，全部内嵌）和resources（表格、图片与图注）。底部写着“一个普通的 ZIP：开放、有文档、MIT 许可。任何工具都能读写它。”",
        narration: "Postext是一个开放标准，一个可移植的文件，有文档、采用MIT许可，任何工具都能读写。",
      },
      {
        time: "2:04",
        scene: "“案例 · 由真实引擎排版”：一面由中文竖排指南书页组成的墙在透视中后退，计数器升到59页。文字：“12 章、3 篇、竖排，排版仅需不到一秒。”“Postext 指南中文竖排版的每一页，都在浏览器中计算完成，由 postext 1.11.1 为本片生成。无一手工摆放。”随后出现标签：教材、杂志、文学版本、展览图录。",
        narration: "所以，数百页的书，零点几秒就能排好。",
      },
      {
        time: "2:12",
        scene: "片尾：Postext标志和标语“为网页而生的可编程排版引擎”，网址postext.dev，一行终端命令打出“$ pnpm add postext”，页脚为“开源 · MIT · GITHUB.COM/DRNACHIO/POSTEXT”。",
        narration: "Postext开源项目，网址postext.dev。",
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
        scene: "片头竖排：Postext标志下方，从右往左依次是小标题“教程 · 五个步骤”、标题“把你的出版物”“转换成 Postext”（金色），以及副标题“借助 AI 智能体，无需编程。”",
      },
      {
        time: "0:03",
        scene: "右缘竖写着“你的出版物已经存在。”三张中文页面依次落下：一本书、一本手册和一份红头公文，分别标着InDesign（IDML）、Word（DOCX）和PDF。三页聚到一起，一条金色虚线箭头穿过“AI 智能体”标签，指向一个名为“我的书.postext”的文件图标；右缘换成“智能体把它转换成 Postext。”和“五个步骤，几句写清楚的要求。”",
        narration: "你手上已经有一部出版物：一本书、一本手册、一份公文。它存在InDesign、Word或PDF里。在这个教程里，AI智能体会替你把它转换成Postext。不用写代码：五个步骤，再加几句写清楚的要求。",
      },
      {
        time: "0:23",
        scene: "“计划”：旁白每说出一步，就出现一张编号卡片：01 整理文件夹、02 找齐矢量原稿、03 放一份参照样张、04 交给智能体、05 在沙盒里检查。",
        narration: "计划是这样的：整理文件夹、找齐矢量原稿、放一份参照样张、交给智能体，最后检查结果。",
      },
      {
        time: "0:34",
        scene: "第一步，节标题竖排在右缘：“第一步 · 文件夹”“一个项目，一个文件夹。”一个大文件夹“我的书/”浮在十个零散文件中间：思源宋体-Regular.otf、封面.jpg、图1-1.ai、第一章.docx、思源宋体-Bold.otf、地图.svg、照片-07.jpg、思源黑体-Bold.otf、书.idml、图表.pdf。随后打开一个显示文件夹结构的窗口，旁白每说出一类，文件就飞进对应的子文件夹：样张.pdf（成品应有的样子 → 第三步）、字体/（思源宋体、思源黑体…，.otf .ttf .woff2）、图片/（照片，.jpg .png）、原稿/（矢量原稿，.ai .svg .pdf）和文稿/（Word、InDesign（IDML）…）。",
        narration: "第一步，把所有材料放进电脑上的同一个文件夹。一个项目，一个文件夹。在里面按材料分类建子文件夹：字体、图片、插图，还有文稿。",
      },
      {
        time: "0:49",
        scene: "“字体/”一行高亮，一张“字体”卡片显示一个大大的“永”字、思源宋体、思源黑体和加粗三种字样、OTF、TTF、WOFF2三种格式，以及说明“只放有权嵌入的字体：智能体只用你放进去的。”随后竖排出现“文件夹越整齐，”“要猜的越少。”，文件夹结构里的每个子文件夹都打上勾。",
        narration: "别忘了字体。中文字体文件很大，而且大多需要授权，只放你有权嵌入的字体，比如思源宋体这样的开源字体。智能体只会用你放进去的字体。文件夹越整齐，智能体要猜的就越少。",
      },
      {
        time: "1:08",
        scene: "第二步：“第二步 · 矢量原稿”“找齐原稿。”一张示意图、一张图表和一张地图以线条绘出，锚点清晰可见，随后出现三个文件图标：.ai Illustrator、.svg SVG和.pdf PDF。",
        narration: "第二步，如果插图是矢量图，比如示意图、图表或地图，请找到原始文件：Illustrator、SVG或PDF。",
      },
      {
        time: "1:19",
        scene: "两块面板显示同一张示意图：“书稿”和“模板”指向“页面”，图题“图2-1　内容与设计在这里相遇。”一块标为“从 PDF 截取 · 图的照片”，放大后变得模糊、满是像素块；另一块标为“原稿 · 图本身”，放大后依然清晰。截图面板随后暗下，原稿上的标签被重新打成英文（Manuscript、Template、Pages），四角出现裁切标记，三项打勾：“放大多少倍都清晰”“图上的文字是真正的文字”“原稿 → 付印”。",
        narration: "从成品PDF里截出来的图，不过是那张图的照片；原稿才是图本身。有了原稿，智能体会重建每一张图，放大多少倍都清晰，图上的文字仍是真正的文字，可以翻译。付印时，原稿原封不动地送去印刷。",
      },
      {
        time: "1:41",
        scene: "第三步：“第三步 · 参照样张”“展示成品应有的样子。”文件夹结构里，“样张.pdf”高亮，旁边标着“★ 放在根目录”；从中飞出一页，放大成示例课本《山地地貌》的一张竖排书页，标着“样张.pdf”。",
        narration: "第三步很关键：在文件夹的根目录放一份文件，清楚地展示成品应有的样子。PDF最理想。",
      },
      {
        time: "1:50",
        scene: "书页上出现测量：上下两栏竖行的轮廓，栏距2字，切口24 mm，天头28 mm，每行30字，每页26行；标题、正文和图题分别标为“标题 · 思源黑体 11 pt”“正文 · 思源宋体 小五 9/15 pt”“图题 · 思源黑体 7.5 pt”；上栏每一行都画出一个个字格，相邻两行之间标着行距15 pt。旁边的“规格表.md”逐行填好：开本 185 × 260 mm（16开）· 竖排右翻；版心 上下两栏 · 每行30字 · 26行；栏距 2字（18 pt）；正文 思源宋体 小五 9/15 pt，两端对齐；首行缩进 2字；标题 思源黑体 · 第一章 / 一、；标点 开明式 · GB 避头尾；图题 图1-1　黑体 7.5 pt。最后“猜”字被划掉，金色的“量。”亮起。",
        narration: "智能体会从这些页面读出版式：开本、版心、每行多少字、每页多少行，还有字号、行距和标点的处理方式，再把它们写成版式规则。没有样张，它只能猜；有了样张，它就能量。",
      },
      {
        time: "2:09",
        scene: "第四步：“第四步 · 智能体”“用平常的话提出要求。”一个标题为“智能体 · ~/我的书”的窗口打开，旁边是Claude Code、Codex和“或其他任何智能体”三个标签。窗口里，署名“你”的一条消息逐字打出：“安装 Postext 技能：`npx skills add drnachio/postext --skill postext-port`”，智能体回复“✓ 技能已安装：postext-port”。一张“技能 · postext-port”卡片列出：一套成熟的流程、Postext 的全部知识、检查自身工作的工具。窗口是横排的，因为中文界面从左往右读。",
        narration: "第四步，在这个文件夹里打开你的智能体，Claude Code、Codex或者你常用的任何一个，让它安装Postext技能。技能是一套打包好的专业知识。这一个教智能体如何把出版物转入Postext，也给了它检查自己工作的工具。",
      },
      {
        time: "2:29",
        scene: "下一条请求逐字打出：“用 postext-port 技能把这本书转换成 Postext。版式以 `样张.pdf` 为准，字体在 `字体/` 里，插图原稿在 `原稿/` 里：请用原稿，不要从 PDF 里截图。先只做第一章，动手之前先给我看规格表。”旁边的文件夹结构里，消息提到样张.pdf、字体/和原稿/时，它们依次亮起，随后出现一张卡片，写着“样章”和一个大大的“1”。",
        narration: "然后用平常的话说出你的要求，告诉它样张、字体和原稿在哪里，并让它先只做一章。",
      },
      {
        time: "2:42",
        scene: "十二张暗着的竖排课本页面排成网格，第一张围上金框。一个转动的箭头在它上面数着打磨的轮次（第 1 轮到第 3 轮），出现对勾后，其余十一页随之亮起。下方是：样章 → 打磨 → 推广。",
        narration: "如果内容很长，就先做一个样章，把它打磨到完美，再推广到其余部分。",
      },
      {
        time: "2:50",
        scene: "智能体提出四个问题：“照原样复刻，还是重新设计？”“哪些语言？”“印刷、屏幕，还是两者都要？”“横排还是竖排？”。一份任务清单逐项完成：清点材料、测量版式、提取文字、字体和图片、逐页对照、打包文件，随后出现文件“我的书.postext”。第三条请求逐字打出：“第一章通过了。用同样的设计转换其余各章，每一章都和 `样张.pdf` 对照，最后全部打包成一个 .postext 文件。”智能体回复“✓ 12 章 · 0 个警告 · 我的书.postext”。",
        narration: "智能体会问你几个问题：照原样复刻还是重新设计、哪些语言、用于印刷还是屏幕、横排还是竖排。然后它测量、提取、组装、检查，最后交给你一个Postext文件。样章没问题之后，扩展到整本书只需要再提一个要求。",
      },
      {
        time: "3:18",
        scene: "第五步：“第五步 · 沙盒”“逐页检查。”浏览器窗口的地址栏里打出postext.dev/zh/sandbox。指针点击侧栏的“书库”，再点“新建”和“打开.postext文件…”；文件飞入，“我的书 · 12 章 · 184 页”出现在列表顶端，Canvas视图里打开它的前几页竖排页面。",
        narration: "第五步，打开postext.dev上的Postext沙盒，在“书库”里选择“新建”，打开你的文件。",
      },
      {
        time: "3:26",
        scene: "侧栏换成“版面设计”面板，“书写系统”一节里是“中文默认设置”和一个“查看…”按钮。各项设置逐行打勾：语言 zh-Hans、正文字体 思源宋体、标题字体 思源黑体、首行缩进 2字、对齐 两端对齐、图题 图1-1　标题、章节编号 第一章、列表 一、（一）1.（1）①、脚注 ①，每页重新编号。",
        narration: "如果是从零开始的中文书，“版面设计”里的“中文默认设置”可以一次套用中国大陆的排版习惯。",
      },
      {
        time: "3:35",
        scene: "样张和Postext排出的页面并排放着，分别标为“样张”和“POSTEXT”。“检查”面板打开，列出三个问题：CJK行排不满（第四页）、PDF字体缺字（第七页）、标注框超出所在栏（第七页）；Postext的页面上，红框标出每一处。",
        narration: "对照样张逐页检查。“检查”面板会替你指出问题：排不满的行、字体里缺的字、超出所在栏的标注框。",
      },
      {
        time: "3:45",
        scene: "两排示意页面，“样张 · PDF”和“POSTEXT · 内容流动”。在流动的那一排里，一张“图”从第一页移到第二页的栏首，一条虚线连起它的两个位置。竖排文字：“同样的规则，”“不同的页面。”“内容是流动的：某张图或某个分页可能落在别处。”随后，每对页面之间出现等号，标题为“必须一致的”：开本、版心与字格；字体与字号；图和标注框的样式；版面干净：无孤字，各栏齐平。一块带≠号的红色面板写着“手工的手艺判断”和“不是规则，排不了不断变化的内容”。",
        narration: "有一点要记住：页面不必和你的PDF一模一样。Postext学到的是版式规则，你的内容现在是流动的，所以某张图或某个分页可能落在别处。应该一致的是品质，同样的制作水准。手工排版时，我们会做许多细小的手艺判断，它们并不是规则；而只有规则，才能排好不断变化的内容。",
      },
      {
        time: "4:13",
        scene: "智能体的窗口再次出现，第四条请求逐字打出：“沙盒里第二章第7页：“提示”框被拆到了两栏，书眉也不见了。“检查”面板显示有3行排不满。请修正后重新打包。”并附上一张截图“截图-第二章-第7页.png”。随后，沙盒（检查）和智能体（修正）之间的循环转了第 1 轮到第 3 轮，警告数从3降到0，最后出现对勾和竖排的“完全正确。”",
        narration: "然后把你看到的告诉智能体，越具体越好：哪一章、哪一页、哪里不对。附一张截图会更有帮助。打开新版本，再检查，如此反复。每一轮都更接近，直到完全正确。",
      },
      {
        time: "4:32",
        scene: "竖排两列：“不只是”“一个 Postext 版本。”文件“我的书.postext”被一道金线一分为二。一边是“内容 · 写了什么”：chapters/zh-Hans/01-冰川.md，里面是标题“# 冰川如何塑造山谷”、一句引用:ref{id=\"valleys\"}的文字，以及一个写着“冰川是会流动的冰。”的“提示”框。另一边是“形式 · 看起来怎样”：“模板 · 从你的原件推导而来”，列出开本 185 × 260 mm（16开），竖排；版心 2栏 × 30字 × 26行；正文 思源宋体 小五 9/15 pt；标题 思源黑体，第一章 / 一、；标点 开明式，GB 避头尾；图 图1-1，浮动到栏首。",
        narration: "最妙的是，你得到的不只是内容的Postext版本。你把内容和形式分开了：文字存在干净的章节里，设计存在模板里，版式规则都从你的原件推导而来。",
      },
      {
        time: "4:47",
        scene: "一排竖排书页上方，“修订”“增补”“翻译”三个标签依次亮起：一行被高亮，一道光扫过书页；又滑入两页；随后书页翻转为同一模板排出的英文版。一条请求逐字打出：“增加一个英文版：翻译正文、图题和示意图上的文字，设计保持不变。”说明文字：“同样的规则，新的内容，页面自己排好。”接着竖排出现“一个文件，整本书。”：一个.postext图标分出三支，分别通向一张带裁切标记的页面（可付印的 PDF）、一个浏览器窗口（网页阅读器）和一对页面（每一页都排好）。",
        narration: "所以当内容变化时，修订、增补或者翻译，你都不必再操心排版。Postext会按同样的规则重新排。整本书只有一个文件：可付印的PDF、网页阅读器，还有会自己排版的页面。",
      },
      {
        time: "5:07",
        scene: "片尾：Postext标志、标语“为网页而生的可编程排版引擎”、postext.dev、一个写着“本视频的提示词都在简介里 ↓”的胶囊框，以及页脚“开源 · MIT · GITHUB.COM/DRNACHIO/POSTEXT”。",
        narration: "Postext开源项目，网址postext.dev。示例提示词都在视频简介里。",
      },
    ],
  },
};
