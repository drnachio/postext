// The Spanish cut of each narrated video, block by block.
import type { TranscriptBlock, TranscriptVideo } from "../transcripts";

export const TRANSCRIPTS_ES: Record<TranscriptVideo, TranscriptBlock[]> = {
  showreel: [
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
  tutorial: [
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
};
