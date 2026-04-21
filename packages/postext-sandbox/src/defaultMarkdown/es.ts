export const DEFAULT_MARKDOWN_ES = `---
title: "Postext: Un tipógrafo programable para la web"
subtitle: "Un motor de maquetación de código abierto con calidad editorial"
author: "Ignacio Ferro"
publishDate: "2026-04-21"
---

# Postext: Un tipógrafo programable para la web

Postext es un **motor de maquetación de código abierto** concebido para llevar la sofisticación de la tipografía profesional de imprenta al desarrollo web moderno. Durante siglos, el mundo del diseño editorial ha depurado técnicas para colocar texto, imágenes y anotaciones sobre la página con una precisión extraordinaria. Esas técnicas abarcan desde el equilibrio minucioso de columnas hasta la prevención rigurosa de huérfanas y viudas, desde la separación silábica inteligente hasta la colocación elegante de notas al pie. Hasta ahora, la web carecía de una herramienta capaz de reproducir esos estándares de manera programable y declarativa.

La misión central de Postext es cerrar esa brecha. El motor toma **contenido semántico** escrito en Markdown enriquecido y lo transforma en una maquetación completamente resuelta donde cada elemento ocupa una posición precisa, medida en unidades tipográficas reales. Esa maquetación puede a continuación renderizarse en varios formatos de salida, entre ellos páginas web interactivas, vistas previas sobre canvas y documentos PDF listos para imprimir, todos ellos generados a partir de la misma fuente única de verdad.

Este documento por defecto, el que estás leyendo ahora mismo dentro del Sandbox, tiene un doble propósito. Por un lado, es una demostración en vivo de lo que el motor puede hacer con prosa extensa. Por otro, es un recorrido compacto por las ideas, decisiones y características que distinguen a Postext de cualquier otra tecnología de maquetación disponible en la web. Siéntete libre de modificarlo, acortarlo, sustituirlo por material propio o usarlo como andamiaje mientras exploras cómo los cambios en el panel de configuración se propagan al instante al canvas, a la vista HTML y a la salida en PDF.

## El problema que Postext resuelve

Antes de entrar en los detalles internos, conviene entender la forma exacta del problema que aborda Postext. La distancia entre lo que los navegadores modernos saben renderizar y lo que el diseño editorial profesional espera es mucho mayor de lo que la mayoría de desarrolladores imagina, y las herramientas que tradicionalmente han cubierto ese hueco viven fuera del ecosistema web. Esta sección describe ambos lados del problema y las razones por las que un motor de un tipo nuevo acabó siendo necesario.

### Las limitaciones de CSS para la maquetación editorial

El CSS moderno es una herramienta notablemente potente para construir interfaces de usuario. Flexbox, Grid y las consultas de contenedor ofrecen a quien desarrolla un control muy fino sobre la disposición de los componentes en pantalla. Subgrid, el posicionamiento por anclajes y las animaciones impulsadas por el desplazamiento siguen ampliando lo que un navegador puede expresar de forma declarativa. Sin embargo, CSS se diseñó principalmente para _maquetar aplicaciones_, no para _maquetar publicaciones_. Hay una diferencia de fondo entre ambos casos:

- **Maquetar aplicaciones** consiste en organizar componentes interactivos como botones, formularios, barras de navegación y tarjetas dentro de un viewport por el que el usuario puede desplazarse con libertad
- **Maquetar publicaciones** consiste en organizar texto fluido, imágenes, tablas, figuras y anotaciones a lo largo de una sucesión de páginas o columnas de dimensiones fijas, siguiendo reglas tipográficas estrictas heredadas de siglos de tradición impresa

CSS atiende brillantemente el primer caso. Para el segundo se queda corto en aspectos críticos que, en el fondo, la plataforma nunca ha llegado a resolver:

1. **No hay flujo multicolumna nativo con conciencia del reflujo**
   - La propiedad CSS _columns_ existe, pero no sabe equilibrar alturas de columna de forma inteligente
   - No sabe gestionar recursos que abarquen columnas ni floten a posiciones concretas dentro de una retícula de columnas
   - No ofrece un mecanismo para mantener los encabezados junto con su párrafo siguiente
   - No existe un concepto de conjunto óptimo de saltos a escala de página
2. **No hay prevención de huérfanas y viudas entre columnas**
   - Aunque CSS cuenta con las propiedades _orphans_ y _widows_, el soporte en los navegadores es irregular
   - Esas propiedades no funcionan a través de los límites de columna como la tipografía profesional espera
   - Una prevención de nivel editorial exige conocer toda la geometría de la página, no sólo un contenedor de texto
   - Tampoco hay una propiedad CSS que modele el _rabo_, esa palabra corta que queda colgando al final de un párrafo
3. **No hay estrategias integradas de colocación de recursos**
   - La maquetación impresa coloca figuras con naturalidad en la cabeza de la siguiente columna disponible, las flota hacia el margen o las extiende a ancho completo de página
   - Los floats de CSS resultan primitivos al lado de esas estrategias y no negocian con el flujo de texto
   - No existe la noción de una figura que debe retrasarse una columna si fuera a dejar una huérfana por encima
4. **No hay sistemas de notas al pie ni de notas al margen**
   - Las notas al pie impresas aparecen al fondo de la columna donde se referencian y consumen espacio del texto superior
   - Las notas al margen se alinean verticalmente con el párrafo que las referencia
   - Las notas finales deben recopilarse por sección o por documento manteniendo una numeración coherente
   - CSS no ofrece primitivas para ninguna de esas necesidades
5. **No existe el concepto de retícula de línea base**
   - Los libros y revistas profesionales alinean la primera línea base de cada columna con un ritmo vertical común
   - CSS no tiene ninguna primitiva para fijar líneas a una retícula que atraviese columnas y páginas

El patrón es constante. CSS sabe describir con enorme detalle la _apariencia_ de una región concreta de texto, pero carece de las primitivas de _optimización global_ que exige la calidad editorial. La tipografía editorial es, en última instancia, un problema de satisfacción de restricciones, y al navegador nunca se le ha dado el lenguaje necesario para expresar esas restricciones.

### Lo que las herramientas existentes no cubren

Existen, por supuesto, herramientas que abordan parte del problema. Los procesadores de texto como Microsoft Word o Google Docs gestionan la paginación básica. Las aplicaciones de autoedición como Adobe InDesign ofrecen un control editorial completo. LaTeX es la referencia dorada de la composición académica, y sus descendientes siguen dominando la publicación matemática. Sin embargo, ninguna de ellas fue diseñada para la web, y sus supuestos hacen muy difícil trasplantarlas a los flujos de desarrollo actuales:

- No producen maquetaciones _responsivas_ que se adapten a distintos tamaños de pantalla
- No se integran con frameworks frontend modernos como React, Vue o Svelte
- No pueden incrustarse como un componente dentro de una aplicación web más amplia
- Su salida es estática, no interactiva, y rara vez conserva la estructura semántica de la que dependen las herramientas de accesibilidad
- Sus formatos de origen son propietarios, binarios o tan complejos que resultan difíciles de generar de manera programática

Postext ocupa una posición singular en este panorama. Es una **biblioteca de JavaScript** que se ejecuta en el navegador, recibe Markdown como entrada, aplica reglas tipográficas profesionales y produce una maquetación que puede renderizarse como HTML, como canvas o como PDF. Está pensada para ser incrustada, configurada y ampliada por quienes desarrollan en la web sin abandonar su cadena de herramientas habitual. Trata la web como superficie de edición y como destino de renderizado de primera clase al mismo tiempo, no como una ocurrencia tardía.

## Cómo funciona Postext

Entender la arquitectura de Postext es la forma más rápida de entender qué puede y qué no puede hacer. El motor se organiza como una tubería en la que cada etapa refina una representación en memoria compartida del documento. Ninguna etapa se esconde tras formatos opacos, ninguna etapa exige E/S de disco y toda la tubería es pura: dadas las mismas entradas de contenido y configuración, siempre produce la misma maquetación.

### La tubería de procesamiento

El motor de maquetación de Postext procesa el contenido a través de una tubería cuidadosamente orquestada. Cada etapa se construye sobre los resultados de la anterior, transformando de forma gradual el Markdown en bruto en una maquetación completa y medida con precisión. Comprender esta tubería es clave para asimilar la filosofía de diseño del proyecto y, además, clarifica qué partes del motor pueden sustituirse, extenderse o reutilizarse de forma aislada.

#### Capa de entrada

El proceso comienza en la **capa de entrada**, donde quien desarrolla aporta los ingredientes en crudo del documento. Por esta capa circulan dos cosas, y las dos están pensadas para leerse y editarse a mano:

1. **Contenido** en formato Markdown enriquecido
   - El cuerpo principal del texto, escrito con la sintaxis estándar de Markdown
   - Encabezados, párrafos, listas, énfasis y demás formato en línea
   - Marcadores especiales que referencian recursos externos o notas
   - Un frontmatter opcional en YAML con el título, el autor y la fecha de publicación
2. **Configuración** que define las reglas de maquetación
   - Dimensiones de página, márgenes y ajustes de DPI
   - Número de columnas, ancho de medianil y preferencias de equilibrio
   - Reglas tipográficas para la prevención de huérfanas, viudas, rabos y separación silábica
   - Estrategias de colocación de recursos para imágenes, tablas y figuras
   - Ajustes del sistema de referencias para notas al pie, notas finales y notas al margen
   - Una paleta de colores con nombre que puede reutilizarse desde varios puntos de la configuración

La separación entre contenido y configuración es deliberada e importante. El mismo documento Markdown puede generar maquetaciones radicalmente distintas sin más que cambiar la configuración. Una maquetación a una columna para pantallas móviles, otra a dos columnas para tabletas y otra a tres columnas para monitores amplios de escritorio pueden nacer del mismo texto fuente. Es el equivalente editorial del diseño responsivo y la razón por la que el motor se niega a cocer decisiones visuales dentro del contenido.

#### Capa de medición

Antes de poder decidir dónde colocar cada elemento, el motor necesita saber cuánto espacio ocupa cada uno. De eso se encarga la **capa de medición**, construida sobre una biblioteca hermana llamada _pretext_. La medición de texto es el núcleo de cualquier motor tipográfico, y acertar ahí, tanto en precisión como en velocidad, fue la intuición que hizo posible todo el proyecto.

El reto de medir no es trivial. Representar texto es complejo porque el ancho y el alto de un párrafo dependen de la fuente, del tamaño de la fuente, de la interlínea, del ancho disponible, de las reglas de separación silábica y de muchos otros factores. Tradicionalmente, la única manera de medir texto con precisión en un navegador consiste en renderizarlo en el DOM y leer las dimensiones calculadas. Ese enfoque es lento, ya que dispara reflujos de maquetación que pueden bloquear el hilo principal cientos de milisegundos por párrafo en documentos realistas.

Postext adopta un enfoque radicalmente distinto. La biblioteca _pretext_ realiza **medición de texto sin DOM** utilizando métricas de fuente del canvas y aritmética pura. Esta técnica resulta entre 300 y 600 veces más rápida que la medición basada en DOM, dependiendo del navegador y del documento, y funciona combinando tres ingredientes:

1. Cargando métricas de fuente desde la API del canvas
   - Anchos de glifos y métricas de avance
   - Medidas de ascendentes y descendentes
   - Ajustes de kerning por pares cuando están disponibles
   - Métricas por peso para variantes negrita y cursiva
2. Calculando los saltos de línea con el algoritmo de salto de línea óptimo de Knuth-Plass
   - Evaluando todos los posibles puntos de corte de un párrafo
   - Escogiendo el conjunto de saltos que minimiza una función de penalización global
   - Teniendo en cuenta las oportunidades de división silábica con patrones de calidad TeX
   - Respetando las reglas de adyacencia entre líneas apretadas, normales, sueltas y muy sueltas
3. Calculando las dimensiones del bloque resultante
   - Altura total incluyendo todas las líneas y el espaciado interlineal
   - Ancho máximo de línea para fines de alineación
   - Posiciones de línea base para la alineación con la retícula
   - Ratios de justificación por línea para la capa de depuración

Este enfoque de medición es la innovación crítica que vuelve viable a Postext. Sin él, el motor tendría que provocar miles de reflujos del DOM al calcular la maquetación, haciendo imposible la edición interactiva. Con él puedes teclear en el Sandbox y ver cómo la maquetación se actualiza entre pulsaciones.

#### Motor de maquetación

El **motor de maquetación** es el corazón de Postext. Toma los elementos ya medidos y los dispone en páginas y columnas siguiendo las reglas configuradas. Aquí es donde reside la inteligencia editorial, y es también el punto en el que la distancia entre un algoritmo ingenuo de primer ajuste y un motor tipográfico auténtico se vuelve visible.

El motor de maquetación trabaja de forma iterativa. Realiza una primera pasada de colocación y, a continuación, refina el resultado mediante iteraciones sucesivas, ajustando posiciones para satisfacer restricciones que pueden entrar en conflicto. Por ejemplo:

- Un encabezado debe permanecer junto a su párrafo siguiente, lo que podría obligar a mover ambos a la columna siguiente
- Mover contenido a la columna siguiente podría crear una viuda en la columna actual
- Eliminar esa viuda podría requerir traer contenido de vuelta, rompiendo la restricción entre encabezado y párrafo
- Una figura pensada para la cabeza de la siguiente columna podría retrasarse una columna más si al caer ahí dejara una huérfana arriba

Estas dependencias circulares se resuelven mediante un **bucle de convergencia** que ejecuta hasta cinco iteraciones. En la práctica, la mayoría de las maquetaciones convergen en dos o tres pasadas. El motor detecta cuándo no puede mejorar más y se detiene antes, de modo que el tope es una red de seguridad, no una ruta habitual. La estructura de datos que sobrevive a este bucle se conoce internamente como **VDT**, el árbol virtual del documento, y es la fuente única de verdad que consume cada uno de los renderizadores.

El motor de maquetación produce un VDT que describe la posición exacta y las dimensiones de cada elemento en cada página. Esta estructura es independiente del formato, es decir, contiene geometría pura sin información específica de renderizado, y es precisamente esa independencia la que permite que Canvas, HTML y PDF produzcan una salida coherente.

#### Capa de salida

La última etapa es la **capa de salida**, que toma esa geometría abstracta y la renderiza en un formato concreto. El motor incluye hoy tres renderizadores, y los tres consumen el mismo VDT sin modificarlo jamás:

- **Renderizador de canvas** produce una vista previa rasterizada sobre un elemento canvas de HTML5
   - Las páginas se dibujan de forma perezosa mediante IntersectionObserver para rendir bien en documentos largos
   - Incluye de serie zoom, ajuste al ancho, ajuste al alto y modo de doble página
   - La salida es adecuada para una inspección visual rápida a cualquier nivel de zoom
- **Renderizador web** produce elementos HTML con posicionamiento CSS preciso
   - Cada elemento se sitúa de forma absoluta dentro de su contenedor de página
   - El texto se compone con tamaños, interlíneas y posiciones de línea base exactos
   - El resultado es un componente React que puede incrustarse en cualquier aplicación web
   - El aislamiento de estilos se logra con Shadow DOM para que la página anfitriona no lo contamine
- **Renderizador de PDF** genera documentos listos para imprimir
   - Utiliza los mismos datos del VDT que los renderizadores web y de canvas
   - Produce una salida vectorial apta para impresión profesional
   - Conserva todos los detalles tipográficos, incluidas las posiciones exactas de los caracteres
   - Incrusta fuentes estáticas por peso para que la negrita y la cursiva salgan al peso correcto

Como los tres renderizadores leen del mismo VDT, la promesa de _lo que ves es lo que obtienes_ no es retórica: saltos de línea, fronteras de página y colocación de recursos coinciden píxel a píxel entre los tres.

## Características tipográficas

Las siguientes características son en las que Postext invierte el grueso de su esfuerzo. Cada una de ellas tiene una larga historia en el mundo de la imprenta y cada una, hasta ahora, resultaba imposible o dolorosamente artesanal de conseguir dentro del navegador. Postext las trata como ciudadanas de primera, configurables por alguien que diseña sin necesidad de escribir una sola línea de código.

### Prevención de huérfanas y viudas

En la tipografía profesional, una **huérfana** es una única línea de un párrafo que aparece aislada al comienzo de una columna o página, separada del resto de su párrafo. Una **viuda** es una única línea que aparece sola al final de una columna o página. Ambas se consideran defectos tipográficos serios porque rompen el ritmo visual del texto y dificultan que quien lee mantenga su fluidez.

Postext ofrece una prevención configurable de huérfanas y viudas:

- El ajuste _mínimo de líneas huérfanas_ especifica cuántas líneas deben aparecer al comienzo de un párrafo antes de un salto de columna
- El ajuste _mínimo de líneas viudas_ especifica cuántas líneas deben aparecer al final de un párrafo después de un salto de columna
- El motor ajusta los saltos de columna, mueve contenido entre columnas e incluso modifica los saltos de línea dentro de los párrafos para cumplir estas restricciones
- Cuando las restricciones entran en conflicto, el motor utiliza un sistema de prioridades basado en penalizaciones configurables para decidir qué regla prevalece
- Las reglas de huérfanas y viudas también se aplican a los elementos de lista, con activadores independientes para cada tipo de lista

Además de huérfanas y viudas, Postext reconoce un tercer defecto habitual llamado **rabo**: la última línea de un párrafo compuesta por apenas una o dos palabras cortas que quedan varadas lejos del resto del texto. Los rabos se miden en número mínimo de caracteres y se penalizan directamente dentro de la optimización de Knuth-Plass, de forma que el algoritmo prefiere de manera natural los conjuntos de saltos que los evitan.

### Separación silábica y optimización del margen

La **separación silábica** consiste en dividir palabras por sus límites silábicos cuando caen al final de una línea. Una separación correcta mejora la uniformidad de las longitudes de línea y reduce la perturbación visual que causan los grandes espacios entre palabras en el texto justificado. Sin ella, un motor solo puede evitar una línea suelta moviendo palabras enteras, y mover palabras enteras suele desplazar el problema unas líneas más abajo.

Postext utiliza **patrones Liang de calidad TeX** servidos por la biblioteca _Hypher_. Son los mismos patrones que TeX emplea desde 1983, mantenidos por la comunidad TeX y refinados a lo largo de cuatro décadas de uso. Se generan a partir de grandes corpus léxicos y cubren muchos más casos límite de los que cualquier heurística artesanal podría abarcar. Los idiomas soportados actualmente incluyen inglés, español, francés, alemán, italiano, portugués, catalán y neerlandés, y añadir más consiste simplemente en importar el fichero de patrones correspondiente.

El sistema de separación silábica expone los siguientes controles:

- Patrones de separación específicos por idioma que definen los puntos de corte válidos dentro de las palabras
- Mínimos de caracteres antes y después del guion para evitar cortes incómodos
- Máximo de líneas consecutivas con guion para evitar el efecto de escalera en el margen derecho
- Valores de penalización por división silábica que influyen en el algoritmo de Knuth-Plass al elegir entre un corte con guion y una línea más holgada

La **optimización del margen** se refiere al suavizado del borde derecho del texto alineado a la izquierda, conocido como _rag_ o _bandera_. Un margen sin optimizar puede parecer irregular, con líneas cortas seguidas de líneas largas sin ningún patrón. Postext optimiza ese margen mediante:

1. Evaluación de la calidad visual del margen derecho a lo largo de varias líneas
2. Ajuste del espaciado entre palabras dentro de límites aceptables
3. Elección de puntos de corte que produzcan un margen que varíe de forma gradual en vez de brusca
4. Uso de la separación silábica como herramienta para suavizar el margen, no sólo para encajar líneas

### Justificación Knuth-Plass

Para el texto justificado, Postext implementa al completo el **algoritmo de salto de línea óptimo de Knuth-Plass**, el mismo que impulsa TeX desde 1981. A diferencia del enfoque voraz de primer ajuste que emplea CSS, Knuth-Plass evalúa todas las formas posibles de romper un párrafo entero y escoge la combinación que minimiza la _maldad_ total de todas sus líneas. El resultado es un texto justificado cuyo espaciado entre palabras es visiblemente más uniforme de lo que cualquier navegador puede producir de manera nativa.

El algoritmo modela el texto como una secuencia de tres primitivas:

- **Las cajas** son palabras o fragmentos de palabra con un ancho fijo que no puede estirarse, comprimirse ni romperse
- **Las gomas** son espacios entre palabras con un ancho natural más capacidades de estiramiento y contracción que el motor ajusta para llenar la línea
- **Las penalizaciones** son puntos de corte potenciales con un coste asociado, donde las _marcadas_ indican además oportunidades de separación silábica y añaden un guion visible si se usan

Para cada corte candidato, el algoritmo calcula un ratio de ajuste, un valor de maldad que crece cúbicamente con el valor absoluto de ese ratio y un total de deméritos que también contempla la separación silábica y las transiciones de clase de holgura entre líneas contiguas. Postext amplía el conjunto clásico de deméritos con tres penalizaciones editoriales —huérfana, viuda y rabo— para que el mismo optimizador que equilibra el espaciado también evite los defectos al final del párrafo.

### Composición matemática

Postext trata las fórmulas LaTeX como ciudadanas de primera del formato de documento, no como un añadido posterior. Las expresiones en línea como $e^{i\\pi}+1=0$ fluyen con el texto que las rodea y se componen con MathJax como trazos vectoriales, de modo que se mantienen nítidas a cualquier nivel de zoom. Cuando la altura natural de una fórmula excedería la caja de línea del cuerpo, el motor la escala uniformemente hacia abajo para preservar la rejilla de línea base — el lector conserva el ritmo horizontal del texto por densa que sea la notación.

Las fórmulas en display viven en sus propias líneas, enmarcadas por los marcadores \`$$…$$\`. El motor las centra en la columna, aplica márgenes superior e inferior configurables y ajusta el borde inferior a la rejilla de línea base usando el mismo mecanismo de corrección que emplean los encabezados:

$$
\\int_0^{\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

El siguiente párrafo cae por tanto exactamente sobre una línea de la rejilla, independientemente de lo alta que sea la fórmula — una propiedad que importa mucho en libros técnicos y artículos científicos donde las matemáticas y la prosa se alternan sin descanso. Los mismos trazos vectoriales alimentan la vista canvas, la exportación HTML y el backend PDF, de modo que las tres salidas coinciden píxel a píxel, y el PDF se mantiene plenamente vectorial para producción impresa.

### Espaciado y ritmo

El espaciado vertical en la tipografía editorial obedece a reglas estrictas que mantienen el ritmo visual de la página. Postext aplica esas reglas a través de su sistema de configuración:

- **El espaciado de encabezados** controla la distancia por encima y por debajo de los encabezados de cada nivel
   - Los encabezados mayores reciben más espacio por encima para separarlos visualmente de la sección anterior
   - El espacio por debajo es menor que el de arriba, creando una conexión visual entre el encabezado y su contenido
   - Los encabezados consecutivos sin texto entre ellos se señalan en el panel de avisos como un defecto semántico, porque casi siempre indican que falta una introducción
- **El espaciado de párrafos** puede configurarse como sangría o como espacios verticales
   - La tipografía tradicional de libros emplea sangría de primera línea sin espacio vertical entre párrafos
   - La tipografía digital moderna suele utilizar espacios verticales sin sangría
   - Postext admite ambos enfoques e incluso su mezcla dentro de un mismo documento
- **El espaciado de listas** controla la distancia entre elementos y entre niveles anidados
   - Los elementos de una lista pueden estar compactos o holgados
   - Las listas anidadas admiten sangría adicional y estilos de viñeta distintos en cada nivel
- **La alineación a la retícula de línea base** fija el texto a una cuadrícula vertical regular
   - Esto asegura que el texto en columnas adyacentes se alinee horizontalmente
   - Aporta una sensación de orden y estabilidad a toda la página
   - Los elementos que rompen la retícula, como los encabezados con tamaños mayores, pueden configurarse para realinearse con ella después

## Maquetaciones basadas en columnas

Las columnas son la expresión más visible del diseño editorial y también el punto donde las soluciones caseras de CSS suelen quebrarse primero. Postext proporciona un sistema de columnas que las trata como ciudadanas de primera clase de la página, con sus propias reglas de equilibrio, sus propias estrategias de colocación de recursos y su propia relación con la retícula de línea base.

### Flujo de texto multicolumna

Una de las características más distintivas de la maquetación editorial es el uso de varias columnas. Las columnas cumplen varios propósitos en la tipografía profesional:

- Mantienen las longitudes de línea dentro del rango óptimo de comodidad de lectura, que se suele situar entre 45 y 75 caracteres por línea
- Permiten que quepa más texto por página sin recurrir a un tamaño de fuente incómodo
- Aportan variedad visual y estructura a la página
- Brindan oportunidades para una colocación sofisticada de recursos y para combinar pasajes textuales estrechos con figuras anchas

Postext admite configuraciones multicolumna flexibles:

1. **El número de columnas** puede establecerse en cualquier entero positivo, o elegirse entre varios presets
   - Maquetaciones a una columna para viewports estrechos o lectura concentrada
   - Maquetaciones a dos columnas para artículos y ensayos
   - Maquetaciones de columna y media que combinan una columna principal con una columna lateral estrecha para anotaciones
   - Tres o más columnas para boletines, revistas y materiales de referencia
2. **El ancho del medianil** controla el espacio entre columnas
   - Medianiles más anchos dan sensación de columnas más independientes
   - Medianiles más estrechos permiten más texto por página, pero suelen requerir un separador visual
3. **Las filetes de columna** son líneas verticales opcionales entre columnas
   - Su grosor, estilo y color son configurables
   - Ayudan a distinguir las columnas cuando los medianiles son estrechos
4. **El cruce de columnas** permite que determinados elementos rompan la retícula
   - Un encabezado puede abarcar dos de las tres columnas
   - Una figura puede extenderse al ancho completo de la página
   - Una cita destacada puede flotar cruzando el medianil entre dos columnas

### Equilibrio de columnas

Cuando el texto fluye por varias columnas, éstas suelen terminar a alturas distintas. La última columna de una página puede contener apenas unas líneas mientras las demás están llenas. Eso transmite una sensación de documento inacabado y poco profesional, y es una de las quejas más frecuentes ante las maquetaciones multicolumna improvisadas.

El **equilibrio de columnas** es el proceso de repartir el texto de forma uniforme entre ellas para que terminen aproximadamente a la misma altura. Es un problema computacional sorprendentemente difícil porque:

- Mover texto entre columnas cambia los saltos de línea, lo que modifica la altura de cada columna
- Las figuras y otros elementos no textuales tienen alturas fijas que no pueden partirse
- Las notas al pie asociadas al texto de una columna deben aparecer al fondo de esa misma columna y consumen espacio
- Las restricciones de huérfanas y viudas pueden impedir ciertas distribuciones
- La retícula de línea base impone posiciones discretas de aterrizaje, no continuas

Postext aborda el equilibrio de columnas mediante un refinamiento iterativo:

1. Primero llena las columnas de forma secuencial para establecer una distribución base
2. Después calcula la altura ideal de columna dividiendo la altura total del contenido entre el número de columnas
3. Redistribuye el contenido para aproximarse a esa altura ideal respetando todas las restricciones
4. Repite la redistribución hasta que las alturas convergen o se agota el número máximo de iteraciones
5. Si no se alcanza la convergencia, conserva el mejor resultado intermedio en lugar de producir una maquetación degenerada

### Estructuras de columnas mixtas

No todo el contenido de una página necesita seguir la misma estructura de columnas. Un patrón habitual del diseño editorial consiste en abrir una sección con un párrafo introductorio a ancho completo y, acto seguido, pasar a una maquetación multicolumna para el cuerpo. Otro patrón coloca una imagen o tabla ancha a ancho completo de página, interrumpiendo el flujo multicolumna y reanudándolo debajo. Un tercero emplea una estructura de columna y media en la que la columna lateral estrecha alberga notas al margen, citas destacadas e ilustraciones secundarias.

Postext admite estas estructuras mixtas mediante **sobrescrituras por sección**:

- Cada sección del documento puede especificar su propia configuración de columnas
- Las transiciones entre tipos de sección se gestionan automáticamente
- El motor administra el espacio vertical que consume cada sección y garantiza que el contenido fluya de una a la siguiente
- Las sobrescrituras se aplican de forma declarativa, de manera que el mismo Markdown puede renderizarse distinto en cada dispositivo

## Colocación de recursos

Los recursos son todo lo que no es texto fluido: imágenes, tablas, figuras, citas destacadas, despieces y cualquier otro bloque que interrumpa o acompañe a la narración principal. La manera de colocar esos bloques tiene un efecto desproporcionado en la experiencia lectora, y Postext ofrece un vocabulario para expresar esa intención de colocación a nivel semántico en lugar de a nivel de píxel.

### Estrategias de colocación

En el diseño editorial, los recursos como imágenes, tablas, figuras y citas destacadas no se insertan sin más en el lugar exacto donde se referencian. Se colocan, más bien, siguiendo estrategias que optimizan la calidad visual de la página y la legibilidad del texto circundante. La referencia en el texto es una _pista_ sobre dónde encaja el recurso, no una orden.

Postext admite varias estrategias de colocación:

- **Cabeza de columna** coloca el recurso en la parte superior de la columna actual o de la siguiente disponible
   - Es la estrategia más habitual en la publicación académica y profesional
   - El recurso queda anclado en la cabeza de la columna y el texto fluye debajo
   - Si el recurso no cabe en el espacio restante, se aplaza a la siguiente columna
- **En línea** coloca el recurso en el punto exacto donde se referencia en el texto
   - El flujo textual se interrumpe, se inserta el recurso y el texto se reanuda debajo
   - Es la estrategia más simple, pero puede producir saltos de página incómodos si el recurso cae cerca del final de una columna
- **Flotante a la izquierda y flotante a la derecha** colocan el recurso en el borde izquierdo o derecho de la columna
   - El texto rodea el recurso fluyendo hacia el lado opuesto
   - El recurso puede configurarse para extenderse al medianil o al margen
   - Varios flotantes pueden coexistir en la misma columna si hay espacio suficiente
- **Salto a ancho completo** interrumpe por completo la maquetación de columnas
   - El recurso abarca el ancho completo de la página
   - Todas las columnas por encima y por debajo se sincronizan con él
   - Se usa habitualmente para imágenes grandes, tablas anchas o divisores de sección
- **Margen** coloca el recurso en el margen de la página
   - El recurso se alinea verticalmente con el párrafo que lo referencia
   - Se emplea para pequeñas ilustraciones, iconos o anotaciones complementarias

### Relación de aspecto y dimensionado

Al colocar recursos, Postext respeta la relación de aspecto y ofrece varias opciones de dimensionado:

1. **Tamaño natural** utiliza las dimensiones intrínsecas del recurso
2. **Ancho de columna** escala el recurso para llenar el ancho de una columna
3. **Ancho de expansión** escala el recurso para cubrir un número indicado de columnas, medianiles incluidos
4. **Ancho completo** escala el recurso para ocupar toda el área de texto
5. **Dimensiones personalizadas** permiten indicar valores exactos de ancho y alto

El motor garantiza que los recursos nunca desborden sus contenedores y ajusta el flujo de texto circundante para acomodar las dimensiones finales. Si dos estrategias compiten por el mismo espacio —un flotante a la derecha y una figura en cabeza de columna, por ejemplo—, el motor aplica un orden de prioridad configurable y aplaza la perdedora al siguiente hueco disponible.

## Sistemas de referencias

Los sistemas de referencias son el hilo que conecta la narración principal de una autora o un autor con su aparato erudito, sus comentarios complementarios y su andamiaje bibliográfico. Manejarlos bien es lo que distingue a un documento que se siente como un libro acabado de otro que se siente como un artículo de blog impreso, y es otra área en la que el navegador ha ofrecido históricamente muy poca ayuda.

### Notas al pie

Las notas al pie son una de las funciones más complejas de la tipografía editorial. Una nota al pie debe aparecer al fondo de la columna donde se referencia y el espacio que ocupa debe restarse del área de texto disponible en esa columna. Eso crea un bucle de retroalimentación que un algoritmo de una sola pasada no puede resolver:

- Añadir una nota al pie a una columna reduce el espacio de texto disponible
- Reducir el espacio de texto podría empujar la referencia de la nota a la columna siguiente
- Si la referencia se mueve, la nota debe moverse con ella, cambiando el espacio de texto en ambas columnas
- Cambiar el espacio de texto en la columna siguiente podría, a su vez, empujar otra nota de vuelta a la anterior

Postext gestiona esta complejidad mediante su bucle de convergencia. El motor coloca las notas al pie de forma tentativa, comprueba si sus referencias siguen en la misma columna y ajusta posiciones iterativamente hasta que todo se estabiliza. La configuración de notas al pie incluye:

- **El estilo de marcador** determina cómo se numeran o simbolizan las notas al pie
   - Los números en superíndice son la opción más común
   - Los símbolos como asteriscos, obeliscos y dobles obeliscos resultan tradicionales en algunos contextos
   - Pueden definirse secuencias de marcadores personalizadas para aplicaciones especializadas
- **El separador** es la línea horizontal que se traza entre el área de texto y el área de notas
   - Su ancho, estilo y espaciado son configurables
- **El tamaño de fuente** del texto de nota suele ser menor que el del cuerpo
   - Tamaño, interlínea y espaciado se configuran de forma independiente

### Notas finales

A diferencia de las notas al pie, las notas finales se recopilan y se muestran al final de una sección o al final del documento completo. Son más simples de implementar porque no compiten por espacio con el texto del cuerpo en la misma columna. Aun así, exigen una numeración y unas referencias cruzadas cuidadosas, y deben respetar la estructura de columnas de la sección que las aloja.

Postext admite la recopilación de notas finales tanto por sección como por documento:

- **Notas finales por sección** aparecen al final de cada sección principal, lo que las hace más fáciles de encontrar
- **Notas finales por documento** se recogen al final del todo, siguiendo la convención académica tradicional
- La numeración puede reiniciarse en cada sección o continuar secuencialmente a lo largo de todo el documento
- Las referencias cruzadas entre el cuerpo y el bloque de notas finales se mantienen coherentes a medida que el contenido se mueve durante la convergencia

### Notas al margen

Las notas al margen son anotaciones breves que aparecen en el margen de la página, alineadas verticalmente con el párrafo que las referencia. Se utilizan a menudo en libros de texto, manuales técnicos y ediciones anotadas para aportar contexto complementario sin interrumpir el flujo principal, y son un rasgo definitorio de la maquetación a columna y media que Postext admite de forma nativa.

Postext coloca las notas al margen atendiendo a las siguientes consideraciones:

- La nota se alinea verticalmente con el inicio del párrafo que la referencia
- Si varias notas hacen referencia a párrafos cercanos, se apilan con el espaciado adecuado para evitar solapes
- El ancho disponible del margen determina el ancho máximo del texto de la nota
- Las notas al margen pueden aparecer en el margen izquierdo, en el derecho o alternar entre ambos en páginas enfrentadas

## El Sandbox interactivo

Todo lo descrito hasta aquí puede explorarse ahora mismo sin escribir una sola línea de código. El Sandbox que estás viendo no es una demostración montada sobre Postext; es el propio motor, envuelto en una interfaz de editor familiar diseñada para que experimentar resulte lo más fluido posible. Existe para dos públicos a la vez: quienes desarrollan y evalúan la biblioteca para su próximo proyecto, y quienes diseñan o componen tipográficamente y quieren ver qué hace cada opción de configuración sin necesidad de tocar un repositorio.

### Disposición de la interfaz

El Sandbox sigue un paradigma familiar tipo IDE con tres áreas principales:

- Una **barra de actividad** en el extremo izquierdo para cambiar entre paneles y alojar acciones globales
- Una **barra lateral redimensionable** que aloja el panel activo, ya sea el editor Markdown, el formulario de configuración o la lista de avisos
- Un **viewport** a la derecha con tres pestañas para las salidas Canvas, HTML y PDF

La barra lateral puede plegarse por completo al pulsar sobre el icono del panel activo. La frontera entre la barra lateral y el viewport es arrastrable dentro de un rango razonable, de modo que puedes intercambiar espacio de editor por espacio de previsualización según avanzas.

### La barra de actividad

La barra de actividad reúne botones con icono para cada acción principal del Sandbox. De arriba abajo suelen encontrarse:

1. **Editor Markdown**, que abre o cierra el editor basado en CodeMirror
2. **Configuración**, que abre o cierra el panel de configuración basado en formulario
3. **Avisos**, que abre una lista de problemas semánticos y tipográficos detectados en el documento actual
4. **Recursos**, que abre el panel de gestión de recursos
5. **Exportar**, que descarga el Markdown y la configuración actuales como un único fichero JSON
6. **Importar**, que carga un fichero JSON previamente exportado
7. **Cambio de tema** entre modo oscuro y modo claro
8. **Cambio de idioma** de la interfaz

Pulsar sobre el icono del panel activo pliega la barra lateral, algo útil cuando se quiere maximizar el área de previsualización durante un ajuste fino.

### El panel de configuración

El panel de configuración es un editor en forma de formulario para todo el objeto de configuración de Postext. Los ajustes se agrupan en secciones desplegables, cada una con su propio botón de reinicio que restaura los valores por defecto de esa sección sin alterar el resto del trabajo. Las secciones incluyen actualmente:

- **Página**, para el color de fondo, el preset de tamaño, las dimensiones personalizadas, los márgenes, el DPI, las líneas de corte y la retícula de línea base
- **Maquetación**, para el tipo de columnas, el ancho del medianil, el porcentaje de la columna lateral y las filetes
- **Texto del cuerpo**, para la fuente, el tamaño, la interlínea, el color, la alineación, el peso, la separación silábica y las reglas avanzadas de párrafo como la prevención de huérfanas, viudas y rabos
- **Encabezados**, para los valores por defecto generales más los ajustes por nivel de H1 a H6
- **Listas ordenadas** y **Listas no ordenadas**, para la tipografía específica de cada tipo de lista, incluidos el formato de numeración, los caracteres de viñeta y la sangría francesa
- **Visor HTML**, para los parámetros que gobiernan los modos de renderizado a una y a varias columnas de la salida HTML
- **Depuración**, para las capas que visualizan la retícula de línea base, las líneas sueltas, la sincronización del cursor y otras señales internas
- **Paleta de colores**, para colores con nombre reutilizables en toda la configuración

Los controles son conscientes del contexto: el ancho del medianil sólo aparece cuando se elige una maquetación multicolumna, los ajustes de separación silábica sólo aparecen cuando la alineación del texto lo permite, y varias opciones avanzadas se ocultan tras expansores para que el panel siga resultando abarcable a primera vista.

### Las tres pestañas de salida

El viewport muestra la salida renderizada. Cambiar de pestaña no relanza la maquetación: el mismo VDT alimenta a todos los motores, así que el contenido se mantiene coherente entre modos.

- **Canvas** muestra una vista rasterizada con zoom, ajuste al ancho, ajuste al alto y doble página, con renderizado perezoso para que los documentos largos sigan respondiendo con soltura
- **HTML** renderiza el documento dentro de un Shadow DOM y ofrece un control de escala de fuente más un flujo a una o a varias columnas, útil para revisar cómo sentará el contenido en una aplicación web real
- **PDF** genera un PDF real en el cliente mediante el paquete _postext-pdf_ y lo muestra en el visor nativo del navegador, con acciones de regeneración, descarga e impresión a un clic

Como las tres pestañas comparten una única fuente de verdad, cualquier cambio que hagas en el editor o en el panel de configuración se propaga a todas a la vez. El motor no guarda estado oculto que no puedas ver o exportar.

### Persistencia y compartición

El Sandbox guarda tu trabajo de forma automática en el almacenamiento local del navegador. El contenido Markdown y la configuración se guardan tras alrededor de un segundo de inactividad, y al volver a abrir la página se restaura la sesión anterior. El estado del viewport, como el modo de vista del canvas o el modo de ajuste, se recuerda aparte, y el estado desplegado o plegado de cada sección de configuración se preserva entre visitas.

Para trasladar tu trabajo entre dispositivos o compartir maquetaciones con otras personas, el Sandbox ofrece acciones explícitas de **exportar** e **importar**. El fichero exportado es un documento JSON versionado que contiene tanto el Markdown como la configuración. Puedes commitearlo a un repositorio, adjuntarlo a una incidencia o soltarlo en una conversación de chat, y cualquiera con el Sandbox abierto podrá cargarlo con un solo clic.

## Configuración y personalización

El sistema de configuración es el contrato entre el motor y todo lo que lo utiliza. Comprender su forma es la mejor vía para saber qué está dispuesto a negociar Postext y qué da por fijo, y el objeto que editas desde el panel del Sandbox es el mismo que pasarías a la biblioteca de manera programática en una integración independiente.

### El objeto de configuración

Cada aspecto de la maquetación de Postext puede controlarse a través de un único objeto de configuración exhaustivo. Este objeto está profundamente estructurado, con secciones anidadas para cada área de interés:

- **Configuración de página**
   - Ancho y alto en unidades reales como centímetros, milímetros, pulgadas o puntos
   - Márgenes para cada lado de la página, configurables de forma independiente
   - Ajuste de DPI que controla la resolución para los cálculos basados en píxeles
   - Color de fondo para la superficie de la página
   - Líneas de corte para producción de imprenta, incluidas sangría, longitud de marca, desplazamiento de marca, ancho de marca y color
   - Ajustes de la retícula de línea base, incluidos altura de línea, color y ancho de trazo
- **Configuración de columnas**
   - Número de columnas por página o sección
   - Ancho del medianil entre columnas
   - Apariencia y visibilidad de las filetes
   - Comportamiento y tolerancia del equilibrio
- **Configuración tipográfica**
   - Mínimos de líneas o caracteres para huérfanas, viudas y rabos
   - Idioma de separación silábica, mínimo de caracteres y máximo de guiones consecutivos
   - Modo de espaciado de párrafo, ya sea sangría, espacios verticales o ambos
   - Espaciado por encima y por debajo de cada nivel de encabezado
   - Reglas de agrupación que impiden saltos de página entre elementos relacionados
   - Sangría de primera línea y sangría francesa para párrafos y elementos de lista
- **Configuración de colocación de recursos**
   - Estrategia de colocación por defecto para cada tipo de recurso
   - Comportamiento de dimensionado y dimensiones máximas
   - Espaciado alrededor de los recursos colocados
- **Configuración de referencias**
   - Estilo de marcador y apariencia del separador para notas al pie
   - Modo de recolección y numeración de notas finales
   - Posicionamiento y ancho de las notas al margen
- **Configuración de depuración**
   - Capas para la retícula de línea base, las líneas sueltas, el espacio negativo de página, la sincronización de cursor y la de selección
   - Controles de umbral para la detección de líneas sueltas
   - Activadores individuales para cada categoría de aviso

### Sobrescrituras por sección

Para documentos con maquetaciones variadas, Postext permite **sobrescrituras a nivel de sección** que cambian la configuración en partes concretas del documento:

1. Una página de título podría usar una sola columna con márgenes amplios
2. El cuerpo principal podría usar dos columnas con márgenes estándar
3. Un apéndice podría usar tres columnas estrechas con márgenes mínimos
4. Una sección de imagen a toda página podría carecer por completo de columnas y márgenes
5. Un índice dedicado podría aprovechar una maquetación a columna y media con sangría francesa

Cada sobrescritura indica qué valores de configuración cambian. Los no especificados se heredan de la configuración base. Este enfoque por capas mantiene la configuración manejable incluso en documentos complejos y facilita derivar variantes del mismo documento sin duplicar estado.

### Tamaños preestablecidos y paletas con nombre

Postext incluye un conjunto de **tamaños de página preestablecidos** que corresponden a formatos habituales de libro y documento:

- **11 x 17 cm** para libros de bolsillo pequeños y guías de mano
- **12 x 19 cm** para novelas de bolsillo estándar
- **17 x 24 cm** para manuales técnicos y libros de texto
- **21 x 28 cm** para publicaciones de gran formato y revistas
- **Personalizado** para cualquier formato fuera de norma

Cada preset fija automáticamente el ancho y el alto, pero siempre puedes sobrescribir dimensiones individuales o pasar a valores totalmente personalizados en cualquier momento.

La configuración admite además una **paleta de colores con nombre**. Cualquier color de la configuración puede vincularse a una entrada de la paleta mediante su nombre, de modo que un cambio único en la paleta se propaga a todos los puntos que referencian esa entrada. Así resulta sencillo establecer un pequeño sistema de diseño para una publicación y mantener en sintonía los colores de acento, los colores de filete y los colores de texto gestionados por paleta a medida que el documento evoluciona.

### Avisos y diagnósticos

Junto a la configuración, Postext mantiene un **panel de avisos** que informa de los problemas detectados al maquetar el documento actual. Algunos avisos son tipográficos, otros semánticos y todos apuntan a una línea o elemento concreto para que puedas saltar al origen del problema. Las categorías actuales de aviso incluyen:

- **Fuente ausente** cuando una familia tipográfica configurada no puede cargarse a tiempo
- **Línea suelta** cuando una línea justificada supera un umbral configurable de espaciado entre palabras
- **Jerarquía de encabezados** cuando un nivel de encabezado se salta uno o más niveles intermedios, por ejemplo pasando de H2 a H4
- **Encabezados consecutivos** cuando dos encabezados se suceden sin prosa intermedia, una estructura casi siempre no intencionada
- **Lista después de encabezado** cuando aparece una lista justo debajo de un encabezado sin una frase de transición, otra inconsistencia frecuente en documentación

Cada aviso puede activarse, desactivarse o ajustarse de forma independiente, y cada uno puede resolverse sin salir del Sandbox.

## Visión y hoja de ruta del proyecto

Postext no aspira a ser una plataforma documental universal. Aspira a ser un motor de maquetación editorial para la web realmente, realmente bueno, y su ecosistema circundante es deliberadamente estrecho para que el núcleo se mantenga afilado. Esta sección describe dónde está hoy el proyecto, hacia dónde se dirige a continuación y cómo puedes influir en ese rumbo.

### Una base para el contenido editorial en la web

Postext no pretende sustituir a CSS en la maquetación de aplicaciones. Es una herramienta especializada para una necesidad concreta y desatendida: la presentación de contenido extenso y estructurado con la calidad visual que quien lee espera de publicaciones producidas profesionalmente. El proyecto se propone acercar ese nivel de calidad a quienes desarrollan en la web sin exigirles experiencia en composición tipográfica tradicional y, a la vez, acercarlo a diseñadores y tipógrafas sin exigirles experiencia en JavaScript.

La visión a largo plazo incluye:

- **Maquetaciones editoriales responsivas** que se adapten con inteligencia a distintos tamaños de pantalla, no simplemente replegando el texto a una sola columna sino eligiendo el número de columnas, el tamaño de márgenes y las estrategias de colocación adecuadas para cada viewport
- **Edición colaborativa** en la que quienes escriben redactan contenido en Markdown y quienes diseñan configuran las reglas de maquetación, cada parte trabajando en su área de experiencia
- **Salida accesible** que preserve la estructura semántica y soporte lectores de pantalla, navegación por teclado y modos de alto contraste
- **Paridad entre imprenta y digital**, donde el mismo contenido y configuración produzcan resultados visualmente coherentes tanto en web como en PDF
- **Un estándar abierto** que editoriales, revistas, periódicos, plataformas de libros y equipos de desarrollo en todo el mundo puedan adoptar y ampliar, en vez de otro producto de maquetación propietario más

### Fases de desarrollo

El desarrollo de Postext se organiza en cuatro grandes fases. No son hitos rígidos; describen el orden aproximado en el que cada capacidad se estabiliza y queda lista para uso en producción.

1. **Fundamentos**
   - Estructuras de datos centrales y sistema de tipos
   - Parser de Markdown con extensiones de recursos y notas
   - Maquetación básica a una columna con medición
   - Configuración por defecto y sistema de presets
2. **Maquetación editorial**
   - Flujo multicolumna con reflujo inteligente
   - Equilibrio de columnas con satisfacción de restricciones
   - Colocación de recursos con todas las estrategias soportadas
   - Prevención de huérfanas, viudas y rabos entre columnas y páginas
3. **Tipografía profesional**
   - Separación silábica con patrones Liang específicos por idioma
   - Optimización del margen para texto alineado a la izquierda
   - Justificación Knuth-Plass con penalizaciones editoriales
   - Sistemas de notas al pie, notas finales y notas al margen
   - Reglas avanzadas de espaciado y alineación a la retícula de línea base
   - Citas destacadas, capitulares y elementos decorativos
4. **Salida e integración**
   - Renderizador de canvas para vistas previas rápidas
   - Renderizador web con aislamiento mediante Shadow DOM
   - Renderizador de PDF para producción impresa
   - Sandbox interactivo para experimentación y aprendizaje
   - Sistema de plugins para renderizadores y extensiones personalizadas
   - Documentación, tutoriales y proyectos de ejemplo

## Contribuir al proyecto

Postext es un proyecto de código abierto impulsado por una comunidad y mantenido en GitHub. Acoge contribuciones de quienes desarrollan, diseñan, componen tipográficamente, traducen y de cualquiera a quien le importe el futuro del contenido de largo formato en la web. La coordinación del proyecto se hace a propósito a la luz pública: cada incidencia, cada pull request y cada conversación de diseño transcurren en canales abiertos, de modo que quien llega nuevo puede reconstruir cualquier decisión leyendo su historia.

### Formas de contribuir

Hay muchas maneras de participar, y la mayoría no requieren escribir JavaScript:

- **Reportar problemas** cuando encuentres errores o comportamientos inesperados, siempre que sea posible con una reproducción mínima
- **Sugerir funcionalidades** que harían al motor más útil para tu propio trabajo
- **Contribuir código** cogiendo una incidencia abierta y enviando un pull request, empezando por las etiquetadas como _good first issue_ si eres nuevo en la base de código
- **Mejorar la documentación** escribiendo tutoriales, ejemplos o explicaciones, ya sea en el sitio principal de documentación o como entradas de blog enlazadas desde allí
- **Traducir contenido** a idiomas nuevos para que el motor llegue a comunidades tipográficas más allá del inglés y el español que ya se cubren
- **Compartir tus maquetaciones** para demostrar qué puede hacer Postext e inspirar a otras personas
- **Aportar conocimiento tipográfico**, especialmente para idiomas y sistemas de escritura que aún no están bien representados

### Cómo trabajamos

Toda la coordinación ocurre en GitHub, repartida en tres canales principales:

1. **Incidencias** para reportes de bugs, peticiones de funcionalidades y tareas concretas que alguien pueda adoptar
2. **Pull requests** para contribuciones de código, con revisión a la vista y discusiones preservadas junto al propio código
3. **Debates** para ideas, conversaciones de diseño, preguntas y cualquier cosa que todavía no sea lo bastante concreta como para convertirse en incidencia

Esto es deliberado. Cuando todo vive en un único lugar, cualquiera puede encontrar el contexto detrás de cualquier decisión, quien llega nuevo puede leer la historia y nadie queda fuera de una conversación que haya ocurrido en un canal en el que no estaba.

### Principios

El proyecto se mantiene con un pequeño conjunto de principios que moldean cada decisión:

- **Respetar el oficio.** La tipografía es una disciplina con siglos de sabiduría acumulada, y el motor debe honrarla en vez de reinventarla a peor.
- **Mantener el núcleo afilado.** El motor debe hacer una sola cosa extremadamente bien y resistirse a convertirse en una plataforma documental de propósito general.
- **Preferir estándares abiertos.** Markdown, PDF y los formatos de fuente abiertos deben seguir siendo ciudadanos de primera, y ningún flujo completo debería exigir formatos propietarios.
- **Seguir siendo incrustable.** Postext debe ser una biblioteca que se caiga dentro de una aplicación existente, no un framework que se apropie del proyecto.
- **Documentar todo.** Una función que sólo existe dentro de la implementación es una función que nadie puede usar.

Si algo de todo esto resuena contigo, el repositorio es el mejor paso siguiente. Abre una incidencia, lanza una pregunta en los debates o, simplemente, léete el código y cuéntanos qué podría estar más claro. El proyecto será tan amplio como la comunidad que lo construya.
`;
