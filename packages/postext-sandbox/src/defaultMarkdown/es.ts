export const DEFAULT_MARKDOWN_ES = `---
title: "Postext"
subtitle: "Un tipógrafo programable para la web"
author: "Ignacio Ferro"
publishDate: "2026-09-23"
---

# Postext {style="cover" toc="false" kicker="Motor de maquetación de código abierto · La guía" publisher="postext.dev · Licencia MIT · Cada página de este libro la ha compuesto Postext en tu navegador"}

:::pagebreak

:::paragraphs{style="colophon"}
**Guía de Postext** es el libro de muestra que acompaña al Sandbox. Es a la vez un recorrido por el motor y una demostración de lo que hace: la cubierta, el índice que se numera solo, las portadillas de parte, las aperturas de capítulo, las cabeceras, cada figura y cada tabla que flota hasta su sitio… todo lo maqueta Postext, en tu navegador, a partir del Markdown que puedes abrir en el editor.

Compuesto en Fraunces, Lora y Geist, servidas por Google Fonts. Los diagramas son archivos SVG sencillos, que se dibujan como vectores en el canvas, en la vista HTML y en el PDF. Cambia lo que quieras —una palabra, un margen, un color de la paleta— y el libro vuelve a componerse.

Postext es de código abierto, con licencia MIT. Texto © 2026 Ignacio Ferro y quienes contribuyen a Postext.
:::

# Índice {style="contents" toc="false"}

:::toc

:::part{number="I" title="Fundamentos" palette="band=#2b4acb"}
1. Por qué Postext
2. Cómo funciona el motor
:::

# Por qué Postext {lead="La tipografía impresa pasó cinco siglos aprendiendo a componer una página; los navegadores aprendieron a disponer una interfaz. Postext lleva lo primero a lo segundo: un motor que convierte Markdown en páginas compuestas con criterio editorial." summary="La distancia entre la web y la página, y qué la salva"}

Postext es un **motor de maquetación de código abierto** que lleva a la web el oficio de la tipografía impresa profesional. Recibe **contenido semántico** escrito en Markdown enriquecido y un objeto de configuración, y calcula una maquetación completamente resuelta en la que cada línea, cada título, cada figura y cada tabla tiene una posición precisa, medida en unidades tipográficas reales. Después la dibujan tres renderizadores —una vista previa viva en canvas, HTML posicionado y un PDF listo para imprenta— que leen la misma geometría, de modo que lo que ves en pantalla es exactamente lo que va a imprenta.

Este libro es su propia demostración. La cubierta, el índice que se numera solo, las portadillas en tres colores, la banda que abre cada capítulo, las cabeceras de estas páginas y cada figura que flota hasta su sitio las ha maquetado Postext, en tu navegador, hace un momento. Nada se ha colocado a mano: el Markdown solo dice qué es cada cosa, y la configuración decide cómo se ve.

:::callout{type="try"}
Abre el panel **Markdown** y elige este capítulo en el selector de capítulos de su cabecera. Cambia una palabra de este párrafo o borra una frase: la página vuelve a componerse, las columnas se reequilibran y los folios de los capítulos siguientes se actualizan.
:::

## Maquetación de aplicaciones y maquetación editorial

El CSS moderno es una herramienta extraordinaria para construir interfaces. Flexbox, Grid, las consultas de contenedor y el posicionamiento por anclas dan un control fino sobre cómo se disponen los componentes en una ventana. Pero CSS se diseñó para la _maquetación de aplicaciones_, y la lectura extensa necesita _maquetación editorial_. Son problemas distintos:

- **La maquetación de aplicaciones** dispone componentes interactivos —botones, formularios, tarjetas, navegación— dentro de una ventana que el lector recorre libremente
- **La maquetación editorial** hace fluir texto, figuras, tablas y recuadros por una secuencia de páginas y columnas fijas, según reglas depuradas durante siglos de imprenta

El contraste de :ref{id="feature-comparison"} resume dónde divergen ambos enfoques en los documentos largos. (Basta con mencionarla: la tabla flota por sí sola al primer hueco libre tras este párrafo, y nunca hay que colocarla dos veces).

CSS resuelve el primer caso de forma brillante. Para el segundo, la plataforma nunca ha ofrecido las primitivas que importan:

1. **Columnas equilibradas que conocen su contenido**
   - La propiedad _columns_ de CSS hace fluir el texto, pero no puede igualar columnas ajustando el espacio sobre los títulos o la holgura de un párrafo
   - No conoce figuras ni tablas que deban flotar a la cabeza de la siguiente columna libre
   - No puede mantener un título con el párrafo que introduce a través de un salto de columna
2. **Defectos de final de párrafo y de columna**
   - Las _huérfanas_ y las _viudas_ existen en CSS, pero su soporte es desigual y no ven la geometría de la página entera
   - No hay ninguna regla para la _línea corta_, la palabra que se queda sola en la última línea de un párrafo
3. **Corte de líneas por párrafo completo**
   - Los navegadores cortan las líneas de forma voraz, una a una, y solo pueden repartir el espacio sobrante dentro de cada línea
   - Una justificación equilibrada necesita sopesar el párrafo entero a la vez
4. **Un ritmo vertical compartido**
   - Libros y revistas asientan cada línea en una rejilla de línea base común a todas las columnas de la página
   - CSS no tiene ninguna primitiva que ajuste las líneas a una rejilla entre columnas y páginas
5. **El aparato de un libro**
   - Cabeceras que conocen el capítulo, folios en secuencias romanas o arábigas, saltos de capítulo que respetan la paridad, un índice con números de página reales
   - Nada de esto existe en un documento que se desplaza

:::callout{type="quote"}
La tipografía editorial es un problema de satisfacción de restricciones. Al navegador nunca se le dio el lenguaje para enunciarlas.
:::

CSS describe con gran detalle la _apariencia_ de cualquier región de texto. Lo que le falta es _optimización global_: la capacidad de sopesar un párrafo, una columna y una página enteros antes de decidir nada.

## Lo que no resuelven las herramientas existentes

Otras herramientas abordan partes del problema. Los procesadores de texto paginan. Adobe InDesign ofrece un control editorial completo. LaTeX sigue siendo la referencia de la composición académica y matemática. Pero ninguna se diseñó para la web, y sus supuestos las hacen difíciles de encajar en un flujo de desarrollo moderno:

- No se pueden incrustar como un componente de una aplicación web
- Su salida es estática y rara vez conserva la estructura semántica de la que dependen las herramientas de accesibilidad
- Sus formatos de origen son propietarios, binarios o difíciles de generar por programa
- Viven fuera de las herramientas de frontend que un equipo web ya usa

Postext adopta otra posición, resumida en :ref{id="tools-comparison"}. Es una **biblioteca de JavaScript** que se ejecuta en el navegador, lee Markdown, aplica las reglas de la tipografía profesional y devuelve una maquetación que se puede dibujar como canvas, HTML o PDF. Está pensada para que la incrusten, configuren y amplíen desarrolladores que quieren páginas de calidad editorial sin salir de sus herramientas, y para que la configuren diseñadores que nunca necesitan tocar el código.

## Lo que Postext no es

Tener claro el alcance mantiene afilado el núcleo. Postext no sustituye a CSS en las interfaces: es un motor especializado en contenido extenso y estructurado. No es un editor WYSIWYG: tú escribes Markdown y describes el diseño, y el motor compone las páginas. No gestiona puntos de ruptura adaptables: elegir una configuración para cada tamaño de pantalla es decisión de la aplicación que lo aloja. No carga las fuentes por ti: el motor mide con las fuentes que el navegador ya tiene, así que una página debe cargar sus tipos antes de maquetar. Y, por ahora, el motor de maquetación solo funciona en el navegador, porque sus medidas vienen de las métricas de fuente del canvas de un navegador real; el renderizador de PDF, en cambio, también funciona en Node.

# Cómo funciona el motor {lead="Entran Markdown y un objeto de configuración; sale un árbol en el que cada línea tiene una posición en unidades reales. En medio, una tubería breve que mide el texto sin tocar el DOM e itera hasta que la página se asienta." summary="Analizar, medir, maquetar, converger"}

La forma más rápida de entender lo que Postext puede hacer es seguir un documento a través de él. El motor es una tubería, esbozada en :ref{id="layout-pipeline"}, en la que cada etapa refina una única representación del documento en memoria. Ninguna etapa se esconde tras un formato opaco y ninguna toca el disco. Además, la tubería es pura: con el mismo contenido y la misma configuración produce siempre la misma maquetación.

## Contenido y configuración

A la tubería entran dos cosas, y las dos están pensadas para que las lean y editen personas:

1. **Contenido** en Markdown enriquecido
   - Títulos, párrafos, listas, énfasis, citas en bloque y matemáticas
   - Directivas para saltos de página, numeración de páginas, partes, recuadros y el índice
   - Referencias a recursos —figuras, diagramas SVG y tablas— declarados por su identificador fuera del texto
   - Metadatos YAML opcionales con el título, el subtítulo, el autor y la fecha
2. **Configuración** que describe el diseño
   - Tamaño de página, márgenes, sangrado y numeración de páginas
   - Estructura de columnas, medianil y filetes de columna
   - Texto, títulos, listas, pies, tablas y matemáticas
   - Estilos de título, de párrafo y de recuadro, partes e índice
   - Cabeceras, una paleta de colores con nombre y las opciones del PDF

Separarlos es deliberado. El mismo Markdown puede convertirse en un libro de bolsillo, en una revista a dos columnas o en un libro de texto con columna lateral con solo cambiar la configuración. Por eso el motor se niega a meter decisiones visuales en el contenido.

## Medir sin el DOM

Antes de colocar nada, el motor tiene que saber cuánto sitio necesita cada elemento, y ahí empieza todo el proyecto. Medir texto en un navegador suele significar pintarlo en la página y leer su tamaño, un reflujo que puede bloquear el hilo principal cientos de milisegundos en un documento largo.

Postext mide con _pretext_, una biblioteca de medición de texto sin DOM que usa las métricas de fuente del canvas y pura aritmética. Su paso caro, preparar un texto para una fuente dada, se guarda en caché; componerlo a un ancho concreto es casi gratis. El método es entre 300 y 600 veces más rápido que medir mediante reflujos, como ilustra :ref{id="measurement-speed"}, y sobre él el módulo de medición del motor añade tramos enriquecidos de negrita, cursiva y matemáticas, separación silábica, justificación y corte óptimo de líneas. Cada resultado se guarda con una clave que incluye el texto, las fuentes, el ancho y todas las opciones que pueden cambiar una línea, de modo que escribir en un párrafo vuelve a medir ese párrafo y ningún otro.

## Siete pasadas y un bucle

La maquetación propiamente dicha se hace en siete pasadas:

1. **Estructuración del contenido**: analiza el Markdown en una lista plana de bloques y resuelve los recursos por su identificador
2. **Medición del texto**: compone cada párrafo en líneas al ancho que va a ocupar
3. **Colocación en páginas y columnas**: llena páginas y columnas y reserva sitio para las cabeceras y los recuadros de página completa
4. **Colocación de recursos**: hace flotar cada figura y tabla citada hasta el primer hueco libre tras su referencia
5. **Refinamiento tipográfico**: aplica las reglas que mantienen los títulos con su texto y las listas con su introducción
6. **Equilibrado de columnas**: iguala las columnas de cada página
7. **Ritmo vertical**: devuelve el texto a la rejilla de línea base después de todo lo que la rompe

Estas pasadas dependen unas de otras en círculo. Mantener un título con su párrafo puede empujar a ambos a la columna siguiente; ese movimiento puede dejar una viuda; corregir la viuda devuelve una línea, lo que puede separar otra vez el título. Postext deshace el círculo con el **bucle de convergencia** de :ref{id="convergence-loop"}: las pasadas tres a siete se repiten, marcando solo lo que ha cambiado, hasta que nada se mueve. El bucle tiene un tope de cinco iteraciones y los documentos habituales se asientan en una o dos. Una puntuación de infracciones tipográficas acompaña a cada iteración, así que, si alguna vez se alcanza el tope, el motor se queda con la mejor maquetación que encontró, no con la última.

:::callout{type="figures" title="El motor en cifras"}
:::columns{count=3}
**300–600×** más rápida la medición de texto que con reflujos del DOM: la idea que hizo posible el proyecto.

**7 pasadas** del Markdown a la página posicionada, repetidas en un bucle de **5 iteraciones** como mucho, casi siempre una o dos.

**3 renderizadores** —canvas, HTML y PDF— que dibujan una sola geometría, línea a línea.
:::
:::

El equilibrado converge tramo a tramo, entre aperturas de capítulo y saltos de página explícitos. El resultado es una garantía que importa en los libros: un capítulo maquetado por separado y el mismo capítulo dentro del libro completo salen idénticos, página a página.

## El árbol virtual del documento

Lo que sobrevive al bucle es el **VDT**, el árbol virtual del documento: páginas que contienen columnas, columnas que contienen bloques, bloques que contienen líneas, cada uno con su caja en unidades reales, junto a una lista plana de todos los bloques para acceder rápido. El árbol es geometría pura —no sabe nada de canvas, HTML ni PDF— y eso es justo lo que permite a tres renderizadores dibujar salidas idénticas. Cada línea recuerda además el tramo de Markdown del que procede, y así un clic en la página lleva el cursor del editor a la palabra correcta.

## Fuera del hilo principal

Una maquetación puede tardar más que una pulsación de tecla, así que el motor puede ejecutarse en un Web Worker. El worker conserva su propia caché de medición entre compilaciones y se cancela de forma cooperativa: cuando se pide una compilación nueva, la anterior se detiene en su siguiente punto de control y gana la última petición. El Sandbox maqueta así todas sus vistas, y el renderizador de PDF tiene un worker propio, de modo que la interfaz sigue respondiendo mientras se compone un libro entero.

:::callout{type="note" title="En código"}
\`buildDocument(content, config)\` devuelve el VDT. \`renderPage\` dibuja una página en un canvas, \`renderToHtml\` devuelve HTML posicionado y \`renderToPdf\`, del paquete _postext-pdf_, devuelve los bytes de un PDF, de un documento o de un libro entero pasado como una lista de capítulos. \`createLayoutWorker\`, de _postext/worker_, ejecuta la compilación fuera del hilo principal.
:::

:::part{number="II" title="El oficio" palette="band=#b7820f"}
3. Componer la línea
4. La página y sus columnas
5. Figuras, tablas y flotantes
6. Libros, partes y cabeceras
:::

# Componer la línea {lead="Un párrafo se compone entero, no línea a línea. Postext sopesa todas las formas posibles de cortarlo, pone precio al espaciado, a los guiones y a las palabras sueltas, y elige el conjunto de cortes que menos cuesta." summary="Corte óptimo de líneas, separación silábica, espaciado y los defectos que evita"}

La calidad de una página se decide primero en sus párrafos. Un navegador corta las líneas de forma voraz: llena una línea con todas las palabras que caben, pasa a la siguiente y solo puede repartir el espacio sobrante dentro de cada línea. Postext implementa el **algoritmo de Knuth-Plass**, el cortador de líneas óptimo que mueve TeX desde 1981. Evalúa todas las formas viables de cortar el párrafo entero y elige la que minimiza el coste total, de modo que el espaciado se mantiene parejo de la primera línea a la última.

## Cajas, gomas y penalizaciones

El algoritmo ve un párrafo como una secuencia de tres primitivas, dibujadas a todo lo ancho en :ref{id="knuth-plass-model"}:

- **Cajas**: palabras o trozos de palabra, de ancho fijo
- **Gomas**: el espacio entre palabras, con un ancho natural y capacidad para estirarse o encogerse
- **Penalizaciones**: posibles puntos de corte con un coste; una penalización _marcada_ señala un punto de guion y dibuja el guion si se usa

Para cada línea candidata el motor calcula una razón de ajuste $r$, cuánto deben estirarse o encogerse las gomas para llenar la medida, y una medianía que crece con su cubo, $b = 100\\,|r|^3$. Las líneas se clasifican en cuatro clases de ajuste —apretada, normal, holgada y muy holgada— y a cada corte se le cargan sus deméritos:

$$
d = (1 + b + p)^2
$$

donde $p$ es la penalización del corte. Dos líneas seguidas con guion cuestan 3000 más, y un salto de más de una clase de ajuste entre líneas vecinas cuesta 100, así que el optimizador prefiere párrafos cuya textura cambia con suavidad. Si no existe ningún conjunto de cortes viable, el motor recurre al corte voraz en lugar de fallar.

## Separación silábica

La separación silábica usa los mismos **patrones de Liang** en los que TeX confía desde 1983, servidos por la biblioteca _Hypher_, en ocho idiomas: inglés, español, francés, alemán, italiano, portugués, catalán y neerlandés. El idioma del documento se fija una vez, en la cabecera de la configuración, y también etiqueta el PDF para los lectores de pantalla. Los patrones dejan al menos dos letras antes del guion y tres después, de modo que las palabras de menos de cinco letras nunca se dividen, y cada guion es una penalización marcada de 50 que el optimizador puede aceptar o rechazar.

La separación solo actúa en el texto justificado, donde se gana el sueldo. Hay dos oportunidades de corte siempre disponibles, sea cual sea el ajuste: un guion entre dos letras es un corte legítimo, y una palabra más ancha que toda la medida se divide por la última sílaba que cabe o, si no hay más remedio, por el último carácter.

## Espaciado y líneas en bandera

Dos ajustes limitan cuánto puede estirarse o encogerse un espacio: \`maxWordSpacing\`, por defecto el doble del espacio natural, y \`minWordSpacing\`, 0,6 veces. Estirar más allá del máximo se paga por encima de cualquier otro defecto, así que el cortador prefiere poner un guion, mover una palabra o aceptar una línea corta antes que abrir un río. Hay líneas que no se pueden llenar —una URL larga, la cola irrompible de un elemento de lista— y, en lugar de abrirlas con huecos de tres veces el espacio natural, el motor las compone en bandera con el espaciado natural. La última línea de un párrafo va siempre en bandera, salvo cuando se desborda: entonces sus espacios se comprimen para que quepa, igual que hace TeX con las gomas.

## Huérfanas, viudas y líneas cortas

Una **huérfana** es la primera línea de un párrafo que se queda sola al pie de una columna; una **viuda**, su última línea llevada sola a la cabeza de la siguiente. Las dos rompen el ritmo de la lectura, y :ref{id="orphan-widow"} las muestra a ambos lados de un salto de columna. Un tercer defecto, la **línea corta**, es una última línea con una sola palabra breve, varada bajo un párrafo lleno.

Postext pone precio a las tres. Cuando un párrafo cruza una columna, el motor compara todos los cortes posibles y a cada uno le carga el espacio que deja sin usar, la huérfana y la viuda —1000 por defecto cada una, con al menos dos líneas a cada lado—. Las líneas cortas se pagan dentro del propio cortador, como medianía, siempre que la última línea mida menos de veinte caracteres de espacio. Cuando no se puede evitar una línea corta cortando de otra manera, el motor puede componer el párrafo una línea más corto, apretando los espacios dentro de su mínimo y, si hace falta, el espaciado entre letras como mucho diez milésimas de cuadratín. Los elementos de lista siguen las mismas reglas, con interruptores propios.

:::callout{type="try"}
En **Configuración**, busca _flojas_ y activa **Resaltar líneas flojas** de la sección de depuración. Después estrecha las columnas o sube \`maxWordSpacing\` y observa qué líneas tiene que abrir el motor y cómo las redistribuye el optimizador.
:::

## Matemáticas

Las fórmulas son ciudadanas de pleno derecho. Las expresiones en línea, como $e^{i\\pi}+1=0$, fluyen con el texto, compuestas por MathJax como trazados vectoriales que se mantienen nítidos a cualquier ampliación. Cuando una fórmula es más alta de lo que permite la línea, se reduce de forma uniforme para que la rejilla de línea base sobreviva, y el lector conserva el ritmo del texto por densa que sea la notación. Las fórmulas destacadas ocupan líneas propias, centradas en la columna, con sus propios márgenes, y el texto que las sigue vuelve a la rejilla:

$$
\\int_0^{\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

El canvas, la vista HTML y el PDF dibujan los mismos trazados, de modo que las fórmulas coinciden en las tres salidas y siguen siendo vectores en la imprenta.

# La página y sus columnas {lead="Las páginas son fijas, las columnas son finitas y cada línea debería asentarse en un ritmo compartido por todo el pliego. Este capítulo trata del marco: la geometría de la página, las estructuras de columnas, la rejilla de línea base y el arte de terminar las columnas a la par." summary="Geometría de página, columnas, rejilla de línea base y equilibrado"}

Las columnas son la expresión más visible del diseño editorial, y el lugar donde antes se rompen las soluciones caseras. Postext trata la página y sus columnas como objetos de primera clase, con su propia geometría, su propio ritmo y sus propias reglas para terminar bien.

## Geometría de la página

Una página empieza por su tamaño. Postext ofrece como predefinidos los formatos habituales de libro y revista, recogidos en :ref{id="preset-sizes"}, y cualquier tamaño a medida en centímetros, milímetros, pulgadas o puntos; esta guía se compone en el formato de 21 × 28 cm. Los márgenes pueden ser **simétricos**: el margen izquierdo pasa a ser el interior, junto al lomo, y cambia de lado en cada verso. Para la producción impresa, la página puede llevar sangrado y marcas de corte, y un ajuste de PPP controla la resolución de las medidas en píxeles.

Los folios siguen secuencias: arábigos, romanos en minúscula o mayúscula, alfabéticos en minúscula o mayúscula, cada una con su propio número inicial, de modo que un libro puede numerar sus preliminares i, ii, iii y empezar el capítulo uno en 1. El PDF registra las mismas secuencias como etiquetas de página, y el visor muestra exactamente el número impreso al pie.

## Estructuras de columnas

Tres estructuras cubren la mayoría de las publicaciones, esbozadas como miniaturas en :ref{id="column-layouts"}:

1. **Una columna**, para novelas, ensayos y lectura concentrada
2. **Dos columnas**, para revistas, informes y libros como este
3. **Columna y media**: una columna principal junto a otra lateral más estrecha
   - La columna lateral puede llevar texto que continúa desde la principal
   - O puede ser un **canal de flotantes** que solo recoge figuras, tablas, pies y recuadros, como en los libros de texto con una columna exterior de notas y diagramas

El medianil entre columnas es configurable, y en él puede dibujarse un filete opcional, con su propio grosor y color. Los elementos de página completa —una figura, una tabla, un recuadro— cortan las columnas: el texto que queda por encima se reparte a la par entre ellas, y las columnas continúan por debajo.

## La rejilla de línea base

Los libros profesionales alinean la primera línea base de cada columna a un ritmo vertical común, y todas las líneas siguientes caen en la misma rejilla, de modo que se miran a través del medianil. Postext ajusta el texto a una rejilla derivada del interlineado del cuerpo, como ilustra :ref{id="baseline-grid"}. Tras los elementos que la rompen —un título mayor que el cuerpo, una figura, una fórmula destacada— se deja el espacio necesario para devolver la línea siguiente a su sitio. La rejilla puede dibujarse superpuesta mientras trabajas, allí donde hay texto.

## Terminar las columnas a la par

Cuando una página termina en mitad del texto, sus columnas deberían acabar a la misma altura. Es el **equilibrado de columnas**, y es más difícil de lo que parece: las líneas van en pasos enteros de rejilla, las figuras no se pueden partir, los títulos deben seguir con su texto y los párrafos no pueden dejar huérfanas. Postext iguala una columna corta con tres palancas, usadas por orden de preferencia y dibujadas en :ref{id="column-balancing"}:

1. **Espacio sobre los títulos**, una línea de rejilla entera cada vez, repartida por importancia y nunca en la cabeza de una columna
2. **Una línea tras el final de una lista**
3. **Párrafos más sueltos**: un párrafo compuesto una línea más largo, la _looseness_ de TeX, aceptado solo si ninguna de sus líneas se estira más allá del límite de espaciado; si ayuda, un toque de espaciado entre letras, como mucho diez milésimas de cuadratín

Cada arreglo se verifica maquetando la página de nuevo, hasta ocho veces, y gana el mejor resultado. Algunas columnas se dejan en paz a propósito: la última antes de un salto de página forzado o de una apertura de capítulo, la última página del documento, una columna sin nada que estirar. Dos reglas afines igualan las columnas del final de un capítulo y las que quedan sobre un recuadro de página completa que se mueve o se parte.

:::callout{type="quote"}
Una columna que acaba dos líneas más corta es lo primero que nota un lector y lo último que un diseñador debería tener que arreglar a mano.
:::

:::callout{type="try"}
En **Configuración**, abre **Títulos** y desactiva **Equilibrar columnas**. Mira el pie de las columnas de este capítulo; después vuelve a activarlo y observa qué palanca ha usado el motor en cada página.
:::

# Figuras, tablas y flotantes {lead="Una referencia es una promesa, no una posición. Menciona una figura y Postext le busca casa: el primer hueco libre tras la mención, numerada por orden de lectura, con su pie, y nunca antes de las palabras que la llaman." summary="Dónde caen los recursos, cómo se numeran, tablas que se parten"}

Todo lo que no es texto que fluye —imágenes, diagramas SVG, tablas— es un **recurso**. Los recursos se declaran fuera del texto, cada uno con su identificador, su tipo, su pie y sus preferencias de colocación, y el Markdown se limita a mencionarlos. En el Sandbox viven en el panel de Recursos.

## Basta con una mención

Escribir \`:ref{id="…"}\` en una frase hace dos cosas: imprime la etiqueta del recurso y, la primera vez, lo _incorpora_, de modo que flota hasta el primer hueco libre tras la referencia. Los huecos se prueban en orden, como muestra :ref{id="float-slots"}: el pie de la columna que contiene la referencia, luego la cabeza y el pie de la siguiente columna libre, luego una banda en la página siguiente. El texto nunca se interrumpe.

Unas pocas reglas mantienen honrados a los flotantes:

- Un flotante nunca cae antes de su referencia y nunca se encoge para caber
- Los flotantes de una misma secuencia de numeración conservan su orden, así que la figura 12 nunca aparece antes que la 11; una tabla que espera sitio no retiene a las figuras
- Los flotantes nunca escapan de su capítulo: las aperturas de capítulo, las portadillas de parte y el final del documento son barreras
- Un flotante que dejaría menos de tres líneas de texto en una página nueva espera a la siguiente
- Las bandas de cabeza y de pie se alinean con la rejilla de línea base, y el pie de un flotante inferior comparte la línea base de la última línea de texto

## Colocación

Cada recurso puede indicar dónde prefiere ir, y cada tipo de recurso tiene un valor por defecto; los campos se recogen en :ref{id="placement-options"}. Un recurso también puede insertarse en un punto exacto, cuando su posición es _here_. Y una tabla o una figura demasiado ancha para la página puede girar un cuarto de vuelta: entonces ocupa una página propia, pegada al lomo.

## Números y etiquetas

Los tipos de recurso definen sus propias secuencias de numeración. Figuras y tablas vienen de serie y se traducen al idioma del documento; un tipo puede añadir un prefijo, una etiqueta abreviada, una plantilla como \`{h1}.{n}\` para numerar por capítulo —la figura 5.2 es la segunda figura del capítulo 5—, una regla de reinicio y un formato de contador. Los números siguen la **primera referencia en el orden de lectura**: si insertas una mención anterior, se mueven todos los números posteriores. Una referencia puede imprimir solo el número, la etiqueta completa o la abreviada, cambiar su caja o imprimir un texto propio.

## Tablas

Las tablas llevan su modelo consigo: filas de celdas con fusiones de columnas y filas, filas de cabecera, alineación y anchos de columna relativos. Las celdas admiten Markdown en línea, párrafos y listas sencillas, un relleno propio —los tres colores de parte de este libro son :swatch{color="#2b4acb"} azul, :swatch{color="#b7820f"} oro y :swatch{color="#c0452f"} bermellón— e incluso una imagen. El estilo de las tablas se define una vez para todo el documento: tipografía del cuerpo y de la cabecera, relleno de la cabecera y filetes en retícula, solo horizontales, solo exteriores o ninguno.

Una tabla más alta que la página se parte entre páginas. Sus filas de cabecera se repiten en cada tramo, el pie de cada continuación gana el sufijo _(cont.)_, un aviso de _Continúa_ cierra cada tramo salvo el último, y ningún corte atraviesa una fusión de filas. Una tabla girada se parte igual, página tras página.

## Pies y créditos

Un pie es el prefijo del tipo, el número y el texto del pie, que admite Markdown en línea y referencias propias. Los pies van encima o debajo de su recurso, opcionalmente sobre una barra de color, con la tipografía y el tamaño del estilo de pie; la etiqueta puede ir en negrita o en color, como en este libro. Un recurso puede llevar además una nota: una línea más pequeña de crédito o de fuente bajo él.

## Figuras vectoriales

Los diagramas SVG se dibujan como vectores en todas partes. El PDF convierte el subconjunto habitual de SVG —formas, trazados, grupos, trazados de recorte, rellenos y trazos sólidos, opacidad y texto— en operaciones de dibujo nativas, y rasteriza a 600 ppp lo que queda fuera; una figura también puede traer un máster PDF propio, que se incrusta tal cual. Para imprimir a una tinta, un interruptor recolorea todos los diagramas como tintas de un solo color, según su luminancia, en los tres renderizadores.

:::callout{type="try"}
Haz clic en el pie de cualquier figura del canvas: el panel de Recursos se abre en ese recurso, con el campo del pie listo. Cambia su colocación de _auto_ a _top_ y mira cómo se mueve.
:::

# Libros, partes y cabeceras {lead="Un libro es más que sus capítulos: una cubierta, un índice que se mantiene al día, portadillas de parte, aperturas que anuncian cada capítulo y cabeceras que saben dónde está el lector. Todo ello es configuración." summary="Capítulos, estilos de título, diseños, partes, índice y folios"}

Esta guía es un libro de doce capítulos, y cada capítulo es un documento Markdown propio. Un proyecto del Sandbox es siempre un libro: la configuración, los recursos y las fuentes se comparten, y los capítulos se suceden, como muestra :ref{id="book-anatomy"}.

## Los capítulos hacen el libro

Cada capítulo se maqueta por separado, _continuando_ a los anteriores: hereda su número de páginas y su paridad, sus contadores de capítulos y de figuras, la parte abierta y las cabeceras. Por eso las figuras de este capítulo se numeran desde la 6.1, y por eso editar un capítulo nunca obliga al motor a componer de nuevo el libro entero. Las vistas previas pueden mostrar el capítulo actual o el libro completo, y el PDF se puede generar de cualquiera de los dos. Los capítulos se pueden añadir, renombrar, reordenar, dividir por sus títulos de primer nivel o fusionar con el anterior.

## Estilos de título

Un título puede llevar atributos, escritos entre llaves al final de su línea. El más potente es el **estilo**: \`{style="cover"}\` aplica un estilo de título con nombre, que cambia la tipografía y el diseño del título y, para la sección que abre, puede cambiar las cabeceras, los márgenes de página, la disposición de columnas, la tipografía del cuerpo y la paleta. La cubierta de este libro es un estilo de título con márgenes propios, sin cabeceras y con un diseño a página completa; el índice es otro. Un estilo también puede dejar sin numerar sus títulos, para que un prólogo no desplace la numeración de los capítulos, y dejarlos fuera del índice.

## Diseños

Las cabeceras, los pies de página, las aperturas de capítulo y las portadillas se dibujan con **diseños**: pequeñas composiciones libres de textos, filetes, cajas e imágenes. Cada elemento se ancla a la página, al sangrado, a la caja de texto o a otro elemento, con desplazamientos y tamaños en unidades reales, e imprime **marcadores** como \`{pageNumber}\`, \`{chapterTitle}\`, \`{partTitle}\` o cualquier atributo del título, como el \`{attr.lead}\` que pone la entradilla en la banda de este capítulo. Los elementos se pueden limitar a las páginas pares o impares y a las páginas de un papel concreto —cuerpo, apertura, parte o blanca—, y así las cabeceras de este libro desaparecen en las aperturas de capítulo mientras aparece un folio al pie. Los elementos de texto pueden ajustarse, dividir palabras, recortarse con puntos suspensivos, dibujar una caja detrás y abrir con una capitular.

## Partes y paletas

\`:::part\` abre una portadilla de parte: una página propia, llevada a la paridad que pide la configuración, dibujada con el diseño de parte y seguida de un cuerpo, normalmente la lista de sus capítulos. Las partes se arrastran, de modo que las cabeceras y las aperturas de los capítulos siguientes pueden nombrar la parte a la que pertenecen, y aparecen tanto en el índice como en los marcadores del PDF.

Una parte también puede cambiar el color del libro. Los colores de la configuración pueden enlazarse a entradas con nombre de la **paleta**, y el atributo \`palette\` de una parte sustituye entradas hasta la parte siguiente. Este libro define una entrada, el _color de parte_, y cada parte le da un valor: azul para los fundamentos, oro para el oficio, bermellón para la práctica. Las bandas de los capítulos, los números de los títulos, los folios y los pies lo siguen.

## Un índice que se mantiene al día

\`:::toc\` imprime el índice: una entrada por cada título de los niveles indicados y una fila por cada parte, con números, títulos, puntos guía, folios y, si se quiere, una línea tomada de un atributo del título; en este libro, el resumen de cada capítulo. Los folios son reales: el motor maqueta el libro, lee dónde ha caído cada título y vuelve a componer el índice hasta que los números se asientan, lo que lleva como mucho tres pasadas más. En el PDF las entradas son enlaces.

## Saltos de página y numeración

\`:::pagebreak\` empieza una página nueva y puede pedir que sea impar o par, añadiendo una página en blanco si hace falta. \`:::numbering\` cambia la secuencia de folios desde la página siguiente; así, unos preliminares numerados en romanos dan paso a los arábigos en el capítulo uno. Las aperturas de capítulo pueden pedir su propia paridad, y las páginas en blanco se reconocen como tales, de modo que las cabeceras las dejan limpias.

:::part{number="III" title="La práctica" palette="band=#c0452f"}
7. Escribir para Postext
8. El Sandbox
9. Salida: canvas, HTML y PDF
10. Hoja de ruta y comunidad
:::

# Escribir para Postext {lead="Todo este libro se ha escrito en Markdown corriente con un puñado de extensiones. Se leen bien en cualquier editor de texto y dicen qué es el texto, nunca dónde va." summary="Markdown, directivas, recuadros y estilos de párrafo"}

Los documentos de Postext son, ante todo, Markdown. Quien sabe Markdown puede escribir para Postext desde el primer día; las extensiones solo aparecen donde un libro necesita algo para lo que Markdown nunca tuvo palabras.

## Markdown corriente

Títulos de una a seis almohadillas, párrafos, citas en bloque, listas con viñetas, numeradas y de tareas —anidadas con dos espacios por nivel, hasta cinco niveles— y matemáticas destacadas entre dobles signos de dólar. En línea, la negrita y la cursiva de siempre, más superíndices entre acentos circunflejos, como en 10^-8^, subíndices entre virgulillas, como en H~2~O, matemáticas en línea entre signos de dólar y barras invertidas para escribir caracteres literales.

Parte de Markdown se deja fuera a propósito, porque un libro tiene otras formas de decirlo: las imágenes son recursos y no dibujos en línea, las tablas son recursos con un modelo y no tablas de barras, y el HTML en bruto no significa nada en una página impresa. Los enlaces conservan su texto; hacerlos pulsables y dar al código en línea un estilo propio está en la hoja de ruta.

## Directivas y contenedores

Todo lo demás se expresa con un pequeño vocabulario de directivas, recogido en :ref{id="document-format"}. Las directivas de una línea empiezan con tres dos puntos y actúan en el punto donde aparecen. Los contenedores envuelven bloques entre una línea de apertura con atributos y una línea de cierre con tres dos puntos; se pueden anidar, y uno sin cerrar se cierra al final del capítulo, con un aviso.

## Recuadros

\`:::callout\` compone una caja con un título opcional, en uno de los estilos que define la configuración. Este libro define cuatro: los recuadros _Pruébalo_ que te mandan al Sandbox, las notas técnicas, las citas destacadas en cursiva de rótulo y un panel oscuro de página completa con cifras clave. Un estilo decide el fondo, el borde, la franja y el radio de las esquinas de la caja, un icono o marca opcional, la tipografía de su título, su cuerpo y sus listas, y dónde va: en el flujo, en la cabeza o al pie de una columna, a lo ancho de la página, en la columna lateral de una maquetación de columna y media o fijo en una posición de la página.

Un recuadro largo puede partirse entre sus párrafos, o incluso entre sus líneas, dejando al menos dos a cada lado; la continuación omite el título. Dentro de un recuadro, \`:::columns\` compone su contenido en columnas equilibradas, como el panel de cifras del capítulo 2.

:::callout{type="note" title="Por qué un vocabulario tan pequeño"}
Cada extensión responde a una pregunta que un libro se hace y Markdown no sabe contestar: dónde acaba una página, cómo se numeran las páginas, qué es una parte, qué párrafos pertenecen a una caja. Todo lo que tiene que ver con su aspecto vive en la configuración, y así el mismo texto puede componerse como libro de bolsillo o como revista sin tocar una coma.
:::

## Estilos de párrafo

\`:::paragraphs{style="…"}\` aplica un estilo de párrafo con nombre a los párrafos que envuelve: un epígrafe, una dedicatoria, una bibliografía, un colofón. Un estilo puede cambiar el tipo de letra, el cuerpo, el interlineado, el color, la alineación —también centrada y a la derecha—, la sangría y el espaciado. El colofón del dorso de la cubierta de este libro es uno.

## Metadatos

Los metadatos de un libro van en un bloque YAML al principio de su primer capítulo: título, subtítulo, autor y fecha de publicación, disponibles como marcadores en todos los diseños. La cubierta de este libro imprime de ahí su título y su subtítulo. Cualquier otra clave se guarda para la aplicación que aloja el motor; los metadatos de los capítulos posteriores se ignoran, con un aviso.

# El Sandbox {lead="El Sandbox es el motor con un editor alrededor: la página que estás leyendo, el Markdown del que sale y cada ajuste que le ha dado forma, uno junto a otro y en vivo." summary="El editor, los paneles, proyectos, presets y compartir"}

Todo lo que cuenta este libro puede probarse ahora mismo, sin escribir código. El Sandbox no es una demo construida sobre Postext: es el propio motor, en una interfaz pensada para dos públicos a la vez, quienes desarrollan y evalúan la biblioteca y quienes diseñan y quieren ver qué hace cada opción.

## Un recorrido por la interfaz

La interfaz sigue la disposición de un editor conocido, esbozada en :ref{id="sandbox-ui"}. Una **barra de actividad** a la izquierda cambia entre seis paneles —Proyectos, Markdown, Recursos, Fuentes, Configuración y Avisos, este último con el número de asuntos pendientes—. Una **barra lateral** redimensionable aloja el panel activo; al hacer clic en el icono activo se pliega. El **visor**, a la derecha, muestra la misma maquetación en tres pestañas: Canvas, HTML y PDF.

## Editar un libro

El editor de Markdown resalta los metadatos y las matemáticas, y su barra de herramientas inserta formato, listas, saltos de página y cambios de numeración. En su cabecera, un **selector de capítulos** recorre los capítulos del libro y muestra sus páginas; cada capítulo conserva su propio historial de deshacer y su cursor. Editor y páginas se siguen en los dos sentidos: hacer clic en una palabra de la página lleva el cursor a ella en el Markdown, y seleccionar texto lo resalta en la página.

## Configuración

El panel de Configuración edita la configuración completa —más de quinientos campos— agrupada en secciones plegables. Un buscador encuentra cualquier opción por su nombre, unas fichas de categoría acotan la lista al documento, el texto, las figuras y tablas, la salida o los ajustes avanzados, y un filtro de _solo modificados_ muestra lo que difiere de los valores por defecto. Cada campo y cada sección se pueden restablecer por separado, y la configuración se puede exportar e importar como archivo.

## Recursos y fuentes

El panel de Recursos lista los recursos del libro por tipo. Las imágenes y los archivos SVG se pueden arrastrar, las tablas se editan en un editor tipo hoja de cálculo con celdas fusionadas, rellenos, imágenes, anchos de columna y pegado desde una hoja de cálculo, y el texto de un diagrama SVG se puede editar en su sitio. Al hacer clic en un pie, una nota, una celda o el texto de un diagrama de la vista previa, se abre en el panel. El panel de Fuentes añade familias propias, peso a peso, en los formatos web y de escritorio habituales; una familia propia tiene prioridad sobre una fuente de Google con el mismo nombre.

## Avisos

El panel de Avisos lista todo lo que el motor ha notado al componer el libro: fuentes que no han cargado, líneas holgadas, niveles de título que se saltan, contenedores sin cerrar y directivas desconocidas, estilos que no existen, marcadores que no imprimen nada, recursos que faltan y recuadros demasiado altos para su columna. Cada aviso indica su capítulo y su línea, y al hacer clic lleva hasta ellos.

## Proyectos, presets y compartir

Tu trabajo se guarda en el navegador mientras escribes. Los **proyectos** son libros guardados localmente, cada uno con su nombre, su descripción y su imagen de cubierta; se pueden duplicar, exportar e importar. Los **presets** son libros de solo lectura desde los que empezar: esta guía y una galería de ediciones de muestra —una revista de astronomía, un _Quijote_ ilustrado, una revista de medio ambiente, un catálogo de exposición y dos manuales universitarios—, cada una con un diseño propio. Duplica uno como proyecto para hacerlo tuyo.

Un libro viaja como un único archivo **.postext**: sus capítulos, su configuración, sus recursos y sus fuentes, además de la paginación ya calculada, de modo que se abre paginado. Y la barra de direcciones contiene siempre un enlace permanente a lo que estás viendo: el libro, el idioma, el visor, el capítulo y la página.

:::callout{type="try"}
Ve hasta una página que te guste y copia la dirección del navegador: al abrir ese enlace verás el mismo libro, en el mismo visor, en la misma página.
:::

# Salida: canvas, HTML y PDF {lead="Un árbol, tres renderizadores. El canvas previsualiza, el HTML se lee en pantalla y el PDF va a imprenta, y los tres dibujan las mismas líneas en las mismas posiciones." summary="Los tres renderizadores, el PDF accesible y el uso de la biblioteca"}

Como todos los renderizadores leen el mismo VDT, la promesa de _lo que ves es lo que obtienes_ es literal: los cortes de línea, los límites de página y la posición de cada figura coinciden en las tres salidas.

## Canvas

El renderizador de canvas dibuja una página en un canvas HTML, a cualquier resolución. En el Sandbox es la vista previa viva, con ampliación, ajuste al ancho o al alto, páginas sueltas o pliegos, y páginas que se dibujan según entran en pantalla, de modo que los libros largos siguen respondiendo.

## HTML

El renderizador HTML devuelve HTML con posicionamiento absoluto y CSS editorial: cada línea donde la puso la maquetación, con su fuente, su cuerpo y su línea base exactos. Una variante indexada indica qué partes de la página han cambiado, para que un visor solo parchee esas. En el Sandbox, la pestaña HTML aísla la salida en un Shadow DOM y añade un modo de lectura con una sola columna que se desplaza o con tantas columnas como quepan en la pantalla, con un control de tamaño de letra. Un conjunto de ajustes solo para pantalla puede adaptar el diseño a la lectura en pantalla sin tocar las páginas impresas.

## PDF

El paquete _postext-pdf_ convierte el VDT en un PDF real, de un documento o de un libro entero. Nunca vuelve a medir: las métricas del canvas son la referencia y el PDF solo las transporta, por eso las líneas se cortan exactamente en los mismos sitios. Incrusta fuentes reales, una estática por peso, así que la negrita es negrita, la cursiva es cursiva y el texto se puede seleccionar. Sobre las páginas añade marcadores a partir de los títulos y las partes, etiquetas de página que coinciden con los folios impresos, referencias pulsables, figuras SVG como vectores y una elección de espacio de color —RGB, CMYK o escala de grises— para la imprenta.

## Accesible por defecto

Todo PDF sale **etiquetado** por defecto, según la norma PDF/UA-1: un árbol de estructura con títulos, párrafos, listas, tablas y figuras en orden de lectura, texto alternativo para cada figura, el idioma del documento y los elementos decorativos marcados como artefactos para que los lectores de pantalla los salten. La accesibilidad no es una opción de exportación que haya que recordar: es la manera en que se fabrica el archivo.

## Usar la biblioteca

El motor se distribuye como dos paquetes en npm: _postext_, para la maquetación y los renderizadores de canvas y HTML, y _postext-pdf_, para la salida en PDF. Los dos son módulos ES con licencia MIT y también se pueden importar directamente desde una CDN. La documentación incluye ejemplos vivos que convierten una página en imagen, en HTML y en PDF, listos para copiar y modificar.

:::callout{type="note" title="Cuatro pasos"}
1. Carga las fuentes que nombra la configuración, para que el navegador pueda medirlas
2. Compila el documento con \`buildDocument(content, config)\`
3. Dibuja sus páginas con \`renderPage\` o genéralas con \`renderToHtml\`
4. Para imprenta, pasa el mismo documento a \`renderToPdf\` con un proveedor de fuentes
:::

# Hoja de ruta y comunidad {lead="Postext es joven y abierto. La tubería principal, el formato del documento y el sistema de configuración ya están hechos; lo que viene después se decide en público." summary="Dónde está el proyecto y cómo participar"}

Postext no aspira a ser una plataforma documental universal. Aspira a ser un motor de maquetación editorial muy bueno para la web, y mantiene un alcance estrecho para que el núcleo siga afilado. Su ambición a largo plazo es convertirse en el motor de maquetación de referencia para el contenido editorial en la web: algo que editoriales, revistas, plataformas de libros y equipos de desarrollo puedan adoptar y sobre lo que puedan construir.

## Dónde está el proyecto

El trabajo se organiza en cuatro fases, resumidas en :ref{id="development-phases"}. No son hitos estrictos: describen el orden en que las capacidades se vuelven lo bastante estables para producción.

Lo que falta importa tanto como lo que ya está hecho. Las **notas al pie, las notas finales y las notas al margen** son la mayor área abierta: el modelo de datos tiene un sitio para ellas, pero todavía no se maquetan. Los **enlaces** conservan su texto pero no su destino, el código en línea no tiene estilo propio, el texto aún no rodea obstáculos y la maquetación solo ocurre en el navegador. Son los siguientes problemas que merece la pena resolver, y aquellos en los que más cuenta la ayuda.

## Cómo participar

El proyecto vive en GitHub, y todas las conversaciones ocurren a la vista: **issues** para errores, peticiones y tareas concretas; **pull requests** para el código, revisado en público; **discussions** para ideas, cuestiones de diseño y todo lo que aún no es lo bastante concreto para ser una issue. Las issues con la etiqueta _good first issue_ son la puerta de entrada más sencilla.

La mayoría de las contribuciones no exigen escribir código:

- **Informar de problemas** con un ejemplo mínimo del documento y de la configuración
- **Compartir tus maquetaciones** y convertirlas en presets desde los que otros puedan empezar
- **Mejorar la documentación** con tutoriales, ejemplos y explicaciones
- **Traducir** la interfaz y la documentación a nuevos idiomas
- **Aportar conocimiento tipográfico**, sobre todo de escrituras y tradiciones aún poco atendidas
- **Contribuir con código** al motor, a los renderizadores o al Sandbox

## Valores

Tres valores guían el proyecto. _El diseño meditado antes que la prisa_: la tipografía acumula siglos de sabiduría, y el motor debería honrarla en lugar de reinventarla mal. _La claridad antes que el ingenio_: el código, la configuración y la documentación deben ser fáciles de leer, cambiar y explicar. _La colaboración antes que el territorio_: las decisiones se toman en público, y se reconoce a cada persona que contribuye.

Si algo de esto te resuena, el repositorio es el siguiente paso. Abre una issue, haz una pregunta en las discussions o cambia algo de este libro y mira qué hace el motor con ello.

:::paragraphs{style="signature"}
postext.dev · github.com/drnachio/postext
:::
`;
