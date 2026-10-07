/**
 * Text alternatives for the narrated videos (WCAG 1.2.3 and 1.2.8): what is said, verbatim from the captions, and
 * what is shown, from the animation sources. One list of blocks per video and locale; each follows its own cut. Every
 * site locale has a cut of its own (Catalan, Arabic and Japanese since #510, Brazilian Portuguese since #611), with its
 * own narration, timings and on-screen text: the Chinese and Japanese films are set vertically, with scenes of their
 * own where the English film is about space-separated text, and the Arabic film is mirrored right to left.
 */
export type TranscriptVideo = "showreel" | "tutorial";
export type TranscriptLocale = "en" | "es" | "zh" | "ca" | "ar" | "ja" | "pt";
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
        scene: "Sección 06, «Una maquetación, cinco salidas»: «Lo que ves es lo que va a imprenta.» Bajo la línea de código const vdt = buildDocument(content, config); una página se divide en cinco. Canvas (renderToCanvas(), mapas de bits exactos al píxel) lleva una lupa sobre su rejilla de píxeles; HTML (renderToHtml(), seleccionable y adaptable) recuadra cada bloque con su etiqueta <h1>, <p>, <figure>, etc.; en PDF (renderToPdf(), para imprenta, PDF/UA, CMYK) cuatro planchas de color entran en registro y aparecen marcas de corte y una tira de color. En EPUB 3 (renderToEpub(), libro electrónico, fijo o fluido) la página aparece en un lector de libros electrónicos con la etiqueta «Maquetación fija»; la pantalla se estrecha hasta el tamaño de un móvil, el texto se redistribuye y la etiqueta pasa a «Maquetación fluida». En Folio (postext-folio, un libro en 3D que pasa páginas) la página se abre en una doble página y una hoja gira sobre el lomo.",
        narration: "Una maquetación, cinco salidas: canvas, HTML, PDF para imprenta, EPUB 3, fijo o fluido, y un libro en 3D. Lo que ves es lo que se imprime.",
      },
      {
        time: "1:43",
        scene: "Sección 07, «Por qué un estándar abierto»: «LaTeX marcó el listón del papel. Hoy la edición vive también en cada pantalla.» Dos tarjetas: LaTeX, 1984, con aspas junto a «Pensado para la página impresa», «Atado a las fuentes y paquetes de una máquina», «Compilar, esperar, repetir» y «Sin maquetación editorial en la web adaptable»; Postext, 2026, con marcas junto a «Web, PDF de imprenta y EPUB 3, una maquetación», «Un solo archivo .postext lo lleva todo», «Se recompone en vivo mientras escribes» y «En cualquier navegador · sin servidores · MIT». La tarjeta de Postext se ilumina.",
        narration: "LaTeX marcó el estándar del papel. Pero hoy la edición vive en todas las pantallas.",
      },
      {
        time: "1:51",
        scene: "Rótulo «Un archivo, el libro entero» y titular «Un estándar abierto para la edición, más allá de donde llega LaTeX». Un icono de archivo .postext se abre en cinco piezas: preset.json (configuración y diseño), chapters/*.md (un Markdown por capítulo), fonts/*.woff2 (las propias tipografías), images/ · SVG (cada imagen, incluida) y resources (tablas, figuras y pies). Pie: «Un ZIP corriente: abierto, documentado y con licencia MIT. Cualquier herramienta puede leerlo y escribirlo.»",
        narration: "Postext es un estándar abierto: un único archivo portátil, documentado y con licencia MIT, que cualquier herramienta puede leer y escribir.",
      },
      {
        time: "2:04",
        scene: "«La muestra · compuesta por el motor real»: un muro de páginas de la edición española de la guía se aleja en perspectiva mientras un contador llega a 48 páginas. Texto: «12 capítulos, 3 partes y una portada, maquetados en torno a medio segundo. Cada página de la guía de Postext, calculada en un navegador por postext v1.7.0 para esta pieza. Nada colocado a mano.» Después, etiquetas: Libros de texto, Revistas, Ediciones literarias, Catálogos.",
        narration: "Por eso es capaz de maquetar libros de cientos de páginas en décimas de segundo.",
      },
      {
        time: "2:11",
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
        scene: "第04节“04 · 虚拟文档”：“改一个词。只重排改变的部分。”注释写着“就像 React 的虚拟 DOM，只不过面向页面：VDT，虚拟文档树。”中文竖排指南的七页（p. 3至p. 9）排成一行，从右往左读。光标在p. 7标出一处编辑，该栏其余部分变成金色，一小块溢到p. 8，p. 8随后打勾；之前的页面标为“跳过”，之后的标为“未变”。三条要点说明这条规则，标题为renderToHtmlIndexed()的面板把文档树中改动的节点标为“已修补”。",
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
        scene: "第06节“06 · 一次排版，五种输出”：“所见即所印。”在代码行const vdt = buildDocument(content, config);下方，中文竖排指南的一页分成五页。Canvas（renderToCanvas()，像素级精确的位图）配一个放大镜，显示像素网格；HTML（renderToHtml()，可选中、随尺寸自适应）给每个块加上边框和<h1>、<p>、<figure>等标签；PDF（renderToPdf()，可付印 · PDF/UA · CMYK）的四块分色版滑动对准套印，随后出现裁切标记和色标条；EPUB 3（renderToEpub()，电子书 · 固定版式或流式版式）把这一页放进电子阅读器，标为“固定版式”，随后屏幕收窄到手机大小，文字重新排布，标签换成“流式版式”；书页（postext-folio，能翻页的三维书）把这一页展开成一个对页，一张书页绕着书脊翻过去。",
        narration: "一次排版，五种输出：canvas、HTML、可付印的PDF、固定或流式的EPUB 3，还有一本三维的书。所见即所印。",
      },
      {
        time: "1:52",
        scene: "第07节，节标题和两句话竖排在右缘：“07 · 为什么需要开放标准”“LaTeX 为印刷树立了标杆。”“如今，出版发生在每一块屏幕上。”两张卡片：LaTeX（1984）一侧逐条打叉：为印刷页面而设计；构建依赖某台机器的字体与宏包；编译、等待、重复；网页上没有编辑级排版。Postext（2026）一侧逐条打勾：一次排版，输出网页、付印级 PDF 与 EPUB 3；一个可移植的 .postext 文件承载一切；边输入边实时重排；任何浏览器即可运行 · 无需服务器 · MIT。Postext卡片亮起。",
        narration: "LaTeX为印刷树立了标杆，但如今，出版发生在每一块屏幕上。",
      },
      {
        time: "1:59",
        scene: "“07 · 一个文件，整本书”：“一个开放的出版标准，走到 LaTeX 未及之处。”一个.postext文件图标展开成五部分：preset.json（配置与设计）、chapters/*.md（每章一个 Markdown 文件）、fonts/*.woff2（字体文件本身）、images/ · SVG（所有图片，全部内嵌）和resources（表格、图片与图注）。底部写着“一个普通的 ZIP：开放、有文档、MIT 许可。任何工具都能读写它。”",
        narration: "Postext是一个开放标准，一个可移植的文件，有文档、采用MIT许可，任何工具都能读写。",
      },
      {
        time: "2:09",
        scene: "“案例 · 由真实引擎排版”：一面由中文竖排指南书页组成的墙在透视中后退，计数器升到59页。文字：“10 章、3 篇、竖排，排版仅需不到一秒。”“Postext 指南中文竖排版的每一页，都在浏览器中计算完成，由 postext 1.11.1 为本片生成。无一手工摆放。”随后出现标签：教材、杂志、文学版本、展览图录。",
        narration: "所以，数百页的书，零点几秒就能排好。",
      },
      {
        time: "2:17",
        scene: "片尾：Postext标志和标语“为网页而生的可编程排版引擎”，网址postext.dev，一行终端命令打出“$ pnpm add postext”，页脚为“开源 · MIT · GITHUB.COM/DRNACHIO/POSTEXT”。",
        narration: "Postext开源项目，网址postext.dev。",
      },
    ],
    ca: [
      {
        time: "0:00",
        scene: "Sobre fons fosc, «MAGÚNCIA · 1455» damunt d’un filet daurat. Darrere del titular «Durant cinc segles, la impremta va aprendre a compondre la pàgina.», l’any avança de 1455 a 2026 en xifres perfilades molt grans, i al voltant cauen termes de l’ofici: Justificació, Kerning, Vídues, òrfenes, Columnes equilibrades, Interlineat, Retícula base, par·ti·ci·ó, Mesura, Flotants, Capçaleres, Rius. La càmera entra dins el punt final, que omple la pantalla de daurat.",
        narration: "Durant cinc segles, la impremta va aprendre a compondre la pàgina.",
      },
      {
        time: "0:05",
        scene: "Titular: «El web va aprendre a maquetar interfícies. Mai no va aprendre a compondre una pàgina.» Una finestra de navegador a example.com/longform/article mostra un article justificat a tres columnes, «Per què falla el web». Unes etiquetes vermelles hi assenyalen els defectes: RIUS de blanc, una ÒRFENA, una VÍDUA, una COL·LISIÓ d’una imatge amb el text i el DESEQUILIBRI de l’última columna. Al costat, una pastilla de codi diu «column-count: 3;», seguida de «…i poca cosa més.» i d’una llista ratllada: Rius de blanc, Òrfenes, Vídues, Col·lisions, Columnes desequilibrades. La finestra es distorsiona i s’esfondra.",
        narration: "El web va aprendre a maquetar interfícies. Mai pàgines. Per això el text llarg encara es trenca: rius, vídues, òrfenes, col·lisions.",
      },
      {
        time: "0:18",
        scene: "Després d’un esclat blanc i una escombrada de franges blava, daurada i vermella, el logotip de Postext puja al seu lloc amb el lema «El tipògraf programable per al web». A sota: CODI OBERT · LLICÈNCIA MIT · v1.15.0 · FUNCIONA AL TEU NAVEGADOR.",
        narration: "Això és Postext: el tipògraf programable per al web.",
      },
      {
        time: "0:24",
        scene: "Secció 01 de 07, «Entra el contingut»: «Markdown diu què és cada cosa.» Un fitxer Markdown, 03-per-que-postext.md, s’escriu sol: una directiva de part (número I, «Fonaments»), el títol «Per què Postext» amb entradeta, un paràgraf que cita la figura fig-flow amb :ref, una línia ::resource i un bloc :::callout amb la frase «Canvia una paraula: la pàgina es recompon.» Al costat, config.ts crida buildDocument amb maquetació a dues columnes, text justificat i partició de mots per a «ca», sota la frase «La configuració decideix com es veu. El text no conté ni una sola decisió de maquetació.»",
        narration: "Escrius Markdown semàntic, que diu què és cada cosa. La configuració decideix com es veu.",
      },
      {
        time: "0:32",
        scene: "Secció 02, «Pretext mesura»: «Mesurat sense tocar el DOM.» Un títol, un paràgraf i un requadre s’escanegen l’un rere l’altre i unes cotes en donen l’alçada en punts; un tauler de codi mostra prepare(text, '25px Lora') i layout(prepared, width, 38), que retorna una alçada i un nombre de línies. Dues barres fan una cursa amb 10.000 paràgrafs: «Reflow del navegador · DOM» gairebé no avança i «Pretext · canvas + aritmètica» s’omple de cop. Un comptador puja fins a 600× sobre «més ràpid que el DOM mesurant text, perquè un llibre sencer es recompongui mentre escrius» i «Impulsat per @chenglou/pretext».",
        narration: "Cada paràgraf es mesura sense tocar el DOM, fins a sis-centes vegades més ràpid, gràcies a Pretext, la biblioteca que ho ha fet possible.",
      },
      {
        time: "0:41",
        scene: "Secció 03, «Postext decideix»: «Cada línia col·locada abans de pintar un píxel.» Un anell de set segments s’il·lumina per torns, Estructura, Mesura, Col·locació, Flotants, Refinament, Equilibri i Ritme, cadascun amb una línia d’explicació. Al costat es munta una pàgina a dues columnes de la guia de Postext: els blocs etiquetats volen a les seves columnes, una figura llisca al seu lloc amb la nota «:ref{id=\"fig-flow\"} → peu de columna», cau la banda d’obertura, apareixen les línies, les columnes s’anivellen i baixa la retícula base. L’anell fa les iteracions 1 a 3 i mostra «Estable en 3 iteracions» amb una marca; un requadre dona la caixa i la línia de base d’una línia.",
        narration: "Després, Postext decideix. Set passades col·loquen cada línia, porten cada figura al seu lloc i equilibren les columnes, fins que res no es mou.",
      },
      {
        time: "0:53",
        scene: "Secció 04, «El document virtual»: «Canvia una paraula. Només es recompon el que canvia.», amb la nota «Com el virtual DOM de React, però per a pàgines: el VDT, un arbre de document virtual.» Set pàgines, de la p. 7 a la p. 13, en filera. Un cursor marca una edició a la p. 11, la resta d’aquella columna es torna daurada amb l’etiqueta BRUT i un tros passa a la p. 12, que rep una marca i ESTABLE; les pàgines anteriors diuen ES SALTA i les posteriors, INTACTA. Tres vinyetes expliquen la regla, i un tauler titulat renderToHtmlIndexed() marca com a APEDAÇAT els nodes de l’arbre que han canviat.",
        narration: "Tot viu en un document virtual, com el virtual DOM de React. Canvies una paraula, i només es recompon el que canvia.",
      },
      {
        time: "1:03",
        scene: "«Un document llarg? Només es pinta el que és a la pantalla.» Una columna de pàgines passa per un marc daurat retolat VIEWPORT, amb un marge de 200 píxels a dalt i a baix: les pàgines de dins es dibuixen senceres i les de fora són contorns discontinus. Un comptador gran indica quantes de les 51 pàgines estan pintades en cada moment (IntersectionObserver · +200 px), al costat de «Geometria: totes les pàgines. Píxels: només el que veus.»",
        narration: "I en un llibre llarg, només es pinten les pàgines que són a la pantalla.",
      },
      {
        time: "1:10",
        scene: "Secció 05, «Justificació Knuth–Plass»: «Totes les maneres de tallar el paràgraf. Alhora.» A l’esquerra, un paràgraf sobre el tall de línies compost de manera voraç, com ho fa el navegador, amb les línies més obertes en vermell. A sota, cada paraula és un punt sobre una recta: arcs vermells per als talls voraços, arcs blaus tènues que proven tots els talls possibles i un camí daurat amb la millor combinació. A la dreta, la versió Knuth–Plass, d’espaiat uniforme, amb la lletjor de cada línia, la fórmula «(1 + lletjor + penalització)²» i una suma de demèrits més baixa.",
        narration: "Un navegador talla les línies de manera voraç, una a una. Postext fa servir Knuth-Plass, l’algorisme de TeX: sospesa totes les maneres de tallar el paràgraf sencer i es queda la més uniforme.",
      },
      {
        time: "1:24",
        scene: "Secció 06, «Una maquetació, cinc sortides»: «El que veus és el que s’imprimeix.» Sota la línia de codi const vdt = buildDocument(content, config); una pàgina es divideix en cinc. Canvas (renderToCanvas(), mapes de bits exactes al píxel) porta una lupa sobre la graella de píxels. HTML (renderToHtml(), seleccionable i adaptable) emmarca cada bloc amb la seva etiqueta, <h1>, <p>, <figure>… A PDF (renderToPdf(), per a impremta · PDF/UA · CMYK) quatre planxes de color entren en registre i apareixen marques de tall i una tira de color. A EPUB 3 (renderToEpub(), llibre electrònic · fix o fluid) la pàgina és dins d’un lector: passa de «Maquetació fixa» a «Maquetació fluida», es fa més estreta i el text s’hi torna a repartir en línies. A Folio (postext-folio, un llibre en 3D que passa pàgines) la pàgina s’obre en una doble pàgina i un full gira sobre el llom.",
        narration: "Una maquetació, cinc sortides: canvas, HTML, PDF per a impremta, EPUB 3, fix o fluid, i un llibre en 3D. El que veus és el que s’imprimeix.",
      },
      {
        time: "1:38",
        scene: "Secció 07, «Per què un estàndard obert»: «LaTeX va marcar l’estàndard del paper. Avui l’edició viu també a cada pantalla.» Dues targetes. LaTeX, 1984, amb creus al costat de «Pensat per a la pàgina impresa», «Lligat a les fonts i els paquets d’una màquina», «Compilar, esperar, repetir» i «Sense maquetació editorial al web adaptable». Postext, 2026, amb marques al costat de «Web, PDF d’impremta i EPUB 3, una maquetació», «Un sol fitxer .postext ho porta tot», «Es recompon en directe mentre escrius» i «A qualsevol navegador · sense servidors · MIT». La targeta de Postext s’il·lumina.",
        narration: "LaTeX va marcar l’estàndard del paper. Però avui l’edició viu a totes les pantalles.",
      },
      {
        time: "1:45",
        scene: "Rètol «Un fitxer, el llibre sencer» i titular «Un estàndard obert per a l’edició, més enllà d’on arriba LaTeX.» Una icona de fitxer .postext s’obre en cinc peces: preset.json (configuració i disseny), chapters/*.md (un Markdown per capítol), fonts/*.woff2 (les tipografies mateixes), images/ · SVG (cada imatge, inclosa) i resources (taules, figures i peus). Peu: «Un ZIP corrent: obert, documentat i amb llicència MIT. Qualsevol eina el pot llegir i escriure.»",
        narration: "Postext és un estàndard obert: un únic fitxer portàtil, documentat i amb llicència MIT, que qualsevol eina pot llegir i escriure.",
      },
      {
        time: "1:57",
        scene: "«La mostra · composta pel motor real»: un mur de pàgines de l’edició catalana de la guia s’allunya en perspectiva mentre un comptador arriba a 51 pàgines. Text: «14 capítols, 3 parts i una portada, maquetats en prop de mig segon. Cada pàgina de la guia de Postext, calculada en un navegador per postext v1.15.0 per a aquesta peça. Res col·locat a mà.» Després apareixen quatre etiquetes: Llibres de text, Revistes, Edicions literàries, Catàlegs.",
        narration: "Per això és capaç de maquetar llibres de centenars de pàgines en dècimes de segon.",
      },
      {
        time: "2:04",
        scene: "Tancament: el logotip de Postext amb el lema «El tipògraf programable per al web», l’adreça postext.dev, una línia de terminal on s’escriu «$ pnpm add postext» i el peu «Codi obert · MIT · github.com/drnachio/postext».",
        narration: "Postext. Codi obert, a postext.dev.",
      },
    ],
    ar: [
      {
        time: "0:00",
        scene: "بطاقة داكنة كُتب عليها «ماينتس · 1455» فوق خط ذهبي رفيع. خلف العنوان «على مدى خمسة قرون، تعلّمت الطباعة كيف تنضّد الصفحة.» تتصاعد السنة من 1455 إلى 2026 بأرقام مفرّغة ضخمة، وتحطّ حولها مصطلحات الطباعة بالعربية: الضبط، ضبط الأزواج، الأرامل، اليتامى، أعمدة متوازنة، تباعد الأسطر، شبكة خطوط الأساس، الكشـــيدة (مكتوبة بتطويل ظاهر)، عرض السطر، العناصر العائمة، الترويسات، الأنهار. تغوص الكاميرا في النقطة الأخيرة، فتغمر الشاشة باللون الذهبي.",
        narration: "على مدى خمسة قرون، تعلّمت الطباعة كيف تُنضِّد الصفحة.",
      },
      {
        time: "0:07",
        scene: "العنوان: «تعلّم الويب إخراج الواجهات. أما الصفحة، فلم يتعلّم تنضيدها قط.» نافذة متصفح على example.com/longform/article فيها مقال عربي مضبوط على ثلاثة أعمدة تُقرأ من اليمين إلى اليسار، عنوانه «لماذا يعجز الويب عن تنضيد الصفحة»؛ وتشير وسوم حمراء إلى «أنهار» من البياض، و«أرملة»، و«يتيمة»، و«تصادم» صورة تقع فوق النص، و«اختلال» العمود الأخير. بجانبها شريحة شيفرة نصها «column-count: 3;» ثم «…وقليل غير ذلك.» وقائمة مشطوبة بالعيوب نفسها: أنهار من الفراغ، الأرامل، اليتامى، التصادمات، أعمدة غير متوازنة. ثم تضطرب النافذة وتنهار.",
        narration: "وتعلّم الويب إخراج الواجهات. أما الصفحات، فلا. فما زال النص الطويل ينكسر: أنهار، وأرامل، ويتامى، وتصادمات.",
      },
      {
        time: "0:20",
        scene: "بعد وميض أبيض ومرور خطوط زرقاء وذهبية وحمراء، يرتفع شعار Postext واسمه اللاتيني، مكتوبًا من اليسار إلى اليمين، مع العبارة «المنضّد القابل للبرمجة للويب». وتحتها: مفتوح المصدر · رخصة MIT · v1.15.0 · يعمل في متصفحك.",
        narration: "إليكم Postext: المنضِّد القابل للبرمجة للويب.",
      },
      {
        time: "0:26",
        scene: "القسم 01 من 07، «المحتوى يدخل»: «Markdown يقول ما هو كل عنصر.» ملف Markdown اسمه 03-why-postext.md يكتب نفسه بالعربية: موجّه :::part{number=\"I\" title=\"الأسس\"}، والعنوان «# لماذا Postext» مع {lead=\"الطباعة…\"}، وفقرة «Postext **محرّك إخراج مفتوح المصدر** ينقل حرفة الطباعة التقليدية إلى الويب، كما يبيّن :ref{id=\"fig-flow\"}.»، وسطر ::resource{id=\"fig-flow\"}، وكتلة :::callout{type=\"try\"} فيها «غيّر كلمة: تُنضَّد الصفحة من جديد.». بجانبه ملف config.ts يستدعي buildDocument بالقيمة layoutType: \"double\" ومتن textAlign: \"justify\" وhyphenation مفعّل مع locale: \"ar\"، تحت السطر «والإعدادات تقرّر كيف يبدو.» و«لا شيء من الإخراج يعيش في النص.»",
        narration: "تكتب نص Markdown دلاليًا، يقول ما هو كل عنصر. والإعدادات تقرّر كيف يبدو.",
      },
      {
        time: "0:35",
        scene: "القسم 02، «Pretext يقيس»: «يُقاس النص دون لمس DOM.» العنوان «لماذا Postext» وفقرته وإطار «غيّر كلمة: تُنضَّد الصفحة من جديد.» تُمسح واحدًا بعد آخر، وتعطي خطوط الأبعاد ارتفاعاتها بالنقاط؛ ولوحة شيفرة تعرض prepare(text, '25px Lora') وlayout(prepared, width, 38) يعيدان ارتفاعًا وعدد أسطر. شريطان يتسابقان عبر 10,000 فقرة: «إعادة التدفق في المتصفح · DOM» بالكاد يتحرك، و«PRETEXT · مقاييس CANVAS + حساب» يمتلئ في الحال، وعدّاد يصعد إلى 600× فوق «أسرع من DOM في قياس النص» و«فيُعاد إخراج كتاب كامل وأنت تكتب.» و«مدعوم بـ @chenglou/pretext».",
        narration: "كل فقرة تُقاس دون لمس DOM، أسرع بما يصل إلى ستمئة مرة، بفضل Pretext، المكتبة التي جعلت ذلك ممكنًا.",
      },
      {
        time: "0:46",
        scene: "القسم 03، «Postext يقرّر»: «كل سطر في موضعه قبل رسم أي بكسل.» حلقة من سبعة أجزاء تضيء تباعًا تحت «جولة 1 / 7»: البنية، القياس، الوضع، التعويم، التنقيح، الموازنة، الإيقاع، مع وصف من سطر واحد لكل منها، مثل «تحليل Markdown إلى كتل ذات أنواع» و«Knuth–Plass. لا أرامل ولا يتامى». بجانبها تتجمّع صفحة من عمودين من الطبعة العربية لدليل Postext: كتل موسومة تطير إلى أعمدتها، ويستقر «شكل 2.1» في مكانه تحت الملاحظة «:ref{id=\"fig-flow\"} → أسفل العمود»، وينزل شريط الافتتاح، وتظهر الأسطر، وتتساوى الأعمدة تحت وسم «أعمدة متساوية»، وتمسح شبكة خطوط الأساس الصفحة نزولًا. تدور الحلقة في «حلقة التقارب» من «تكرار 1» إلى «تكرار 3» («5 على الأكثر، حتى لا يتحرّك شيء») وتعرض «استقرّ بعد 3 تكرارات» و«تقارب» مع علامة صح؛ ويعرض إطار مربع إحاطة سطر واحد (bbox) وخط أساسه.",
        narration: "ثم يقرّر Postext. سبع جولات تضع كل سطر، وتُنزل كل شكل في موضعه، وتوازن كل عمود، وتتكرّر حتى لا يتحرّك شيء.",
      },
      {
        time: "1:00",
        scene: "القسم 04، «المستند الافتراضي»: «غيّر كلمة. لا يُعاد تنضيد إلا ما تغيّر.»، مع الملاحظة «مثل virtual DOM في React، لكن للصفحات: VDT، شجرة مستند افتراضية.» سبع صفحات من الدليل العربي، من p. 7 إلى p. 13، مصفوفة في صف يبدأ من اليمين؛ مؤشر كتابة يعلّم «تعديل» في p. 11، فيتحوّل باقي ذلك العمود إلى الذهبي بوسم «مُعلَّم»، وينسكب جزء يسير إلى p. 12 التي تنال علامة صح ووسم «مستقر»، بينما تحمل الصفحات السابقة وسم «متجاوَز» واللاحقة وسم «لم يُمَسّ». ثلاث نقاط تعرض القاعدة، ولوحة عنوانها renderToHtmlIndexed() و«لا يحدّث من DOM إلا ما تغيّر» تعلّم العقد المتغيّرة في شجرة المستند بوسم «حُدِّث».",
        narration: "كل ذلك يعيش في مستند افتراضي، مثل virtual DOM في React. غيّر كلمة واحدة، فلا يُعاد تنضيد إلا ما تغيّر.",
      },
      {
        time: "1:11",
        scene: "«مستند طويل؟ لا يُرسم إلا ما يظهر على الشاشة.» عمود من صفحات الدليل العربي يمرّ عبر إطار ذهبي اسمه VIEWPORT، مع هامش +200 px فوقه وتحته: الصفحات داخله مرسومة كاملة، والصفحات خارجه حدود متقطعة. عدّاد كبير يعرض عدد الصفحات المرسومة في تلك اللحظة من أصل 61 تحت «صفحات مرسومة الآن» (IntersectionObserver · +200 px)، بجانب «الهندسة: كل الصفحات.» و«البكسلات: ما تراه فقط.» و«تُرسم الصفحات حين تدخل مجال الرؤية وتُحرَّر حين تغادره.»",
        narration: "وفي الكتاب الطويل، لا تُرسم إلا الصفحات الظاهرة على الشاشة.",
      },
      {
        time: "1:18",
        scene: "القسم 05، «ضبط الأسطر بخوارزمية Knuth–Plass»: «كل طرق تقسيم الفقرة. دفعة واحدة.» على اليمين فقرة عربية عن تقسيم الأسطر منضّدة بطريقة «التقسيم الجشع · المتصفح»، وتتحوّل أرخى أسطرها إلى الأحمر. وتحتها تصير كل كلمة نقطة على خط: أقواس حمراء تعلّم «قطع جشع»، وأقواس زرقاء باهتة تجرّب «كل نقاط القطع الممكنة»، ومسار ذهبي يختار أفضل مجموعة. وعلى اليسار نسخة «KNUTH–PLASS · POSTEXT» متساوية التباعد، مع «نقاط الجزاء لكل سطر»، والصيغة «(1 + الرداءة + الجزاء)²»، ومجموع «Σ نقاط الجزاء» أدنى.",
        narration: "المتصفح يقسّم الأسطر بجشع، سطرًا تلو الآخر. أما Postext فيستخدم Knuth-Plass، خوارزمية TeX. تزن كل طرق تقسيم الفقرة كاملة، وتختار أكثرها تناسقًا.",
      },
      {
        time: "1:35",
        scene: "القسم 06، «إخراج واحد، خمسة مُخرَجات»: «ما تراه هو ما يُطبع.» تحت سطر الشيفرة const vdt = buildDocument(content, config); تنقسم صفحة واحدة من الدليل العربي إلى خمس، مصفوفة من اليمين إلى اليسار. Canvas (renderToCanvas()، «صور نقطية دقيقة حتى البكسل») تمرّ فوق شبكة بكسلاتها عدسة مكبّرة؛ وHTML (renderToHtml()، «قابل للتحديد ويتكيّف مع الحجم») تُحاط كل كتلة فيه بإطار وتُوسم <h1> و<p> و<figure> وغيرها؛ وPDF (renderToPdf()، «جاهز للطباعة · PDF/UA · CMYK») تنزلق فيه أربعة ألواح ألوان حتى تتطابق، ثم تظهر علامات القص وشريط الألوان؛ وEPUB 3 (renderToEpub()، «كتاب إلكتروني · ثابت أو متدفّق») قارئ إلكتروني يحمل الصفحة تحت وسم «تخطيط ثابت»، ثم يضيق إلى عرض هاتف ويتدفّق النص فيه تحت وسم «قابل لإعادة التدفق»؛ وFolio (postext-folio، «كتاب ثلاثي الأبعاد تُقلَّب صفحاته») تنفتح فيه الصفحة إلى صفحتين متقابلتين وتنقلب ورقة فوق الكعب من اليسار إلى اليمين، كما يُقلَّب كتاب عربي.",
        narration: "إخراج واحد، وخمسة مُخرَجات: canvas، و HTML، و PDF للطباعة، و EPUB 3 ثابت أو متدفّق، وكتاب ثلاثي الأبعاد. ما تراه هو ما يُطبع.",
      },
      {
        time: "1:52",
        scene: "القسم 07، «لماذا معيار مفتوح»: «LaTeX وضع معيار الورق.» و«لكن النشر اليوم يعيش على كل شاشة أيضًا.» بطاقتان: على اليمين LaTeX، 1984، مع علامات خطأ أمام «صُمّم للصفحة المطبوعة» و«بناء مرتبط بخطوط جهاز واحد وحزمه» و«تصريف، فانتظار، فتكرار» و«لا إخراج تحريري على الويب المتجاوب»؛ وعلى اليسار Postext، 2026، مع علامات صح أمام «الويب وPDF للطباعة وEPUB 3 من إخراج واحد» و«ملف .postext واحد قابل للنقل يحمل كل شيء» و«يُعاد الإخراج مباشرة وأنت تكتب» و«في أي متصفح · بلا خوادم · MIT». ثم تخفت بطاقة LaTeX وتضيء بطاقة Postext.",
        narration: "وضع LaTeX معيار الورق. لكن النشر اليوم يعيش على كل شاشة.",
      },
      {
        time: "1:59",
        scene: "العنوان التمهيدي «07 · ملف واحد، الكتاب كله»، والعنوان «معيار مفتوح للنشر، يبلغ ما لم يبلغه LaTeX.» تنفجر أيقونة ملف .postext إلى خمسة أجزاء: preset.json (الإعدادات والتصميم)، وchapters/*.md (ملف Markdown لكل فصل)، وfonts/*.woff2 (الخطوط نفسها)، وimages/ · SVG (كل صورة، مضمَّنة)، وresources (الجداول والأشكال والتعليقات). والتعليق: «ملف ZIP عادي: مفتوح وموثَّق وبرخصة MIT. تستطيع أي أداة أن تقرأه وتكتبه.»",
        narration: "و Postext معيار مفتوح: ملف واحد قابل للنقل، موثَّق وبرخصة MIT، تستطيع أي أداة أن تقرأه وتكتبه.",
      },
      {
        time: "2:13",
        scene: "«المعرض · من تنضيد المحرّك الحقيقي»: على اليسار جدار من صفحات الطبعة العربية لدليل Postext يبتعد في منظور، وعلى اليمين عدّاد يبلغ 61 صفحة. النص: «12 فصلًا، و3 أجزاء، وغلاف، أُخرجت في نحو نصف ثانية.» و«كل صفحة من دليل Postext، محسوبة في متصفح بواسطة postext v1.15.0 لهذا الفيلم. لا شيء وُضع يدويًا.» ثم وسوم: كتب مدرسية، مجلات، طبعات أدبية، كتالوجات.",
        narration: "ولهذا يستطيع أن يُخرج كتبًا من مئات الصفحات في أعشار من الثانية.",
      },
      {
        time: "2:21",
        scene: "بطاقة الختام: شعار Postext واسمه اللاتيني مع العبارة «المنضّد القابل للبرمجة للويب»، والعنوان postext.dev، وسطر طرفية يكتب من اليسار إلى اليمين «$ pnpm add postext»، والتذييل «مفتوح المصدر · MIT · GITHUB.COM/DRNACHIO/POSTEXT».",
        narration: "Postext. مفتوح المصدر، على postext.dev.",
      },
    ],
    ja: [
      {
        time: "0:00",
        scene: "全編が縦組みで、文字は上から下へ、行は右から左へ読みます。暗い画面の右寄りに、金色の細い罫の下で「畢昇 · 1045年ごろ」が縦に組まれています。活字が一つずつ上から字の枠に落ち、右から「畢昇の活字から千年、」「印刷は紙面の組み方を」「学んできた。」の3行に並びます。最後の行は金色です。背後では巨大な袋文字の年号が1045から2026まで数え上がり、まわりに組版の用語が降りてきます。禁則処理、約物の詰め、版面、ルビ、段間、天地、字詰め、和欧間、ぶら下げ、縦組み、柱、行長。カメラが最後の句点に寄り、画面は金色に満たされます。",
        narration: "畢昇の活字から千年、印刷は紙面の組み方を学んできました。",
      },
      {
        time: "0:08",
        scene: "右端に縦組みの見出しが2行、「ウェブは画面の配置を覚えた。」「だが、紙面は組めないままだ。」と並び、2行目は赤です。アドレスがexample.com/longform/articleのブラウザーのウィンドウに、横組み3段の日本語の記事「ウェブはなぜ紙面を組めないのか」が、ブラウザーのやり方で1行ずつ詰めて表示されています。ナレーションに合わせて、赤い印が問題の箇所に一つずつ付きます。ラベルは「行頭の句読点」「段落末の1字」「詰まらない約物」（「版面」のかぎ括弧と句点がそれぞれ全角を取る）、「和欧間のアキなし」（PostextとHTMLの前後にすき間がない）、「ふぞろいな段」（3段目は2行だけ）です。左にはコードのチップ「column-count: 3;」、その下に「……それだけ。」と、同じ五つの問題に×を付けたリスト。ウィンドウが乱れ、崩れ落ちます。",
        narration: "ウェブが覚えたのは画面の配置。紙面は組めないままです。だから、ウェブの日本語の長文は今も粗いまま。句読点が行頭に来て、最後の行に一文字が残り、約物は詰まらず、和文と欧文がぶつかります。",
      },
      {
        time: "0:29",
        scene: "白い閃光のあと、青・金・赤の縞が横切り、Postextのロゴとワードマークがせり上がります。その下にキャッチフレーズ「ウェブで動く、プログラムできる組版システム」があり、「組版」が金色です。さらに下の行は「オープンソース · MIT ライセンス · v1.16.2 · ブラウザーで動く」。",
        narration: "これがPostext、ウェブのためのプログラムできる組版エンジンです。",
      },
      {
        time: "0:36",
        scene: "ここからは、各セクションの見出しが画面の右端に縦に組まれ、内容はその左に並びます。セクション01「01 · 内容を入れる」：「Markdown が示すのは、それが何か、だけ。」Markdownのファイル03-why-postext.mdが1文字ずつ打ち出されます。partディレクティブ{number=\"I\" title=\"基礎\"}、リード文付きの見出し「# なぜPostextか」、:refで図fig-flowを参照する段落、::resourceの行、そして「一語を変えれば、ページが組み直される。」と書かれた:::calloutのブロック。隣のconfig.tsはbuildDocumentを呼び、2段組み、両端そろえ、locale \"ja\" のハイフネーションを指定しています。その下に「見た目は、設定が決める。」と「組版の判断は、本文には一切書かない。」",
        narration: "書くのは、意味を表すMarkdown。それが何なのかだけを示します。見た目は、設定が決めます。",
      },
      {
        time: "0:46",
        scene: "セクション02「02 · PRETEXT が測る」：「文字を測る、DOM に触れずに。」見出し「なぜPostextか」、本文の段落、囲みが順にスキャンされ、寸法線がそれぞれの高さをptで示します。コードパネルでは、prepare(text, '25px Lora')とlayout(prepared, width, 38)が高さと行数を返します。2本のバーが1万段落の処理を競い、「ブラウザーのリフロー · DOM」はほとんど進まず、「PRETEXT · CANVAS の計測 + 算術」は一瞬で満ちます。カウンターが600×まで上がり、「DOM より速い文字の計測で、本一冊が、入力に合わせて組み直される。」と「@chenglou/pretext を使用」の文字が添えられます。",
        narration: "どの段落も、DOMに触れずに測られます。速さは最大で六百倍。それを可能にしたのが、ライブラリのPretextです。",
      },
      {
        time: "0:57",
        scene: "セクション03「03 · POSTEXT が決める」：「ピクセルを描く前に、すべての行が決まる。」七つに区切られた輪が順に点灯します。構造、計測、配置、フロート、仕上げ、段末そろえ、リズム。それぞれに「図を段の上か下へ」「Knuth–Plass。ウィドウもオーファンも出さない」「ベースライングリッドに合わせる」のような1行の説明が付きます。隣では、Postextガイド日本語縦組み版の第二章「エンジンのしくみ」の1ページが組み上がっていきます。ラベル付きのブロックが段に飛び込み、注記「:ref{id=\"fig-flow\"} → 段の下」とともに図2-1が所定の位置に移り、縦の行が現れ、段がそろいます。輪は反復1から3まで回り、「3回の反復で安定」と「収束」がチェックマークとともに表示されます。囲みには1行の位置が「行 · ページ · 段」で示されます。",
        narration: "そして、Postextが決めます。七つのパスで、すべての行を置き、すべての図を配置し、すべての段をそろえ、何も動かなくなるまで繰り返します。",
      },
      {
        time: "1:12",
        scene: "セクション04「04 · 仮想ドキュメント」：「一語を変える。変わった所だけ組み直す。」注記は「React の仮想 DOM の、ページ版。VDT、仮想ドキュメントツリーです。」日本語縦組みのガイドのp. 4からp. 10までの7ページが、右から左へ並びます。p. 8の「編集」の位置にキャレットが立ち、その段の続きが「ダーティ」として金色に変わり、p. 9に「安定」とチェックマークが付きます。それより前のページには「スキップ」、後のp. 10には「変更なし」。3つの箇条書きが規則を説明し、renderToHtmlIndexed()と題したパネル（「変わった DOM だけを差し替える」）が、文書ツリーの変わったノードに「差し替え済み」の印を付けます。",
        narration: "すべては仮想ドキュメントの中にあります、Reactの仮想DOMのように。一文字を変えれば、変わったところだけが組み直されます。",
      },
      {
        time: "1:25",
        scene: "「長い文書でも？ 描くのは、画面に見える部分だけ。」縦組みのページの列が、VIEWPORTと記された金色の枠の中をスクロールしていきます。枠の上下には200ピクセルの余白があり、枠内のページは描かれ、枠外のページは破線の輪郭だけです。大きなカウンターが70ページのうちいま描かれている数を示し、その下に「いま描かれているページ数」と「IntersectionObserver · +200 px」。隣には「幾何情報：全ページ。」「ピクセル：見えるところだけ。」と「ページは画面に入ると描かれ、出ると解放される。」",
        narration: "そして長い本でも、描かれるのは画面に映ったページだけです。",
      },
      {
        time: "1:32",
        scene: "セクション05「05 · 日本語組版の規則」：「どの行も、日本語の作法で。」同じ日本語の段落「紙面を組むには決まりが多い。句読点を行頭に置かない。「括弧」。と続く約物は詰める。和文とPostextのような欧文の間にはアキを入れる。段落の最後の行を一字にしない。」が、まず「ブラウザー · 詰めこんで改行」として組まれ、ナレーションに合わせて問題が赤く示されます。句点が行頭に来て、「括弧」と句点がそれぞれ全角を取り、Postextと和文の間にすき間がなく、最後の行は「い。」だけです。続いて「POSTEXT · 日本語組版の規則」が同じ段落を組み直し、下のチップ「禁則処理」「約物の詰め」「和欧間のアキ」「末尾1字の回避」が順に点灯し、それぞれの規則が直した箇所が金色になります。最後に、ブラウザーの段落が同じ文の縦組みに置き換わり、「縦組みでも、同じ規則」と添えられます。",
        narration: "ブラウザは行を詰めるだけ。句読点の位置には、お構いなしです。Postextは日本語組版の規則に従います。禁則処理、約物の詰め、和文と欧文の間隔。一文字だけの行も残しません。縦組みでも、同じ規則です。",
      },
      {
        time: "1:54",
        scene: "セクション06「06 · 一度の組版、五つの出力」：「見たままが、印刷される。」コードの行const vdt = buildDocument(content, config);の下で、日本語縦組みのガイドの章扉「なぜPostextか」のページが五つに分かれます。Canvas（renderToCanvas()、ピクセル単位で正確なビットマップ）にはピクセルの格子を見せるルーペ。HTML（renderToHtml()、選択できて、サイズに追従）では、ブロックが枠で囲まれ、<h1>、<h2>、<p>などのタグが付きます。PDF（renderToPdf()、入稿用 · PDF/UA · CMYK）では4色の版が重なって見当が合い、トンボとカラーバーが現れます。EPUB 3（renderToEpub()、電子書籍 · 固定レイアウトかリフロー型）では、ページを持つ電子書籍リーダーがスマートフォンの幅に縮み、文字が流し直されて「固定レイアウト」が「リフロー型」に変わります。Folio（postext-folio、ページをめくれる3Dの本）では、本が見開きに開き、1枚がのどを越えてめくれます。",
        narration: "一度組めば、出力は五つ。canvas、HTML、印刷用のPDF、固定レイアウトかリフロー型のEPUB 3、そして3Dの本。見たままが、そのまま印刷されます。",
      },
      {
        time: "2:14",
        scene: "セクション07、見出しの2行が右端に縦に組まれています。「07 · なぜオープンな標準か」「LaTeX は印刷の水準を決めた。」「いま、出版はあらゆる画面に。」カードが2枚並びます。1984年のLaTeXには×印の行が並びます。印刷されたページのための設計、ビルドが手元のフォントとパッケージ次第、コンパイルして、待って、また繰り返す、レスポンシブなウェブには書籍の組版がない。2026年のPostextにはチェックマークの行。一度の組版から、ウェブ、入稿用 PDF、EPUB 3、持ち運べる .postext ファイル一つにすべてが入る、入力しながら、その場で組み直す、どのブラウザーでも動く · サーバー不要 · MIT。Postextのカードが明るくなります。",
        narration: "印刷の基準を作ったのはLaTeX。でも今、出版はあらゆる画面にあります。",
      },
      {
        time: "2:22",
        scene: "「07 · ファイル一つに、本一冊」：「出版のためのオープンな標準。LaTeX が届かないところまで。」.postextファイルのアイコンが五つの部分に分かれます。preset.json（設定とデザイン）、chapters/*.md（章ごとに Markdown ファイル一つ）、fonts/*.woff2（フォントファイルそのもの）、images/ · SVG（すべての画像を埋め込み）、resources（表、図、キャプション）。下に「ふつうの ZIP。オープンで、仕様が公開され、MIT ライセンス。どんなツールでも読み書きできる。」",
        narration: "Postextは、オープンな標準です。持ち運べるファイルで、仕様は公開、MITライセンス。どのツールでも読み書きできます。",
      },
      {
        time: "2:36",
        scene: "「作例 · 本物のエンジンで組版」：日本語縦組みのガイドのページが壁のように並んで奥へ遠ざかり、カウンターが70ページまで上がります。文字は「全11章・3部、縦組み。組むのに1秒足らず。」と「Postext ガイド日本語縦組み版の全ページを、ブラウザーの中で計算。postext 1.16.2 がこの映像のために組みました。手で置いたものは一つもありません。」続いてタグが並びます。教科書、雑誌、文芸書、展覧会図録。",
        narration: "だから、数百ページの本も一秒足らずで組み上がります。",
      },
      {
        time: "2:43",
        scene: "エンドカード：Postextのロゴ、キャッチフレーズ「ウェブで動く、プログラムできる組版システム」、アドレスpostext.dev、「$ pnpm add postext」と打ち込まれるターミナルの行、フッター「オープンソース · MIT · GITHUB.COM/DRNACHIO/POSTEXT」。",
        narration: "Postext。オープンソースで、postext.devにあります。",
      },
    ],
    pt: [
      {
        time: "0:00",
        scene: "Sobre fundo escuro, “MOGÚNCIA · 1455” acima de um fio dourado. Atrás da manchete “Durante cinco séculos, a imprensa aprendeu a compor a página.”, o ano avança de 1455 a 2026 em grandes algarismos vazados, e termos do ofício vão caindo em volta: Justificação, Kerning, Viúvas, órfãs, Colunas equilibradas, Entrelinha, Grade de base, hi·fe·ni·za·ção, Medida, Flutuantes, Cabeços, Rios. A câmera entra no ponto final, que enche a tela de dourado.",
        narration: "Durante cinco séculos, a imprensa aprendeu a compor a página.",
      },
      {
        time: "0:06",
        scene: "Manchete: “A web aprendeu a diagramar interfaces. Nunca aprendeu a compor uma página.” Uma janela de navegador em example.com/longform/article mostra um artigo justificado em três colunas, “Por que a web falha”; etiquetas vermelhas apontam rios de branco, uma órfã, uma viúva, uma imagem que cai sobre o texto e uma última coluna desequilibrada. Ao lado, um chip de código diz “column-count: 3;”, seguido de “…e pouco mais.” e de uma lista riscada com os mesmos cinco defeitos: Rios de branco, Órfãs, Viúvas, Colisões, Colunas desequilibradas. A janela se distorce e desaba.",
        narration: "A web aprendeu a diagramar as interfaces. Nunca as páginas. Por isso o texto longo continua se quebrando: rios, viúvas, órfãs, colisões.",
      },
      {
        time: "0:20",
        scene: "Depois de um clarão branco e de uma varredura de faixas azul, dourada e vermelha, o logotipo do Postext sobe até o seu lugar com o lema “O tipógrafo programável para a web”. Embaixo: CÓDIGO ABERTO · LICENÇA MIT · v1.20.3 · FUNCIONA NO SEU NAVEGADOR.",
        narration: "Este é o Postext: o tipógrafo programável para a web.",
      },
      {
        time: "0:26",
        scene: "Seção 01 de 07, “Entra o conteúdo”: “O Markdown diz o que é cada coisa.” Um arquivo Markdown, 03-por-que-postext.md, se digita sozinho: uma diretiva de parte, o título “Por que Postext” com um lead, um parágrafo que cita a figura fig-flow com :ref, uma linha ::resource e um bloco :::callout. Ao lado, config.ts chama buildDocument com diagramação em duas colunas, texto justificado e hifenização para “pt-BR”, sob a frase “A configuração decide como fica. O texto não contém nenhuma decisão de diagramação.”",
        narration: "Você escreve Markdown semântico, que diz o que é cada coisa. A configuração decide como fica.",
      },
      {
        time: "0:34",
        scene: "Seção 02, “O Pretext mede”: “Medido sem tocar no DOM.” Um título, um parágrafo e um boxe são escaneados um depois do outro, e linhas de cota dão a altura de cada um em pontos; um painel de código mostra prepare(text, '25px Lora') e layout(prepared, width, 38), que devolve uma altura e um número de linhas. Duas barras disputam 10.000 parágrafos: “Reflow do navegador · DOM” mal sai do lugar e “Pretext · canvas + aritmética” se enche na hora, e um contador sobe até 600× acima de “mais rápido que o DOM para medir texto, para que um livro inteiro se recomponha enquanto você digita” e “Baseado em @chenglou/pretext”.",
        narration: "Cada parágrafo se mede sem tocar o DOM, até seiscentas vezes mais rápido, graças ao Pretext, a biblioteca que o tornou possível.",
      },
      {
        time: "0:44",
        scene: "Seção 03, “O Postext decide”: “Cada linha no lugar antes de pintar um pixel.” Um anel de sete segmentos se acende por turnos, Estrutura, Medição, Disposição, Flutuantes, Refino, Equilíbrio e Ritmo, cada um com uma linha de explicação, enquanto ao lado se monta uma página em duas colunas do guia do Postext: os blocos etiquetados voam para as suas colunas, uma figura desliza até o lugar com a nota “:ref{id=\"fig-flow\"} → pé da coluna”, a faixa de abertura desce, as linhas aparecem, as colunas se nivelam e a grade de base desce pela página. O anel percorre as iterações 1 a 3 e mostra “Estável em 3 iterações” com um visto; um boxe dá a caixa e a linha de base de uma linha.",
        narration: "Depois, o Postext decide. Sete passadas posicionam cada linha, levam cada figura ao seu lugar e equilibram as colunas, até que nada se mova.",
      },
      {
        time: "0:57",
        scene: "Seção 04, “O documento virtual”: “Mude uma palavra. Só se recompõe o que muda.”, com a nota “Como o virtual DOM do React, mas para páginas: o VDT, uma árvore de documento virtual.” Sete páginas, da p. 7 à p. 13, em fila; um cursor marca uma edição na p. 11, o resto dessa coluna fica dourado como SUJO e uma faixa passa para a p. 12, que recebe um visto e ESTÁVEL, enquanto as anteriores dizem PULADA e as seguintes INTACTA. Três marcadores explicam a regra, e um painel com o título renderToHtmlIndexed() marca como ATUALIZADO os nós da árvore que mudaram.",
        narration: "Tudo vive num documento virtual, como o virtual DOM do React. Você muda uma palavra, e só o que mudou é recomposto.",
      },
      {
        time: "1:07",
        scene: "“Um documento longo? Só se pinta o que está na tela.” Uma coluna de páginas passa por uma moldura dourada chamada VIEWPORT, com uma margem de 200 pixels acima e abaixo: as páginas de dentro são desenhadas inteiras e as de fora são contornos tracejados. Um contador grande indica quantas das 51 páginas estão pintadas a cada momento (IntersectionObserver · +200 px), ao lado de “Geometria: todas as páginas. Pixels: só o que você vê.”",
        narration: "E num livro longo, só são pintadas as páginas que estão visíveis na tela.",
      },
      {
        time: "1:14",
        scene: "Seção 05, “Justificação Knuth–Plass”: “Todas as formas de quebrar o parágrafo. Ao mesmo tempo.” À esquerda, sob “Gulosa · o navegador”, um parágrafo sobre a quebra de linhas é composto de forma gulosa, como faz o navegador, com as linhas mais frouxas em vermelho. Embaixo, cada palavra é um ponto sobre uma reta: arcos vermelhos para as quebras gulosas, arcos azuis tênues que testam todas as quebras possíveis e um caminho dourado com a melhor combinação. À direita, a versão “Knuth–Plass · Postext”, de espaçamento uniforme, com os deméritos de cada linha, a fórmula “(1 + feiura + penalidade)²” e uma soma de deméritos menor.",
        narration: "Um navegador quebra as linhas de forma gulosa, uma a uma. O Postext usa Knuth-Plass, o algoritmo do TeX: pesa todas as formas de quebrar o parágrafo inteiro e fica com a mais uniforme.",
      },
      {
        time: "1:29",
        scene: "Seção 06, “Uma diagramação, cinco saídas”: “O que você vê é o que vai para a gráfica.” Sob a linha de código const vdt = buildDocument(content, config); uma página se divide em cinco. Canvas (renderToCanvas(), bitmaps exatos ao pixel) ganha uma lupa sobre a sua grade de pixels; HTML (renderToHtml(), selecionável e responsivo) contorna cada bloco com a sua etiqueta <h1>, <p>, <figure> etc.; em PDF (renderToPdf(), para impressão, PDF/UA, CMYK) quatro chapas de cor entram em registro e aparecem marcas de corte e uma barra de cor. Em EPUB 3 (renderToEpub(), livro digital, fixo ou refluível) a página aparece num leitor de livros digitais com a etiqueta “Layout fixo”; a tela se estreita até o tamanho de um celular, o texto se redistribui e a etiqueta passa a “Refluível”. Em Folio (postext-folio, um livro em 3D que vira as páginas) a página se abre numa página dupla e uma folha gira sobre a lombada.",
        narration: "Uma diagramação, cinco saídas: canvas, HTML, PDF para impressão, EPUB 3, fixo ou refluível, e um livro em 3D. O que você vê é o que vai para a gráfica.",
      },
      {
        time: "1:45",
        scene: "Seção 07, “Por que um padrão aberto”: “LaTeX definiu o padrão do papel. Hoje a edição vive também em cada tela.” Dois cartões: LaTeX, 1984, com xis ao lado de “Pensado para a página impressa”, “Preso às fontes e pacotes de uma máquina”, “Compilar, esperar, repetir” e “Sem diagramação editorial na web responsiva”; Postext, 2026, com vistos ao lado de “Web, PDF para gráfica e EPUB 3, uma diagramação”, “Um só arquivo .postext leva tudo”, “Recompõe ao vivo enquanto você digita” e “Em qualquer navegador · sem servidores · MIT”. O cartão do Postext se acende.",
        narration: "O LaTeX definiu o padrão do papel. Mas hoje a edição vive em todas as telas.",
      },
      {
        time: "1:52",
        scene: "Chamada “Um arquivo, o livro inteiro” e manchete “Um padrão aberto para a edição, além de onde o LaTeX chega.” Um ícone de arquivo .postext se abre em cinco peças: preset.json (configuração e design), chapters/*.md (um Markdown por capítulo), fonts/*.woff2 (as próprias fontes), images/ · SVG (cada imagem, incluída) e resources (tabelas, figuras e legendas). Rodapé: “Um ZIP comum: aberto, documentado e com licença MIT. Qualquer ferramenta pode lê-lo e escrevê-lo.”",
        narration: "O Postext é um padrão aberto: um único arquivo portátil, documentado e com licença MIT, que qualquer ferramenta pode ler e escrever.",
      },
      {
        time: "2:03",
        scene: "“A amostra · composta pelo motor real”: um mural de páginas da edição brasileira do guia se afasta em perspectiva enquanto um contador chega a 51 páginas. Texto: “11 capítulos, 3 partes e as capas, diagramados em cerca de meio segundo. Cada página do guia do Postext, calculada em um navegador pelo postext v1.20.3 para esta peça. Nada posto à mão.” Depois, as etiquetas Livros didáticos, Revistas, Edições literárias, Catálogos.",
        narration: "Por isso ele consegue diagramar livros de centenas de páginas em décimos de segundo.",
      },
      {
        time: "2:10",
        scene: "Fechamento: o logotipo do Postext com o lema “O tipógrafo programável para a web”, o endereço postext.dev, uma linha de terminal que digita “$ pnpm add postext” e o rodapé “Código aberto · MIT · github.com/drnachio/postext”.",
        narration: "Postext. Código aberto, em postext.dev.",
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
        scene: "Paso 05, el sandbox: «Revísalo página a página.» En una ventana de navegador se escribe la dirección postext.dev/es/sandbox. El puntero pulsa Libros en la barra lateral, luego Nuevo y luego «Abrir un archivo .postext…»; el archivo entra volando, «Mi libro, 12 capítulos · 184 páginas» aparece arriba de la lista y sus primeras páginas se abren en la vista Canvas; las pestañas de vista son Canvas, HTML, PDF, Folio y EPUB 3.",
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
        scene: "Se encienden las pastillas Corregir, Ampliar y Traducir sobre una fila de páginas: se resalta una línea y un destello recorre las páginas, entran dos páginas más y las páginas se dan la vuelta para mostrar la edición en inglés. Se escribe una petición: «Añade una edición en inglés: traduce los capítulos, los pies de figura y los rótulos de los diagramas, y mantén el mismo diseño.» Pie: «Mismas reglas. Contenido nuevo. Las páginas se componen solas.» Después, «Un archivo, todo el libro.»: un icono .postext se ramifica hacia una página con marcas de corte (PDF para imprenta), un lector de libros electrónicos con el texto ajustado a su pantalla (Libro EPUB), una ventana de navegador (Lector web) y una pareja de páginas (Cada página, compuesta).",
        narration: "Así, cuando tu contenido cambie, cuando lo corrijas, lo amplíes o lo traduzcas, no tendrás que preocuparte por el formato. Postext lo vuelve a componer con las mismas reglas. Un solo archivo para todo el libro: un PDF listo para imprenta, un libro electrónico EPUB, un lector para la web y páginas que se componen solas.",
      },
      {
        time: "4:59",
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
        scene: "第五步：“第五步 · 沙盒”“逐页检查。”浏览器窗口的地址栏里打出postext.dev/zh/sandbox。指针点击侧栏的“书库”，再点“新建”和“打开.postext文件…”；文件飞入，“我的书 · 12 章 · 184 页”出现在列表顶端，Canvas视图里打开它的前几页竖排页面；视图标签依次是Canvas、HTML、PDF、书页和EPUB 3。",
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
        scene: "一排竖排书页上方，“修订”“增补”“翻译”三个标签依次亮起：一行被高亮，一道光扫过书页；又滑入两页；随后书页翻转为同一模板排出的英文版。一条请求逐字打出：“增加一个英文版：翻译正文、图题和示意图上的文字，设计保持不变。”说明文字：“同样的规则，新的内容，页面自己排好。”接着竖排出现“一个文件，整本书。”：一个.postext图标分出四支，分别通向一张带裁切标记的页面（可付印的 PDF）、一台文字按屏幕重新排成竖行的电子阅读器（EPUB 电子书）、一个浏览器窗口（网页阅读器）和一对页面（每一页都排好）。",
        narration: "所以当内容变化时，修订、增补或者翻译，你都不必再操心排版。Postext会按同样的规则重新排。整本书只有一个文件：可付印的PDF、EPUB电子书、网页阅读器，还有会自己排版的页面。",
      },
      {
        time: "5:09",
        scene: "片尾：Postext标志、标语“为网页而生的可编程排版引擎”、postext.dev、一个写着“本视频的提示词都在简介里 ↓”的胶囊框，以及页脚“开源 · MIT · GITHUB.COM/DRNACHIO/POSTEXT”。",
        narration: "Postext开源项目，网址postext.dev。示例提示词都在视频简介里。",
      },
    ],
    ca: [
      {
        time: "0:00",
        scene: "Capçalera: el logotip de Postext, el rètol «Tutorial · 5 passos» i el títol «Converteix la teva publicació a Postext amb un agent d’IA. Sense programar.»",
      },
      {
        time: "0:03",
        scene: "«La teva publicació ja existeix.» Tres pàgines compostes amb Postext, un llibre, un manual i una revista, cauen l’una rere l’altra amb les etiquetes InDesign (IDML), Word (DOCX) i PDF. S’apleguen a l’esquerra, una fletxa daurada discontínua passa per una insígnia «Agent d’IA» i apareix una icona de fitxer, el-meu-llibre.postext, sota «Un agent la converteix a Postext. Cinc passos. Unes quantes peticions ben escrites.»",
        narration: "Ja tens una publicació: un llibre, un manual, una revista. Viu a InDesign, a Word o en un PDF. En aquest tutorial, un agent d’intel·ligència artificial la convertirà a Postext per tu. Sense programar: cinc passos i unes quantes peticions ben escrites.",
      },
      {
        time: "0:23",
        scene: "«El pla»: cinc targetes numerades apareixen a mesura que la veu anomena cada pas: 01 Prepara la carpeta, 02 Reuneix els originals vectorials, 03 Afegeix una referència, 04 Demana-ho a l’agent, 05 Revisa-ho al sandbox.",
        narration: "El pla: preparar la carpeta, reunir els originals vectorials, afegir una referència, demanar-ho a l’agent i revisar el resultat.",
      },
      {
        time: "0:34",
        scene: "Pas 01, la carpeta: «Un projecte, una carpeta.» Una carpeta gran, el-meu-llibre/, sura entre deu fitxers solts, com MinionPro-Regular.otf, portada.jpg, fig-2-1.ai, capitol-01.docx, mapa.svg, llibre.idml i grafic.pdf. S’obre una finestra amb l’arbre de la carpeta i cada fitxer vola a la seva subcarpeta quan la veu l’anomena: referencia.pdf (com ha de quedar, pas 03), fonts/ (Minion Pro, Myriad…, .otf .ttf .woff2), imatges/ (fotografies, .jpg .png), il·lustracions/ (originals vectorials, .ai .svg .pdf) i textos/ (Word, InDesign IDML…).",
        narration: "Pas u: reuneix-ho tot en una sola carpeta a l’ordinador. Un projecte, una carpeta. A dins, dona a cada tipus de material la seva pròpia subcarpeta: les tipografies, les imatges, les il·lustracions i els textos.",
      },
      {
        time: "0:51",
        scene: "La fila fonts/ es ressalta i una targeta titulada «Tipografies» mostra una «Aa» gran, els estils Rodona, Cursiva i Negreta, els formats OTF, TTF i WOFF2 i la nota «Només es poden fer servir les que incloguis.» Després apareix «Com més endreçada, menys endevina.», mentre cada subcarpeta de l’arbre rep una marca.",
        narration: "No t’oblidis de les tipografies: són la veu del disseny, i l’agent només pot fer servir les que incloguis. Com més endreçada estigui la carpeta, menys haurà d’endevinar l’agent.",
      },
      {
        time: "1:04",
        scene: "Pas 02, originals vectorials: «Reuneix els originals.» Un diagrama, un gràfic i un mapa es dibuixen a traç, amb els punts d’ancoratge a la vista, i apareixen tres icones de fitxer: .ai Illustrator, .svg SVG i .pdf PDF.",
        narration: "Pas dos: si les teves il·lustracions són vectorials, com diagrames, gràfics o mapes, busca els fitxers originals: Illustrator, SVG o PDF.",
      },
      {
        time: "1:15",
        scene: "Dos taulers mostren la mateixa figura, un diagrama en què Manuscrit i Plantilla apunten a Pàgines, amb el peu «Fig. 2.1 Contingut i disseny es troben.» A l’esquerra, «Retallada del PDF: una foto del dibuix» es torna borrosa i pixelada quan s’amplia; a la dreta, «L’original: el dibuix mateix» es manté nítid. El tauler de l’esquerra s’apaga, els rètols de l’original es reescriuen en anglès (Manuscript, Template, Pages), unes marques de tall l’emmarquen i tres etiquetes diuen «Nítida a qualsevol mida», «Rètols com a text real» i «Original → impremta».",
        narration: "Una figura retallada del PDF final és poca cosa més que una foto del dibuix. L’original és el dibuix mateix. Amb l’original, l’agent recompon cada figura: nítida a qualsevol mida, amb els rètols com a text real, a punt per traduir. I a impremta, l’original hi va tal com és.",
      },
      {
        time: "1:36",
        scene: "Pas 03, la referència: «Mostra com ha de quedar.» A l’arbre de la carpeta es ressalta referencia.pdf amb l’etiqueta «A l’arrel». En surt una pàgina que es converteix en una pàgina de llibre gran, a dues columnes, marcada referencia.pdf.",
        narration: "El pas tres és essencial: a l’arrel de la carpeta, posa-hi un fitxer que mostri amb claredat com ha de quedar el producte final. L’ideal és un PDF.",
      },
      {
        time: "1:45",
        scene: "Sobre la pàgina apareixen les mesures: el contorn de les columnes, una separació de 9 mm, un marge de 20 mm, etiquetes per al títol (Fraunces 28 pt), el text (Lora 9,4/13,6 pt) i un requadre (fons, 1 filet), i les línies de base amb un interlineat de 13,6 pt. Un fitxer, fitxa-especificacions.md, es va omplint: pàgina 210 × 280 mm; marges 24 · 20 · 22 · 20 mm, simètrics; 2 columnes, separació 9 mm; retícula base 13,6 pt; text Lora 9,4 / 13,6 pt, justificat; títols Fraunces 28 pt · Geist; obertures amb banda de color, 101 mm; requadres amb fons i filet esquerre. Després la paraula «Endevinar» queda ratllada i «Mesurar.» s’encén en daurat.",
        narration: "L’agent llegeix el disseny en aquestes pàgines: mesura marges, columnes, tipografies i espais, i els anota com a regles de maquetació. Sense referència, hauria d’endevinar. Amb ella, mesura.",
      },
      {
        time: "2:00",
        scene: "Pas 04, l’agent: «Demana-ho amb les teves paraules.» S’obre una finestra titulada «Agent · ~/el-meu-llibre» al costat de les insígnies Claude Code, Codex i «o qualsevol altre agent». S’hi escriu un missatge signat TU: «Instal·la la skill de Postext: `npx skills add drnachio/postext --skill postext-port`», i l’agent respon «✓ Skill instal·lada: postext-port». Una targeta de la skill postext-port enumera «Un mètode provat», «Tot sobre Postext» i «Eines per revisar la seva feina».",
        narration: "Pas quatre: obre el teu agent, Claude Code, Codex o el que tinguis, en aquesta carpeta, i demana-li que instal·li la skill de Postext. Una skill és un paquet de coneixement expert. Aquesta ensenya l’agent a convertir una publicació a Postext, i li dona eines per revisar la seva pròpia feina.",
      },
      {
        time: "2:20",
        scene: "S’escriu la petició següent: «Fes servir la skill postext-port per convertir aquest llibre a Postext. El disseny és a referencia.pdf, les tipografies a fonts/ i les il·lustracions originals a il·lustracions/: fes-les servir en lloc de retallar les figures del PDF. Comença només pel capítol 1 i ensenya’m la fitxa d’especificacions abans de construir-lo.» Al costat, referencia.pdf, fonts/ i il·lustracions/ s’il·luminen a l’arbre de la carpeta a mesura que el missatge les anomena, i apareix una targeta amb «Cap. 1».",
        narration: "Després, demana-li el que vols amb les teves paraules. Digues-li on són la referència, les tipografies i els originals, i que comenci per un sol capítol.",
      },
      {
        time: "2:33",
        scene: "Una quadrícula de dotze pàgines atenuades; la primera s’emmarca en daurat. Una fletxa circular hi compta les voltes de polit fins que apareix una marca, i llavors s’il·luminen les altres onze. A sota: Capítol de mostra → Polir → Estendre.",
        narration: "Si el contingut és llarg, comença per un capítol de mostra. Poleix-lo fins que sigui perfecte, i només llavors estén-lo a la resta.",
      },
      {
        time: "2:42",
        scene: "L’agent pregunta «Còpia fidel o redisseny?», «Quines llengües?» i «Paper, pantalla o tots dos?». Una llista de tasques avança per Fer inventari, Mesurar el disseny, Extreure el text, Tipografies i imatges, Comparar pàgina a pàgina i Empaquetar el fitxer, i apareix el fitxer el-meu-llibre.postext. S’escriu una tercera petició: «El capítol 1 està aprovat. Converteix la resta de capítols amb el mateix disseny, compara cadascun amb referencia.pdf i empaqueta-ho tot en un únic fitxer .postext.» L’agent respon «✓ 12 capítols · 0 avisos · el-meu-llibre.postext».",
        narration: "L’agent et farà unes preguntes: còpia fidel o redisseny, quines llengües, paper o pantalla. Després mesura, extreu, munta i comprova, i et lliura un fitxer Postext. Quan la mostra estigui bé, estendre-la al llibre sencer és només una petició més.",
      },
      {
        time: "3:06",
        scene: "Pas 05, el sandbox: «Revisa’l pàgina a pàgina.» En una finestra de navegador s’escriu l’adreça postext.dev/ca/sandbox. El punter prem Llibres a la barra lateral, després Nou i després «Obrir un fitxer .postext…». El fitxer hi entra volant, «El meu llibre, 12 capítols · 184 pàgines» apareix a dalt de la llista i les primeres pàgines s’obren a la pestanya Canvas, al costat d’HTML, PDF, Folio i EPUB 3.",
        narration: "Pas cinc: obre el sandbox de Postext, a postext.dev. A Llibres, tria Nou i obre el teu fitxer.",
      },
      {
        time: "3:14",
        scene: "La pàgina de referència i la de Postext queden l’una al costat de l’altra, retolades Referència i Postext, i una línia daurada les recorre de dalt a baix. S’obre el tauler Revisió amb un comptador de 3 i la llista Vídua (p. 4), Línia oberta (p. 7) i La figura no hi cap (p. 9); uns requadres vermells marquen cada problema a la pàgina de Postext.",
        narration: "Revisa’l pàgina a pàgina al costat de la teva referència. El tauler Revisió t’assenyala els problemes: vídues, línies obertes, figures que no hi caben.",
      },
      {
        time: "3:26",
        scene: "Dues files de pàgines esquemàtiques, «Referència · PDF» i «Postext · fluid». A la fila fluida, una figura passa de la primera pàgina a dalt de la segona i una línia discontínua uneix les dues posicions. Text: «Les mateixes regles, no les mateixes pàgines. El contingut flueix: una figura o un salt de pàgina poden caure en un altre lloc.» Després, un signe igual uneix cada parella de pàgines sota «El que ha de coincidir»: Marges i retícula base, Tipografia, Estil de figures i requadres, Pàgines netes: sense vídues, columnes equilibrades. Un tauler vermell amb el signe ≠ diu «Decisions artesanes a mà», amb la nota «no són regles: no serveixen per a un contingut que canvia».",
        narration: "Tingues en compte una cosa: les pàgines no han de ser idèntiques a les del PDF. Postext ha entès les regles de maquetació i ara el teu contingut és fluid, així que una figura o un salt de pàgina poden caure en un altre lloc. El que ha de coincidir és la qualitat: els mateixos valors de producció. Quan maquetem a mà, prenem petites decisions artesanes que no són regles. I només amb regles es pot maquetar un contingut que canvia.",
      },
      {
        time: "3:54",
        scene: "Torna la finestra de l’agent amb una quarta petició: «Al sandbox, capítol 2, pàgina 7: el requadre “Recorda” es parteix en dues columnes i falta el titolet. Revisió marca 3 línies obertes. Corregeix-ho i torna a empaquetar el fitxer.» S’hi adjunta una captura, captura-cap2-p7.png. Després, un bucle entre Sandbox (revisar) i Agent (corregir) fa les voltes 1 a 3 mentre el nombre d’avisos baixa de 3 a 0, i acaba amb una marca i «Perfecte.»",
        narration: "Després explica a l’agent el que veus, amb la màxima precisió possible: el capítol, la pàgina i què falla. Una captura de pantalla ajuda. Obre la versió nova, torna a revisar i repeteix. Cada volta s’hi acosta més, fins que queda perfecte.",
      },
      {
        time: "4:14",
        scene: "«No només una versió Postext.» El fitxer el-meu-llibre.postext es parteix en dos per una línia daurada. A l’esquerra, Contingut (què diu): chapters/ca/02-la-cellula.md, amb el títol «La cèl·lula», una frase que cita la figura fig-celula i un requadre de tipus «recorda» que diu «La cèl·lula és la unitat mínima de vida.» A la dreta, Forma (com es veu): una plantilla deduïda del teu original, amb pàgina de 210 × 280 mm simètrica, 2 columnes amb una separació de 9 mm, text Lora 9,4/13,6 justificat, títols en Fraunces numerats, requadres «recorda» amb fons i filet, i figures a dalt de la columna.",
        narration: "I això és el millor: no només tens el teu contingut a Postext. Has separat el contingut de la forma. El text viu en capítols nets; el disseny, en una plantilla amb les regles de maquetació deduïdes del teu original.",
      },
      {
        time: "4:28",
        scene: "S’encenen les pastilles Corregir, Ampliar i Traduir sobre una filera de pàgines: es ressalta una línia i una lluïssor recorre les pàgines, n’entren dues més i les pàgines es giren i mostren la mateixa guia en anglès. S’escriu una petició: «Afegeix una edició en anglès: tradueix els capítols, els peus de figura i els rètols dels diagrames, i mantén el mateix disseny.» Peu: «Les mateixes regles. Contingut nou. Les pàgines es componen soles.» Després, «Un fitxer, tot el llibre.»: una icona .postext es ramifica cap a una pàgina amb marques de tall (PDF per a impremta), un lector de llibres electrònics amb el text recompost a la mida de la pantalla (Llibre EPUB), una finestra de navegador (Lector web) i una parella de pàgines (Cada pàgina, composta).",
        narration: "Així, quan el teu contingut canviï, quan el corregeixis, l’ampliïs o el tradueixis, no t’hauràs de preocupar pel format. Postext el torna a compondre amb les mateixes regles. Un sol fitxer per a tot el llibre: un PDF a punt per a impremta, un llibre electrònic EPUB, un lector per al web i pàgines que es componen soles.",
      },
      {
        time: "4:52",
        scene: "Tancament: el logotip de Postext, el lema «El tipògraf programable per al web», postext.dev, una pastilla amb «Els prompts d’aquest vídeo són a la descripció ↓» i el peu «Codi obert · MIT · github.com/drnachio/postext».",
        narration: "Postext. Codi obert, a postext.dev. Tens els prompts d’exemple a la descripció.",
      },
    ],
    ar: [
      {
        time: "0:00",
        scene: "بطاقة العنوان: شعار Postext، والعنوان التمهيدي «درس · 5 خطوات»، والعنوان «حوّل منشورك إلى Postext» وتحته «بمساعدة وكيل ذكاء اصطناعي. بلا برمجة.»",
      },
      {
        time: "0:03",
        scene: "«منشورك موجود بالفعل.» ثلاث صفحات عربية تنزل واحدة بعد أخرى: صفحة رواية تفتتح «الفصل الأول» بعنوان «الباب الأزرق»، وصفحة بحث من «مجلة دراسات الكتاب والنشر» عنوانه «أثر الكشيدة في سرعة قراءة النص العربي المطبوع: تجربة على قرّاء جامعيين»، والصفحة الأولى من صحيفة «الساحل» وعنوانها الرئيسي «الترام يعود إلى رأس المرجان بعد ستين عامًا». توسم الصفحات InDesign (IDML) وWord (DOCX) وPDF، ثم تتجمّع على اليمين، ويمرّ سهم ذهبي متقطع نحو اليسار عبر شارة «وكيل ذكاء اصطناعي»، وتظهر أيقونة ملف اسمه my-book.postext، تحت «وكيل يحوّله إلى Postext.» و«خمس خطوات. وبضعة طلبات محكمة الصياغة.»",
        narration: "لديك منشور جاهز بالفعل: رواية، أو بحث علمي، أو صحيفة. وهو يعيش في InDesign، أو في Word، أو في ملف PDF. في هذا الدرس، سيحوّله وكيل ذكاء اصطناعي إلى Postext نيابةً عنك. بلا برمجة: خمس خطوات فقط، وبضعة طلبات محكمة الصياغة.",
      },
      {
        time: "0:25",
        scene: "«الخطة»: تظهر من اليمين إلى اليسار خمس بطاقات مرقّمة كلما ذُكرت خطوة: 01 جهّز المجلد، 02 اجمع الرسوم الأصلية، 03 أضف مرجعًا، 04 اطلب من الوكيل، 05 راجع في Sandbox.",
        narration: "إليك الخطة: جهّز المجلد، واجمع الرسوم الأصلية، وأضف مرجعًا، واطلب من الوكيل، ثم راجع النتيجة.",
      },
      {
        time: "0:35",
        scene: "«الخطوة 01 · المجلد»: «مشروع واحد، مجلد واحد.» مجلد كبير، my-book/، يطفو بين عشرة ملفات متناثرة، منها MinionPro-Regular.otf وcover.jpg وfig-2-1.ai وchapter-01.docx وmap.svg وbook.idml وchart.pdf. تنفتح نافذة على شجرة المجلد ويطير كل ملف إلى مجلده الفرعي حين يُذكر نوعه: reference.pdf («كيف يجب أن يبدو → الخطوة 03»)، وfonts/ («Minion Pro، Myriad… (.otf .ttf .woff2)»)، وimages/ («صور فوتوغرافية (.jpg .png)»)، وartwork/ («الرسوم المتّجهية الأصلية (.ai .svg .pdf)»)، وtext/ («Word، InDesign (IDML)…»).",
        narration: "الخطوة الأولى: ضع كل شيء في مجلد واحد على حاسوبك. مشروع واحد، مجلد واحد. وفي داخله، خصّص لكل نوع من المواد مجلدًا فرعيًا: الخطوط، والصور، والرسوم التوضيحية، وملفات النص.",
      },
      {
        time: "0:54",
        scene: "يُبرَز صف fonts/ وتعرض بطاقة عنوانها «الخطوط» «Aa» كبيرة، والأساليب «عادي» و«مائل» و«عريض»، والصيغ OTF وTTF وWOFF2، والملاحظة «لا يمكن استخدام إلا الخطوط التي تضعها.» ثم «كلما زاد ترتيب المجلد، قلّ ما يخمّنه.»، بينما ينال كل مجلد فرعي في الشجرة علامة صح.",
        narration: "لا تنسَ الخطوط. فهي صوت التصميم، والوكيل لا يستطيع أن يستخدم إلا ما تضعه منها. كلما زاد ترتيب المجلد، قلّ ما على الوكيل تخمينه.",
      },
      {
        time: "1:07",
        scene: "«الخطوة 02 · الرسوم المتّجهية الأصلية»: «اجمع الأصول.» مخطط ورسم بياني وخريطة تُرسم خطوطًا مع ظهور نقاط الارتكاز، وتظهر ثلاث أيقونات ملفات: .ai Illustrator و.svg SVG و.pdf PDF.",
        narration: "الخطوة الثانية: إن كانت رسومك متّجهية، كالمخططات والرسوم البيانية والخرائط، فابحث عن ملفاتها الأصلية: Illustrator، أو SVG، أو PDF.",
      },
      {
        time: "1:21",
        scene: "لوحتان تعرضان الشكل نفسه، مخططًا يشير فيه «المخطوطة» و«القالب» كلاهما إلى «الصفحات»، وتعليقه «شكل 2.1 يلتقي المحتوى والتصميم.» على اليمين لوحة «مقصوص من PDF»، «صورة للرسم»، تصير ضبابية ومربّعة كلما اقترب العرض؛ وعلى اليسار تبقى لوحة «الأصل»، «الرسم نفسه»، حادّة. تخفت اللوحة اليمنى، وتُكتب تسميات الأصل من جديد بالإنجليزية (Manuscript وTemplate وPages)، وتحيط به علامات القص، وتقول ثلاث علامات صح: «حادّ بأي حجم» و«التسميات نص حقيقي» و«الأصل الطباعي → المطبعة».",
        narration: "الشكل المقصوص من ملف PDF النهائي ليس أكثر من صورة للرسم. أما الأصل، فهو الرسم نفسه. وبه يعيد الوكيل بناء كل شكل: حادًّا بأي حجم، وتسمياته نصٌّ حقيقي جاهز للترجمة. وفي الطباعة، يذهب الأصل إلى المطبعة كما هو.",
      },
      {
        time: "1:45",
        scene: "«الخطوة 03 · المرجع»: «أرِه كيف ينبغي أن يبدو.» في شجرة المجلد يُبرَز reference.pdf ويحمل وسم «★ في الجذر»؛ تطير منه صفحة وتصير صفحة كبيرة من عمودين من الطبعة العربية لدليل Postext، افتتاحية الفصل «لماذا Postext»، موسومة reference.pdf.",
        narration: "الخطوة الثالثة أساسية: في جذر المجلد، ضع ملفًا يبيّن بوضوح كيف ينبغي أن يبدو المنتج النهائي. وملف PDF هو الأمثل.",
      },
      {
        time: "1:57",
        scene: "تظهر القياسات فوق الصفحة: حدود الأعمدة، و«الفاصل 9 مم»، و«الهامش 20 مم»، وتسميات «العنوان · Fraunces 28 نقطة» و«المتن · Lora 9.4/13.6 نقطة» و«الإطار · مظلّل، خط واحد»، وخطوط أساس عليها «تباعد الأسطر 13.6 نقطة». ويمتلئ ملف اسمه spec-sheet.md: الصفحة 210 × 280 مم؛ الهوامش 24 · 20 · 22 · 20 مم، متناظرة؛ الأعمدة 2 · فاصل 9 مم؛ شبكة خطوط الأساس 13.6 نقطة؛ المتن Lora 9.4 / 13.6 نقطة، مضبوط؛ العناوين Fraunces 28 نقطة · Geist؛ الافتتاحيات شريط ملوّن، 101 مم؛ الإطارات تظليل + خط جانبي. ثم تُشطب كلمة «التخمين» وتضيء «القياس.» بالذهبي.",
        narration: "يقرأ الوكيل التصميم من تلك الصفحات. يقيس الهوامش والأعمدة والخطوط والمسافات، ويدوّنها قواعدَ للإخراج. من دون مرجع، سيضطر إلى التخمين. ومع المرجع، يقيس.",
      },
      {
        time: "2:13",
        scene: "«الخطوة 04 · الوكيل»: «اطلبه بكلمات بسيطة.» تنفتح نافذة عنوانها «الوكيل · ~/my-book» بجانب الشارات Claude Code وCodex و«أو أي وكيل آخر». تُكتب رسالة من «أنت»: «ثبّت مهارة Postext: npx skills add drnachio/postext --skill postext-port»، ويجيب الوكيل «✓ ثُبّتت المهارة: postext-port». وتعدّد بطاقة «مهارة» باسم postext-port: «سير عمل مجرَّب» و«كل ما يخص Postext» و«أدوات ليراجع عمله بنفسه».",
        narration: "الخطوة الرابعة: افتح وكيلك، Claude Code أو Codex أو أيًّا كان ما تستخدمه، في ذلك المجلد، واطلب منه تثبيت مهارة Postext. المهارة حزمة من خبرة المختصين. وهذه تعلّم الوكيل كيف ينقل منشورًا إلى Postext، وتمنحه الأدوات ليراجع عمله بنفسه.",
      },
      {
        time: "2:36",
        scene: "يُكتب الطلب التالي: «استخدم مهارة postext-port لتحويل هذا الكتاب إلى Postext. التصميم في reference.pdf، والخطوط في fonts/، والرسوم الأصلية في artwork/: استخدمها بدل قصّ الأشكال من ملف PDF. ابدأ بالفصل 1 فقط، وأرني ورقة المواصفات قبل أن تبنيه.» وبجانبه تضيء reference.pdf وfonts/ وartwork/ في شجرة المجلد كلما ذكرها الطلب، وتظهر بطاقة «فصل» برقم 1.",
        narration: "ثم اطلب ما تريد بكلمات بسيطة. أخبره أين المرجع والخطوط والأصول، واطلب منه أن يبدأ بفصل واحد.",
      },
      {
        time: "2:49",
        scene: "شبكة من اثنتي عشرة صفحة باهتة من الدليل العربي؛ الأولى محاطة بإطار ذهبي. سهم دائري يعدّ عليها الجولات («جولة 1»، «جولة 2»…) حتى تظهر علامة صح، ثم تضيء الإحدى عشرة الأخرى. وتحتها: «فصل نموذجي» ← «اصقل» ← «عمّم».",
        narration: "إن كان المحتوى طويلًا، فابدأ بفصل نموذجي. اصقله حتى يكتمل، وبعدها فقط عمّمه على الباقي.",
      },
      {
        time: "2:58",
        scene: "يسأل الوكيل «نسخة أمينة أم إعادة تصميم؟» و«أي اللغات؟» و«للطباعة أم للشاشة أم لكليهما؟». وتمرّ قائمة تحقق على: جرد المواد، وقياس التصميم، واستخراج النص، والخطوط والصور، ومقارنة صفحة بصفحة، وحزم الملف، ثم يظهر الملف my-book.postext. ويُكتب طلب ثالث: «الفصل 1 معتمد. حوّل بقية الفصول بالتصميم نفسه، وقارن كل فصل بـ reference.pdf، واجمع كل شيء في ملف .postext واحد.» ويردّ الوكيل «✓ 12 فصلًا · 0 تحذيرات · my-book.postext».",
        narration: "سيطرح الوكيل بضعة أسئلة: نسخة أمينة أم إعادة تصميم، وأي اللغات، وللطباعة أم للشاشة. ثم يقيس، ويستخرج، ويجمّع، ويراجع. ويسلّمك ملف Postext. وحين يصبح النموذج مضبوطًا، فإن تعميمه على الكتاب كله ليس إلا طلبًا آخر.",
      },
      {
        time: "3:22",
        scene: "«الخطوة 05 · Sandbox»: «راجعه صفحةً صفحة.» نافذة متصفح يُكتب فيها العنوان postext.dev/ar/sandbox، وواجهتها من اليمين إلى اليسار. ينقر المؤشر «الكتب» في الشريط الجانبي، ثم «جديد»، ثم «افتح ملف .postext…»؛ يطير الملف إلى الداخل، ويظهر «كتابي» و«12 فصلًا · 184 صفحة» أعلى القائمة، وتنفتح أولى صفحاته من الدليل العربي في عرض Canvas، بين الألسنة Canvas وHTML وPDF وFolio وEPUB 3.",
        narration: "الخطوة الخامسة: افتح Postext Sandbox على postext.dev. في «الكتب»، اختر «جديد»، وافتح ملفك.",
      },
      {
        time: "3:33",
        scene: "تقف الصفحة المرجعية وصفحة Postext جنبًا إلى جنب، موسومتين «المرجع» و«POSTEXT»، ويمسحهما خط ذهبي نزولًا. تنفتح لوحة «الفحوص» بشارة 3 وتعدّد: «سطر أرمل» (ص 4)، و«سطر متخلخل» (ص 7)، و«الشكل لا يتّسع» (ص 9)؛ وتعلّم مربعات حمراء كل مشكلة على صفحة Postext.",
        narration: "راجعه صفحةً صفحة إلى جانب مرجعك. ولوحة «الفحوص» تدلّك على المشكلات: الأرامل، والأسطر المتخلخلة، والأشكال التي لا تتّسع.",
      },
      {
        time: "3:45",
        scene: "صفّان من المخططات الهيكلية للصفحات، «المرجع · PDF» و«POSTEXT · بعد إعادة التدفق». في الصف الثاني ينتقل «شكل» من الصفحة الأولى إلى أعلى الثانية، ويصل خط متقطع بين موضعيه. النص: «القواعد نفسها، لا الصفحات نفسها.» و«المحتوى يتدفّق: قد يقع شكل أو فاصل صفحة في موضع آخر.» ثم تجمع علامة مساواة كل زوج من الصفحات تحت «ما يجب أن يتطابق»: الهوامش وشبكة خطوط الأساس، والخطوط وأحجامها، وأنماط الأشكال والإطارات، وصفحات نظيفة: بلا أرامل، وأعمدة متوازنة. ولوحة حمراء عليها ≠ تقول: «قرارات حِرفية يدوية» و«ليست قواعد، فلا تصلح لتنضيد محتوى يتغيّر».",
        narration: "تذكّر أمرًا واحدًا: لا يلزم أن تطابق الصفحات ملف PDF الأصلي. فقد تعلّم Postext قواعد الإخراج، وصار محتواك يتدفّق، فقد يقع شكل أو فاصل صفحة في موضع آخر. ما يجب أن يتطابق هو الجودة: معايير الإنتاج نفسها. فحين نُخرج الصفحات يدويًا، نتخذ قرارات حِرفية صغيرة ليست قواعد. ووحدها القواعد تنضّد محتوى لا يكفّ عن التغيّر.",
      },
      {
        time: "4:17",
        scene: "تعود نافذة الوكيل بطلب رابع: «في Sandbox، الفصل 2، الصفحة 7: إطار «تذكّر» منقسم بين عمودين، والترويسة مفقودة. ولوحة «الفحوص» تُظهر 3 أسطر متخلخلة. أصلح ذلك وأعد حزم الملف.» وتُرفق لقطة شاشة، screenshot-ch2-p7.png. ثم تدور حلقة بين SANDBOX («راجع») و«الوكيل» («أصلح») في الجولات من 1 إلى 3 بينما ينخفض عدد التحذيرات من 3 إلى 0، وتنتهي بعلامة صح و«مضبوط تمامًا.»",
        narration: "ثم أخبر الوكيل بما تراه، بأدقّ ما يمكن: الفصل، والصفحة، وموضع الخلل. ولقطة الشاشة تساعد. افتح النسخة الجديدة، وراجع مجددًا، وكرّر. كل جولة تقترب أكثر، حتى يصبح مضبوطًا تمامًا.",
      },
      {
        time: "4:38",
        scene: "«ليست مجرد نسخة Postext.» ينقسم الملف my-book.postext إلى اثنين على طول خط ذهبي. على اليمين «المحتوى» («ما يقوله»): chapters/ar/02-the-cell.md، بالعنوان «# الخلية»، وجملة «كل كائن حي مكوَّن من خلايا، كما يبيّن :ref{id=\"fig-cell\"}.»، وإطار :::callout{type=\"remember\"} نصه «الخلية أصغر وحدة للحياة.» وعلى اليسار «الشكل» («كيف يبدو»): «القالب · مستنبَط من أصلك»، بصفحة 210 × 280 مم، متناظرة، وعمودين بينهما فاصل 9 مم، ومتن Lora 9.4/13.6 مضبوط، وعناوين Fraunces مرقّمة، وإطارات «تذكّر» بتظليل وخط، وأشكال تطفو إلى رأس العمود.",
        narration: "وهذا أجمل ما في الأمر: لم تصنع نسخة Postext من محتواك فحسب. لقد فصلت المحتوى عن الشكل. النص يعيش في فصول نظيفة. والتصميم يعيش في قالب، بقواعد إخراج مستنبَطة من أصلك.",
      },
      {
        time: "4:55",
        scene: "تضيء شارات «صحّح» و«وسّع» و«ترجم» فوق صف من صفحات الدليل العربي: يُبرَز سطر ويعبر بريق الصفحات، وتنزلق صفحتان أخريان، ثم تنقلب الصفحات إلى الطبعة الإنجليزية. ويُكتب طلب: «أضف طبعة إنجليزية: ترجم الفصول والتعليقات وتسميات المخططات، وحافظ على التصميم نفسه.» والتعليق: «القواعد نفسها. محتوى جديد. صفحات تنضّد نفسها.» ثم «ملف واحد، الكتاب كله.»: أيقونة .postext تتفرّع إلى أربعة: صفحة بعلامات قص («PDF جاهز للطباعة»)، وقارئ إلكتروني يتدفّق فيه النص («كتاب إلكتروني EPUB»)، ونافذة متصفح («قارئ للويب»)، وصفحتان متقابلتان («كل صفحة، منضَّدة»).",
        narration: "فحين يتغيّر محتواك، حين تصحّحه أو توسّعه أو تترجمه، لن تحتاج إلى التفكير في الإخراج. فـ Postext ينضّده من جديد، وفق القواعد نفسها. ملف واحد للكتاب كله: PDF جاهز للطباعة، وكتاب إلكتروني بصيغة EPUB، وقارئ للويب، وصفحات تنضّد نفسها بنفسها.",
      },
      {
        time: "5:22",
        scene: "بطاقة الختام: شعار Postext واسمه اللاتيني، والعبارة «المنضّد القابل للبرمجة للويب»، وpostext.dev، وشارة كُتب عليها «ستجد طلبات هذا الفيديو في الوصف ↓»، والتذييل «مفتوح المصدر · MIT · GITHUB.COM/DRNACHIO/POSTEXT».",
        narration: "Postext. مفتوح المصدر، على postext.dev. ستجد أمثلة الطلبات في الوصف.",
      },
    ],
    ja: [
      {
        time: "0:00",
        scene: "縦組みのタイトルカード：Postextのロゴの下に、右から順にキッカー「チュートリアル · 5つのステップ」、タイトル「あなたの出版物を」「Postext に」（金色）、サブタイトル「AIエージェントで。プログラミングは不要。」",
      },
      {
        time: "0:03",
        scene: "右端に縦に「あなたの出版物は、すでにある。」日本語のページが3枚降りてきます。右から、縦組みの小説のページにはInDesign（IDML）、横組みの技術書のページにはWord（DOCX）、緑の帯の町内会報「東若葉台だより」にはPDFのラベルが付きます。3枚が一つに集まり、金色の破線の矢印が「AIエージェント」のラベルを通ってmy-book.postextという名前のファイルアイコンを指します。右端の文字は「エージェントで Postext へ。」と「5つのステップ。よく書けた依頼を、いくつか。」に変わります。",
        narration: "あなたの手もとには、もう出版物があります。小説、技術書、町内会のたより。InDesignやWord、PDFの中にあります。この回では、AIエージェントがそれをPostextにします。コードは不要。五つのステップと、よく書けた依頼がいくつかあれば十分です。",
      },
      {
        time: "0:28",
        scene: "「計画」：ナレーションがステップを挙げるたびに、番号付きのカードが右から1枚ずつ現れます。01「フォルダーを整理」、02「ベクターの原図をそろえる」、03「見本を加える」、04「エージェントに頼む」、05「Sandbox で確認」。",
        narration: "手順はこうです。フォルダーを整理し、イラストの元データをそろえ、見本を一つ置き、エージェントに頼んで、最後に結果を確かめます。",
      },
      {
        time: "0:41",
        scene: "ステップ01、見出しが右端に縦に組まれています。「ステップ 01 · フォルダー」「プロジェクトひとつに、フォルダーひとつ。」大きなフォルダーmy-book/のまわりに、ばらばらのファイルが10個浮かんでいます。NotoSerifJP-Regular.otf、表紙.jpg、図1-1.ai、第一章.docx、NotoSerifJP-Bold.otf、地図.svg、写真-07.jpg、NotoSansJP-Bold.otf、本.idml、グラフ.pdf。フォルダーの中身を示すウィンドウが開き、ナレーションが種類を挙げるたびに、ファイルが対応するサブフォルダーへ飛び込みます。見本.pdf（仕上がりの姿 → ステップ 03）、fonts/（Noto Serif JP、Noto Sans JP…、.otf .ttf .woff2）、images/（写真、.jpg .png）、artwork/（ベクターの原図、.ai .svg .pdf）、text/（Word、InDesign（IDML）…）。",
        narration: "ステップ1。すべてをパソコンの一つのフォルダーに。一つのプロジェクトに一つのフォルダー。その中に、素材の種類ごとのサブフォルダーを作ります。フォント、画像、イラスト、そして原稿。",
      },
      {
        time: "0:59",
        scene: "fonts/の行が強調され、「フォント」のカードに大きな「永」の字、明朝体・ゴシック体・太字の三つの字様、OTF・TTF・WOFF2の三つの形式、そして注記「埋め込めるものだけを。入れたものしか使われない。」が表示されます。続いて縦に「整ったフォルダーほど、推測は減る。」が現れ、ツリーの各サブフォルダーにチェックマークが付きます。",
        narration: "フォントを忘れずに。和文フォントは大きく、多くはライセンスが必要です。埋め込める、たとえばNoto Serif JPのようなオープンソースのフォントだけを。エージェントは入れたものしか使えません。フォルダーが整っているほど、エージェントの推測は減ります。",
      },
      {
        time: "1:20",
        scene: "ステップ02：「ステップ 02 · ベクターの原図」「原図をそろえる。」図解、グラフ、地図がアンカーポイントの見える線画で描かれ、三つのファイルアイコンが現れます。.ai Illustrator、.svg SVG、.pdf PDF。",
        narration: "ステップ2。イラストが図解やグラフ、地図のようなベクター画像なら、元のファイルを探しましょう。Illustrator、SVG、またはPDFです。",
      },
      {
        time: "1:34",
        scene: "2枚のパネルに同じ図が表示されます。「原稿」と「テンプレート」が「ページ」を指す図解で、キャプションは「図2-1　内容とデザインが出会う」。右の「図の写真 · PDF から切り出し」は、拡大するにつれてぼやけ、ピクセルのかたまりに崩れます。左の「図そのもの · 原図」は拡大してもくっきりしたままです。右のパネルが暗くなり、原図のラベルが英語（Manuscript、Template、Pages）に打ち直され、四隅にトンボが付き、三つのチェックマークが並びます。「どれだけ拡大してもくっきり」「図の文字は本物の文字」「原図 → 入稿」。",
        narration: "完成したPDFから切り抜いた図は、絵の写真のようなもの。元のファイルこそが、絵そのものです。元のファイルがあれば、エージェントは図を一つずつ作り直します。どこまで拡大してもくっきりして、図の文字も本物の文字なので、翻訳できます。そして印刷には、元のデータがそのまま入稿されます。",
      },
      {
        time: "2:01",
        scene: "ステップ03：「ステップ 03 · 見本」「仕上がりの姿を見せる。」フォルダーの一覧で見本.pdfが強調され、「★ ルートに置く」のタグが付きます。そこから1ページが飛び出し、例の教科書『山の地形』の縦組み・上下2段のページとして大きく表示されます。柱は「第一章　氷河は山の谷をどう削るか」で、氷河の谷の写真が2点入っています。",
        narration: "ステップ3は欠かせません。フォルダーのいちばん上に、完成品の姿がはっきりわかるファイルを置きます。PDFが理想です。",
      },
      {
        time: "2:12",
        scene: "ページの上に寸法が現れます。上下2段の縦の行の輪郭、「天 28 mm」「小口 24 mm」「段間 2字」「1行 30字」「1段 26行」「行送り 15 pt」。見出し、本文、キャプションには「見出し · Noto Sans JP 11 pt」「本文 · Noto Serif JP 9/15 pt」「キャプション · Noto Sans JP 7.5 pt」のラベルが付きます。隣の仕様書.mdが1行ずつ埋まっていきます。判型 185 × 260 mm（B5変型）· 縦組み・右綴じ、版面 上下2段 · 1行30字 × 26行、段間 2字（18 pt）、本文 Noto Serif JP 9 pt・行送り15 pt、両端そろえ、字下げ 1字、見出し Noto Sans JP · 第一章 / 一、約物 JIS X 4051 · 禁則処理、キャプション 図1-1　ゴシック体 7.5 pt。最後に「推測」の語に赤い取り消し線が引かれ、金色の「実測。」が光ります。",
        narration: "エージェントは、そのページからデザインを読み取ります。判型、版面、字詰めと行数、文字の大きさ、行送り、約物の扱い。そして、それをレイアウトの規則として書き留めます。見本がなければ、推測するしかありません。見本があれば、測れます。",
      },
      {
        time: "2:37",
        scene: "ステップ04：「ステップ 04 · エージェント」「ふだんの言葉で頼む。」「エージェント · ~/my-book」と題したウィンドウが、Claude Code、Codex、「ほかのエージェントでも」のバッジの横に開きます。日本語の画面は横書きで読むため、ウィンドウの中は横組みです。「あなた」のメッセージが打ち込まれます。「Postext のスキルをインストールしてください：`npx skills add drnachio/postext --skill postext-port`」。エージェントが「✓ スキルをインストールしました：postext-port」と答えます。「スキル · postext-port」のカードには「実績のある手順」「Postext のすべての知識」「自分の仕事を確かめる道具」が並びます。",
        narration: "ステップ4。そのフォルダーでエージェントを開きます。Claude CodeでもCodexでも、ふだんのもので。そして、Postextのスキルを入れるよう頼みます。スキルとは、専門的なノウハウのパッケージです。これは、出版物をPostextに移す方法をエージェントに教え、自分の仕事を確かめる道具も渡します。",
      },
      {
        time: "3:03",
        scene: "次の依頼が打ち込まれます。「postext-port スキルで、この本を Postext に変換してください。デザインは `見本.pdf` のとおり、フォントは `fonts/`、元のイラストは `artwork/` にあります。PDF から図を切り抜かずに、元のイラストを使ってください。まず第一章だけを作り、組む前に仕様書を見せてください。」隣のフォルダーの一覧では、依頼が名前を挙げるのに合わせて見本.pdf、fonts/、artwork/が順に光り、「見本の章」と大きな「1」のカードが現れます。",
        narration: "それから、してほしいことをふだんのことばで頼みます。見本とフォントと元データの場所を伝え、まず一つの章だけで始めるよう頼みましょう。",
      },
      {
        time: "3:16",
        scene: "依頼のウィンドウの横に、暗くした縦組みの教科書のページが12枚、格子状に並び、最初の1枚が金色の枠で囲まれます。円を描く矢印がそのページで磨いた回数を「1回目」から「3回目」まで数え、チェックマークが付くと、残りの11ページが明るくなります。下には「見本の章 → 磨く → 広げる」。",
        narration: "内容が長いときは、まずサンプルの章を一つ作ります。完璧になるまで磨き上げ、それから残りに広げます。",
      },
      {
        time: "3:26",
        scene: "エージェントが四つの質問をします。「原本どおり？ それとも作り直す？」「どの言語で？」「印刷、画面、それとも両方？」「縦組み？ 横組み？」チェックリストが、素材を洗い出す、デザインを測る、文章を取り出す、フォントと画像、ページごとに比べる、ファイルにまとめる、と一つずつ完了し、ファイルmy-book.postextが現れます。3つ目の依頼が打ち込まれます。「第一章はこれで承認です。残りの章も同じデザインで変換し、一章ずつ `見本.pdf` と比べて、すべてを一つの .postext ファイルにまとめてください。」エージェントは「✓ 12章 · 警告0件 · my-book.postext」と返します。",
        narration: "エージェントはいくつか質問をします。元のとおりに再現するか、デザインし直すか、どの言語か、紙か画面か、横組みか縦組みか。そのあと、測り、取り出し、組み立て、確かめて、Postextのファイルを渡してくれます。サンプルがうまくいけば、本全体に広げるのはもう一度頼むだけです。",
      },
      {
        time: "3:57",
        scene: "ステップ05：「ステップ 05 · Sandbox」「ページごとに、確かめる。」ブラウザーのウィンドウのアドレス欄にpostext.dev/ja/sandboxが打ち込まれます。ポインターがサイドバーの「本」、「新規」、「.postextファイルを開く…」を順にクリックします。ファイルが飛び込み、一覧の先頭に「私の本 · 12章 · 184ページ」が現れ、Canvasのビューに縦組みの見開きが開きます。上部のタブはCanvas、HTML、PDF、Folio、EPUB 3です。",
        narration: "ステップ5。postext.devでPostextのサンドボックスを開きます。「本」で「新規」を選び、あなたのファイルを開きます。",
      },
      {
        time: "4:09",
        scene: "サイドバーが「デザイン」パネルに替わり、「表記体系」のグループに「日本語の既定設定」と「確認…」のボタンがあります。設定の行に一つずつチェックマークが付きます。文書の言語 ja、本文の書体 Noto Serif JP、見出しの書体 Noto Sans JP、1行目の字下げ 1字、行そろえ 両端そろえ、キャプションのラベル 図1-1　タイトル、章番号 第一章、番号付きリスト 一、（一）1（1）①、ノンブルの数字 漢数字（一〇五）。",
        narration: "一から作る日本語の本なら、デザインの「日本語の既定設定」で、日本の組版のならわしを一度に適用できます。",
      },
      {
        time: "4:20",
        scene: "見本のページとPostextで組んだページが、「見本」と「POSTEXT」のラベル付きで並びます。「検査」パネルが開き、三つの問題を挙げます。行長に満たないCJKの行（4ページ）、PDFのフォントにない文字（7ページ）、段からはみ出す囲み（7ページ）。Postextのページの上で、赤い枠がそれぞれの箇所を示します。",
        narration: "見本と並べて、一ページずつ確かめます。「検査」パネルが問題を教えてくれます。行長に満たない行、フォントにない文字、段からはみ出す囲み。",
      },
      {
        time: "4:34",
        scene: "ページの略図が2列に並びます。「見本 · PDF」と「POSTEXT · 内容が流れる」。流れるほうの列では、「図」が1ページ目から2ページ目の段の上へ移り、破線が二つの位置を結びます。縦に「規則は同じ、ページは別。」と「内容は流れる。図や改ページが、別の場所に来ることもある。」続いて、ページの各組を等号が結び、「そろえるべきもの」として、判型、版面、字詰め、書体と文字サイズ、図と囲みのスタイル、きれいな紙面：1字だけの行がなく、段がそろう、が並びます。≠の印が付いた赤いパネルには「手作業による職人の判断」と「規則ではないので、変わっていく内容は組めない」。",
        narration: "一つ覚えておいてください。ページがPDFとまったく同じでなくてもいいのです。Postextが学んだのはレイアウトの規則。内容は今、流れているので、図や改ページが別の場所に来ることもあります。そろうべきなのは品質、つまり同じ仕上がりの水準です。手で組むとき、私たちは規則ではない小さな職人の判断をたくさんしています。そして、変わり続ける内容を組めるのは、規則だけです。",
      },
      {
        time: "5:09",
        scene: "サンドボックスの上にエージェントのウィンドウが戻り、4つ目の依頼が打ち込まれます。「サンドボックスの第二章、7ページ：「ポイント」の囲みが二つの段に分かれていて、柱も消えています。「検査」には行長に満たない行が3つ出ています。直して、ファイルをまとめ直してください。」スクリーンショット「スクリーンショット-第二章-p7.png」が添付されます。続いて、Sandbox（確かめる）とエージェント（直す）のあいだのループが1回目から3回目まで回り、警告の数が3から0に減り、チェックマークと縦組みの「ぴったり。」で終わります。",
        narration: "それから、見たことをエージェントに伝えます。できるだけ具体的に。どの章の、どのページで、何がおかしいか。スクリーンショットがあると助かります。新しい版を開いて、もう一度確かめ、これを繰り返します。回を重ねるごとに近づき、やがてぴったりになります。",
      },
      {
        time: "5:34",
        scene: "縦組みで「ただの」「Postext 版ではない。」ファイルmy-book.postextが金色の線で二つに割れます。一方は「内容 · 何を言うか」：chapters/01-glaciers.mdに、見出し「# 氷河は山の谷をどう削るか」、:ref{id=\"valleys\"}で図を参照する文「氷河が通った谷は広く、谷底は平らで、横断面はＵ字形になる」、そして「氷河は、流れる氷である。」と書かれた「ヒント」の囲み。もう一方は「形 · どう見えるか」：「テンプレート · 原本から導いたもの」に、判型 185 × 260 mm（B5変型）、縦組み、版面 2段 × 30字 × 26行、本文 Noto Serif JP 9/15 pt、見出し Noto Sans JP、第一章 / 一、約物 JIS X 4051、禁則処理、図 図1-1、段の上にフロート。",
        narration: "ここが肝心です。手にしたのは、内容のPostext版だけではありません。内容と形を、分けたのです。文章は整った章の中に、デザインはテンプレートの中にあり、レイアウトの規則は元の本から導き出されています。",
      },
      {
        time: "5:54",
        scene: "縦組みのページの列の上で、「修正」「増補」「翻訳」のチップが順に光ります。1行が強調されてページの上を光が横切り、2ページが滑り込み、続いてページがめくれて、同じテンプレートで組んだ横組みの英語版に変わります。依頼が打ち込まれます。「英語版を追加してください。本文、キャプション、図の中の文字を翻訳し、デザインはそのままにしてください。」キャプションは「同じ規則、新しい内容。ページはひとりでに組まれる。」続いて縦に「ファイル一つに、本一冊。」：.postextのアイコンから4本の枝が伸び、トンボ付きのページ（入稿用 PDF）、電子書籍リーダー（EPUB 電子書籍）、ブラウザーのウィンドウ（ウェブリーダー）、見開きのページ（どのページも組み上がる）につながります。",
        narration: "だから内容が変わっても、直しても、増やしても、翻訳しても、レイアウトを気にする必要はありません。Postextが同じ規則で組み直します。一冊の本に、ファイルは一つ。印刷用のPDF、EPUBの電子書籍、ウェブで読めるリーダー、そしてひとりでに組み上がるページ。",
      },
      {
        time: "6:21",
        scene: "エンドカード：Postextのロゴ、キャッチフレーズ「ウェブで動く、プログラムできる組版システム」、postext.dev、「この動画のプロンプトは概要欄にあります ↓」と書かれたピル、フッター「オープンソース · MIT · GITHUB.COM/DRNACHIO/POSTEXT」。",
        narration: "Postext。オープンソースで、postext.devにあります。プロンプトの例は概要欄に。",
      },
    ],
    pt: [
      {
        time: "0:00",
        scene: "Abertura: o logotipo do Postext, a chamada “Tutorial · 5 passos” e o título “Converta sua publicação em Postext com um agente de IA. Sem programar.”",
      },
      {
        time: "0:03",
        scene: "“Sua publicação já existe.” Três capas caem uma depois da outra com as suas etiquetas: um livro, Dom Casmurro, de Machado de Assis (Coleção Casuarina), marcado InDesign (IDML); um manual, o da chaleira elétrica Verra W1, marcado Word (DOCX); e uma revista, FALLOW, marcada PDF. Elas se agrupam à esquerda, uma seta dourada tracejada passa por um selo “Agente de IA” e aparece um ícone de arquivo, meu-livro.postext, sob “Um agente a converte em Postext. Cinco passos. Alguns pedidos bem escritos.”",
        narration: "Você já tem uma publicação: um livro, um manual, uma revista. Ela vive no InDesign, no Word ou num PDF. Neste tutorial, um agente de inteligência artificial vai convertê-la em Postext para você. Sem programar: cinco passos e alguns pedidos bem escritos.",
      },
      {
        time: "0:24",
        scene: "“O plano”: cinco cartões numerados aparecem à medida que cada passo é nomeado: 01 Prepare a pasta, 02 Reúna os originais vetoriais, 03 Adicione uma referência, 04 Peça ao agente, 05 Revise no Sandbox.",
        narration: "O plano: preparar a pasta, reunir os originais vetoriais, adicionar uma referência, pedir ao agente e revisar o resultado.",
      },
      {
        time: "0:34",
        scene: "Passo 01, a pasta: “Um projeto, uma pasta.” Uma pasta grande, meu-livro/, flutua entre dez arquivos soltos, como MinionPro-Regular.otf, capa.jpg, fig-2-1.ai, capitulo-01.docx, mapa.svg, livro.idml e grafico.pdf. Abre-se uma janela com a árvore da pasta, e cada arquivo voa para a sua subpasta quando ela é nomeada: referencia.pdf (como deve ficar → passo 03), fontes/ (Minion Pro, Myriad…, .otf .ttf .woff2), imagens/ (fotografias, .jpg .png), ilustracoes/ (originais vetoriais, .ai .svg .pdf) e textos/ (Word, InDesign IDML…).",
        narration: "Passo um: reúna tudo numa única pasta no seu computador. Um projeto, uma pasta. Dentro dela, dê a cada tipo de material a sua própria subpasta: as fontes, as imagens, as ilustrações e os textos.",
      },
      {
        time: "0:51",
        scene: "A linha fontes/ fica destacada e um cartão com o título “Fontes” mostra um “Aa” grande, os estilos Redondo, Itálico e Negrito, os formatos OTF, TTF e WOFF2 e a nota “Só dá para usar as que você incluir.” Depois, “Quanto mais organizada, menos ele adivinha.”, enquanto cada subpasta da árvore recebe um visto.",
        narration: "Não se esqueça das fontes: elas são a voz do design, e o agente só pode usar as que você incluir. Quanto mais organizada estiver a pasta, menos o agente vai ter que adivinhar.",
      },
      {
        time: "1:04",
        scene: "Passo 02, originais vetoriais: “Reúna os originais.” Um diagrama, um gráfico e um mapa são desenhados em traço, com os pontos de ancoragem à mostra, e aparecem três ícones de arquivo: .ai Illustrator, .svg SVG e .pdf PDF.",
        narration: "Passo dois: se as suas ilustrações são vetoriais, como diagramas, gráficos ou mapas, procure os arquivos originais: Illustrator, SVG ou PDF.",
      },
      {
        time: "1:15",
        scene: "Dois painéis mostram a mesma figura, um diagrama em que Manuscrito e Modelo apontam para Páginas, com a legenda “Fig. 2.1 Conteúdo e design se encontram.” À esquerda, “Recortada do PDF: uma foto do desenho” fica borrada e pixelada ao ser ampliada; à direita, “O original: o próprio desenho” continua nítido. O painel da esquerda se apaga, os rótulos do original são reescritos em inglês (Manuscript, Template, Pages), marcas de corte o enquadram e três vistos dizem “Nítida em qualquer tamanho”, “Rótulos como texto real” e “Original → gráfica”.",
        narration: "Uma figura recortada do PDF final é pouco mais que uma foto do desenho. O original é o próprio desenho. Com o original, o agente recompõe cada figura: nítida em qualquer tamanho, com seus rótulos como texto real, prontos para traduzir. E na gráfica, o original vai do jeito que está.",
      },
      {
        time: "1:37",
        scene: "Passo 03, a referência: “Mostre como deve ficar.” Na árvore da pasta, referencia.pdf fica destacado com a etiqueta “Na raiz”; dele sai uma página que se transforma numa página de livro grande, em duas colunas, marcada referencia.pdf.",
        narration: "O passo três é essencial: na raiz da pasta, coloque um arquivo que mostre com clareza como o produto final deve ficar. O ideal é um PDF.",
      },
      {
        time: "1:47",
        scene: "Sobre a página aparecem as medidas: o contorno das colunas, uma medianiz de 9 mm, uma margem de 20 mm, etiquetas para o título (Fraunces 28 pt), o texto (Lora 9,4/13,6 pt) e um boxe (fundo, 1 fio), e as linhas de base com entrelinha de 13,6 pt. Um arquivo, ficha-de-especificacoes.md, vai sendo preenchido: página 210 × 280 mm; margens 24 · 20 · 22 · 20 mm, simétricas; 2 colunas, medianiz 9 mm; grade de linhas de base 13,6 pt; texto Lora 9,4 / 13,6 pt, justificado; títulos Fraunces 28 pt · Geist; aberturas com faixa de cor de 101 mm; boxes com fundo e fio à esquerda. Depois a palavra “Adivinhar” é riscada e “Medir.” se acende em dourado.",
        narration: "O agente lê o design nessas páginas: mede margens, colunas, fontes e espaçamentos, e os anota como regras de diagramação. Sem referência, ele teria que adivinhar. Com ela, mede.",
      },
      {
        time: "2:03",
        scene: "Passo 04, o agente: “Peça com suas palavras.” Abre-se uma janela com o título “Agente · ~/meu-livro” ao lado dos selos Claude Code, Codex e “ou qualquer outro agente”. Na janela é digitada uma mensagem assinada VOCÊ: “Instale a skill do Postext: `npx skills add drnachio/postext --skill postext-port`”, e o agente responde “✓ Skill instalada: postext-port”. Um cartão da skill postext-port lista “Um método testado”, “Tudo sobre o Postext” e “Ferramentas para revisar o próprio trabalho”.",
        narration: "Passo quatro: abra o seu agente, Claude Code, Codex ou o que você usa, nessa pasta, e peça que ele instale a skill do Postext. Uma skill é um pacote de conhecimento especializado. Esta ensina o agente a converter uma publicação para Postext, e lhe dá ferramentas para revisar o próprio trabalho.",
      },
      {
        time: "2:24",
        scene: "O pedido seguinte é digitado: “Use a skill postext-port para converter este livro para Postext. O design está em referencia.pdf, as fontes em fontes/ e as ilustrações originais em ilustracoes/: use-as em vez de recortar as figuras do PDF. Comece só pelo capítulo 1 e me mostre a ficha de especificações antes de construí-lo.” Ao lado, referencia.pdf, fontes/ e ilustracoes/ se acendem na árvore da pasta à medida que a mensagem os cita, e aparece um cartão com “Cap. 1”.",
        narration: "Depois, peça o que você quer com as suas palavras. Diga onde estão a referência, as fontes e os originais, e que ele comece por um só capítulo.",
      },
      {
        time: "2:37",
        scene: "Uma grade de doze páginas esmaecidas; a primeira ganha um contorno dourado. Uma seta circular conta as rodadas de ajuste sobre ela até aparecer um visto, e então as outras onze se acendem. Embaixo: Capítulo de amostra → Refinar → Estender.",
        narration: "Se o conteúdo for longo, comece por um capítulo de amostra. Refine-o até ficar perfeito, e só então estenda-o ao resto.",
      },
      {
        time: "2:45",
        scene: "O agente pergunta “Cópia fiel ou redesenho?”, “Quais idiomas?” e “Papel, tela ou os dois?”. Uma lista de tarefas avança por Fazer o inventário, Medir o design, Extrair o texto, Fontes e imagens, Comparar página a página e Empacotar o arquivo, e aparece o arquivo meu-livro.postext. Um terceiro pedido é digitado: “O capítulo 1 está aprovado. Converta o resto dos capítulos com o mesmo design, compare cada um com referencia.pdf e empacote tudo num único arquivo .postext.” O agente responde “✓ 12 capítulos · 0 avisos · meu-livro.postext”.",
        narration: "O agente vai fazer algumas perguntas: cópia fiel ou redesenho, quais idiomas, papel ou tela. Depois mede, extrai, monta e confere, e entrega um arquivo Postext. Quando a amostra estiver boa, estendê-la ao livro inteiro é só mais um pedido.",
      },
      {
        time: "3:08",
        scene: "Passo 05, o Sandbox: “Revise página por página.” Numa janela de navegador é digitado o endereço postext.dev/pt/sandbox. O ponteiro clica em Livros na barra lateral, depois em Novo e em “Abrir um arquivo .postext…”; o arquivo entra voando, “Meu livro, 12 capítulos · 184 páginas” aparece no alto da lista e as primeiras páginas se abrem na visualização Canvas; as abas de visualização são Canvas, HTML, PDF, Folio e EPUB 3.",
        narration: "Passo cinco: abra o Sandbox do Postext, em postext.dev. Em Livros, escolha Novo e abra o seu arquivo.",
      },
      {
        time: "3:17",
        scene: "A página de referência e a do Postext ficam lado a lado, com as etiquetas Referência e Postext, e uma linha dourada as percorre de cima a baixo. Abre-se o painel Verificações, com um contador de 3 e a lista Viúva (p. 4), Linha frouxa (p. 7) e A figura não cabe (p. 9); caixas vermelhas marcam cada problema na página do Postext.",
        narration: "Revise página por página, ao lado da sua referência. O painel Verificações aponta os problemas: viúvas, linhas frouxas, figuras que não cabem.",
      },
      {
        time: "3:28",
        scene: "Duas fileiras de páginas esquemáticas, “Referência · PDF” e “Postext · fluido”. Na fileira fluida, uma figura passa da primeira página para o topo da segunda, e uma linha tracejada liga as suas duas posições. Texto: “As mesmas regras, não as mesmas páginas. O conteúdo flui: uma figura ou uma quebra de página podem cair em outro lugar.” Depois, um sinal de igual une cada par de páginas sob “O que precisa coincidir”: Margens e grade de linhas de base, Tipografia, Estilo de figuras e boxes, Páginas limpas: sem viúvas, colunas equilibradas. Um painel vermelho com o sinal ≠ diz “Decisões artesanais à mão: não são regras, não servem para um conteúdo que muda”.",
        narration: "Tenha em mente uma coisa: as páginas não precisam ser idênticas às do PDF. O Postext entendeu as regras de diagramação e agora o seu conteúdo é fluido, então uma figura ou uma quebra de página podem cair em outro lugar. O que precisa coincidir é a qualidade: os mesmos valores de produção. Quando diagramamos à mão, tomamos pequenas decisões artesanais que não são regras. E só com regras dá para diagramar um conteúdo que muda.",
      },
      {
        time: "3:59",
        scene: "A janela do agente volta com um quarto pedido: “No Sandbox, capítulo 2, página 7: o boxe ‘Lembre’ se divide em duas colunas e falta o cabeço. Verificações marca 3 linhas frouxas. Corrija isso e empacote o arquivo de novo.” Uma captura vai anexada, captura-cap2-p7.png. Depois, um ciclo entre Sandbox (revisar) e Agente (corrigir) dá as voltas 1 a 3 enquanto o número de avisos cai de 3 para 0, e termina com um visto e “Perfeito.”",
        narration: "Depois, conte ao agente o que você vê, com a maior precisão possível: o capítulo, a página e o que está errado. Uma captura de tela ajuda. Abra a nova versão, revise de novo e repita. Cada rodada chega mais perto, até que fique perfeito.",
      },
      {
        time: "4:20",
        scene: "“Não só uma versão Postext.” O arquivo meu-livro.postext se divide em dois ao longo de uma linha dourada. À esquerda, Conteúdo (o que diz): chapters/pt/02-a-celula.md, com o título “A célula”, uma frase que cita a figura fig-celula e um boxe “lembre”. À direita, Forma (como fica): um modelo deduzido do seu original, com página de 210 × 280 mm simétrica, 2 colunas com medianiz de 9 mm, texto Lora 9,4/13,6 justificado, títulos em Fraunces numerados, boxes “lembre” com fundo e fio, e figuras no topo da coluna.",
        narration: "E o melhor: você não só tem o seu conteúdo em Postext. Você separou o conteúdo da forma. O texto vive em capítulos limpos; o design, num modelo com as regras de diagramação deduzidas do seu original.",
      },
      {
        time: "4:34",
        scene: "Os chips Corrigir, Ampliar e Traduzir se acendem sobre uma fileira de páginas: uma linha fica destacada e um brilho percorre as páginas, entram mais duas páginas e as páginas viram para mostrar a edição em inglês. Um pedido é digitado: “Acrescente uma edição em inglês: traduza os capítulos, as legendas das figuras e os rótulos dos diagramas, e mantenha o mesmo design.” Rodapé: “As mesmas regras. Conteúdo novo. As páginas se compõem sozinhas.” Depois, “Um arquivo, o livro inteiro.”: um ícone .postext se ramifica para uma página com marcas de corte (PDF para impressão), um leitor de livros digitais com o texto ajustado à sua tela (Livro digital EPUB), uma janela de navegador (Leitor web) e um par de páginas (Cada página, composta).",
        narration: "Assim, quando o seu conteúdo mudar, quando você o corrigir, ampliar ou traduzir, não vai precisar se preocupar com o formato. O Postext o recompõe com as mesmas regras. Um só arquivo para o livro inteiro: um PDF pronto para impressão, um livro digital EPUB, um leitor para a web e páginas que se compõem sozinhas.",
      },
      {
        time: "4:59",
        scene: "Fechamento: o logotipo do Postext, o lema “O tipógrafo programável para a web”, postext.dev, um chip com “Os prompts deste vídeo estão na descrição ↓” e o rodapé “Código aberto · MIT · github.com/drnachio/postext”.",
        narration: "Postext. Código aberto, em postext.dev. Os prompts de exemplo estão na descrição.",
      },
    ],
  },
};
