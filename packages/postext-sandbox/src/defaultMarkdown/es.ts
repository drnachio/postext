export const DEFAULT_MARKDOWN_ES = `---
title: "Postext"
subtitle: "Un tipógrafo programable para la web"
author: "Ignacio Ferro"
publishDate: "2026-10-04"
---

# Postext {style="cover" toc="false" kicker="Motor de maquetación de código abierto · La guía" publisher="postext.dev · Licencia MIT · Cada página de este libro la ha compuesto Postext en tu navegador"}

# Índice {style="contents" toc="false"}

:::toc

:::callout{type="colophon"}
**Guía de Postext** es el libro de muestra que acompaña al Sandbox. Es a la vez un recorrido por el motor y una demostración de lo que hace: la cubierta, el índice que se numera solo, las portadillas de parte, las aperturas de capítulo, las cabeceras, cada figura y cada tabla que flota hasta su sitio… todo lo maqueta Postext, en tu navegador, a partir del Markdown que puedes abrir en el editor.

Compuesto en Fraunces, Lora, Bricolage Grotesque, Geist y Geist Mono, servidas por Google Fonts. Los diagramas son archivos SVG sencillos, que se dibujan como vectores en el canvas, en la vista HTML y en el PDF. Cambia lo que quieras —una palabra, un margen, un color de la paleta— y el libro vuelve a componerse.

Postext es de código abierto, con licencia MIT. Texto © 2026 Ignacio Ferro y quienes contribuyen a Postext.
:::

:::part{number="I" title="Fundamentos" palette="band=#2b4acb"}
1. Por qué Postext
2. Cómo funciona el motor
:::

# Por qué Postext {lead="La tipografía impresa pasó cinco siglos aprendiendo a componer una página; los navegadores aprendieron a disponer una interfaz. Postext lleva lo primero a lo segundo: un motor que convierte Markdown en páginas compuestas con criterio editorial." summary="La distancia entre la web y la página, y qué la salva"}

Postext es un **motor de maquetación de código abierto** que lleva a la web el oficio de la tipografía impresa profesional. Recibe **contenido semántico** escrito en Markdown enriquecido y un objeto de configuración:index{term="configuración"}, y calcula una maquetación completamente resuelta en la que cada línea, cada título, cada figura y cada tabla tiene una posición precisa, medida en unidades tipográficas reales. Después la dibujan tres renderizadores —una vista previa viva en canvas, HTML posicionado y un PDF listo para imprenta— que leen la misma geometría, de modo que lo que ves en pantalla es exactamente lo que va a imprenta; con esas mismas páginas se escribe además un libro electrónico EPUB 3.

Este libro es su propia demostración. La cubierta, el índice que se numera solo, las portadillas en cuatro colores, la banda que abre cada capítulo, las cabeceras de estas páginas y cada figura que flota hasta su sitio las ha maquetado Postext, en tu navegador, hace un momento. Nada se ha colocado a mano: el Markdown solo dice qué es cada cosa, y la configuración decide cómo se ve.

:::callout{type="try"}
Abre el panel **Texto** y elige este capítulo en el selector de capítulos de su cabecera. Cambia una palabra de este párrafo o borra una frase: la página vuelve a componerse, las columnas se reequilibran y los folios de los capítulos siguientes se actualizan.
:::

Si prefieres verlo antes de leerlo, :ref{id="postext-showreel"} lo recorre en dos minutos; en la vista Folio se reproduce sobre la propia página.

## Cómo leer este libro

El libro se organiza en cuatro partes. **Fundamentos**, la parte en la que estás, explica el problema que resuelve Postext y cómo está construido el motor: qué entra, qué sale y qué ocurre entre medias. **El oficio** trata de tipografía: cómo se compone una línea, cómo se enmarca una página, adónde van las figuras, las tablas y los recuadros, cómo un conjunto de capítulos se convierte en un libro y cómo un mismo libro vive en varios idiomas. **Más allá del texto corrido** compone páginas que no son un flujo de columnas: páginas compuestas, cómics, música y ejercicios. **La práctica** se ocupa de las herramientas: el formato del documento, el Sandbox, las salidas y la imprenta, la línea de comandos y los agentes, y el proyecto que los rodea.

Cada capítulo se abre con una breve introducción sobre su banda, y la mayoría cierran sus secciones con un recuadro titulado _Pruébalo en el Sandbox_: un pequeño experimento que puedes hacer sobre este mismo libro, ahora mismo, para ver la función en acción. Nada de lo que propone puede estropear nada —**Restaurar el original…**, en el menú de la fila de la guía del panel **Libros**, la devuelve a su estado original—, así que cambia lo que quieras.

## Maquetación de aplicaciones y maquetación editorial

El CSS moderno es una herramienta extraordinaria para construir interfaces. Flexbox, Grid, las consultas de contenedor y el posicionamiento por anclas dan un control fino sobre cómo se disponen los componentes en una ventana. Pero CSS se diseñó para la _maquetación de aplicaciones_, y la lectura extensa necesita _maquetación editorial_. Son problemas distintos:

- **La maquetación de aplicaciones** dispone componentes interactivos —botones, formularios, tarjetas, navegación— dentro de una ventana que el lector recorre libremente
- **La maquetación editorial** hace fluir texto, figuras, tablas y recuadros por una secuencia de páginas y columnas fijas, según reglas depuradas durante siglos de imprenta

El contraste de :ref{id="feature-comparison"} resume dónde divergen ambos enfoques en los documentos largos. (Basta con mencionarla: la tabla flota por sí sola al primer hueco libre tras este párrafo, y nunca hay que colocarla dos veces).

La diferencia no es de grado, sino de naturaleza. Una interfaz se adapta a la ventana que la contiene y el lector la recorre a su ritmo; una página, en cambio, tiene un tamaño fijo, un principio y un final, y todo lo que contiene debe resolverse dentro de esos límites: qué cabe en esta columna y qué pasa a la siguiente, dónde va cada figura, cómo termina cada línea y cada párrafo. Esas decisiones son las que definen la calidad de un libro, y ninguna de ellas puede tomarse mirando un solo elemento aislado.

CSS resuelve el primer caso de forma brillante. Para el segundo, la plataforma nunca ha ofrecido las primitivas que importan:

1. **Columnas equilibradas que conocen su contenido.** La propiedad _columns_ de CSS hace fluir el texto, pero no puede igualar columnas ajustando el espacio sobre los títulos o la holgura de un párrafo; no conoce figuras ni tablas que deban flotar a la cabeza de la siguiente columna libre, y no puede mantener un título con el párrafo que introduce a través de un salto de columna.
2. **Defectos de final de párrafo y de columna.** Las _huérfanas_ y las _viudas_ existen en CSS, pero su soporte es desigual y no ven la geometría de la página entera; y no hay ninguna regla para la _línea corta_, la palabra que se queda sola en la última línea de un párrafo.
3. **Corte de líneas por párrafo completo.** Los navegadores cortan las líneas de forma voraz, una a una, y solo pueden repartir el espacio sobrante dentro de cada línea, mientras que una justificación equilibrada necesita sopesar el párrafo entero a la vez.
4. **Un ritmo vertical compartido.** Libros y revistas asientan cada línea en una rejilla de línea base común a todas las columnas de la página, y CSS no tiene ninguna primitiva que ajuste las líneas a una rejilla entre columnas y páginas.
5. **El aparato de un libro.** Cabeceras que conocen el capítulo, folios en secuencias romanas o arábigas, saltos de capítulo que respetan la paridad y un índice con números de página reales: nada de esto existe en un documento que se desplaza sin fin por la pantalla.

:::callout{type="quote" placement="top"}
_La tipografía editorial es un problema de satisfacción de restricciones. Al navegador nunca se le dio el lenguaje para enunciarlas._
:::

CSS describe con gran detalle la _apariencia_ de cualquier región de texto. Lo que le falta es _optimización global_: la capacidad de sopesar un párrafo, una columna y una página enteros antes de decidir nada.

## Lo que no resuelven las herramientas existentes

Otras herramientas abordan partes del problema. Los procesadores de texto paginan. Adobe InDesign ofrece un control editorial completo. LaTeX sigue siendo la referencia de la composición académica y matemática. Pero ninguna se diseñó para la web, y sus supuestos las hacen difíciles de encajar en un flujo de desarrollo moderno:

- No se pueden incrustar como un componente de una aplicación web
- Su salida es estática y rara vez conserva la estructura semántica de la que dependen las herramientas de accesibilidad
- Sus formatos de origen son propietarios, binarios o difíciles de generar por programa
- Viven fuera de las herramientas de frontend que un equipo web ya usa

Postext toma otro camino, y la :ref{id="tools-comparison"} lo compara con los demás. Es una **biblioteca de JavaScript** que se ejecuta en el navegador, lee Markdown, aplica las reglas de la tipografía profesional y devuelve una maquetación que se puede dibujar como canvas, HTML o PDF, o escribir como libro electrónico EPUB. Está pensada para que la incrusten, configuren y amplíen desarrolladores que quieren páginas de calidad editorial sin salir de sus herramientas, y para que la configuren diseñadores que nunca necesitan tocar el código.

## Un oficio con mucha memoria

Las reglas que sigue Postext no se inventaron para él. Una línea cómoda tiene entre 45 y 75 caracteres, y por eso los textos largos se componen en columnas y no en líneas tan anchas como la página. El texto va justificado o en bandera, pero en ambos casos su textura debe ser pareja, sin los huecos que se convierten en ríos cuando se apilan demasiadas líneas flojas. Todas las líneas de una página se asientan en una rejilla de línea base común, de modo que se miran a través del medianil y se transparentan en registro a través del papel. Los títulos siguen con el texto que anuncian, un párrafo no deja sola su primera ni su última línea en el borde de una columna, y una figura aparece después de la frase que la menciona, nunca antes.

Durante siglos, estas reglas se aplicaron a mano, por cajistas que leían cada página antes de que entrase en máquina. La autoedición convirtió muchas de ellas en software, pero ese software siguió siendo un mundo aparte, con sus propios archivos y sus propias herramientas. Lo que nunca existió fue un motor que las aplicara automáticamente, a partir de texto estructurado, dentro del entorno donde hoy se lee la mayor parte de lo que se lee. De ese hueco trata este libro.

## Para quién es Postext

Postext resulta útil allí donde un texto largo y estructurado tiene que parecer diseñado y no simplemente mostrado:

- **Editoriales y equipos editoriales** que quieren que el mismo original produzca un PDF listo para imprenta, una edición fiel en pantalla y un libro electrónico, sin mantener varias maquetaciones sincronizadas
- **Plataformas de documentación y de enseñanza** cuyos libros de texto, manuales y cursos necesitan figuras, tablas, referencias numeradas y matemáticas bien compuestas en cada página
- **Desarrolladores** que construyen experiencias de lectura —informes, revistas, catálogos, documentos generados— y quieren calidad editorial de una biblioteca en lugar de una aplicación de escritorio
- **Diseñadores y tipógrafos** que quieren describir un diseño una sola vez, como reglas, y verlo aplicado con coherencia a lo largo de cientos de páginas

## Lo que Postext no es

Postext no sustituye a CSS en las interfaces: es un motor especializado en contenido extenso y estructurado. No es un editor WYSIWYG: tú escribes Markdown y describes el diseño, y el motor compone las páginas. No carga las fuentes por ti: el motor mide con las fuentes que el navegador ya tiene, así que una página debe cargar sus tipos antes de maquetar. Y, por ahora, el motor de maquetación solo funciona en el navegador, porque sus medidas vienen de las métricas de fuente del canvas de un navegador real; los generadores de PDF y de EPUB, en cambio, también funcionan en Node.

# Cómo funciona el motor {#engine lead="Entran Markdown y un objeto de configuración; sale un árbol en el que cada línea tiene una posición en unidades reales. En medio, una tubería breve que mide el texto sin tocar el DOM e itera hasta que la página se asienta." summary="Analizar, medir, maquetar, converger"}

La forma más rápida de entender lo que Postext puede hacer es seguir un documento a través de él. El motor es una tubería, esbozada en :ref{id="layout-pipeline"}, en la que cada etapa refina una única representación del documento en memoria. Además, la tubería es pura: con el mismo contenido y la misma configuración produce siempre la misma maquetación.

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

Separarlos es deliberado. El mismo Markdown puede convertirse en un libro de bolsillo, en una revista a dos columnas o en un libro de texto con columna lateral con solo cambiar la configuración.

## Análisis

El analizador lee el Markdown enriquecido y produce una lista plana de bloques: títulos, párrafos, citas en bloque, elementos de lista, fórmulas destacadas y las directivas que dan forma al libro. Lo que hace es estructurar la entrada con cuidado: une las líneas de un párrafo, sigue el anidamiento de las listas, separa el título de un encabezado de sus atributos, resuelve cada \`:ref\` contra los recursos declarados fuera del texto y registra, para cada bloque, el tramo exacto del original del que procede.

El formato en línea se analiza al mismo tiempo. La negrita, la cursiva y su combinación, los superíndices y los subíndices, las matemáticas en línea, las muestras de color y las referencias se convierten en tramos tipados dentro del párrafo, para que la etapa de medición pueda dar a cada uno su propia fuente y su propio color. Los metadatos del principio del documento se leen como tales —el título, el subtítulo, el autor y la fecha— y quedan a disposición de todos los diseños.

## Medir sin el DOM

Antes de colocar nada, el motor tiene que saber cuánto sitio necesita cada elemento, y ahí empieza todo el proyecto. Medir texto en un navegador suele significar pintarlo en la página y leer su tamaño, un reflujo que puede bloquear el hilo principal cientos de milisegundos en un documento largo.

Postext mide con _pretext_:index{term="pretext"}, una biblioteca de medición de texto sin DOM que usa las métricas de fuente del canvas y pura aritmética. Su paso caro, preparar un texto para una fuente dada, se guarda en caché; componerlo a un ancho concreto es casi gratis. El método es entre 300 y 600 veces más rápido que medir mediante reflujos, como ilustra :ref{id="measurement-speed"}, y sobre él el módulo de medición del motor añade tramos enriquecidos de negrita, cursiva y matemáticas, separación silábica, justificación y corte óptimo de líneas. Cada resultado se guarda con una clave que incluye el texto, las fuentes, el ancho y todas las opciones que pueden cambiar una línea, de modo que escribir en un párrafo vuelve a medir ese párrafo y ningún otro.

La carga de las fuentes es la única parte de la medición que el motor deja en manos de quien lo aloja. Medir con una fuente que aún no ha llegado mediría en realidad la fuente de sustitución, y todas las líneas se moverían al aparecer la definitiva. Por eso la biblioteca espera que las fuentes estén cargadas antes de la primera compilación, y ofrece una forma de vaciar sus cachés de medición cuando una fuente llega tarde, para que la compilación siguiente vuelva a medir con las métricas correctas.

## Un cortador de líneas en WebAssembly

La parte del motor que más aritmética hace es el cortador de líneas, que sopesa todas las formas de cortar un párrafo. Está escrito en Rust y compilado a WebAssembly:index{term="WebAssembly"}, un módulo de unos treinta kilobytes dentro del paquete, y elige exactamente los mismos cortes que la versión en TypeScript, de modo que un libro sale igual con uno que con otro. Así el cortador va dos o tres veces más rápido, y un libro entero se maqueta en torno a un quince por ciento antes. Donde WebAssembly está bloqueado responde el cortador en TypeScript, y en la página no cambia nada.

## Siete pasadas y un bucle

La maquetación propiamente dicha se hace en siete pasadas:

1. **Estructuración del contenido**: analiza el Markdown en una lista plana de bloques y resuelve los recursos por su identificador
2. **Medición del texto**: compone cada párrafo en líneas al ancho que va a ocupar
3. **Colocación en páginas y columnas**: llena páginas y columnas y reserva sitio para las cabeceras y los recuadros de página completa
4. **Colocación de recursos**: hace flotar cada figura y tabla citada hasta el primer hueco libre tras su referencia
5. **Refinamiento tipográfico**: aplica las reglas que mantienen los títulos con su texto y las listas con su introducción
6. **Equilibrado de columnas**: iguala las columnas de cada página
7. **Ritmo vertical**: devuelve el texto a la rejilla de línea base después de todo lo que la rompe

Estas pasadas dependen unas de otras en círculo. Mantener un título con su párrafo puede empujar a ambos a la columna siguiente; ese movimiento puede dejar una viuda; corregir la viuda devuelve una línea, lo que puede separar otra vez el título. Postext deshace el círculo con el **bucle de convergencia**:index{term="bucle de convergencia"} de :ref{id="convergence-loop"}: las pasadas tres a siete se repiten, marcando solo lo que ha cambiado, hasta que nada se mueve. Una puntuación de infracciones tipográficas acompaña a cada iteración, así que, si alguna vez se alcanza el tope, el motor se queda con la mejor maquetación que encontró, no con la última.

Las reglas que se aplican en estas pasadas son, a propósito, pocas y estrictas. Un título se mantiene siempre con las primeras líneas de lo que lo sigue. Un párrafo que termina en dos puntos se mantiene con la lista que introduce. Una figura y su pie nunca se separan. Un recuadro de página completa divide la página en bandas, y las columnas de cada banda se equilibran por su cuenta, de modo que el texto que queda sobre una tabla ancha se lee de arriba abajo en las dos columnas antes de cruzar por debajo de ella. Cuando no pueden cumplirse dos de estas reglas a la vez, gana la que menos daña la página, y la elección se hace siempre de la misma manera.

## Una pulsación, paso a paso

Ayuda ver qué ocurre cuando escribes una sola letra en un párrafo de este libro. El editor registra el cambio y el Markdown del capítulo se analiza de nuevo, lo cual es barato. Todos los bloques salvo el que has tocado encuentran su medición en la caché; el párrafo editado se compone otra vez a su ancho de columna, quizá ganando o perdiendo una línea. La maquetación del capítulo se reconstruye a partir de esas mediciones, fuera del hilo principal, y el bucle se repite hasta que la página se asienta —normalmente una vez— antes de que la vista previa dibuje el resultado.

Como cada capítulo se maqueta por separado, continuando a los anteriores, el resto del libro no se toca a menos que cambie el número de páginas del capítulo. Cuando cambia, los capítulos siguientes se paginan de nuevo en segundo plano, y el índice recoge sus nuevos folios.

:::callout{type="figures" title="El motor en cifras" placement="top"}
:::columns{count=3 breaks="3,5"}
**300–600×** más rápida la medición del texto que con reflujos del DOM. Pretext mide con las métricas de fuente del canvas y pura aritmética, y eso es lo que permite volver a componer un capítulo entero entre dos pulsaciones de tecla.

**7 pasadas** convierten el Markdown en páginas posicionadas: estructuración, medición, colocación en páginas y columnas, colocación de recursos, refinamiento tipográfico, equilibrado de columnas y ritmo vertical.

**5 iteraciones** como mucho en el bucle de convergencia, casi siempre una o dos. Si alguna vez se alcanza el tope, el motor se queda con la mejor maquetación que encontró por el camino, no con la última.

**8 idiomas** con separación silábica mediante los patrones de Liang que TeX usa desde 1983: inglés, español, francés, alemán, italiano, portugués, catalán y neerlandés.

**4 salidas** —canvas, HTML, PDF y EPUB 3— salen de una misma maquetación, de modo que la página que revisas en pantalla es la página que va a imprenta.

**0 reflujos** de la página mientras se maqueta. Todo se calcula en memoria, en un worker cuando el anfitrión lo pide, y la misma entrada produce siempre las mismas páginas.
:::
:::

El equilibrado converge tramo a tramo, entre aperturas de capítulo y saltos de página explícitos. El resultado es una garantía que importa en los libros: un capítulo maquetado por separado y el mismo capítulo dentro del libro completo salen idénticos, página a página.

## El árbol virtual del documento

:index{term="VDT (árbol virtual del documento)"}Lo que sobrevive al bucle es el **VDT**, el árbol virtual del documento: páginas que contienen columnas, columnas que contienen bloques, bloques que contienen líneas, cada uno con su caja en unidades reales, junto a una lista plana de todos los bloques para acceder rápido. El árbol es geometría pura —no sabe nada de canvas, HTML, PDF ni EPUB— y eso es justo lo que permite a todos los renderizadores dibujar salidas idénticas. Cada línea recuerda además el tramo de Markdown del que procede, y así un clic en la página lleva el cursor del editor a la palabra correcta.

Las páginas registran también para qué sirven. Una página puede ser de cuerpo, una apertura de capítulo, una portadilla de parte o una página en blanco insertada para alcanzar la paridad correcta, y ese papel es lo que permite a las cabeceras, los folios y los adornos decidir dónde aparecen. Las etiquetas de página —el folio impreso dentro de su secuencia— se calculan una sola vez, en el árbol, de modo que el canvas, el HTML y el PDF coinciden en ellas sin hacer cada uno su propia cuenta.

## Fuera del hilo principal

Una maquetación puede tardar más que una pulsación de tecla, así que el motor puede ejecutarse en un Web Worker:index{term="Web Worker"}. El worker conserva su propia caché de medición entre compilaciones y se cancela de forma cooperativa: cuando se pide una compilación nueva, la anterior se detiene en su siguiente punto de control y gana la última petición. El Sandbox maqueta así todas sus vistas, y los generadores de PDF y de EPUB tienen cada uno su worker, de modo que la interfaz sigue respondiendo mientras se compone o se escribe un libro entero.

:::callout{type="note" title="En código"}
\`buildDocument(content, config)\` devuelve el VDT. \`renderPage\` dibuja una página en un canvas, \`renderToHtml\` devuelve HTML posicionado y \`renderToPdf\`, del paquete _postext-pdf_, devuelve los bytes de un PDF, de un documento o de un libro entero pasado como una lista de capítulos. \`renderToEpub\`, de _postext-epub_, escribe esos mismos capítulos como un archivo EPUB 3. \`createLayoutWorker\`, de _postext/worker_, ejecuta la compilación fuera del hilo principal.
:::

:::part{number="II" title="El oficio" palette="band=#8f6408"}
3. Componer la línea
4. La página y sus columnas
5. Figuras, tablas y flotantes
6. Recuadros, notas y marcas
7. Libros, partes y cabeceras
8. Un libro, muchos idiomas
:::

# Componer la línea {lead="Un párrafo se compone entero, no línea a línea. Postext sopesa todas las formas posibles de cortarlo, pone precio al espaciado, a los guiones y a las palabras sueltas, y elige el conjunto de cortes que menos cuesta." summary="Corte óptimo de líneas, separación silábica, espaciado y los defectos que evita"}

La calidad de una página se decide primero en sus párrafos. Un navegador corta las líneas de forma voraz: llena una línea con todas las palabras que caben, pasa a la siguiente y solo puede repartir el espacio sobrante dentro de cada línea. Postext implementa el **algoritmo de Knuth-Plass**, el cortador de líneas óptimo que mueve TeX desde 1981. Evalúa todas las formas viables de cortar el párrafo entero y elige la que minimiza el coste total, de modo que el espaciado se mantiene parejo de la primera línea a la última.

## Cajas, gomas y penalizaciones

:index{term="Knuth-Plass, algoritmo de"}El algoritmo ve un párrafo como una secuencia de tres primitivas, dibujadas a todo lo ancho en :ref{id="knuth-plass-model"}:

- **Cajas**: palabras o trozos de palabra, de ancho fijo
- **Gomas**: el espacio entre palabras, con un ancho natural y capacidad para estirarse o encogerse
- **Penalizaciones**: posibles puntos de corte con un coste; una penalización _marcada_ señala un punto de guion y dibuja el guion si se usa

Para cada línea candidata el motor calcula una razón de ajuste $r$, cuánto deben estirarse o encogerse las gomas para llenar la medida, y una medianía que crece con su cubo, $b = 100\\,|r|^3$. Las líneas se clasifican en cuatro clases de ajuste —apretada, normal, holgada y muy holgada— y a cada corte se le cargan sus deméritos:

$$
d = (1 + b + p)^2
$$

donde $p$ es la penalización del corte. Dos líneas seguidas con guion cuestan 3000 más, y un salto de más de una clase de ajuste entre líneas vecinas cuesta 100, así que el optimizador prefiere párrafos cuya textura cambia con suavidad. Si no existe ningún conjunto de cortes viable, el motor recurre al corte voraz en lugar de fallar.

## Por qué importa el párrafo entero

Piensa en un párrafo cuya primera línea acaba justo después de una palabra larga. Un cortador voraz acepta el corte, porque cabe, y sigue adelante. La segunda línea empieza entonces con una serie de palabras cortas, no llega a llenarse y hay que estirarla; la tercera hereda el problema y termina con un guion; la última acaba con una sola palabra. Ninguno de estos defectos se ve desde la primera línea, que es la única que ha mirado el cortador voraz.

El cortador óptimo ve la cadena entera. Puede decidir terminar la primera línea una palabra antes, algo más floja de lo que podría ir, porque esa elección permite que la segunda línea se llene con naturalidad, quita el guion de la tercera y baja una segunda palabra a la última. El párrafo en su conjunto es mejor aunque su primera línea, tomada sola, no lo sea.

## Separación silábica

:index{term="separación silábica"}La separación silábica usa los mismos **patrones de Liang** en los que TeX confía desde 1983, servidos por la biblioteca _Hypher_, en ocho idiomas: inglés, español, francés, alemán, italiano, portugués, catalán y neerlandés. El idioma del documento se fija una vez, en la cabecera de la configuración, y también etiqueta el PDF para los lectores de pantalla. Los patrones dejan al menos dos letras antes del guion y tres después, de modo que las palabras de menos de cinco letras nunca se dividen, y cada guion es una penalización marcada de 50 que el optimizador puede aceptar o rechazar.

La separación solo actúa en el texto justificado, donde se gana el sueldo. Hay dos oportunidades de corte siempre disponibles, sea cual sea el ajuste: un guion entre dos letras es un corte legítimo, y una palabra más ancha que toda la medida se divide por la última sílaba que cabe o, si no hay más remedio, por el último carácter.

Los guiones opcionales escritos en el texto se respetan como puntos de corte, al mismo precio que los del patrón. El catalán sigue las normas del Institut d'Estudis Catalans: una palabra con _l·l_ geminada, como _col·lecció_, se divide entre las dos _l_, y el guion ocupa el lugar del punto volado: _col-_ al final de una línea y _lecció_ al principio de la siguiente. El idioma también puede cambiar dentro de un libro: todos los capítulos comparten el idioma de la configuración, así que una edición en varios idiomas, como esta, se configura una vez por idioma, y cada versión de la guía divide las palabras según sus propias reglas.

## Espaciado y líneas en bandera

Dos ajustes limitan cuánto puede estirarse o encogerse un espacio: \`maxWordSpacing\`, por defecto el doble del espacio natural, y \`minWordSpacing\`, 0,6 veces. Estirar más allá del máximo se paga por encima de cualquier otro defecto, así que el cortador prefiere poner un guion, mover una palabra o aceptar una línea corta antes que abrir un río. Hay líneas que no se pueden llenar —una URL larga, la cola irrompible de un elemento de lista— y, en lugar de abrirlas con huecos de tres veces el espacio natural, el motor las compone en bandera con el espaciado natural. La última línea de un párrafo va siempre en bandera, salvo cuando se desborda: entonces sus espacios se comprimen para que quepa, igual que hace TeX con las gomas.

## Chino y escrituras de Asia oriental

:index{term="chino, composición del"}El chino se escribe sin espacios entre palabras y nunca se parte con guion: una línea puede terminar entre casi cualquier par de caracteres. Un párrafo con más caracteres chinos, japoneses o coreanos que espacios entre palabras no pasa por Knuth-Plass; lo compone, línea a línea, el **compositor CJK**. Lo que este debe respetar son las reglas de principio y fin de línea: una coma, un punto o un signo de cierre nunca abren una línea, y un signo de apertura nunca la termina. Su rigor depende de la región, que da el idioma del documento —\`zh-Hans\` sigue la norma de China continental, GB/T 15834, y \`zh-Hant\` la práctica de Taiwán y Hong Kong—, y \`cjk.lineBreak\` fija el nivel a mano. Hay tramos que nunca se parten: una raya o unos puntos suspensivos de dos cuadratines, un número con su unidad. Una palabra latina o una dirección web entre los caracteres pasa entera a la línea siguiente, salvo que sea más ancha que la línea; entonces la palabra se divide y la dirección se corta tras una barra o delante de un punto.

Cada signo de puntuación chino ocupa un cuadrado propio, mitad trazo y mitad blanco, y cuánto de ese blanco conserva un libro es cuestión de estilo de la casa, como muestra :ref{id="cjk-composition"}. En Taiwán cada signo ocupa un cuadratín entero. Hong Kong también compone sus signos a cuadratín entero, pero junta casi siempre dos signos seguidos, y al paréntesis que abre o cierra una línea le quita su mitad exterior. El estilo Kaiming de China continental, el predeterminado para \`zh-Hans\`, compone las comas, los paréntesis, las comillas y los signos de título en medio cuadratín y deja entero el punto salvo a final de línea; donde se juntan dos signos, desaparece también el blanco que hay entre ellos. \`cjk.punctuationWidth\` elige el estilo; \`cjk.compressAdjacent\` y \`cjk.trimLineStart\` activan los dos ajustes, y con \`cjk.hangingPunctuation\` una coma o un punto pueden colgar más allá del final de la línea. Los ajustes \`cjk\`, junto con el idioma del documento y la dirección de la escritura, están en el grupo **Escritura** del panel **Diseño**.

Una línea china justificada se llena en un orden fijo: primero los espacios entre palabras occidentales, después el cuarto de cuadratín que el motor pone entre el texto chino y el latino (\`cjk.latinSpacing\`; nunca se teclea) y, por último, cada hueco entre dos caracteres, nunca dentro de una palabra latina ni de un número. Cuando un carácter no puede abrir la línea siguiente, el compositor intenta primero meterlo en la línea quitando blanco a los signos que ya tiene, y solo si no lo consigue baja con él a la línea siguiente el carácter anterior. Una línea que necesitaría más de medio cuadratín entre sus caracteres se deja corta, y el panel **Revisión** la señala como línea CJK corta.

El resto de un libro chino sigue los mismos ajustes. Las plantillas de capítulo, los folios, las listas y los contadores admiten los estilos de numerales chinos, entre ellos \`cjk-decimal\`, \`simp-chinese-informal\` y \`trad-chinese-informal\`, de modo que los capítulos pueden llevar sus ordinales chinos; las figuras y las tablas toman su nombre en chino y se numeran por capítulo con un guion. \`cjk.grid\` fija la caja de texto como un número de caracteres por línea y de líneas por página, la retícula sobre la que se diseñan los libros chinos. La edición china de esta guía se compone en vertical y se encuaderna por la derecha, como se imprimieron los libros chinos durante siglos: nombra sus capítulos con los ordinales chinos, imprime sus folios en numerales chinos y numera sus figuras y tablas por capítulo; su fila en el panel **Libros** tiene un botón de idioma propio. Entre los libros de ejemplo, _Sueño en el pabellón rojo_ es una novela entera compuesta en chino, y su edición en caracteres tradicionales va en vertical sobre una retícula de 38 caracteres por 15 líneas.

Con \`layout.writingMode: 'vertical-rl'\` el libro se compone en vertical. Las líneas van de arriba abajo y se suceden de derecha a izquierda, dos columnas se convierten en dos pisos apilados en la página, las figuras y las tablas se mantienen derechas, las palabras latinas y los números largos se tumban de lado, y cada signo toma el lugar o la forma que tiene en el texto vertical: los paréntesis y las comillas adoptan su forma vertical, y el punto pasa a la esquina superior derecha de su casilla en China continental y se queda centrado en Taiwán y Hong Kong. Un libro así se encuaderna por la derecha (\`page.binding\`): su primera página queda sola a la izquierda del lomo, y el Sandbox muestra sus pliegos de derecha a izquierda. El canvas y el PDF componen las mismas líneas verticales; la vista HTML corta sus propias líneas a la altura de su página, y pone de pie o tumba cada carácter igual que ellos. Por defecto, un número de hasta dos cifras se pone de pie en una sola casilla, y \`cjk.uprightDigits\` puede subirlo a tres o cuatro (\`:tcy[…]\` hace lo mismo con cualquier tramo corto).

Los libros chinos marcan además el texto de maneras que la tipografía latina no conoce. El énfasis se señala con un punto junto a cada carácter y no con cursiva, así que en un documento chino \`*…*\` pone puntos de énfasis en los caracteres chinos que abarca, como \`:dots[…]\`; \`cjk.emphasis: 'italic'\` conserva la cursiva. \`:name[…]\` traza la línea recta de los nombres propios, y \`:book[…]\` señala el título de una obra, y \`cjk.bookTitleMark\` elige cómo: con los signos angulares dobles de China continental o con la línea ondulada de Taiwán y Hong Kong. \`:ruby[…]{rt="…"}\` compone una lectura, en pinyin sobre los caracteres o en zhuyin a la derecha de cada uno, y \`:warichu[…]\` compone una nota en dos filas de medio cuerpo dentro de la línea. Ninguna cambia el interlineado: el panel **Revisión** avisa cuando los puntos, las líneas o las lecturas necesitan entre líneas más hueco del que deja el párrafo. En texto vertical, los puntos pasan a la derecha de la columna, las líneas a su izquierda, y de una nota se lee primero la fila de la derecha.

## El árabe, de derecha a izquierda

:index{term="árabe, composición del"}El árabe, el persa, el urdu y el hebreo se escriben de derecha a izquierda, y Postext los compone a partir del mismo Markdown y la misma configuración que cualquier otra lengua. Lo decide el idioma del documento: con \`locale: 'ar'\`, las líneas empiezan a la derecha, la primera columna es la de la derecha, el libro se encuaderna por su borde derecho y los pliegos se leen de derecha a izquierda. El motor maqueta esa página como si fuera de izquierda a derecha y luego la refleja entera, pintando cada palabra, imagen y fórmula del derecho, de modo que un diseño hecho para un libro en español funciona sin cambios: un ajuste que nombra un lado se refiere a un lado del texto, y \`start\` y \`end\` se aceptan como nombres explícitos de ese lado. Las cabeceras y los folios se quedan en el pliego, donde un diseñador los espera.

Dentro de una línea, los números, las palabras latinas y las citas siguen leyéndose de izquierda a derecha. El orden de esos tramos lo decide el algoritmo bidireccional de Unicode, implementado por completo; el texto se guarda, se busca y se copia en el orden en que se escribió, y solo se reordena al pintarlo. Los paréntesis y las comillas angulares se reflejan en los tramos de derecha a izquierda. Un bloque que va contra la dirección del libro lleva \`{dir=ltr}\` o \`{dir=rtl}\`, y un tramo de texto, \`:ltr[…]\` o \`:rtl[…]\`, un aislamiento con el que su punto final deja de irse al extremo equivocado de la línea.

Las letras árabes se enlazan, y cada una toma la forma que le piden sus vecinas, así que una palabra se mide y se pinta como una sola cadena modelada, nunca letra a letra; el PDF la modela con HarfBuzz y relaciona cada glifo con sus caracteres, de modo que el texto copiado y los lectores de pantalla reciben las palabras que se escribieron. De ahí salen tres reglas: no se divide con guiones, no se espacian las letras y no se corta una palabra por dentro; si no cabe, desborda la línea y se avisa en lugar de partirla. Las líneas justificadas se estiran primero en sus espacios y después con la **cachida**, los enlaces alargados que el calígrafo traza entre dos letras unidas, que solo se ponen donde las reglas del naskh lo permiten y se dejan fuera del texto copiado. El cortador de líneas cuenta ese alargamiento como estiramiento, así que elige los cortes sabiendo dónde puede ensancharse una línea. El énfasis se compone en negrita, porque la tipografía árabe no tiene cursiva, y el motor nunca inclina una letra árabe.

Las vocales se apilan encima y debajo de las letras, dentro del interlineado, que nunca crece solo: el panel **Revisión** señala el párrafo cuyas marcas tocarían la línea de arriba, con el interlineado que necesitaría. Los números que genera el motor —folios, números de capítulo, de figura y de nota— toman las cifras de la región, las arábigo-índicas en el oriente árabe y las europeas en el Magreb, mientras que los números que escribe el autor nunca se tocan; un título puede escribir su número como un ordinal en letras, y los preliminares pueden contar en el orden abjad de los manuscritos. Los poemas clásicos se escriben en \`:::verse\`, un verso por línea con sus dos hemistiquios separados por \`||\`: cada hemistiquio se lleva a un mismo ancho, primero con cachidas, y las rimas quedan alineadas a lo largo del poema. La edición árabe de esta guía se compone así, encuadernada a la derecha, y entre los libros de ejemplo _Las mil y una noches_ recoge la obra entera en árabe, a la manera de la imprenta de Bulaq.

## Énfasis y tramos

Un párrafo rara vez es un único tramo de texto. La negrita, la cursiva y la negrita cursiva se componen en los cortes reales de la familia —una cursiva verdadera, no una redonda inclinada—, cada uno medido con sus propias métricas, de modo que una palabra en negrita ocupa exactamente el sitio que necesita. El color del texto en negrita, del texto en cursiva y de las referencias puede fijarse por separado; en este libro, las referencias a figuras y tablas van en negrita y en el color de parte; en el PDF, además, son enlaces.

Los superíndices y los subíndices se componen más pequeños y desplazados de la línea base sin alterar el interlineado, y las muestras de color en línea se asientan en la línea base como una letra más. Todos ellos son atómicos: el cortador de líneas puede cortar antes o después, pero nunca por dentro, así que una fórmula o una muestra nunca acaban partidas entre dos líneas.

Otros dos tramos distinguen palabras sin recurrir a otro tipo de letra. \`:smallcaps[…]\` compone versalitas a partir de las mayúsculas de la fuente, igual en todas las salidas, para siglas y para los nombres de los personajes de una obra de teatro. \`:chip[…]\` pone una palabra en una cajita redondeada que fluye con la línea —teclas, etiquetas, el banco de palabras de un ejercicio—, con un estilo con nombre, sin cortarse nunca por dentro y con palabras que siguen siendo texto real en el HTML y en el PDF.

Los números también tienen estilos.:index{term="cifras, estilos de"} Un tipo puede dibujar sus cifras alineadas, tan altas como las mayúsculas, o elzevirianas, que suben y bajan como las minúsculas, y proporcionales o tabulares, todas del mismo ancho para que las columnas de números cuadren. \`figureStyle\` elige entre ellas para el cuerpo, un estilo de párrafo, un nivel de título, una tabla o un pie: cifras elzevirianas en el texto corrido, donde las alineadas gritarían, y cifras alineadas tabulares en una tabla de resultados. Un tipo que no dibuja el estilo pedido conserva sus propias cifras.

## Huérfanas, viudas y líneas cortas

:index{term="viudas y huérfanas"}Una **huérfana** es la primera línea de un párrafo que se queda sola al pie de una columna; una **viuda**, su última línea llevada sola a la cabeza de la siguiente. Las dos rompen el ritmo de la lectura, y :ref{id="orphan-widow"} las muestra a ambos lados de un salto de columna. Un tercer defecto, la **línea corta**, es una última línea con una sola palabra breve, varada bajo un párrafo lleno.

Postext pone precio a las tres. Cuando un párrafo cruza una columna, el motor compara todos los cortes posibles y a cada uno le carga el espacio que deja sin usar, la huérfana y la viuda —1000 por defecto cada una, con al menos dos líneas a cada lado—. Las líneas cortas se pagan dentro del propio cortador, como medianía, siempre que la última línea mida menos de veinte caracteres de espacio. Cuando no se puede evitar una línea corta cortando de otra manera, el motor puede componer el párrafo una línea más corto, apretando los espacios dentro de su mínimo y, si hace falta, el espaciado entre letras como mucho diez milésimas de cuadratín. Los elementos de lista siguen las mismas reglas, con interruptores propios.

## Listas

Las listas siguen la misma disciplina que los párrafos, con una tipografía propia. Las listas con viñetas eligen el carácter de la viñeta, su tamaño, su peso y su color, y el espacio y la sangría francesa que mantienen alineado el texto de cada elemento; las listas numeradas eligen entre números arábigos, letras minúsculas o mayúsculas y números romanos en minúscula o mayúscula, con un separador que puede tener estilo propio y números alineados a la derecha, para que los elementos 9 y 10 queden alineados. El anidamiento llega a cinco niveles, cada uno con su propia sangría y sus propias marcas, y las listas de tareas dibujan una casilla para cada elemento, marcada o no. Los elementos pueden ir juntos o espaciados, y el motor trata el final de una lista como una de sus palancas al equilibrar las columnas.

:::callout{type="try"}
En el panel **Diseño**, busca _flojas_ y activa **Resaltar líneas flojas**, en el grupo **Avanzado**. Después estrecha las columnas o sube \`maxWordSpacing\` y observa qué líneas tiene que abrir el motor y cómo las redistribuye el optimizador.
:::

## Matemáticas

:index{term="matemáticas"}Las fórmulas son ciudadanas de pleno derecho. Las expresiones en línea, como $e^{i\\pi}+1=0$, fluyen con el texto, compuestas por MathJax como trazados vectoriales que se mantienen nítidos a cualquier ampliación. Cuando una fórmula es más alta de lo que permite la línea, se reduce de forma uniforme para que la rejilla de línea base sobreviva. Las fórmulas destacadas ocupan líneas propias, centradas en la columna, con sus propios márgenes, y el texto que las sigue vuelve a la rejilla:

$$
\\int_0^{\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

El canvas, la vista HTML y el PDF dibujan los mismos trazados, de modo que las fórmulas coinciden en las tres salidas y siguen siendo vectores en la imprenta.

Unos cuantos ejemplos más muestran el abanico de notación que maneja el motor. El primero es una serie infinita, la suma de los inversos de los cuadrados que Euler resolvió en 1734. En una fórmula destacada, los límites del sumatorio se colocan encima y debajo del símbolo, y la fracción del resultado toma su tamaño completo en lugar de la versión reducida que se usa dentro de una línea.

$$
\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}
$$

Las matrices son otra prueba habitual, porque exigen alinear filas y columnas y ajustar la altura de los paréntesis a la de su contenido. MathJax compone la matriz como una tabla de celdas centradas y estira los delimitadores hasta abarcarla; Postext recibe el resultado como trazados, mide su caja completa y reserva el espacio exacto antes de devolver el texto a la rejilla. El determinante de una matriz de dos por dos se lee así.

$$
\\det \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} = ad - bc
$$

La distribución normal reúne en una sola expresión casi todo lo que complica la composición matemática: una raíz con su barra, letras griegas para la media y la desviación típica, y una fracción entera dentro de un exponente, que debe reducirse dos veces sin perder legibilidad.

$$
f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}}\\, e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}
$$

Las definiciones por casos cierran la serie. Una llave agrupa las ramas de la definición, cada una con su condición alineada a la derecha, y la altura de la llave crece con el número de casos.

$$
|x| = \\begin{cases} x & \\text{si } x \\ge 0 \\\\ -x & \\text{si } x < 0 \\end{cases}
$$

Las fórmulas en línea siguen otras reglas, porque tienen que convivir con las palabras que las rodean. Las raíces de $ax^2+bx+c=0$ son $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$, el producto de Euler se escribe $\\prod_p (1-p^{-s})^{-1} = \\zeta(s)$ y la transformada de Fourier $\\hat f(\\xi) = \\int f(x)\\,e^{-2\\pi i x \\xi}\\,dx$ también se queda en su línea. En los tres casos el motor mide la altura de la fórmula y, si supera la que permite el interlineado, la reduce solo lo necesario, de modo que las líneas de alrededor conservan su posición en la rejilla y el párrafo mantiene su textura.

# La página y sus columnas {#columns lead="Las páginas son fijas, las columnas son finitas y cada línea debería asentarse en un ritmo compartido por todo el pliego. Este capítulo trata del marco: la geometría de la página, las estructuras de columnas, la rejilla de línea base y el arte de terminar las columnas a la par." summary="Geometría de página, columnas, rejilla de línea base y equilibrado"}

Las columnas son la expresión más visible del diseño editorial, y el lugar donde antes se rompen las soluciones caseras. Postext trata la página y sus columnas como objetos de primera clase, con su propia geometría, su propio ritmo y sus propias reglas para terminar bien.

## Geometría de la página

Una página empieza por su tamaño. Postext ofrece como predefinidos los formatos habituales de libro y revista, recogidos en :ref{id="preset-sizes"}, y cualquier tamaño a medida en centímetros, milímetros, pulgadas o puntos; esta guía se compone en el formato de 21 × 28 cm. Los márgenes pueden ser **simétricos**: el margen izquierdo pasa a ser el interior, junto al lomo, y cambia de lado en cada verso. Para la producción impresa, la página puede llevar sangrado y marcas de corte, y un ajuste de PPP controla la resolución de las medidas en píxeles.

Los folios siguen secuencias: arábigos, romanos en minúscula o mayúscula, alfabéticos en minúscula o mayúscula, cada una con su propio número inicial, de modo que un libro puede numerar sus preliminares i, ii, iii y empezar el capítulo uno en 1. El PDF registra las mismas secuencias como etiquetas de página, y el visor muestra exactamente el número impreso al pie.

## Medida e interlineado

Las dos cifras que más deciden cómo se lee una página son la longitud de sus líneas y la distancia entre ellas. La configuración fija el cuerpo y el interlineado en unidades reales —este libro usa 9,4 puntos sobre 13,6—, y el ancho de columna se deduce de la página, los márgenes, la estructura de columnas y el medianil. Una línea de 45 a 75 caracteres es el objetivo clásico; mucho más corta y el ojo salta demasiado a menudo, mucho más larga y pierde el camino de vuelta a la línea siguiente. Dos columnas en una página de 21 cm caen con holgura dentro de ese margen, y esa es una de las razones de que el formato sea tan común en revistas y libros técnicos.

El interlineado es además la unidad de la rejilla de línea base. Toda distancia vertical que importa —el espacio sobre y bajo un título, alrededor de una figura, entre los elementos de una lista— se expresa mejor como un número entero de líneas de rejilla, o se corrige hasta serlo, para que la página mantenga un único ritmo de arriba abajo.

## Estructuras de columnas

Tres estructuras cubren la mayoría de las publicaciones, esbozadas como miniaturas en :ref{id="column-layouts"}:

1. **Una columna**, para novelas, ensayos y lectura concentrada
2. **Dos columnas**, para revistas, informes y libros como este
3. **Columna y media**: una columna principal junto a otra lateral más estrecha
   - La columna lateral puede llevar texto que continúa desde la principal
   - O puede ser un **canal de flotantes** que solo recoge figuras, tablas, pies y recuadros, como en los libros de texto con una columna exterior de notas y diagramas

El medianil entre columnas es configurable, y en él puede dibujarse un filete opcional, con su propio grosor y color. Los elementos de página completa —una figura, una tabla, un recuadro— cortan las columnas: el texto que queda por encima se reparte a la par entre ellas, y las columnas continúan por debajo.

## Títulos

Los títulos se configuran nivel a nivel, hasta seis niveles: tipo de letra, cuerpo, interlineado, peso, cursiva, mayúsculas, color, alineación y el espacio encima y debajo de cada uno. Un nivel puede numerarse con una plantilla —\`{1}.{2}\` imprime 4.3 en la tercera sección del capítulo 4, y formatos como \`{1:I}\` o \`{1:a}\` pasan un nivel a números romanos o a letras—. Un nivel también puede saltar a una página nueva, con la paridad que pida, y ocupar todo el ancho de la página en lugar de una columna: eso es lo que convierte un título de primer nivel en una apertura de capítulo.

Los títulos se mantienen con lo que los sigue, así que un título de sección nunca se queda esperando solo al pie de una columna. También se ajustan a la rejilla de línea base: un título mayor que el cuerpo ocupa el espacio que necesita, y el texto que lo sigue vuelve a la rejilla, de modo que las columnas a ambos lados del medianil siguen mirándose línea a línea.

## La rejilla de línea base

:index{term="rejilla de línea base"}Los libros profesionales alinean la primera línea base de cada columna a un ritmo vertical común, y todas las líneas siguientes caen en la misma rejilla, de modo que se miran a través del medianil. Postext ajusta el texto a una rejilla derivada del interlineado del cuerpo, como ilustra :ref{id="baseline-grid"}. Tras los elementos que la rompen —un título mayor que el cuerpo, una figura, una fórmula destacada— se deja el espacio necesario para devolver la línea siguiente a su sitio. La rejilla puede dibujarse superpuesta mientras trabajas, allí donde hay texto.

## Terminar las columnas a la par

Cuando una página termina en mitad del texto, sus columnas deberían acabar a la misma altura. Es el **equilibrado de columnas**:index{term="equilibrado de columnas"}, y es más difícil de lo que parece: las líneas van en pasos enteros de rejilla, las figuras no se pueden partir, los títulos deben seguir con su texto y los párrafos no pueden dejar huérfanas. Postext iguala una columna corta con tres palancas, usadas por orden de preferencia y dibujadas en :ref{id="column-balancing"}:

1. **Espacio sobre los títulos**, una línea de rejilla entera cada vez, repartida por importancia y nunca en la cabeza de una columna
2. **Una línea tras el final de una lista**
3. **Párrafos más sueltos**: un párrafo compuesto una línea más largo, la _looseness_ de TeX, aceptado solo si ninguna de sus líneas se estira más allá del límite de espaciado; si ayuda, un toque de espaciado entre letras, como mucho diez milésimas de cuadratín

Un título no recibe más de dos líneas antes de que se prueben las otras palancas; solo si aún queda hueco toma la tercera o la cuarta. Cada arreglo se verifica maquetando la página de nuevo, hasta ocho veces, y gana el mejor resultado. Algunas columnas se dejan en paz a propósito: la última antes de un salto de página forzado o de una apertura de capítulo, la última página del documento, una columna sin nada que estirar. Dos reglas afines igualan las columnas del final de un capítulo y las que quedan sobre un recuadro de página completa que se mueve o se parte.

## Bandas y recuadros de página completa

Una página no siempre es un único juego de columnas de arriba abajo. Una figura, una tabla o un recuadro de página completa la corta en **bandas**:index{term="bandas"}: el texto que queda encima del recuadro llena sus columnas como una banda propia, el recuadro cruza la página y las columnas vuelven a empezar debajo. Cada banda se equilibra por su cuenta, de modo que el lector baja por la primera columna y sube a la cabeza de la segunda antes de cruzar el recuadro, como en un periódico. Cuando una banda acabaría desigual, un **tope de banda** acorta sus columnas al mismo número de líneas, y el texto que ya no cabe sigue fluyendo por debajo. Bajo una figura que cruza varias columnas, las cabezas de las columnas se mantienen a la par: ninguna baja una línea sin sus vecinas, salvo para cerrar su propio pie.

Las columnas finales de un capítulo reciben el mismo trato. En lugar de dejar la última página con una columna llena y otra casi vacía, un tope final reparte entre ellas las líneas que quedan, y las palancas de equilibrado hacen el resto. La última página de este capítulo lo muestra: sus dos columnas terminan a la par. Los saltos de columna explícitos se respetan: \`:::columnbreak\` termina una columna donde quiere el autor, y el equilibrado deja en paz el pie de esa columna.

:::callout{type="try"}
En el panel **Diseño**, abre **Títulos e índice** y desactiva **Equilibrar columnas**. Mira el pie de las columnas de este capítulo; después vuelve a activarlo y observa qué palanca ha usado el motor en cada página.
:::

## Reglas que eliges tú

Algunas decisiones son cuestión de estilo de la casa más que de acierto o error, y la configuración las deja en manos de cada libro. ¿Puede partirse entre dos columnas una lista corta de tres elementos? ¿Puede flotar una figura hasta una apertura de capítulo? Cada una de estas **reglas de composición** toma uno de tres valores.:index{term="reglas de composición"} :chip[allow]{style="state"} deja que el motor lo haga, :chip[warn]{style="state"} deja que ocurra y añade una entrada en el panel Revisión, y :chip[avoid]{style="state"} obliga al motor a cambiar la página para que no ocurra nunca: la lista entera pasa adelante con su introducción y la figura espera a la página que sigue a la apertura. Poner una regla en warn es como un editor averigua cuántas veces la rompería el libro antes de decidir. Las dos reglas empiezan en allow, así que una configuración que no las menciona compone sus páginas como siempre, y una lista corta es la de tres elementos como mucho, salvo que la configuración indique otro número.

# Figuras, tablas y flotantes {lead="Una referencia es una promesa, no una posición. Menciona una figura y Postext le busca casa: el primer hueco libre tras la mención, numerada por orden de lectura, con su pie, y nunca antes de las palabras que la llaman." summary="Dónde caen los recursos, cómo se numeran, tablas que se parten"}

Todo lo que no es texto que fluye —imágenes, diagramas SVG, tablas— es un **recurso**. Los recursos se declaran fuera del texto, cada uno con su identificador, su tipo, su pie y sus preferencias de colocación, y el Markdown se limita a mencionarlos. En el Sandbox viven en el panel Recursos.

## Basta con una mención

:index{term="flotantes"}Escribir \`:ref{id="…"}\` en una frase hace dos cosas: imprime la etiqueta del recurso y, la primera vez, lo _incorpora_, de modo que flota hasta el primer hueco libre tras la referencia. Los huecos se prueban en orden, como muestra :ref{id="float-slots"}: el pie de la columna que contiene la referencia, luego la cabeza y el pie de la siguiente columna libre, luego una banda en la página siguiente. El texto nunca se interrumpe.

Unas pocas reglas mantienen honrados a los flotantes:

- Un flotante nunca cae antes de su referencia y nunca se encoge para caber
- Los flotantes de una misma secuencia de numeración conservan su orden, así que la figura 12 nunca aparece antes que la 11; una tabla que espera sitio no retiene a las figuras
- Los flotantes nunca escapan de su capítulo: las aperturas de capítulo, las portadillas de parte y el final del documento son barreras
- Un flotante que dejaría menos de tres líneas de texto en una página nueva espera a la siguiente
- Las bandas de cabeza y de pie se alinean con la rejilla de línea base, y el pie de un flotante inferior comparte la línea base de la última línea de texto

## Colocación

Cada recurso puede indicar dónde prefiere ir, y cada tipo de recurso tiene un valor por defecto; los campos se recogen en :ref{id="placement-options"}. Un recurso también puede insertarse en un punto exacto, cuando su posición es _here_. Y una tabla o una figura demasiado ancha para la página puede girar un cuarto de vuelta, hacia un lado o hacia el otro: entonces ocupa una página propia, pegada al lomo y dimensionada según la altura de la página.

## Números y etiquetas

Los tipos de recurso definen sus propias secuencias de numeración. Figuras y tablas vienen de serie y se traducen al idioma del documento; un tipo puede añadir un prefijo, una etiqueta abreviada, una plantilla como \`{h1}.{n}\` para numerar por capítulo —la figura 5.2 es la segunda figura del capítulo 5—, una regla de reinicio y un formato de contador. Los números siguen la **primera referencia en el orden de lectura**: si insertas una mención anterior, se mueven todos los números posteriores. Una referencia puede imprimir solo el número, la etiqueta completa o la abreviada, cambiar su caja o imprimir un texto propio.

La numeración se mantiene correcta en todo un libro porque forma parte de lo que cada capítulo hereda de los anteriores. El séptimo capítulo de esta guía empieza sus figuras en la 7.1 porque así lo dice el contador de capítulos, no porque nadie haya escrito el número.

## Tipos propios

Una configuración puede declarar tantos tipos de recurso como use una publicación —mapas, láminas, recuadros, gráficos, documentos—, cada uno con un nombre en singular y en plural, una etiqueta abreviada para las referencias, un prefijo para sus pies y una secuencia de numeración propia. Cada tipo puede llevar además su colocación por defecto y ajustar el estilo del pie, de modo que las láminas ocupen una página entera con el pie encima mientras las figuras flotan al ancho de la columna.

## Tablas

:index{term="tablas"}Las tablas llevan su modelo consigo: filas de celdas con fusiones de columnas y filas, filas de cabecera, alineación y anchos de columna relativos. Las celdas admiten Markdown en línea, párrafos y listas sencillas, un relleno propio —los cuatro colores de parte de este libro son :swatch{color="#2b4acb"} azul, :swatch{color="#8f6408"} oro, :swatch{color="#1f7a6d"} verde azulado y :swatch{color="#c0452f"} bermellón— e incluso una imagen. El estilo de las tablas se define una vez para todo el documento: tipografía del cuerpo y de la cabecera, relleno de la cabecera y filetes en retícula, solo horizontales, solo exteriores o ninguno.

Una tabla más alta que la página se parte entre páginas. Sus filas de cabecera se repiten en cada tramo, el pie de cada continuación gana el sufijo _(cont.)_, un aviso de _Continúa_ cierra cada tramo salvo el último, y ningún corte atraviesa una fusión de filas. Una tabla girada se parte igual, página tras página.

## Figuras junto al texto

En una maquetación de columna y media cuya columna lateral solo lleva flotantes, los recursos pueden vivir junto al texto en lugar de dentro de él. Una figura con el ancho _side_ se apila en la columna lateral junto al párrafo que la cita; un recuadro puede hacer lo mismo, y así los libros de texto pueden mantener definiciones, conceptos clave y figuras al margen junto a las líneas que explican. Una figura ancha puede además llevar el pie a su lado, en la columna lateral.

## Texto que rodea las imágenes

:index{term="ajuste del texto"}Una imagen o un recuadro más estrecho que su columna puede quedarse a un lado de ella, con el texto corriendo a su lado en la medida que sobra y volviendo a la medida completa por debajo. Un dibujo recortado puede ir más lejos: con el ajuste de **contorno**, cada línea se compone tan corta como ancho es el dibujo a su altura, de modo que el texto sigue la silueta y no la caja.

## Zonas seguras

Una fotografía rara vez se necesita entera. Una imagen puede marcar su **zona segura**:index{term="zona segura"}, el rectángulo que contiene lo que importa, y el motor puede entonces recortarla en cualquier punto entre la imagen entera y ese rectángulo, sin cambiar su ancho. Aprovecha esa libertad para mantener una imagen en una columna que de otro modo quedaría corta, para encajar una imagen más alta que la página y para equilibrar columnas: una imagen con zona segura puede crecer líneas enteras hasta llenar el pie de una columna corta, sin dejar ningún hueco a la vista. La zona segura se dibuja sobre la imagen en el panel Recursos.

## Pies y créditos

Un pie es el prefijo del tipo, el número y el texto del pie, que admite Markdown en línea y referencias propias. Los pies van encima o debajo de su recurso, con la tipografía y el tamaño del estilo de pie; la etiqueta puede ir en negrita o en color, como en este libro. Un recurso puede llevar además una nota: una línea más pequeña de crédito o de fuente bajo él.

## Figuras vectoriales

Los diagramas SVG se dibujan como vectores en todas partes. El PDF convierte el subconjunto habitual de SVG —formas, trazados, grupos, trazados de recorte, rellenos y trazos sólidos, opacidad y texto— en operaciones de dibujo nativas, y rasteriza a 600 ppp lo que queda fuera; una figura también puede traer un máster PDF propio, que se incrusta tal cual. Para imprimir a una tinta, un interruptor recolorea todos los diagramas como tintas de un solo color, según su luminancia, en los tres renderizadores.

El texto de un SVG sigue siendo texto. En el PDF se compone con fuentes reales y se puede seleccionar y buscar, y en el Sandbox se puede editar en su sitio: el panel Recursos abre el código del diagrama con solo su texto editable —el dibujo en sí queda bloqueado salvo que lo desbloquees—, de modo que una etiqueta puede corregirse o traducirse sin abrir un programa de dibujo. Los diagramas de este libro se generan para cada idioma, y por eso sus etiquetas están en español en la edición española, en catalán en la catalana, en inglés en la inglesa, en chino en la china y en árabe en la árabe.

Tres figuras compuestas aquí lo demuestran. La roseta de :ref{id="vector-rosette"} está hecha de curvas de Bézier, trazos finísimos y una línea de microtexto de dos puntos y medio de alto; el gráfico de :ref{id="vector-chart"} combina un área rellena, una línea discontinua y etiquetas de texto; y :ref{id="vector-clip"} usa un trazado de recorte, un grupo dibujado con transparencia y una misma forma reutilizada cinco veces.

:::callout{type="try"}
Haz clic en el pie de cualquier figura del canvas: el panel Recursos se abre en ese recurso, con el campo del pie listo. Cambia su colocación de _auto_ a _top_ y mira cómo se mueve.
:::

## Vídeos

:index{term="vídeos"}Un vídeo es un recurso más. Se menciona, se numera aparte y flota hasta el primer hueco libre, como una figura. Puede venir de YouTube o de Vimeo, de un archivo guardado en el libro o de una dirección web: un MP4 o un WebM en un servidor, o un flujo HLS.

En papel se imprime su portada, un fotograma elegido, con una marca de reproducción y un código QR que abre el vídeo. La vista HTML y el EPUB lo reproducen en su propio reproductor, salvo los de YouTube y Vimeo y los flujos HLS, que un libro electrónico solo puede enlazar. En la vista Folio, un clic en la portada lo reproduce en la página. Los vídeos de este libro, como :ref{id="postext-showreel"}, son flujos HLS servidos desde una red de distribución de contenidos.

# Recuadros, notas y marcas {#boxes lead="Alrededor del texto corrido un libro guarda una segunda capa: recuadros que apartan un comentario, notas al pie de la columna, pequeñas marcas dentro de la línea y un índice que recuerda cada página. Todo se escribe en el Markdown y lo dibuja la configuración." summary="Recuadros, recuadros anidados y flotantes, chips, notas al pie y el índice analítico"}

Los libros de texto enmarcan definiciones y ejercicios, los ensayos bajan sus fuentes al pie de la página, los manuales señalan teclas y estados dentro de la frase y los libros largos terminan con un índice. Postext escribe cada una donde le corresponde en el texto y deja su aspecto a la configuración.

## Recuadros

:index{term="recuadros"}\`:::callout\` compone una caja con un título opcional, en uno de los estilos que define la configuración. Este libro define cinco: los recuadros _Pruébalo_ que te mandan al Sandbox, las notas técnicas, las citas destacadas en cursiva de rótulo, el panel oscuro de página completa con cifras clave y, un aparte al margen señalado con un filete. Un estilo decide el fondo, el borde, la franja y las esquinas de la caja, la tipografía de su título y su cuerpo, y dónde va: en el flujo, en la cabeza o al pie de una columna, a lo ancho de la página, en la columna lateral o fijo en una posición de la página.

Un recuadro largo puede partirse entre sus párrafos, o incluso entre sus líneas, dejando al menos dos a cada lado; la continuación omite el título. Dentro de un recuadro, \`:::columns\` compone su contenido en columnas equilibradas, como el panel de cifras de :ref{id="engine"}.

Los atributos de un recuadro pueden sustituir su estilo para una sola caja: un \`title\`, una \`placement\`, un \`span\` de columna, de página o lateral, y una \`label\` impresa en una pestaña de su esquina superior.

## Recuadros dentro de recuadros

:index{term="recuadros!anidados"}Un recuadro puede contener otro. Así se pone un ejemplo resuelto dentro de una lección o una advertencia dentro de un procedimiento: el recuadro interior se abre dentro del exterior y se cierra antes que él, y cada \`:::\` suelto cierra el recuadro más interno que siga abierto. El recuadro interior toma el ancho de su padre, y conserva su propio estilo.

:::callout{type="note" title="Dos recuadros, un bloque"}
El recuadro exterior es una nota técnica. Se mantiene unido a lo que contiene, así que el motor coloca los dos como un solo bloque.

:::callout{type="try"}
Abre el panel Texto en este capítulo y borra la línea que cierra el recuadro interior. El recuadro exterior termina ahora donde termina el capítulo, y el panel Revisión lo señala.
:::

El recuadro exterior sigue después del interior, con su propio estilo.
:::

## Recuadros que flotan

Hay recuadros que no tienen por qué interrumpir la lectura: una columna aparte, un perfil, un resumen de cifras. Con una \`placement\` _top_ o _bottom_, un recuadro así flota como una figura hasta la cabeza o el pie de la primera columna con sitio para él, y el texto que lo sigue en el Markdown llena la página por encima o por debajo.

:::callout{type="aside" placement="bottom" title="Dónde cae un recuadro flotante"}
En el primer hueco libre a partir del punto donde se escribe. Un recuadro que debe ir entero cede ante los recuadros y las figuras ya colocados, nunca al revés.
:::

## Marcas y recuadros con diseño

Un estilo puede dibujar una **marca** fuera del recuadro, en una columna estrecha propia a su lado: un icono, un glifo, una forma o una imagen de los recursos, con un filete que recorre la altura del recuadro.

Cuando una marca no basta, un estilo puede dibujar el recuadro entero con un **diseño**. El texto del recuadro pasa a ser un elemento más, y los atributos escritos en el recuadro pueden imprimirse en el diseño.

## Marcas dentro de la línea

:index{term="chips"}\`:chip[…]\` pone una palabra en una cajita redondeada que fluye con el texto, para teclas, estados y etiquetas: un ajuste que puede valer :chip[allow]{style="state"}, :chip[warn]{style="state"} o :chip[avoid]{style="state"}, o una tecla como :chip[Esc].

Escrita \`:swatch{color="#c0452f"}\`, una muestra pone dentro de la línea un cuadradito de ese color, :swatch{color="#c0452f"} como este.

## Notas al pie

:index{term="notas al pie"}Una nota se cita con \`[^id]\` justo después de la palabra o del signo al que pertenece,[^first-note] y se escribe en cualquier lugar del capítulo como un párrafo que empieza por \`[^id]:\`. Las notas se numeran en el orden en que se citan por primera vez, de nuevo desde uno en cada capítulo; \`footnotes.numbering\` puede seguir la numeración a lo largo del libro o reiniciarla en cada página.

[^first-note]: Esta es una. Se escribió más abajo en el Markdown, como un párrafo propio.

La nota se compone al pie de la columna que contiene la línea que la cita, bajo un filete corto, y la línea y su nota comparten siempre columna: si la nota no cabe, la línea pasa con ella a la siguiente.[^second-note] \`footnotes.placement: 'chapterEnd'\` reúne en cambio las notas de un capítulo después de su último bloque.

[^second-note]: El motor equilibra la columna contando las líneas de la nota, así que una página con notas también termina a la par.

## Un índice al final

:index{term="índice analítico"}El índice analítico se escribe donde el texto trata cada término. \`:index[anemia]\` imprime la palabra y la registra; \`:index{term="Corazón!válvulas"}\` no imprime nada y registra la página bajo una subentrada. La marca \`main\` pone la página en negrita, \`range="start"\` y \`range="end"\` acotan un pasaje que ocupa varias páginas, y \`see\` y \`seealso\` escriben las remisiones. \`:::index\` imprime el índice donde está.

El motor lee la página de cada marca después de maquetar, así que los números siguen al texto. Las entradas se ordenan según el alfabeto del idioma del documento —en español, la _ñ_ con encabezado propio después de la _n_— y se agrupan bajo su letra inicial, las páginas seguidas se unen en un intervalo y cada número es un enlace en el PDF. Este libro tiene uno, al final, hecho con marcas escritas en todos sus capítulos.

# Libros, partes y cabeceras {lead="Un libro es más que sus capítulos: una cubierta, un índice que se mantiene al día, portadillas de parte, aperturas que anuncian cada capítulo y cabeceras que saben dónde está el lector. Todo ello es configuración." summary="Capítulos, estilos de título, diseños, partes, índice y folios"}

Esta guía es un libro de veintiún capítulos, y cada capítulo es un documento Markdown propio. Un proyecto del Sandbox es siempre un libro: la configuración, los recursos y las fuentes se comparten, y los capítulos se suceden, como muestra :ref{id="book-anatomy"}.

## Los capítulos hacen el libro

Cada capítulo se maqueta por separado, _continuando_ a los anteriores: hereda su número de páginas y su paridad, sus contadores de capítulos y de figuras, la parte abierta y las cabeceras. Por eso las figuras de este capítulo se numeran desde la 7.1.

## Lo que hereda un capítulo

Lleva el número de páginas y la paridad de la página siguiente, para que una apertura que debe caer en página par sepa si necesita una página en blanco delante. Lleva los contadores de capítulos, de recursos y de etiquetas de página. Y lleva el esquema del libro, para que un índice en el capítulo dos pueda imprimir la página en la que empieza el capítulo diez.

## Estilos de título

Un título puede llevar atributos, escritos entre llaves al final de su línea. El más potente de ellos es el **estilo**: \`{style="cover"}\` aplica un estilo de título con nombre, que cambia la tipografía y el diseño del título y, para la sección que abre, puede cambiar las cabeceras, los márgenes de página, la disposición de columnas, la tipografía del cuerpo y la paleta. Un estilo también puede dejar sin numerar sus títulos, para que un prólogo no desplace la numeración de los capítulos, y dejarlos fuera del índice.

## Un vistazo a la configuración de este libro

La cubierta es el título de primer nivel del primer capítulo, con el estilo _cover_. El estilo quita las cabeceras y dibuja un diseño a página completa: una caja que llena el sangrado con el color noche, la ilustración de cubierta, un antetítulo en versales doradas, el título de los metadatos en Fraunces a 88 puntos, un filete dorado corto, el subtítulo en Lora cursiva y una línea de créditos al pie.

Las aperturas de capítulo son un diseño del primer nivel de título. Una caja llena la parte superior del sangrado con el color de parte; el número de capítulo se imprime en grande junto al borde exterior, el antetítulo combina la palabra _Capítulo_, el número y el título de la parte, y bajo un filete blanco corto vienen el título y la introducción del capítulo, tomada del atributo \`lead\` del título. El atributo \`summary\` del mismo título es lo que el índice imprime bajo cada entrada.

## Diseños

:index{term="diseños"}Las cabeceras, los pies de página, las aperturas de capítulo y las portadillas se dibujan con **diseños**: pequeñas composiciones libres de textos, filetes, cajas e imágenes. Cada elemento se ancla a la página, al sangrado, a la caja de texto o a otro elemento, con desplazamientos y tamaños en unidades reales, y su texto puede llevar **marcadores** como \`{pageNumber}\`, \`{chapterTitle}\`, \`{partTitle}\` o cualquier atributo del título, como el \`{attr.lead}\` que pone la entradilla en la banda de este capítulo. Los elementos se pueden limitar a las páginas pares o impares y a las páginas de un papel concreto: cuerpo, apertura, parte o blanca.

En las páginas pares de este libro, el folio en el color de parte y el título del libro van junto al borde exterior; en las impares, el título del capítulo y el folio. Solo aparecen en las páginas de cuerpo; las aperturas llevan en su lugar un folio al pie, y las portadillas de parte no llevan nada. La página en el color de parte que da frente a cada portadilla también es un elemento de diseño: una caja que llena el sangrado, visible solo en las páginas pares en blanco.

## Partes y paletas

:index{term="partes"}\`:::part\` abre una portadilla de parte: una página propia, llevada a la paridad que pide la configuración, dibujada con el diseño de parte y seguida de un cuerpo, normalmente la lista de sus capítulos.

En este libro cada parte se abre como un pliego: una página par en el color de parte a la izquierda y la portadilla a la derecha. Las partes saltan con la paridad _siempre impar_, que coloca una hoja en blanco delante de cada portadilla, de modo que la portadilla cae siempre en página impar.

Una parte también puede cambiar el color del libro. Los colores de la configuración pueden enlazarse a entradas con nombre de la **paleta**:index{term="paleta"}, y el atributo \`palette\` de una parte sustituye entradas hasta la parte siguiente. Este libro define una entrada, el _color de parte_, y cada parte le da un valor: azul para los fundamentos, oro para el oficio, verde azulado para las páginas que van más allá del texto corrido, bermellón para la práctica.

## Un índice que se mantiene al día

:index{term="índice general"}\`:::toc\` imprime el índice: una entrada por cada título de los niveles indicados y una fila por cada parte, con números, títulos, puntos guía, folios y, si se quiere, una línea tomada de un atributo del título; en este libro, el resumen de cada capítulo. Los folios son reales: el motor maqueta el libro, lee dónde ha caído cada título y vuelve a componer el índice hasta que los números se asientan.

## Saltos de página y numeración

\`:::pagebreak\` empieza una página nueva y puede pedir que sea impar o par, añadiendo una página en blanco si hace falta. \`:::numbering\` cambia la secuencia de folios desde la página siguiente. Y donde un pasaje pide un poco más de aire encima, \`:::space\` deja una línea en blanco, o \`:::space{lines=2}\` dos; las líneas en blanco de más en el Markdown no añaden nada.

# Un libro, muchos idiomas {#languages lead="Esta guía existe en diez ediciones, en cuatro escrituras y dos direcciones, y todas comparten un mismo diseño. Cada edición guarda solo lo que su idioma necesita decir de otra manera." summary="Ediciones, ajustes generales, ajustes propios, escrituras y direcciones"}

Un libro traducido suele ser un segundo libro. Quien lo diseña abre el primero, guarda una copia y empieza a cambiar cosas, y desde ese momento cada corrección del diseño hay que hacerla dos veces, o diez, a mano. Postext mantiene juntas las ediciones de un libro: un solo proyecto con un juego de capítulos por idioma, un diseño compartido y, para cada idioma, una lista breve de los ajustes que fija de otra manera.

## Ediciones

:index{term="ediciones"}Un libro del Sandbox puede contener varios idiomas. Cada **edición** tiene sus capítulos, su nombre y su descripción y, donde una figura lo necesita, sus propias ilustraciones; los recursos, las fuentes y el diseño son del libro. El panel Libros muestra una etiqueta por cada idioma que contiene un libro, y la dirección de la página nombra el que está en pantalla, de modo que un enlace abre la edición desde la que se copió. El canvas puede maquetar dos ediciones una junto a otra, y así comprueba quien traduce que el capítulo en español sigue cabiendo en las páginas que llena el inglés.

Una edición nueva empieza como copia de la que está en pantalla, todavía sin traducir, desde **Añadir un idioma…** en el menú del libro. Cuando el idioma nuevo es el árabe, el chino o el japonés, la copia toma por el camino los valores por defecto de ese idioma: la dirección, el modo de escritura, los tipos de letra y las reglas de su tipografía.

## Ajustes generales y ajustes propios

El diseño de un libro en varios idiomas se guarda en dos capas. Los **ajustes generales** son los que usan todas las ediciones:index{term="ajustes generales"}; cada idioma tiene además una **capa propia** que nombra solo los campos que fija de otra manera, combinada campo a campo sobre los generales. Un color, un tamaño o un margen cambiado en la capa general llega a todas las ediciones a la vez; cambiado en la capa de un idioma, llega solo a esa edición.

El panel Diseño muestra las dos capas con un selector en su cabecera, entre _Todos los idiomas_ y solo el idioma actual. Con el selector en un idioma, cada campo que ese idioma fija por su cuenta lleva una marca, y el panel puede llevar un valor a la capa general o devolver una edición a ella. Una lista breve en la cabecera del panel nombra todos los ajustes que el idioma fija por su cuenta.

:::callout{type="note" title="Cómo está hecha esta guía"}
Las siete ediciones en escritura latina lo comparten casi todo. De los ajustes que forman el diseño, cada una fija unas pocas decenas por su cuenta, todos ellos palabras: los títulos de sus recuadros, los nombres de sus colores, estilos y figuras, el título de sus cabeceras y el idioma de su separación silábica. Las ediciones árabe, china y japonesa conservan la misma página, la misma paleta y las mismas partes, y fijan los tipos de letra, la dirección y el modo de escritura que pide cada escritura.
:::

Esas cifras aparecen en :ref{id="edition-layers"}.

## Lo que cambia un idioma

El idioma del documento es un ajuste, \`locale\`, y llega más lejos que la separación silábica. Elige los patrones de separación, de los que vienen ocho idiomas de serie; los nombres de los tipos de figura y de tabla incorporados, _Figure_ en inglés, _Figura_ en español, _Abbildung_ en alemán; las palabras que imprimen una tabla partida o un recuadro que continúa; el orden de un índice; y las cifras, que un libro árabe puede componer en numerales arábigo-índicos. Un título o un párrafo pueden cambiar de idioma por su cuenta, y unas pocas palabras en otro idioma pueden marcarse dentro de la línea.

## Cuatro escrituras, dos direcciones

Las ediciones de esta guía usan todas las clases de composición que conoce el motor. Las latinas se componen de izquierda a derecha, justificadas y con separación silábica. La edición **árabe** se lee desde la derecha y se encuaderna por la derecha: sus líneas se justifican alargando letras con cachida donde la escritura lo permite, y no solo ensanchando los espacios; los números y las palabras latinas conservan su propia dirección dentro de la línea, y las figuras se dibujan en espejo cuando su disposición sigue el orden de lectura.

Las ediciones **china** y **japonesa** se componen en vertical, en columnas que van de arriba abajo y de derecha a izquierda, encuadernadas por la derecha como la árabe. Sus líneas siguen las reglas que cada idioma ha puesto por escrito: qué signos pueden empezar o terminar una línea, cuánto espacio ocupa una coma, dónde se tumban las palabras latinas y dónde los números cortos se quedan de pie en la columna. El japonés añade el **ruby**:index{term="ruby"}, lecturas pequeñas compuestas junto a los caracteres difíciles, que se escriben en el Markdown como \`:ruby[…]{rt="…"}\` o en una forma más corta entre llaves que da a cada carácter su propia lectura, con una barra delante de cada lectura.

## Traducir con el motor a la vista

Como las páginas se componen mientras escribes, una traducción se puede juzgar a medida que se escribe. Una frase alemana un tercio más larga que su original inglés enseña enseguida lo que cuesta: una columna que se pasa una línea o un título que ya no cabe en su banda.

:::callout{type="try"}
Abre el panel Libros y cambia el idioma de esta guía con los botones de su fila. Después abre el panel Diseño, pon el selector de su cabecera en el idioma actual y lee la lista de lo que esta edición fija por su cuenta.
:::

:::part{number="III" title="Más allá del texto corrido" palette="band=#1f7a6d"}
9. Páginas compuestas
10. Cómics y partituras
11. Ejercicios y cursos
:::

# Páginas compuestas {#composed lead="No todas las páginas son un río de texto. Una doble página de libro de texto, una apertura de revista o una hoja de consulta rápida se construyen con marcos, cada uno con su pieza. Postext guarda los marcos en una plantilla y las palabras en el Markdown." summary="Plantillas de página, marcos con nombre, pliegos y texto que no cabe"}

Los capítulos anteriores componen texto en columnas que pasan de página en página, y el motor decide dónde cae cada línea. Una gran familia de libros funciona al revés. En un libro de texto escolar cada doble página se dibuja primero: una banda para el título, un recuadro para la definición, una tira de fotografías, una columna de ejercicios, un mapa con rótulos. Las palabras se escriben para que quepan en los marcos, y cuando no caben, alguien las acorta o mueve un marco. Postext también compone estas páginas, con el nombre de **páginas compuestas**, y se atiene a la regla que sigue el resto del motor: el Markdown dice qué es el contenido y la configuración dice dónde va.

## Plantillas y marcos

:index{term="páginas compuestas"}Una **plantilla de página** forma parte de la configuración:index{term="plantillas de página"}, bajo \`pageTemplates\`. Nombra un conjunto de **marcos**: rectángulos situados en la página por un ancla y un desplazamiento o por una celda de una retícula, con un ancho, un alto y un estilo de caja tomado de los estilos de recuadro del libro. Un marco puede ser tan alto como su contenido, fijo, o llegar hasta el borde de la página; los marcos pueden apilarse o ponerse en fila como un **grupo**, de modo que cuando uno crece los demás se mueven con él. Una plantilla lleva además una **decoración**: filetes, bandas, imágenes y textos breves que se colocan cuando los marcos ya están en su sitio, de modo que una banda puede colgar de un recuadro y seguirlo.

En una plantilla no vive ninguna palabra. Un marco tiene un nombre, un tamaño y un aspecto; el título que imprime, el texto que contiene y la imagen que enmarca vienen de la página que lo usa. Por eso las diez ediciones de esta guía comparten una sola plantilla para la hoja de consulta rápida que cierra el libro, antes del índice analítico: cada una llena los mismos marcos con sus propias palabras.

## Llenar los marcos desde el Markdown

Una página compuesta es un bloque de cuatro dos puntos que nombra su plantilla. Dentro de él, \`:::frame{slot="…"}\` manda su contenido al marco de ese nombre, y un título, un recurso o un recuadro pueden nombrar un marco propio. El contenido que no nombra ninguno va al marco que la plantilla señala como marco de **flujo**, y el primer título va al marco que recoge los títulos de su nivel. La hoja de consulta rápida del final del libro se escribió así, y su Markdown se lee como el de cualquier otro capítulo.

:::callout{type="note" title="El bloque de la hoja de consulta rápida"}
\`::::page{template="sheet"}\` lo abre y \`::::\` lo cierra. Entre ambos van un título, un párrafo para el marco de flujo, seis bloques \`:::frame\` para las tarjetas y uno para la clave al pie de la página. Las posiciones, los tamaños y los colores están en la plantilla, en Diseño › Página y columnas › Plantillas de página.
:::

## Cómo se compone una página

Una página compuesta ocupa una página propia, o dos si es un pliego, y el texto que sigue a su bloque empieza en la siguiente. El motor coloca los marcos uno tras otro, llena cada uno con la tipografía del resto del libro —los mismos estilos de párrafo, títulos, listas y chips— y dibuja su caja con su tamaño final. Los marcos se leen en el orden en que aparece su contenido en el Markdown, no en el orden en que se pintan, así que un lector de pantalla, el PDF etiquetado y el EPUB fluido leen el título, luego el texto y luego los recuadros, como lo haría una persona.

## Cuando las palabras no caben

El texto escrito para un marco nunca cabe a la primera. Una plantilla dice qué puede hacer la página al respecto, y el motor prueba cada paso en orden y se detiene en el primero que funciona. Un marco que sigue a su contenido crece hasta ocupar el espacio que deja su grupo; los marcos de debajo bajan; los marcados para ceder se encogen; el texto puede componerse un poco más apretado. Cuando nada de eso basta, el texto sigue en otro marco, encadenado como los marcos enlazados de un programa de autoedición, o en una página añadida después de esta, bajo una marca que dice dónde continúa.

Lo que la página no ha podido resolver aparece en el panel Revisión con sus propuestas: qué marco se desborda, en cuántas líneas y qué haría que cupiera. Un **registro de recomposición** anota cada movimiento que el motor hizo en la página, para que quien diseña vea por qué un recuadro acabó más abajo de donde lo puso la plantilla. En el Sandbox, un clic en el aviso muestra el marco, y sus campos quedan a otro clic.

## Pliegos y conectores

:index{term="pliegos"}Una plantilla puede cubrir dos páginas enfrentadas como una sola hoja. Un **pliego** se abre en página par, añade delante una página en blanco cuando el texto anterior termina en página par, y deja que los marcos y la decoración crucen el lomo donde la plantilla lo permite; un medianil mantiene todo lo demás lejos del pliegue. Así se componen las cronologías, los mapas y las aperturas a doble página, y cada página del pliego sigue imprimiendo su cabecera y su folio.

Los marcos también pueden unirse con **conectores**: líneas, codos y curvas trazados entre dos marcos que siguen enganchados por mucho que las palabras los muevan, para organigramas, árboles genealógicos y mapas con rótulos. Las imágenes de un marco pueden llevar rótulos anclados a puntos de la imagen, con líneas de guía y flechas, de modo que un mapa de ríos mantiene los nombres sobre los ríos cuando el mapa cambia de tamaño o se traduce.

## Plantillas en el Sandbox

Las plantillas se editan en el panel Diseño, donde cada una se dibuja con sus marcos y aparece con el número de páginas que la usan. Con la vista previa en modo **Diseño**, una página compuesta muestra su retícula y sus márgenes; pulsar un marco lo selecciona, arrastrarlo lo mueve y sus tiradores cambian su tamaño, y la caja se escribe de vuelta en la plantilla en milímetros. Cuando otras páginas usan la misma plantilla, el Sandbox pregunta si el cambio es para todas o solo para esta página, que entonces recibe una plantilla nueva basada en la primera.

También existe el camino inverso. Una página maquetada a mano puede guardarse como plantilla, y un libro cuyos estilos antiguos guardaban sus palabras puede llevarlas al Markdown, donde deben estar, con una sola orden para todo el libro.

:::callout{type="try"}
Pasa la vista previa al modo Diseño, ve a la hoja de consulta rápida, justo antes del índice analítico, y arrastra hacia abajo una de las tarjetas. El Sandbox pregunta si cambiar la plantilla o solo esta página; elige solo esta página y abre el panel Texto para ver que el bloque nombra ahora una plantilla nueva.
:::

# Cómics y partituras {#comics lead="Hay libros que hablan con imágenes y otros con notas. Un cómic es un conjunto de dibujos y un guion; una partitura es música escrita como texto. En los dos casos Postext guarda las palabras en el Markdown y se encarga él mismo de rotular y de grabar." summary="Viñetas, bocadillos, rotulación, tiras y notación musical"}

El cómic y la música parecen lo contrario de aquello para lo que sirve un motor de texto. Una página de cómic se dibuja, una partitura se graba, y ninguna de las dos es una columna de líneas justificadas. Y sin embargo las dos están hechas de texto. Cada bocadillo de un cómic es una línea de diálogo que hay que traducir, rotular y encajar en un dibujo, y cada compás de una partitura es notación que un músico puede escribir en un editor de texto. Postext las trata así: los dibujos y las reglas son recursos y ajustes, y el diálogo y la música están en el capítulo.

## Imágenes sin palabras

:index{term="cómics"}Un cómic en Postext parte de dibujos sin ningún rótulo. Cada imagen puede marcar lo que no debe recortarse nunca, su **zona segura**, y dónde están sus personajes: un punto para la boca de cada personaje que habla, una caja para cada cara, zonas de las que los bocadillos deben apartarse. Esas marcas se hacen una vez, en el panel Recursos, y todas las ediciones del cómic las usan.

El guion es el Markdown del capítulo. Un bloque \`:::page\` divide una página en viñetas con una fórmula corta, \`30 [30 | 20 | *] / *\` para una fila de tres viñetas sobre una grande, da a cada viñeta su imagen y enumera bajo cada una lo que se dice en ella, una línea por bocadillo: \`maya: ¡Abuelo! ¡Ya estoy aquí!\`. Un cartucho, un pensamiento, un susurro, un grito o una onomatopeya son la misma línea con otra clave u otro estilo.

## Rotulación

:index{term="rotulación"}El motor rotula todos los bocadillos a un mismo cuerpo, con la letra de rotulación del libro, como trabaja un rotulista. Corta las palabras en líneas que forman una figura redondeada, cortas arriba y abajo, dibuja el bocadillo a su alrededor con el mismo aire por todos los lados, lo coloca en orden de lectura dentro de la viñeta, lejos de las caras y de las zonas que marca la imagen, y apunta su rabillo a la boca de quien habla. Dos líneas seguidas del mismo personaje se unen en un bocadillo de dos lóbulos. El texto nunca se encoge para caber: un bocadillo que no cabe cambia de forma, se mueve o aparece en el panel Revisión.

La tira de :ref{id="guide-strip"} se rotuló así. Sus tres dibujos no llevan palabras; el diálogo son tres líneas de Markdown de este capítulo, y cada edición de esta guía lo rotula en su idioma.

:::strip{split="* | * | *" span=page placement=top caption="Una tira rotulada por el motor. Los dibujos los comparten todas las ediciones de esta guía; los bocadillos se escriben en el Markdown de cada edición." type=figure id=guide-strip}
::panel{art=strip-proof}
editor: La edición alemana se pasa una línea en la página 212.
::panel{art=strip-screen}
designer: Pues aprieta el párrafo, no la página.
::panel{art=strip-book}
sfx: FLAP
:::

## Sentido de lectura y traducción

Un cómic occidental se lee de izquierda a derecha; un manga y un cómic árabe, de derecha a izquierda. Postext toma el sentido del idioma de la edición: una edición árabe o japonesa dispone desde la derecha las viñetas de cada fila, refleja las esquinas y las inclinaciones y encuaderna el libro por la derecha, mientras las imágenes se quedan como se dibujaron. Los bocadillos japoneses se rotulan en columnas verticales, con la puntuación girada para la columna.

Una traducción es el mismo Markdown con otras palabras. Las imágenes, los recortes y las marcas se comparten; cada edición mide su propio texto y coloca sus propios bocadillos. El español ocupa alrededor de una quinta parte más que el inglés y el chino mucho menos, y los bocadillos cambian de tamaño con el texto sin que nadie los mueva a mano.

## Páginas, pliegos y tiras

Un cómic puede llenar una página, ocupar dos páginas enfrentadas para una panorámica o ir dentro del texto como una **tira**, del ancho de una columna o de la página, como la tira diaria de un periódico. Una tira se comporta como una figura: puede numerarse y llevar pie, citarse con \`:ref\` y flotar hasta la cabeza o el pie de una página. Las recetas de periódico del Recetario componen así sus tiras, entre los artículos.

## La música como texto

:index{term="notación musical"}Una partitura se escribe en el capítulo como un bloque delimitado de notación, igual que el código en un libro técnico. Postext lee cuatro formatos: **ABC**, compacto y fácil de teclear, para melodías y canciones; **MusicXML**, el que exportan los programas de notación que usan los músicos; **MEI**, para ediciones críticas; y **Humdrum**, para corales y análisis. El motor graba la música con Verovio, la biblioteca de grabado de la Music Encoding Initiative, al ancho de la columna.

La melodía de abajo está escrita en cinco líneas de ABC en el Markdown de este capítulo. El motor la graba y la compone como una fórmula destacada, en la rejilla de línea base, y el texto sigue después.

\`\`\`abc {alt="Una melodía breve en sol mayor, en compás de tres por cuatro"}
X:1
M:3/4
L:1/8
K:G
D2 | G2 B2 d2 | c2 A2 F2 | G4 B2 | A4 D2 | G2 B2 d2 | e2 c2 A2 | G6 |]
\`\`\`

Una partitura larga se corta en **sistemas**, las líneas de música que sigue quien lee, y los sistemas pasan de columna en columna y de página en página como las líneas de un párrafo, sin cortar nunca un pentagrama. Un ejemplo musical que el texto cita puede ser también un recurso, numerado y con pie como una figura. El aspecto de la música es un ajuste: el tamaño de los pentagramas, la fuente musical, los números de compás y los márgenes alrededor de una partitura, con estilos con nombre para ejemplos más pequeños dentro de un recuadro.

La música es opcional. El grabador pesa varios megas y solo lo cargan los libros que contienen notación, así que una novela nunca paga por él. Las partituras se dibujan como vectores en el canvas, el HTML y el PDF, se etiquetan como figuras con su texto alternativo en el PDF accesible y pasan al EPUB.

# Ejercicios y cursos {#exercises lead="Un libro de texto le pide a quien lo lee que haga algo: elegir, completar, relacionar, escribir. Postext lee las preguntas y sus respuestas del Markdown, imprime el ejercicio para el alumno y deja que las ediciones en pantalla lo corrijan." summary="Clases de ejercicio, solucionarios, soluciones, ediciones en pantalla y SCORM"}

Los ejercicios de un libro escolar están entre las páginas más tediosas de componer a mano. Cada hueco tiene que ser lo bastante largo para escribir en él sin delatar la respuesta por su longitud, las opciones de una pregunta se rotulan al estilo de la colección, el solucionario del final tiene que coincidir con las preguntas del principio, y la edición del profesor imprime las mismas páginas con las respuestas puestas. Todo eso se deduce de dos cosas: cuál es la pregunta y cuál es su respuesta. Postext no pide nada más.

## Un ejercicio en el Markdown

:index{term="ejercicios"}Un ejercicio es un bloque entre \`:::exercise\` y \`:::\`. Sus primeros párrafos son el enunciado; lo que sigue es la pregunta, escrita en un Markdown que un profesor podría teclear sin manual. Una lista de tareas con las opciones correctas marcadas es una pregunta de opción múltiple. Las palabras entre dobles corchetes son huecos, y las palabras de dentro son las respuestas. Los pares unidos por una flecha forman un ejercicio de relacionar. El motor deduce la clase de ejercicio de lo que encuentra, y un atributo \`type\` la indica cuando el contenido no basta.

Los tres ejercicios que siguen tratan de este libro. Se escribieron en el Markdown de este capítulo, en unas pocas líneas cada uno, y el motor los numeró, rotuló sus opciones, trazó los huecos y compuso los recuadros.

:::exercise{level=1}
¿Cuál de estas cosas decide la configuración, y no el Markdown?

- [ ] Las palabras de un título
- [x] El color de la banda del capítulo
- [ ] Qué figura menciona un párrafo
:::

:::exercise{bank level=2}
Completa las frases con las palabras del recuadro.

1. Una figura flota hasta el primer hueco libre tras su [[mención]].
2. El motor corta un párrafo [[entero]], no línea a línea.
3. Una página compuesta llena los marcos de una [[plantilla]].

::bank[margen | columna]
:::

:::exercise{level=2}
Relaciona cada salida con aquello para lo que sirve.

- PDF/X -> La imprenta
- EPUB -> Un lector electrónico
- SCORM -> Un curso en una plataforma de aprendizaje
:::

## Doce clases

Postext conoce doce clases de ejercicio, suficientes para casi todo lo que imprime un libro de texto: opción múltiple y verdadero o falso; huecos, con o sin banco de palabras, y opciones dentro de la línea; relacionar, clasificar en grupos, ordenar elementos o las palabras de una frase; marcar palabras en un texto; preguntas abiertas con renglones o con un espacio pautado para escribir; sopas de letras y crucigramas, cuyas cuadrículas construye el motor a partir de la lista de palabras; y operaciones en columna, para la aritmética. Los elementos se barajan cuando la clase lo requiere, siempre de la misma manera, para que el PDF, la pantalla y el solucionario coincidan.

Un nivel de dificultad se imprime como puntos tras el número, unos iconos de actividad pueden señalar los ejercicios que se hacen en pareja o en voz alta, y el primer elemento puede imprimirse resuelto como modelo. Cómo se ve cada una de estas cosas lo decide un **estilo de ejercicio**: la insignia del número, las etiquetas de las opciones, el aspecto de un hueco, la pauta de un espacio de escritura y el recuadro que rodea el ejercicio, tomado de los estilos de recuadro del libro.

## Respuestas y soluciones

Todo ejercicio que se puede corregir tiene un **solucionario** construido a partir de sus respuestas: la opción correcta, los huecos en orden, los pares. Un bloque \`:::solution\` dentro de un ejercicio añade una solución desarrollada en cualquier Markdown. Dónde se imprimen es un ajuste de todo el libro: en ninguna parte, justo después de cada ejercicio, del revés debajo de él como en los libros de pasatiempos, al final del capítulo, en un punto del capítulo que las pida o en un capítulo de soluciones al final del libro. Esta guía reserva sus respuestas para la pantalla.

Una **edición del profesor** es el mismo libro con un ajuste cambiado: cada respuesta impresa en su sitio, en el color del bolígrafo de corregir, con los huecos llenos, las opciones rodeadas y las líneas de relacionar trazadas.

## En pantalla

En la vista HTML y en un EPUB, los ejercicios se pueden responder. Quien lee escribe en los huecos, marca opciones y traza las líneas de relacionar, y después comprueba las respuestas, pide una pista, ve la solución o vuelve a empezar. Los aciertos y los errores se marcan con un color y un signo y se anuncian a los lectores de pantalla, y las respuestas se guardan en el navegador, de modo que quien lee las vuelve a encontrar en la visita siguiente.

:::callout{type="try"}
Abre la vista HTML en este capítulo y responde a los tres ejercicios. Compruébalos y pasa después a la vista PDF: los mismos ejercicios, compuestos para el lápiz del alumno.
:::

## Cursos

:index{term="SCORM"}Un libro con ejercicios puede convertirse en un curso. La vista **SCORM** del Sandbox empaqueta los capítulos y las secciones que elijas en un paquete SCORM, el formato que leen plataformas de aprendizaje como Moodle. Cada parte del libro que sigue la plataforma informa de su nota, a partir de los ejercicios bien respondidos; de si está completa, con todas las páginas vistas y todos los ejercicios comprobados; y de si está aprobada, frente a una nota mínima que fija el libro. Una prueba puede limitar cuántas veces se comprueba un ejercicio, cuántas veces se reinicia y cuándo aparece su solución.

El paquete lleva el libro tal como lo muestra la vista HTML, maquetado por el mismo motor, así que el curso se parece al libro impreso que el alumnado tiene sobre la mesa.

:::part{number="IV" title="La práctica" palette="band=#c0452f"}
12. Escribir para Postext
13. El Sandbox
14. Salida: canvas, HTML, PDF y EPUB
15. Pruebas e imprenta
16. El libro en 3D
17. Herramientas en torno al motor
18. Hoja de ruta y comunidad
:::

# Escribir para Postext {lead="Todo este libro se ha escrito en Markdown corriente con un puñado de extensiones. Se leen bien en cualquier editor de texto y dicen qué es el texto, nunca dónde va." summary="Markdown, directivas, recuadros y estilos de párrafo"}

Los documentos de Postext son, ante todo, Markdown.:index{term="Markdown"} Quien sabe Markdown puede escribir para Postext desde el primer día; las extensiones solo aparecen donde un libro necesita algo para lo que Markdown nunca tuvo palabras.

## Markdown corriente

Títulos de una a seis almohadillas, párrafos, citas en bloque, listas con viñetas, numeradas y de tareas —anidadas con dos espacios por nivel, hasta cinco niveles— y matemáticas destacadas entre dobles signos de dólar. En línea, la negrita y la cursiva de siempre, más superíndices entre acentos circunflejos, como en 10^-8^, subíndices entre virgulillas, como en H~2~O, matemáticas en línea entre signos de dólar y barras invertidas para escribir caracteres literales.

Conviene conocer algunos detalles. Las líneas consecutivas de un párrafo se unen, así que los saltos de línea del original nunca llegan a la página; un párrafo nuevo necesita una línea en blanco. Las listas toleran una sola línea en blanco entre elementos, pero dos líneas en blanco las terminan. Las listas ordenadas conservan el número con el que empiezan, de modo que una lista puede empezar en 0 o en 5. Y un título puede forzar un salto de línea en su texto con dos barras invertidas, lo que solo afecta a los diseños que imprimen el título en grande —aperturas y portadillas de parte—, mientras que las cabeceras, el índice y los marcadores del PDF lo mantienen en una sola línea.

Parte de Markdown se deja fuera a propósito, porque un libro tiene otras formas de decirlo: las imágenes son recursos y no dibujos en línea, las tablas son recursos con un modelo y no tablas de barras, y el HTML en bruto no significa nada en una página impresa. Los enlaces funcionan en la vista HTML y en el PDF, y el código en línea entre comillas invertidas se compone con la letra de código del libro, como la sintaxis que cita este libro.

## Resaltados, versalitas y tabuladores

Otras tres marcas cambian el aspecto de las palabras sin sacarlas de la línea. \`:mark[…]\` tiende una banda de color detrás de una frase, :mark[como subraya un libro de texto lo que importa], y las palabras que cubre se siguen cortando, dividiendo y justificando como las de alrededor, así que marcar un libro terminado no mueve ninguna de sus páginas. \`:smallcaps[…]\` compone las minúsculas como versalitas, como el nombre de :smallcaps[Hamlet] en el reparto de una obra o una sigla como :smallcaps[unesco], tomadas de las mayúsculas de la propia fuente y dibujadas igual en todas las salidas. Y \`:tab\` lleva el resto de una línea hasta un tope que fija la configuración: un precio al final de la medida tras una fila de puntos, o la puntuación de una pregunta de examen en el margen.

## Directivas y contenedores

Todo lo demás se expresa con un pequeño vocabulario de directivas, recogido en :ref{id="document-format"}. Las directivas de una línea empiezan con tres dos puntos y actúan en el punto donde aparecen. Los contenedores envuelven bloques entre una línea de apertura con atributos y una línea de cierre con tres dos puntos; se pueden anidar, y uno sin cerrar se cierra al final del capítulo, con un aviso.

Los valores de los atributos pueden ir entre comillas dobles o simples, o sin comillas cuando son una sola palabra, y una clave sin valor es un indicador. Una directiva que el motor no conoce no se descarta en silencio: se imprime como un párrafo, para que nada desaparezca, y el panel Revisión la señala con su capítulo y su línea. Lo mismo ocurre con un estilo de recuadro o un estilo de párrafo que la configuración no define. Los recuadros, las notas al pie y el índice analítico también se escriben con directivas, y tienen un capítulo propio, :ref{id="boxes"}.

## Mencionar recursos

Las referencias merecen una mirada más atenta, porque con ellas se escribe la mayor parte del aparato de un libro. \`:ref{id="…"}\` imprime por defecto la etiqueta abreviada y el número —_Fig. 5.1_ en la edición española de este libro— e incorpora el recurso la primera vez que aparece. Un atributo \`style\` imprime solo el número o la etiqueta completa, _Figura 5.1_; \`case\` pasa la etiqueta a minúsculas, a mayúsculas o a mayúscula inicial, para que una referencia a principio de frase se lea bien; y \`text\` imprime cualquier texto sin dejar de incorporar y enlazar el recurso. Una referencia a un identificador que no existe imprime un signo de interrogación y un aviso, de modo que las referencias rotas se encuentran antes de que el libro vaya a imprenta.

\`::resource{id="…"}\`, en una línea propia, inserta un recurso en ese punto exacto cuando su colocación dice _here_; en otro caso, cuenta simplemente como una mención. Este libro no lo usa en ninguna parte y deja flotar todas las figuras, que suele ser la mejor elección.

## Referencias cruzadas y citas

:index{term="citas bibliográficas"}El mismo \`:ref\` nombra cualquier lugar del libro:index{term="referencias cruzadas"} que lleve un identificador: un título escrito \`## Método {#metodo}\`, un recuadro abierto con \`{#id}\` o una frase marcada \`[estas palabras]{#clave}\`. Imprime _sección 3.2_ o _capítulo 4_, el título con \`style=title\` o la página con \`style=page\`, y la página es la correcta porque el motor vuelve a componer el libro hasta que no cambia. Cada una de estas referencias es un enlace en el PDF, en el HTML y en estas vistas previas.

Las obras se citan como las escribe Pandoc, \`[@garcia2020, pág. 33]\` o \`@garcia2020\` dentro de la frase, con las referencias en el front matter o en un bloque \`:::references\` de BibTeX. El estilo de cita es un ajuste, no una propiedad del texto: APA, Chicago, MLA, IEEE, Vancouver, ISO 690, GB/T 7714 o un estilo propio, que se elige en Diseño › Citas, donde una vista previa muestra el resultado. La bibliografía va tras el último capítulo, o allí donde se escriba \`:::bibliography\`.

## Matemáticas en el original

Las matemáticas se escriben en notación LaTeX. Las fórmulas en línea van entre signos de dólar sencillos, en mitad de una frase; las fórmulas destacadas van entre dobles signos de dólar, en una línea propia o como un bloque de varias líneas. Un signo de dólar que deba imprimirse como tal se escapa con una barra invertida. Una fórmula que nunca se cierra, o que MathJax no puede leer, se señala en el panel Revisión y se sustituye en la página por un marcador rojo, para que no pueda colarse sin que nadie lo note en el PDF.

## Código

Un fragmento de código más largo es un **listado**, escrito entre dos líneas de tres comillas invertidas. Todo lo que va dentro se conserva tal como se escribió, espacios y líneas en blanco incluidos, y nada se lee como Markdown. La palabra que sigue a las comillas de apertura nombra el lenguaje, y el motor colorea las palabras clave, las cadenas, los números y los comentarios de una docena de ellos; los atributos añaden un título, números de línea y un fondo detrás de las líneas que importan:

\`\`\`js {title="chapter.js" lineNumbers highlight="4"}
import { buildDocument } from 'postext';
import { renderToPdf } from 'postext-pdf';

const doc = buildDocument(markdown, config);
const pdf = await renderToPdf(doc, { fontProvider });
\`\`\`

Una línea más ancha que su columna sigue en la línea siguiente bajo una pequeña marca, o el listado entero se compone algo más pequeño, o la línea se corta en el borde, según diga el estilo del código, en Diseño › Tipografía › Código. Un listado largo se parte entre líneas como un recuadro, sin dejar nunca menos de dos líneas a cada lado, y un bloque de código también puede ocupar el ancho de la página o flotar hasta la cabeza o el pie de una columna.

## Estilos de párrafo

\`:::paragraphs{style="…"}\` aplica un estilo de párrafo con nombre a los párrafos que envuelve: un epígrafe, una dedicatoria, una bibliografía, un colofón. Un estilo puede cambiar el tipo de letra, el cuerpo, el interlineado, el color, la alineación —también centrada y a la derecha—, la sangría y el espaciado. La firma que cierra el último capítulo de este libro es uno. Un estilo también puede abrir su primer párrafo con una **capitular**, una inicial que ocupa dos o tres líneas, y el atributo \`dropcap\` de un título la activa o la desactiva en el párrafo que lo sigue.

## Escribir bien para el motor

Unas cuantas costumbres facilitan el trabajo del motor y mejoran las páginas. Introduce cada lista con una frase, para que la lista nunca sea lo primero bajo un título; el panel Revisión puede señalar las que lo son. Mantén los títulos en orden, sin saltarte niveles. Menciona cada figura y cada tabla en el texto, cerca de donde la quieres: la mención decide adónde puede ir el recurso y qué número recibe. Deja la colocación a la configuración salvo que un recurso necesite de verdad una posición propia. Marca los términos del índice donde el texto los trata, no en cualquier sitio donde se nombran. Y escribe un texto alternativo para cada figura, porque el PDF accesible se lo ofrece a los lectores que no pueden ver la imagen.

## Metadatos

Los metadatos de un libro van en un bloque YAML al principio de su primer capítulo: título, subtítulo, autor y fecha de publicación, disponibles como marcadores en todos los diseños. La cubierta de este libro imprime de ahí su título y su subtítulo. Cualquier otra clave se guarda para la aplicación que aloja el motor; los metadatos de los capítulos posteriores se ignoran, con un aviso.

# El Sandbox {lead="El Sandbox es el motor con un editor alrededor: la página que estás leyendo, el Markdown del que sale y cada ajuste que le ha dado forma, uno junto a otro y en vivo." summary="El editor, los paneles, proyectos, presets y compartir"}

Todo lo que cuenta este libro puede probarse ahora mismo, sin escribir código. El Sandbox no es una demo construida sobre Postext: es el propio motor, en una interfaz pensada para dos públicos a la vez, quienes desarrollan y evalúan la biblioteca y quienes diseñan y quieren ver qué hace cada opción.

## Un recorrido por la interfaz

:index{term="Sandbox"}La interfaz sigue la disposición de un editor conocido, esbozada en :ref{id="sandbox-ui"}. Una **barra de actividad** a la izquierda cambia entre siete paneles —Libros, Capítulos, Texto, Recursos, Fuentes, Diseño y Revisión, este último con el número de asuntos pendientes—. Una **barra lateral** redimensionable aloja el panel activo; al hacer clic en el icono activo se pliega. El **visor**, a la derecha, muestra la misma maquetación en seis pestañas: Canvas, PDF, Folio, HTML, EPUB 3 y SCORM. La interfaz está en español, inglés, catalán, francés, alemán, italiano, portugués de Brasil, chino simplificado, japonés y árabe, y en árabe se dispone de derecha a izquierda; un ajuste de botones y campos grandes hace que cada control sea más fácil de alcanzar con el dedo o con un pulso poco firme.

La barra lateral y el visor comparten la ventana, y la frontera entre ambos se puede arrastrar. Cada panel y el visor recuerdan su estado entre visitas: la ampliación y el modo de vista del canvas, el modo de columnas de la vista HTML, los grupos abiertos en el panel Diseño. El tema y el idioma de la interfaz se cambian desde el pie de la barra de actividad, y el idioma de la interfaz es independiente del idioma del libro. Ninguna de estas preferencias viaja con el libro cuando se exporta: se quedan en el navegador en el que se eligieron.

## Editar un libro

El editor del panel **Texto** resalta los metadatos y las matemáticas, y su barra de herramientas inserta formato, listas, saltos de página y cambios de numeración. En su cabecera, un **selector de capítulos** recorre los capítulos del libro y muestra sus páginas; cada capítulo conserva su propio historial de deshacer y su cursor. Editor y páginas se siguen en los dos sentidos: hacer clic en una palabra de la página lleva el cursor a ella en el Markdown, y seleccionar texto lo resalta en la página. El panel **Capítulos** muestra el libro abierto de una vez, con sus capítulos en orden y las páginas de cada uno.

La barra que hay sobre la vista previa cambia entre dos maneras de trabajar. En el modo **Contenido** se edita el texto, en el panel Texto y sobre las páginas; en el modo **Diseño**, los estilos y las plantillas de página, y un clic en la página elige el estilo o el marco que ha dibujado lo que queda bajo el puntero. Un segundo clic en el mismo sitio sube un nivel, de una palabra a su párrafo, su recuadro y su página, y :chip[⌘ Z] deshace el último cambio de cualquiera de los dos tipos, una palabra escrita o un ajuste movido, desde un único historial.

El editor vigila además el libro entero. Su menú de capítulos lista cada capítulo con las páginas que ocupa en cuanto se conocen, y pasar a otro capítulo cambia las vistas previas a él. Los capítulos se pueden crear, renombrar, reordenar, dividir por sus títulos de primer nivel o fusionar con el anterior, y el capítulo entero se puede exportar como archivo Markdown o sustituir por uno. Un libro de ciento veinte capítulos funciona como uno corto: el menú los lista bajo sus partes y, a partir de treinta, se abre con un campo de búsqueda que encuentra un capítulo por su número o por una palabra de su título.

## Configuración

El panel **Diseño** edita la configuración completa —más de quinientos campos— por grupos: página y columnas, escritura, colores, tipografía, títulos e índice, listas, figuras y tablas, recuadros, ejercicios, cómic, cabeceras y pies, partes, exportación, Folio (el libro en 3D) y ajustes avanzados. Un buscador encuentra cualquier opción por su nombre, y el filtro **Cambiados** muestra lo que difiere de los valores por defecto. Cada campo y cada sección se pueden restablecer por separado, y la configuración se puede exportar e importar como archivo. En un libro con varios idiomas, un selector en la cabecera del panel elige entre los ajustes que comparten todas las ediciones y los de la edición que está en pantalla, como explica :ref{id="languages"}.

## Las seis vistas

La vista **canvas** es la vista previa de trabajo: amplía desde un cuarto del tamaño real hasta cuatro veces, ajusta la página al ancho o al alto del visor y muestra páginas sueltas o pliegos, con la primera página sola como página impar, tal como se abre un libro impreso. La vista **PDF** genera un PDF real en el navegador y lo muestra en el visor del propio navegador, con botones para generarlo de nuevo, descargarlo e imprimirlo. La vista **Folio** muestra el libro encuadernado y abierto sobre una mesa, en tres dimensiones, con hojas que se pasan con la mano; tiene un capítulo propio, _El libro en 3D_. La vista **HTML** muestra la misma maquetación como HTML posicionado, aislado del resto de la página, con un control del tamaño del texto y dos modos de lectura: una columna que se desplaza o tantas columnas como quepan en la pantalla. La vista **EPUB 3** genera en el navegador un libro electrónico con una de dos maquetaciones: la **fija** conserva las páginas impresas línea a línea, con texto real que se puede seleccionar y buscar; la **fluida** deja que el texto se adapte a la pantalla y al tamaño de letra de quien lee. Un pequeño lector dentro de la pestaña muestra el mismo archivo que vas a descargar: las flechas del teclado, un deslizamiento en el móvil o los botones pasan sus páginas, una lista salta a cualquier capítulo y un libro fluido puede leerse con la letra más grande o más pequeña. La vista **SCORM** convierte en un curso para una plataforma de aprendizaje como Moodle los capítulos y secciones que marques en un árbol del libro, con páginas fijas o con texto fluido; sus ejercicios envían las notas a la plataforma.

Las vistas canvas, HTML y Folio pueden maquetar el capítulo actual o el libro completo; el PDF tiene su propia elección, de modo que se puede corregir rápidamente un solo capítulo mientras las vistas previas muestran el libro; el EPUB y el paquete SCORM se maquetan siempre a partir del libro completo. Esta guía se abre en el modo de libro completo. Un libro compuesto en vertical, como la edición china de esta guía, se lee en la vista HTML solo página a página, porque en una única columna que se desplaza sus líneas quedarían tumbadas.

## En el móvil

Por debajo del ancho de una tableta, el Sandbox se reorganiza. La barra de paneles pasa al pie de la pantalla, un panel abierto cubre la vista previa en lugar de quedarse a su lado, y al cerrarlo la vista previa sigue en la página que mostraba. Las barras de herramientas de las vistas previas se colocan a lo largo del borde inferior, donde llega el pulgar, y pasan a una segunda fila cuando la pantalla es estrecha. Un móvil no puede mostrar un PDF dentro de una página, así que la vista PDF ofrece abrir el archivo; y como un móvil da a una pestaña del navegador menos memoria de la que necesita un libro en tres dimensiones, allí no aparece la vista Folio.

## Recursos y fuentes

El panel **Recursos** lista los recursos del libro por tipo. Las imágenes y los archivos SVG se pueden arrastrar, las tablas se editan en un editor tipo hoja de cálculo con celdas fusionadas, rellenos, imágenes, anchos de columna y pegado desde una hoja de cálculo, y el texto de un diagrama SVG se puede editar en su sitio. Al hacer clic en un pie, una nota, una celda o el texto de un diagrama de la vista previa, se abre en el panel. El panel de Fuentes añade familias propias, peso a peso, en los formatos web y de escritorio habituales; una familia propia tiene prioridad sobre una fuente de Google con el mismo nombre.

Cada recurso tiene una vista de detalle con su identificador, su tipo, su pie, su nota y su texto alternativo, su colocación —posición, ancho de columna, giro, ancho, alineación y un pie al lado— y una vista previa en vivo. Borrar un recurso avisa cuando el texto aún lo menciona. El panel Fuentes, por su parte, comprueba que cada familia que nombra la configuración tenga los pesos y estilos que necesita, y avisa de las variantes que faltan o están duplicadas.

## Avisos

El panel **Revisión** lista todo lo que el motor ha notado al componer el libro: fuentes que no han cargado, líneas holgadas, niveles de título que se saltan, contenedores sin cerrar y directivas desconocidas, estilos que no existen, marcadores que no imprimen nada, recursos que faltan y recuadros demasiado altos para su columna. Cada aviso indica su capítulo y su línea, y al hacer clic lleva hasta ellos.

## Proyectos, presets y compartir

Tu trabajo se guarda en el navegador mientras escribes. Los **proyectos** son libros guardados localmente, en **Mis libros** dentro del panel **Libros**, cada uno con su nombre, su descripción y su imagen de cubierta; se pueden duplicar, exportar e importar. Los **presets** son libros de solo lectura desde los que empezar, en **Libros de ejemplo**: esta guía y una galería de ediciones de muestra —una revista de astronomía, un _Quijote_ ilustrado, una revista de medio ambiente, un catálogo de exposición, dos manuales universitarios, _Sueño en el pabellón rojo_ en chino, _Las mil y una noches_ en árabe, encuadernado a la derecha, y un _Paraíso perdido_ anotado con los grabados de Doré—, cada una con un diseño propio. **Hacer una copia propia** convierte uno en un proyecto tuyo.

Los presets siguen a su origen. Cuando un paquete de preset cambia en el servidor, el Sandbox lo nota en cuestión de segundos: un preset sin tocar se recarga solo, y uno que has editado muestra un aviso que ofrece recargarlo, de modo que el trabajo en curso nunca se sobrescribe. Los presets se pueden ocultar de la lista y volver a mostrar, y cada uno se puede abrir en cualquiera de sus idiomas cuando tiene más de uno, como esta guía, que está en español, inglés, catalán, francés, alemán, italiano, portugués de Brasil, chino simplificado, árabe y japonés.

Un libro viaja como un único archivo **.postext**: sus capítulos, su configuración, sus recursos y sus fuentes, además de la paginación ya calculada, de modo que se abre paginado. Las recetas del Recetario se abren en el Sandbox de la misma manera, como libros tuyos; una receta que ya abriste antes pregunta si quieres **Abrir mi copia**, con tus cambios, o **Sustituir por la versión publicada**, que puede haberse corregido desde entonces. Y la barra de direcciones contiene siempre un enlace permanente a lo que estás viendo: el libro, el idioma, el visor, el capítulo y la página.

:::callout{type="try"}
Ve hasta una página que te guste y copia la dirección del navegador: al abrir ese enlace verás el mismo libro, en el mismo visor, en la misma página.
:::

## Incrustar el Sandbox

El Sandbox es a su vez un paquete, _postext-sandbox_, un componente de React que cualquier aplicación web puede incrustar. Quien lo aloja decide el Markdown y la configuración iniciales, el idioma de la interfaz y cada etiqueta, los orígenes de los presets que ofrece, y el selector de tema, el selector de idioma y el enlace de inicio que muestra. Las etiquetas que el anfitrión deja sin traducir conservan su texto original, en inglés. Todo lo que el lector guarda se queda en su navegador, en el almacenamiento de ese sitio: el componente no necesita un servidor propio. Y la maquetación corre en un _worker_, de modo que la página que lo aloja sigue respondiendo mientras el libro se compone. El Sandbox que estás usando es exactamente ese componente, incrustado en el sitio web de Postext.

# Salida: canvas, HTML, PDF y EPUB {#output lead="Un árbol, cuatro salidas. El canvas previsualiza, el HTML se lee en pantalla, el PDF va a imprenta y el EPUB va al dispositivo de quien lee, y todas se escriben a partir de la misma maquetación." summary="Los renderizadores, el PDF accesible, los libros EPUB y el uso de la biblioteca"}

Como todos los renderizadores leen el mismo VDT, la promesa de _lo que ves es lo que obtienes_ es literal: los cortes de línea, los límites de página y la posición de cada figura coinciden en el canvas, el HTML y el PDF, y un EPUB de maquetación fija los conserva también. El skill de agente que pasa libros existentes a Postext revisa su trabajo con estas salidas, como muestra :ref{id="skill-tutorial"}.

## Canvas

El renderizador de canvas dibuja una página en un canvas HTML, a cualquier resolución. En el Sandbox es la vista previa viva, con ampliación, ajuste al ancho o al alto, páginas sueltas o pliegos, y páginas que se dibujan según entran en pantalla.

## HTML

El renderizador HTML devuelve HTML con posicionamiento absoluto y CSS editorial: cada línea donde la puso la maquetación, con su fuente, su cuerpo y su línea base exactos. En el Sandbox, la pestaña HTML aísla la salida en un Shadow DOM y añade un modo de lectura con una sola columna que se desplaza o con tantas columnas como quepan en la pantalla, con un control de tamaño de letra. Un conjunto de ajustes solo para pantalla puede adaptar el diseño a la lectura en pantalla sin tocar las páginas impresas.

El renderizador recibe una función que convierte el identificador de archivo de un recurso en una URL, para que las imágenes puedan servirse desde cualquier sitio, y un color de fondo para la página. Su salida es marcado y CSS sin más, sin ningún script, lo que la hace adecuada para alojamiento estático.

## PDF

:index{term="PDF"}El paquete _postext-pdf_ convierte el VDT en un PDF real, de un documento o de un libro entero. Nunca vuelve a medir: las métricas del canvas son la referencia y el PDF solo las transporta, por eso las líneas se cortan exactamente en los mismos sitios. Incrusta fuentes reales, una estática por peso, así que la negrita es negrita, la cursiva es cursiva y el texto se puede seleccionar. Sobre las páginas añade marcadores a partir de los títulos y las partes, etiquetas de página que coinciden con los folios impresos, referencias pulsables y figuras SVG como vectores.

Las fuentes llegan al PDF a través de un **proveedor de fuentes**, una función que devuelve los bytes de una familia en un peso y un estilo dados. El proveedor del Sandbox descarga caras estáticas de Fontsource, un archivo por peso, y las descomprime desde WOFF2; las fuentes propias vienen del panel Fuentes. El renderizado informa de su progreso, se ejecuta en un worker propio cuando se le pide y acepta un libro entero como una lista de documentos de capítulo, del que produce un único PDF con etiquetas de página continuas, marcadores y enlaces.

## Accesible por defecto

:index{term="PDF!accesible (PDF/UA)"}Todo PDF sale **etiquetado** por defecto, según la norma PDF/UA-1: un árbol de estructura con títulos, párrafos, listas, tablas y figuras en orden de lectura, texto alternativo para cada figura, el idioma del documento y los elementos decorativos marcados como artefactos para que los lectores de pantalla los salten.

El etiquetado sigue a la maquetación y no al original. Los párrafos partidos entre columnas y páginas se etiquetan como un solo párrafo, las listas mantienen juntos sus elementos, las tablas conservan sus celdas de cabecera y las figuras llevan su texto alternativo —o su pie, o su etiqueta, cuando no se ha escrito texto alternativo—. El título y el idioma del documento viajan en sus metadatos, y las referencias entre el texto y las figuras que menciona son enlaces reales.

## Color para imprenta

Los colores de la configuración se escriben como valores hexadecimales, opcionalmente enlazados a la paleta, y eso es lo que dibuja el PDF por defecto. Un PDF también puede forzarse a CMYK para la impresión offset o a escala de grises para trabajos a una tinta, y un libro preparado para imprenta va más allá: un perfil ICC, PDF/X, un negro que se imprime con una sola tinta y una comprobación previa de cada página. De todo ello trata :ref{id="press"}.

## Libros enteros

El renderizador recibe la maquetación de cada capítulo y escribe un único documento: las etiquetas de página continúan de un capítulo a otro, los marcadores forman un solo árbol con las partes por encima de sus capítulos, y la estructura accesible del libro entero es un único árbol en orden de lectura.

## Las fuentes en el PDF

Postext incrusta cada tipo que ha usado la maquetación —un archivo estático por peso y estilo—, de modo que una palabra en negrita se compone con la negrita real y una cursiva con la cursiva real, nunca con una imitación inclinada o engrosada. Los tipos TrueType se reducen a los glifos que el libro usa de verdad; los tipos OpenType con contornos PostScript se incrustan enteros, porque algunos visores no saben leer sus subconjuntos. Cada fuente incrustada lleva un mapa de los glifos a los caracteres, ligaduras incluidas, de modo que al copiar una frase del PDF se obtiene la frase que se escribió.

Una familia disponible solo en WOFF no se admite en el PDF, porque ese formato no se puede incrustar con garantías; WOFF2, TrueType y OpenType funcionan.

## EPUB 3

:index{term="EPUB"}El paquete _postext-epub_ escribe un libro maquetado como archivo EPUB 3, el formato de las tiendas de libros electrónicos, las bibliotecas y las aplicaciones de lectura. Lee los mismos documentos de capítulo que el PDF de un libro entero, así que los folios, las notas, las citas, las referencias cruzadas, el índice general y el analítico llegan resueltos, y devuelve el archivo como bytes, en el navegador o en Node, sin servidor. EPUB define dos maquetaciones, comparadas en :ref{id="epub-renditions"}.

La **maquetación fija** conserva la página impresa. Cada página se convierte en un documento propio, del tamaño de la página, con el texto donde lo pone el PDF y en las fuentes del libro, de modo que se mantienen las columnas, los flotantes, las cabeceras, las aperturas y todos los cortes de línea. El texto sigue siendo texto: se puede seleccionar, buscar y leer en voz alta, y los enlaces del libro funcionan entre páginas. Los pliegos se emparejan como en papel, y un libro encuadernado a la derecha, en árabe o en chino vertical, se pasa de derecha a izquierda. Conviene a los libros cuyas páginas están diseñadas como páginas —un libro ilustrado, un manual, un catálogo, una revista— leídos en una pantalla grande.

## Libros fluidos

La **maquetación fluida** renuncia a la página y conserva el texto. Cada capítulo se convierte en un documento que el sistema de lectura compone de nuevo para su pantalla, con el tipo de letra, el tamaño y los márgenes que elige quien lee. El generador no vuelve al Markdown: reconstruye cada párrafo a partir de las líneas que compuso el motor, quita los guiones que añadieron los cortes de línea y conserva los que pertenecen a la palabra. Las figuras y las tablas siguen al texto que las cita, con sus pies numerados y su texto alternativo; las tablas siguen siendo tablas de verdad, con filas de encabezado y celdas combinadas; los recuadros se convierten en apartes con su título, y las notas enlazan con el final del capítulo y vuelven. Cada página impresa deja una marca donde empieza su texto, de modo que se puede encontrar la página 112 de la edición impresa, y el índice analítico apunta a esas marcas.

El aspecto sale de la configuración. Una hoja de estilos derivada de ella da a los títulos, los recuadros, las tablas, los pies y las listas sus tamaños y sus colores, relativos al cuerpo del texto, para que el tamaño que elige quien lee se aplique a todo. Los párrafos compuestos con un estilo de párrafo lo conservan.

Las dos maquetaciones llevan la misma navegación: una tabla de contenidos a partir de los títulos y las partes, una lista de los folios impresos y puntos de referencia para la cubierta, el índice impreso y el comienzo del texto. Se incrustan todas las familias que nombra el diseño, salvo las marcadas como no redistribuibles. Las dos llevan los metadatos de EPUB Accessibility 1.1 y las dos pasan EPUBCheck, el validador del W3C, sin errores ni avisos. En el Sandbox, la pestaña **EPUB 3** escribe el archivo en un worker.

## Usar la biblioteca

El motor se distribuye en npm como _postext_, para la maquetación y los renderizadores de canvas y HTML, con un paquete para cada salida más pesada: _postext-pdf_ para el PDF, _postext-epub_ para el EPUB 3 y _postext-folio_ para el libro en 3D. Todos son módulos ES con licencia MIT y también se pueden importar directamente desde una CDN.

El motor de maquetación se ejecuta en el navegador, donde puede medir con las fuentes que ve el lector; _postext-pdf_ y _postext-epub_ también se ejecutan en el navegador, y además en Node. Un libro entero viaja igual: \`openBundle\` lee un archivo .postext, \`buildBundle\` maqueta sus capítulos en orden y el resultado pasa directamente a \`renderToPdf\` o a \`renderToEpub\`. Los paquetes son solo módulos ES, con los tipos de TypeScript incluidos, y algunos empaquetadores necesitan un ajuste de una línea para el descompresor WOFF2 que usa el paquete de PDF.

:::callout{type="note" title="Cuatro pasos" placement="top"}
1. Carga las fuentes que nombra la configuración, para que el navegador pueda medirlas
2. Compila el documento con \`buildDocument(content, config)\`
3. Dibuja sus páginas con \`renderPage\` o genéralas con \`renderToHtml\`
4. Para imprenta, pasa el mismo documento a \`renderToPdf\` con un proveedor de fuentes; para un libro electrónico, pasa los capítulos a \`renderToEpub\`
:::

## Páginas como imágenes, desde un script

Una página no necesita un navegador para convertirse en imagen. El renderizador de canvas dibuja en cualquier canvas que hable la interfaz de dibujo del navegador, y en Node lo hace un canvas precompilado: se maqueta el libro, se dibuja la página y se codifica como JPEG o PNG. Así revisa su propio trabajo el skill de agente que adapta libros existentes a Postext. Tras cada cambio en la configuración o en el texto vuelve a maquetar el libro, dibuja solo las páginas en las que está trabajando y las lee como imágenes. El PDF se genera al final, para las comprobaciones que solo un PDF puede responder: las fuentes incrustadas, las imágenes a su resolución, la estructura etiquetada.

En :ref{id="skill-tutorial"} se ve el skill de principio a fin: recibe el PDF de referencia, las fuentes y las ilustraciones originales, propone una ficha de especificaciones, compone el primer capítulo y revisa cada página que compone.

# Pruebas e imprenta {#press lead="Una imprenta hace preguntas distintas de las de un lector. ¿Tiene cada imagen nitidez suficiente a su tamaño impreso, usa una sola tinta el negro del texto, pasa la ilustración más allá del corte? Postext las responde antes de que el archivo salga del navegador." summary="Revisión, contraste, color ICC, PDF/X, el negro y el preflight"}

Un libro se termina dos veces. Está terminado para el lector cuando el texto es correcto y las páginas se ven como deben; está terminado para la imprenta cuando el archivo cumple las reglas de la máquina que lo va a imprimir. Postext guarda las dos listas en el mismo sitio.

## El panel Revisión

:index{term="panel Revisión"}Todo lo que nota el motor se reúne en el panel **Revisión**, ordenado como lo atendería un editor de producción: primero las fuentes, después las figuras y las tablas, el texto y el marcado, el diseño, el contraste, la composición, el preflight y el navegador. Cada entrada indica su capítulo y su línea, y un clic lleva hasta ella. Qué comprobaciones se hacen es un ajuste, en Diseño › Avanzado › Avisos.

Algunas comprobaciones tratan del texto: una línea floja, un nivel de título que se salta, una directiva desconocida, un recuadro demasiado alto para su columna. Otras tratan del diseño y vienen de las **reglas de composición**, descritas en :ref{id="columns"}, que una configuración pone en _allow_, _warn_ o _avoid_. Una regla en _warn_ deja la página como está y añade una entrada; en _avoid_, el motor cambia la página y no se avisa de nada.

## Contraste

:index{term="contraste"}La comprobación de contraste mide cada par de colores de texto y de fondo que usa el libro, incluido el texto de los recuadros, los pies, las cabeceras y los diseños, y señala los pares que quedan por debajo del nivel pedido: AA o el más exigente AAA de las pautas de accesibilidad. En el panel Diseño, cada campo de color muestra su contraste más bajo junto a la muestra.

La impresión añade un problema que una pantalla nunca tiene. Un texto blanco calado sobre una banda oscura se imprime como la ausencia de cuatro tintas superpuestas, y los trazos finos se cierran en cuanto el registro de la máquina se desvía un pelo. La comprobación señala el texto calado demasiado pequeño o demasiado fino para la imprenta.

## Un color que entienda la imprenta

Los colores de una configuración se escriben para la pantalla, y de camino a la imprenta hay que convertirlos a las cuatro tintas de la condición de impresión: un papel, una máquina y una norma concretos. Esa conversión es lo que describe un **perfil ICC**:index{term="perfiles ICC"}, y Postext lleva quince, de FOGRA39 y FOGRA51 para papel estucado en Europa a GRACoL y SWOP para Norteamérica, con FOGRA39 por defecto.

La conversión la hace el propio Postext, en el navegador, con un propósito de conversión, relativo o perceptual, y compensación del punto negro. Las imágenes también se pueden convertir, de modo que una fotografía del PDF ya está en las tintas de la imprenta, y un **límite de tinta** pone tope a la cobertura total de las cuatro tintas donde el papel no llegaría a secarse. Los ajustes de impresión nunca mueven una línea: la maquetación los ignora, y solo actúan en el PDF, en la simulación de impresión y en el preflight.

## PDF/X

Las imprentas piden **PDF/X**:index{term="PDF!PDF/X"} porque elimina las conjeturas. Un archivo PDF/X dice para qué condición de impresión se hizo, incrusta todas las fuentes, lleva sus cajas de corte y de sangrado y deja fuera todo lo que una máquina no puede usar, como los enlaces. Postext escribe las dos versiones que más piden las imprentas. PDF/X-1a es la conservadora: solo cuatro tintas y gris, sin transparencias. PDF/X-4 conserva las transparencias y es hoy la elección habitual. Cualquiera de las dos se elige en Diseño › Exportación › Preparación para imprenta, o con la opción \`--pdfx\` de la línea de comandos.

Un libro para imprimir necesita además **sangrado**:index{term="sangrado"}: las imágenes y las bandas que salen de la página deben pasar unos milímetros del corte, para que una cuchilla un pelo desviada nunca deje un borde blanco. Los ajustes de líneas de corte añaden el sangrado y dibujan marcas de corte en las esquinas.

## El negro

El texto del cuerpo debería imprimirse solo con tinta negra, porque un texto compuesto en cuatro tintas se emborrona en cuanto las planchas se desplazan. Los grises y los negros pueden limitarse a la tinta negra, y el negro sólido puede **sobreimprimirse**, encima de lo que tiene debajo, para que nunca aparezca un fino hilo blanco alrededor de una letra negra sobre una banda de color. Las masas grandes de negro son el caso contrario: una sola tinta se ve lavada, así que un **negro enriquecido** añade:index{term="negro enriquecido"} debajo las otras tres tintas, a partir de un tamaño al que el texto nunca llega.

## Preflight

:index{term="preflight"}Antes de que un archivo vaya a máquina, preimpresión hace un **preflight**: una lectura mecánica de cada página frente a las reglas del trabajo. Postext hace el suyo siempre que un libro está preparado para imprenta, con una norma PDF/X, un PDF en CMYK o marcas de corte, y enumera lo que encuentra en el panel Revisión. Señala las imágenes por debajo de 300 píxeles por pulgada a su tamaño impreso, y como críticas las que bajan de 150; las imágenes que siguen en RGB; los filetes más finos que un cuarto de punto; el texto pequeño en varias tintas; la tinta por encima del límite; el texto demasiado cerca del corte; las ilustraciones que se quedan justo antes del corte, cuando deberían mantenerse lejos de él o entrar en el sangrado.

El mismo preflight funciona fuera del Sandbox. La orden \`check\` de la línea de comandos termina con un código de error cuando encuentra un problema crítico, de modo que una cadena de publicación puede negarse a enviar un archivo que la imprenta devolvería.

:::callout{type="try"}
Abre Diseño › Exportación › Preparación para imprenta, elige PDF/X-4 y activa las marcas de corte. El panel Revisión gana un grupo Preflight, y la vista PDF dibuja ahora el sangrado y las marcas alrededor de cada página.
:::

## Una prueba en pantalla

La **simulación de impresión** muestra:index{term="simulación de impresión"} las páginas tal como las imprimirá la máquina. Cada color se separa con el perfil del trabajo y se vuelve a dibujar sobre el blanco del papel, negros enriquecidos incluidos; un libro en escala de grises se muestra solo en tinta negra. Es un interruptor de la barra de herramientas de la vista Canvas, compartido con la vista Folio.

## El PDF accesible y el impreso

El PDF para la imprenta y el PDF para los lectores pueden ser el mismo archivo. La estructura etiquetada que hace accesible un PDF, descrita en :ref{id="output"}, convive sin conflicto con las reglas de PDF/X; solo se pierden los enlaces, porque una norma de impresión no los admite.

# El libro en 3D {lead="Una maquetación es un conjunto de páginas, pero un libro es un objeto: un papel de cierto gramaje y color, una encuadernación que abre de cierta manera, un grosor que nota la mano. La vista Folio muestra las páginas como ese objeto antes de imprimir nada." summary="La vista Folio, los papeles, las encuadernaciones, las cubiertas y la luz"}

Las pruebas en pantalla son planas. Un pliego visto como dos rectángulos no dice nada de cómo será el libro abierto sobre una mesa: si el lomo se traga el margen interior, si una lámina en papel de brillo recoge la luz, si trescientas páginas de papel ahuesado forman un bloque demasiado grueso para la encuadernación. La vista **Folio** responde a esas preguntas con las páginas que Postext ya ha compuesto. Muestra el libro encuadernado, abierto sobre una superficie, iluminado, con hojas que se curvan y se pasan con la mano.

Nada en ella es una segunda maquetación. Las páginas son las que pinta el canvas, dibujadas a los píxeles exactos de la pantalla, así que el texto en Folio es tan nítido como en la vista Canvas y el mismo línea a línea. Lo que Folio añade es todo lo que rodea a las páginas: el papel, la encuadernación, las cubiertas, la mesa y la luz. Todo sale de una parte de la configuración, \`folio\`, que la maquetación nunca lee. Cambiar el papel o la encuadernación vuelve a dibujar el libro al instante y no mueve ni una línea.

## Pasar las páginas

:index{term="Folio"}Una página se pasa como se pasa una página: se toma por el borde y se arrastra al otro lado. Si se suelta pasada la mitad, cae del otro lado; si se suelta antes, vuelve a su sitio. Un clic en una página también la pasa, hacia delante en la página derecha y hacia atrás en la izquierda, y lo mismo hacen las flechas de la barra de herramientas y, cuando el libro tiene el foco, las teclas de flecha, Re Pág y Av Pág, Inicio y Fin. El campo de página de la barra de herramientas admite un número de página y lleva el libro a ese pliego.

Cada hoja se curva según su papel. El papel biblia, fino, se enrolla en una curva cerrada y deja ver lo impreso en la otra cara; la cartulina gira en un arco amplio; el cartón, como en un libro de cartón para niños pequeños, gira como una plancha rígida sobre su bisagra. Las cubiertas también giran como cartones. Un salto de más de diez páginas no las pasa una a una: el bloque de páginas intermedio se levanta como una sola pieza, tan gruesa como esas páginas, y se posa al otro lado.

La vista también se mueve. Arrastrar con el botón derecho del ratón gira alrededor del libro, hasta un ángulo rasante, para ver el lomo, el corte delantero o el grosor del bloque, y se puede hacer mientras las hojas aún están girando. La vista se queda donde se dejó hasta que **Restablecer la vista** la devuelve al ángulo que fijan los ajustes. En una ventana estrecha el libro muestra una página cada vez, y sigue pasando la hoja por encima del lomo; cuando el sistema pide movimiento reducido, los pliegos cambian sin el giro.

Cuatro botones de la barra de herramientas, o las teclas H, O, S y M, eligen qué hace el puntero sobre el libro: pasar las páginas a mano, orbitar la vista, que es lo que necesita un trackpad o una tableta en lugar del arrastre con el botón derecho, seleccionar texto o sostener una lupa. La selección funciona sobre las páginas tal como se ven, inclinadas o giradas, igual que en la vista canvas: un clic lleva el cursor del editor a esa palabra, un arrastre selecciona, un doble clic toma una palabra y un enlace se sigue. También funciona al revés: el cursor y la selección del editor se dibujan sobre las páginas, y llevar el cursor a una página que no está a la vista pasa el libro hasta ella.

La **lupa** se sostiene sobre el libro donde está el puntero, o un poco por encima del dedo en una pantalla táctil: una lente redonda con un aro negro que muestra la página como la ve el ojo, iluminada y curvada tal como está, con el mayor aumento en el centro. La rueda y las teclas de más y de menos cambian el aumento, de una vez y media a diez, y Esc la guarda. Con ella se lee una nota al pie o el microtexto de una figura sin salir de la vista.

Los vídeos se reproducen en la página. En el modo de pasar páginas, un clic en la portada de un vídeo lo pone en marcha allí mismo, y sigue mientras la hoja gira. Otro clic lo pausa, empezar otro detiene el anterior, y el vídeo se detiene cuando el libro queda abierto por un pliego que ya no lo muestra. Un vídeo configurado para reproducirse por sí solo empieza la primera vez que aparece su pliego. Los de YouTube y Vimeo no se pueden dibujar dentro de la página: un clic en ellos pasa la hoja.

:::callout{type="try"}
Abre la pestaña Folio con esta guía, pasa unas cuantas páginas arrastrando sus esquinas y luego gira el libro arrastrando con el botón derecho para ver su pliegue grapado. Restablecer la vista lo devuelve a su sitio.
:::

## El papel

El papel se elige como lo pediría un impresor: por **tipo**, la clase de papel, y por **gramaje**, su peso en gramos por metro cuadrado. Cada tipo trae los valores habituales en él, recogidos en :ref{id="paper-stocks"}, y cualquiera se puede cambiar por separado: un papel de libro ahuesado de 70 gramos en lugar de 80, un offset sin estucar en un tono más cálido.

El grosor sale de dos números. La **mano** de un papel, en centímetros cúbicos por gramo, dice cuánto sitio ocupa un gramo de él; el gramaje por la mano da el grosor de una hoja en micras. El bloque de un libro es su número de hojas por ese grosor, y por eso las mismas trescientas páginas hacen un volumen delgado en papel estucado y uno grueso en papel de libro de alta mano. Folio cuenta el libro entero, así que un capítulo mostrado solo sigue entre las páginas anteriores y posteriores, con su grosor real.

La superficie tiene tres ajustes. El **acabado** dice si el papel está sin estucar, con su fibra y sin brillo, o estucado y calandrado hasta un acabado mate, semimate o brillo, que refleja la habitación. La **textura** es el relieve: lisa, el grano fino de la vitela, la trama regular del papel uniforme, las líneas del verjurado, un gofrado de tela o las marcas irregulares del fieltro; su intensidad se puede bajar o subir. El **tono** es el color del papel antes de imprimir, blanco, natural o ahuesado, y la **transparencia** deja ver tenuemente lo impreso en el reverso del papel fino, menos cuanto más pesa el papel. Un periódico no necesita nada de esto: un libro con formato de periódico, sábana, berlinés o tabloide, descansa sobre la mesa como papel prensa doblado, salvo que sus ajustes elijan otro papel y otra encuadernación.

## Encuadernaciones y cubiertas

Hay cinco encuadernaciones. El **cartoné** lleva tapas de cartón algo mayores que las páginas. La **rústica fresada** tiene el lomo fresado y encolado, y abre menos. La **rústica cosida** conserva sus cuadernillos cosidos bajo una cubierta blanda y abre con más facilidad. La **encuadernación plana** abre del todo, sin que las páginas se hundan hacia el lomo. El **grapado a caballete** forma un folleto de pliegos doblados y grapados por el pliegue, como una revista o un programa de mano, y no tiene lomo plano. Un libro grueso abre como abre un libro grueso, con el lomo de pie entre los dos bloques de páginas. Un libro encuadernado a la derecha, sea árabe o chino o japonés compuesto en vertical, aparece en espejo, con el lomo a la derecha, y sus hojas y las teclas de flecha pasan en el otro sentido.

Las cubiertas salen de uno de dos sitios. Por defecto, Folio dibuja **una tapa alrededor de las páginas**, de tela, cartulina o piel y en el color de la cubierta. Cuando el documento ya trae sus cubiertas, como esta guía, pueden ser **las páginas del documento**: la primera página pasa a ser la cubierta y la última, si cae en página par, la contracubierta. El libro descansa entonces cerrado sobre su cubierta hasta que el lector lo abre, la cubierta gira como un cartón rígido y al pasar la última hoja el libro vuelve a cerrarse.

El lomo puede llevar una imagen. Cualquier imagen o SVG del panel Recursos se puede imprimir en él, vista como se ve el lomo en una estantería, con la cabeza arriba y la cubierta a la derecha; se escala hasta cubrir el lomo, así que conviene que deje algo de aire en los bordes. Un folleto grapado a caballete no tiene lomo en el que imprimir.

## Láminas en otro papel

Los libros cambian a menudo de papel durante unas pocas páginas: un cuadernillo de láminas en color sobre estucado en una novela impresa en papel de libro, una separata de cartulina, unas hojas de papel de color. En Postext eso es un contenedor en el texto:

:::callout{type="note" title="Un cuadernillo de láminas"}
\`:::paper{type=coatedGloss grammage=130}\` abre el tramo y \`:::\` lo cierra. Todo lo que queda entre ambos se imprime en ese papel.
:::

Un papel ocupa pliegos enteros, así que el contenido del tramo empieza en una página nueva y lo que le sigue también. Cada página compuesta dentro del tramo lleva su papel en la maquetación, y la vista Folio dibuja esas hojas con el color, la superficie, el grosor y la rigidez de ese papel; el canvas, el HTML y el PDF las componen como cualquier otra página. Los atributos que se omiten siguen el papel del libro, y un tramo dentro de otro solo cambia lo que fija.

## La mesa y la luz

El libro descansa sobre una **superficie**: roble, nogal, lino, fieltro, piel, mármol, un color liso o nada, que deja ver el fondo de la página. Cada superficie es una textura fotografiada, y un tinte cambia el color de cualquiera de ellas. Cinco **luces** crean la escena: estudio, luz de día, lámpara de lectura, cielo cubierto y noche. Cada una es un par: el entorno que reflejan los papeles estucados y de brillo al girar una hoja, y una luz principal que proyecta las sombras del bloque y de una página levantada sobre las páginas de debajo. La **exposición** aclara u oscurece la escena, y las sombras se pueden desactivar en un equipo lento. La **inclinación** fija cuánto se aparta la vista de la vertical, hasta setenta grados, y el **giro** cuánto rodea el libro; Guardar como vista por defecto guarda los dos tal como los ves.

Esta guía está montada como un folleto grapado a caballete, en papel estucado brillo de 170 gramos, sobre un tapete de fieltro azul y con luz de estudio. Sus cubiertas son su propia primera y última página, así que se abre por la cubierta y se cierra al pasar la última hoja. Todo ello está en el grupo **Folio** del panel **Diseño**, y nada en ese grupo cambia una sola línea de las páginas. El folleto, el papel, el tapete y la luz son ajustes de la configuración, así que otro libro puede mostrarse en tapa dura, sobre otra mesa y con otra luz.

## Dónde funciona Folio

Folio dibuja con WebGL2, los gráficos tridimensionales del navegador, con una textura por cada cara de cada página pintada. Pintar solo los pliegos que rodean al que está abierto deja la memoria de un libro largo en la de unas pocas páginas, pero un móvil sigue dando a una pestaña del navegador menos memoria de la que necesita un libro, así que el Sandbox ofrece la pestaña Folio en ordenadores y tabletas y la omite en los móviles y en los navegadores sin WebGL2.

:::callout{type="note" title="En código"}
El visor es un paquete propio, _postext-folio_, construido sobre three.js. \`createFolioFromDocument(container, doc)\` muestra un documento maquetado como un libro; \`setDocument\` muestra la maquetación siguiente en la misma página, \`setAppearance\` cambia el papel, la encuadernación o la luz, y \`resetView\` devuelve la vista a su sitio. \`createFolio\` hace lo mismo con cualquier conjunto de imágenes de página.
:::

El mismo paquete pasa las páginas de las recetas del Recetario, y puede ir en cualquier página web que quiera presentar un libro como un libro: el catálogo de una editorial, una prueba enviada a un autor, una vista previa antes de que el pedido vaya a la imprenta. La mesa de luz del Recetario pasa las páginas de una receta con el mismo paquete, en plano, sin la tercera dimensión. Como el visor recibe la maquetación ya hecha, cada cambio en el texto o en el diseño llega al libro en cuanto Postext vuelve a componer sus páginas.

# Herramientas en torno al motor {#tools lead="El Sandbox es una de las entradas a Postext. Una línea de comandos compone libros desde un terminal, un formato de archivo los lleva enteros, los documentos de Word entran y salen, y los agentes pueden manejar el Sandbox o adaptar un libro a partir de su PDF." summary="La línea de comandos, el archivo .postext, Word, WebMCP y el skill de adaptación"}

El motor que está en el centro de este libro es una biblioteca, y a una biblioteca se la puede llamar desde cualquier sitio. El Sandbox es el lugar más visible donde se ejecuta, pero una editorial con un catálogo que producir, un desarrollador con una cadena de compilación o un asistente al que se le pide componer un manuscrito necesitan cada uno otra puerta.

## La línea de comandos

:index{term="línea de comandos"}**postext** es un programa de terminal que convierte un libro en un PDF, un EPUB, HTML, imágenes de página o un documento de Word, sin navegador. Se distribuye como un archivo por sistema, para macOS, Linux y Windows, que se descarga de las versiones publicadas del proyecto, o a través de npm como _postext-cli_. Todo lo que necesita viaja dentro: el motor, una biblioteca de dibujo, un modelador de texto, los perfiles ICC del capítulo de imprenta y dos familias de fuentes. Las demás fuentes se descargan una vez de Google Fonts o de una carpeta que indiques y se guardan en una caché; las fuentes instaladas en el ordenador no se usan nunca, así que un libro sale igual en cualquier máquina.

El programa lee un archivo \`.postext\`, una carpeta que contiene un libro o archivos Markdown sueltos, que toma como capítulos por el orden de sus nombres. Cada salida tiene su orden: \`pdf\`, \`epub\`, \`html\`, \`image\` e \`images\`, \`docx\`. Las opciones cubren lo que el Sandbox ofrece en sus paneles: una norma PDF/X y un perfil, un EPUB fijo o fluido, una sola página o un intervalo de páginas en la numeración que imprime el libro, una resolución, una simulación de impresión. \`--set\` cambia cualquier ajuste para una ejecución, \`--locale\` elige una edición y \`--chapters\`, una parte del libro.

:::callout{type="note" title="De un manuscrito a un PDF"}
1. \`postext pdf libro.postext\` escribe el libro entero como PDF
2. \`postext images libro.postext --pages 12-15 --dpi 200\` dibuja cuatro páginas como imágenes
3. \`postext check libro.postext --strict\` falla ante cualquier aviso
4. \`postext build libro/ --watch\` vuelve a componer el libro cada vez que se guarda un capítulo
:::

Dos órdenes sirven a la automatización. \`check\` maqueta el libro e informa de lo que mostraría el panel Revisión, con el preflight cuando el libro está preparado para imprenta, y termina con un código de error que un script puede comprobar. \`build --watch\` mantiene un libro abierto y lo vuelve a componer cuando cambia un archivo. En un portátil corriente, una novela ilustrada de 140 páginas se compone y se escribe como PDF en unos diez segundos.

## Un libro en un archivo

:index{term="formato de archivo (.postext)"}Un archivo **.postext** es un libro empaquetado para viajar: un archivo zip con los capítulos en Markdown, la configuración, los recursos, las fuentes y un manifiesto que lo une todo. También puede llevar la paginación ya calculada, de modo que el libro se abre maquetado y la primera página aparece antes de que el motor haya compuesto una línea. El Sandbox descarga un libro en este formato desde el panel Libros y lo abre desde el mismo sitio; la línea de comandos lo lee y lo escribe.

Un archivo puede contener varios idiomas, cada uno con sus capítulos, sus recursos y sus ajustes, como describe :ref{id="languages"}. Los programas leen y escriben el formato con una pequeña interfaz del motor, \`openBundle\`, \`createBundle\` y \`buildBundle\`, que maqueta todos los capítulos de un paquete como un solo libro, con los contadores y los folios continuados. Un archivo hecho con una versión de Postext se abre en la siguiente: el manifiesto anota la versión de los ajustes con la que se escribió, y los archivos antiguos se leen como se pensaron.

## Documentos de Word

:index{term="Word, documentos de"}La mayoría de los manuscritos llegan como archivos de Word. El panel Texto importa un .docx en el navegador, sin enviarlo a ninguna parte, y abre un diálogo antes de cambiar nada. Primero juzga el documento: _estilos bien aplicados_ cuando el autor usó estilos de párrafo, _estilos aplicados en parte_, o _sin estilos_ cuando cada título se puso en negrita a mano. Después muestra cómo se leerá cada estilo de Word, como nivel de título, estilo de párrafo, lista, cita o texto normal, y deja cambiar cualquiera; las elecciones se pueden guardar como plantilla.

Las imágenes y las tablas pasan a ser recursos, las notas al pie pasan a ser notas, los campos de índice de Word se convierten en marcas de índice y sus ecuaciones, en matemáticas. La importación puede sustituir el capítulo actual, añadir capítulos nuevos tras él o sustituir el libro entero.

El viaje también se hace al revés. **Exportar a Word** escribe un capítulo o el libro entero como .docx para un autor o un editor que trabaja en Word. Lo que Word no puede mostrar, una directiva o una referencia a un recurso, se guarda en párrafos grises de un estilo llamado _Postext Markup_, y la plantilla viaja dentro del archivo, de modo que el documento corregido vuelve a Postext sin perder nada.

## Agentes en el Sandbox

Un asistente que sabe usar un navegador también puede usar el Sandbox, a través de **WebMCP**:index{term="WebMCP"}, una propuesta de estándar web para que las páginas ofrezcan herramientas a los agentes. Mientras el Sandbox está abierto ofrece más de cincuenta: leer el estado del libro, editar un capítulo, cambiar un ajuste, añadir un recurso, dibujar una página como imagen, leer los avisos, exportar un PDF, deshacer. Un agente al que se le pide apretar un capítulo puede editar el texto, mirar la página que ha salido y volver a intentarlo, y cada cambio que hace está en pantalla y en el historial de deshacer.

Las herramientas que destruyen trabajo, como borrar un capítulo, un recurso o un libro, van marcadas como delicadas, así que el navegador pregunta a la persona antes de ejecutarlas. Una aplicación que incrusta el Sandbox puede desactivar las herramientas.

## Adaptar un libro con un agente

Traer a Postext un libro que ya existe es sobre todo cuestión de leer su diseño: el formato, los márgenes, las columnas, los cuerpos, cómo se abren los capítulos y dónde se asientan las figuras. El skill **postext-port**:index{term="postext-port, skill"} enseña a un agente a hacerlo a partir de lo que tenga la editorial: un PDF, un archivo de Word o de InDesign, un EPUB, LaTeX, HTML o páginas escaneadas. Hace inventario del original, mide las páginas, propone una ficha de especificaciones, escribe la configuración y los capítulos, y después revisa su propio trabajo: dibuja como imagen cada página que compone y la compara con la original, página a página, hasta que coinciden.

El skill se instala con una sola orden en cualquier agente que lea skills, y en Claude Code como plugin. Conoce las escrituras de este libro: libros chinos y japoneses compuestos en vertical, libros árabes compuestos desde la derecha, cómics rotulados de nuevo en otro idioma y libros de texto construidos con páginas compuestas.

# Hoja de ruta y comunidad {lead="Postext es joven y abierto. La tubería principal, el formato del documento y el sistema de configuración ya están hechos; lo que viene después se decide en público." summary="Dónde está el proyecto y cómo participar"}

Postext no aspira a ser una plataforma documental universal. Aspira a ser un motor de maquetación editorial muy bueno para la web, y mantiene un alcance estrecho para que el núcleo siga afilado. Su ambición a largo plazo es convertirse en el motor de maquetación de referencia para el contenido editorial en la web: algo que editoriales, revistas, plataformas de libros y equipos de desarrollo puedan adoptar y sobre lo que puedan construir.

## Dónde está el proyecto

El trabajo se organiza en cuatro fases, resumidas en :ref{id="development-phases"}. No son hitos estrictos: describen el orden en que las capacidades se vuelven lo bastante estables para producción.

Las dos primeras fases están prácticamente terminadas: el modelo de datos, el analizador y la capa de medición, el formato del documento, el motor de columnas con su equilibrado, sus flotantes y sus tablas, y la maquinaria de libro de capítulos, partes, índice y cabeceras. La tercera fase ha entregado su núcleo —corte óptimo de líneas con penalizaciones editoriales, separación silábica en ocho idiomas, matemáticas, notas al pie y notas de final de capítulo, citas bibliográficas, un índice analítico, el chino y el japonés en horizontal y en vertical, el árabe de derecha a izquierda con justificación por cachida, las páginas compuestas, el cómic, la música, los ejercicios y el texto que rodea las imágenes— y tiene pendientes las notas al margen. La cuarta, la salida, ha publicado el canvas, el HTML, un PDF etiquetado y listo para imprenta, libros EPUB 3 y cursos SCORM, junto con el worker, el Sandbox y sus presets, la vista Folio, que muestra una maquetación como un libro impreso, y una línea de comandos que compone libros sin navegador.

Lo que falta importa tanto como lo que ya está hecho. Las **notas al margen** tienen un sitio en el modelo de datos, pero todavía no se maquetan. El texto aún no corre a ambos lados de una imagen, el coreano se compone con las reglas del chino y no con las suyas, y la línea de comandos modela el texto sin las variantes de glifo propias de cada idioma que aplica un navegador, así que alguna vez una línea puede cortarse en otra palabra que en el Sandbox. Son los siguientes problemas que merece la pena resolver, y aquellos en los que más cuenta la ayuda.

## Cómo participar

El proyecto vive en GitHub, y todas las conversaciones ocurren a la vista: **issues** para errores, peticiones y tareas concretas; **pull requests** para el código, revisado en público; **discussions** para ideas, cuestiones de diseño y todo lo que aún no es lo bastante concreto para ser una issue. Las issues con la etiqueta _good first issue_ son la puerta de entrada más sencilla.

El camino habitual de la idea al código es corto: una issue describe el problema, una discussion fija el enfoque cuando hay más de uno, una pull request lo implementa, y el cambio se fusiona en la rama de desarrollo y se publica desde allí. Abrir una issue antes de una pull request grande ahorra tiempo a todos, porque el enfoque puede acordarse antes de escribir el código.

## Dónde cuenta la ayuda

Todas las partes del proyecto dan la bienvenida a quien quiera contribuir. El **motor** tiene problemas profundos —corte de líneas, equilibrado, numeración, colocación de flotantes— y otros más accesibles en sus pruebas y sus mediciones de rendimiento. El **backend de PDF** tiene la incrustación de fuentes, la gestión del color y la accesibilidad. El **Sandbox** tiene sus paneles, sus editores y sus traducciones, organizados para que cada texto de la interfaz se añada de la misma manera en todos los idiomas. **El diseño y la tipografía** necesitan personas que conozcan las tradiciones editoriales, sobre todo las de escrituras que el motor aún no atiende bien. Y la **documentación** y sus traducciones, hoy en inglés, español, catalán, francés, alemán, italiano, portugués de Brasil, chino simplificado, japonés y árabe, están abiertas a cualquiera que sepa explicar algo con claridad.

El mejor primer paso es pequeño: lee la guía de contribución del repositorio, preséntate en las discussions, elige una issue con la etiqueta _good first issue_ o traduce una página de la documentación.

La mayoría de las contribuciones no exigen escribir código:

- **Informar de problemas** con un ejemplo mínimo del documento y de la configuración
- **Compartir tus maquetaciones** y convertirlas en presets desde los que otros puedan empezar
- **Mejorar la documentación** con tutoriales, ejemplos y explicaciones
- **Traducir** la interfaz y la documentación a nuevos idiomas
- **Aportar conocimiento tipográfico**, sobre todo de escrituras y tradiciones aún poco atendidas
- **Contribuir con código** al motor, a los renderizadores o al Sandbox

## Lo que se quedará fuera

Hay cosas en las que Postext no se convertirá a propósito, y decirlo forma parte de mantener honrado el proyecto. No será un procesador de textos: no hay ningún plan para editar la página directamente, porque la página es el resultado de las reglas, no su entrada. No gestionará los puntos de ruptura adaptables de quien lo aloja, porque esa decisión corresponde a la aplicación. No cargará las fuentes por su cuenta, porque la carga de fuentes es asunto de la página que lo incrusta. Y no crecerá hasta convertirse en una plataforma documental general, con almacenamiento, colaboración y flujos de publicación, cuando otras herramientas hacen bien esas cosas y Postext puede incrustarse en ellas.

Otras cosas, sencillamente, aún no están hechas. La colaboración en tiempo real, compartir una sesión viva mediante un enlace, está en la lista de ideas del Sandbox, y las notas al margen son una cuestión de diseño tanto como técnica. Las dos se discutirán en público antes de escribir una sola línea de código.

## Licencia

:index{term="licencia"}Postext se publica con la **licencia MIT**: el motor, los generadores de PDF y de EPUB, el visor Folio y el Sandbox pueden usarse, modificarse e incrustarse tanto en proyectos abiertos como cerrados, con fines comerciales o no, siempre que el aviso de licencia acompañe al código. Los tipos de letra de este libro son fuentes abiertas servidas por Google Fonts, los diagramas forman parte del código del Sandbox y el texto de esta guía pertenece al proyecto y a quienes contribuyen a él.

## Valores

Tres valores guían el proyecto, y están para usarse, no para enmarcarse: cuando dos buenas ideas tiran en direcciones distintas, son la manera de decidir.

_El diseño meditado antes que la prisa._ La tipografía acumula siglos de sabiduría, y el motor debería honrarla en lugar de reinventarla mal. Una funcionalidad llega cuando hace lo correcto en una página real, no cuando simplemente funciona en una demostración; una regla tomada de la imprenta se estudia en los libros que la usan antes de convertirse en una opción. Algunas funcionalidades tardan más así. Las que se publican no hay que retirarlas después.

_La claridad antes que el ingenio._ El código, la configuración y la documentación deben ser fáciles de leer, cambiar y explicar. Una opción que necesita un párrafo de advertencias indica que el diseño aún no está terminado; una función que solo entiende quien la escribió no sobrevivirá a sus vacaciones. La configuración usa unidades reales y nombres llanos, el formato del documento sigue siendo legible en cualquier editor, y cada decisión del motor puede rastrearse hasta una regla que alguien puede señalar.

_La colaboración antes que el territorio._ Las decisiones se toman en público, en issues y discussions que cualquiera puede leer y a las que cualquiera puede sumarse, y ninguna parte del código pertenece a una sola persona. Se reconoce cada contribución —código, documentación, traducciones, informes de errores, consejo tipográfico y los libros de ejemplo que muestran lo que el motor puede hacer—, porque un motor de maquetación para todos solo pueden construirlo muchas personas.

Si algo de esto te resuena, el repositorio es el siguiente paso. Abre una issue, haz una pregunta en las discussions o cambia algo de este libro y mira qué hace el motor con ello.

:::paragraphs{style="signature"}
postext.dev · github.com/drnachio/postext
:::

::::page{template="sheet"}
## Postext en una página

Postext compone libros a partir de dos entradas: un Markdown que dice qué es el texto y una configuración que dice cómo se ve. Si cambia cualquiera de las dos, las páginas se componen de nuevo, en el navegador, en una fracción de segundo.

:::frame{slot="card" label="Escribir"}
Markdown y unas pocas directivas: \`:::callout\` para un recuadro, \`:ref\` para una figura, \`[^id]\` para una nota, \`::::page\` para una página como esta. El texto nunca dice dónde va nada.
:::

:::frame{slot="card" label="Diseñar"}
Más de quinientos ajustes en el panel Diseño: la página y sus columnas, la letra, los recuadros, las aperturas, las cabeceras y una paleta que cada parte puede cambiar.
:::

:::frame{slot="card" label="Componer"}
Cada párrafo cortado entero, columnas que acaban a la par, figuras en el primer hueco tras su mención y un libro recompuesto hasta que sus folios se asientan.
:::

:::frame{slot="card" label="Revisar"}
El panel Revisión lista lo que ha visto el motor: una línea floja, una fuente que falta, un color muy pálido, una imagen sin resolución para imprenta. Un clic lleva a la línea.
:::

:::frame{slot="card" label="Publicar"}
Una maquetación, cinco salidas: el canvas, HTML para la pantalla, un PDF para imprenta o biblioteca, EPUB para lectores electrónicos y un paquete SCORM para un curso.
:::

:::frame{slot="card" label="Compartir"}
Un libro viaja en un archivo .postext con capítulos, diseño, imágenes y fuentes. La línea de comandos lo compone en un servidor; el Sandbox lo abre en cualquier navegador.
:::

:::frame{slot="key" label="Teclas"}
Esta hoja es una página compuesta: una plantilla con un título, un marco de flujo, una retícula de tarjetas y un recuadro al pie, llena con el Markdown del último capítulo. En el editor, :chip[⌘ Z] deshace y :chip[⌘ F] busca; :chip[Esc] cierra un diálogo.
:::
::::

# Índice analítico {style="index" summary="Todos los términos que marca esta guía, con sus páginas"}

:::index

# Contraportada {style="back" toc="false" book="Postext" blurb="Postext compone Markdown como libros, revistas y manuales, en el navegador: cada párrafo cortado entero, columnas que terminan a la par, figuras que llegan después de las palabras que las llaman, un PDF listo para imprenta y un EPUB para lectores electrónicos. Cada página de esta guía la ha compuesto el propio Postext." licence="Código abierto · Licencia MIT"}
`;
