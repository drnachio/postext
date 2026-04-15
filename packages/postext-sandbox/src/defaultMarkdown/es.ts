export const DEFAULT_MARKDOWN_ES = `---
title: "Postext: El Tipógrafo Programable para la Web"
subtitle: "Un motor de maquetación de código abierto para tipografía editorial"
author: "Ignacio Ferro"
publishDate: "2026-04-14"
---

# Postext: El Tipógrafo Programable para la Web

Postext es un **motor de maquetación de código abierto** diseñado para llevar la sofisticación de la tipografía profesional de imprenta al desarrollo web moderno. Durante siglos, el mundo del diseño editorial ha perfeccionado técnicas para colocar texto, imágenes y anotaciones en una página con extraordinaria precisión. Estas técnicas abarcan desde el cuidadoso equilibrio de columnas hasta la meticulosa prevención de huérfanas y viudas, desde la separación silábica inteligente hasta la elegante colocación de notas al pie. Hasta ahora, la web no ha contado con una herramienta capaz de reproducir estos estándares de manera programable y declarativa.

La misión fundamental de Postext es cerrar esa brecha. Toma **contenido semántico** escrito en Markdown enriquecido y lo transforma en una maquetación completamente resuelta donde cada elemento tiene una posición precisa, medida en unidades tipográficas reales. Esta maquetación puede entonces renderizarse en múltiples formatos de salida, incluyendo páginas web interactivas y documentos PDF listos para impresión.

## El Problema que Postext Resuelve

### Las Limitaciones de CSS para la Maquetación Editorial

El CSS moderno es una herramienta extraordinariamente potente para construir interfaces de usuario. Flexbox, Grid y las consultas de contenedor otorgan a los desarrolladores un control detallado sobre cómo se disponen los componentes en pantalla. Sin embargo, CSS fue diseñado principalmente para _maquetación de aplicaciones_, no para _maquetación editorial_. Existe una diferencia fundamental entre ambas:

- **La maquetación de aplicaciones** organiza componentes interactivos como botones, formularios, barras de navegación y tarjetas dentro de un viewport por el que el usuario puede desplazarse
- **La maquetación editorial** organiza texto fluido, imágenes, tablas, figuras y anotaciones a lo largo de una serie de páginas o columnas de dimensiones fijas, siguiendo reglas tipográficas estrictas heredadas de siglos de tradición impresa

CSS maneja el primer caso de forma brillante. Para el segundo, se queda corto en aspectos críticos:

1. **Sin flujo de texto multicolumna nativo con conciencia de reflow**
   - La propiedad CSS _columns_ existe, pero no puede equilibrar la altura de las columnas de forma inteligente
   - No puede manejar recursos que abarquen columnas o floten a posiciones específicas dentro de una cuadrícula de columnas
   - No proporciona un mecanismo para mantener los encabezados junto con sus párrafos siguientes
2. **Sin prevención de huérfanas y viudas entre columnas**
   - Aunque CSS tiene las propiedades _orphans_ y _widows_, el soporte en navegadores es inconsistente
   - Estas propiedades no funcionan a través de los límites de las columnas de la manera que los tipógrafos profesionales esperan
   - La prevención de grado editorial requiere conocimiento de la geometría completa de la página, no solo de un único contenedor de texto
3. **Sin estrategias integradas de colocación de recursos**
   - Las maquetaciones impresas colocan rutinariamente figuras en la parte superior de la siguiente columna disponible, o las flotan en el margen, o las rompen a lo largo del ancho completo de la página
   - Los floats de CSS son primitivos comparados con estas estrategias y no pueden negociar con el flujo de texto circundante
4. **Sin sistemas de notas al pie ni notas marginales**
   - Las notas al pie en imprenta aparecen en la parte inferior de la columna donde se referencian, consumiendo espacio del área de texto superior
   - Las notas marginales se alinean verticalmente con el párrafo que las referencia
   - CSS no ofrece ningún mecanismo para ninguna de las dos

### Lo que las Herramientas Existentes no Cubren

Existen, por supuesto, herramientas que abordan partes de este problema. Los procesadores de texto como Microsoft Word y Google Docs manejan la paginación básica. Las aplicaciones de autoedición como Adobe InDesign proporcionan control editorial completo. LaTeX es el estándar de referencia para la composición tipográfica académica. Sin embargo, ninguna de estas herramientas está diseñada para la web:

- No producen maquetaciones _responsivas_ que se adapten a diferentes tamaños de pantalla
- No se integran con frameworks frontend modernos como React o Vue
- No pueden incrustarse como un componente dentro de una aplicación web más grande
- Su salida es estática, no interactiva

Postext ocupa una posición única en este panorama. Es una **biblioteca JavaScript** que se ejecuta en el navegador, toma Markdown como entrada, aplica reglas tipográficas profesionales y produce un componente React como salida. Está diseñada para ser incrustada, configurada y extendida por desarrolladores web que desean resultados de calidad editorial sin abandonar su cadena de herramientas habitual.

## Cómo Funciona Postext

### El Pipeline de Procesamiento

El motor de maquetación de Postext procesa el contenido a través de un pipeline cuidadosamente orquestado. Cada etapa se construye sobre los resultados de la anterior, transformando gradualmente el Markdown sin procesar en una maquetación completa y medida con precisión. Comprender este pipeline es clave para entender la filosofía de diseño del proyecto.

#### Capa de Entrada

El proceso comienza con la **capa de entrada**, donde el desarrollador proporciona dos cosas:

1. **Contenido** en formato Markdown enriquecido
   - El cuerpo principal del texto, escrito usando la sintaxis estándar de Markdown
   - Encabezados, párrafos, listas, énfasis y otro formato en línea
   - Marcadores especiales que referencian recursos externos o notas
2. **Configuración** que define las reglas de maquetación
   - Dimensiones de la página, márgenes y ajustes de DPI
   - Cantidad de columnas, ancho de medianil y preferencias de equilibrio
   - Reglas tipográficas para prevención de huérfanas, prevención de viudas y separación silábica
   - Estrategias de colocación de recursos para imágenes, tablas y figuras
   - Configuración del sistema de referencias para notas al pie, notas finales y notas marginales

La separación entre contenido y configuración es deliberada e importante. El mismo documento Markdown puede producir maquetaciones radicalmente diferentes simplemente cambiando la configuración. Una maquetación de una sola columna para pantallas móviles, una maquetación de dos columnas para tablets y una maquetación de tres columnas para monitores de escritorio amplios pueden originarse del mismo texto fuente.

#### Capa de Medición

Antes de que el motor pueda decidir dónde colocar cada elemento, debe saber cuánto espacio ocupa cada uno. Este es el papel de la **capa de medición**, que está construida sobre una biblioteca llamada _pretext_.

El desafío de la medición es significativo. La renderización de texto es compleja porque el ancho y la altura de un párrafo dependen de la fuente, el tamaño de la fuente, la altura de línea, el ancho disponible, las reglas de separación silábica y muchos otros factores. Tradicionalmente, la única forma de medir texto con precisión en un navegador es renderizarlo en el DOM y leer las dimensiones calculadas. Este enfoque es lento, ya que desencadena reflows de maquetación que pueden bloquear el hilo principal durante cientos de milisegundos.

Postext adopta un enfoque fundamentalmente diferente. La biblioteca _pretext_ realiza **medición de texto sin DOM** utilizando métricas tipográficas del canvas y aritmética pura. Esta técnica es entre 300 y 600 veces más rápida que la medición basada en DOM. Funciona de la siguiente manera:

1. Cargando métricas tipográficas desde la API del canvas
   - Anchos de glifos y métricas de avance
   - Mediciones de ascendentes y descendentes
   - Ajustes de pares de kerning cuando están disponibles
2. Calculando los saltos de línea mediante el algoritmo de Knuth-Plass
   - Evaluando todos los posibles puntos de quiebre en un párrafo
   - Eligiendo el conjunto de quiebres que minimiza una función de penalización
   - Teniendo en cuenta las oportunidades de separación silábica
3. Calculando las dimensiones del bloque resultante
   - Altura total incluyendo todas las líneas y el espaciado interlineal
   - Ancho máximo de línea para propósitos de alineación
   - Posiciones de línea base para la alineación con la cuadrícula

Este enfoque de medición es la innovación crítica que hace que Postext sea práctico. Sin él, el motor necesitaría realizar miles de reflows del DOM durante el cálculo de la maquetación, haciendo imposible la edición interactiva.

#### Motor de Maquetación

El **motor de maquetación** es el corazón de Postext. Toma los elementos medidos y los dispone en páginas y columnas de acuerdo con las reglas configuradas. Aquí es donde reside la inteligencia editorial.

El motor de maquetación opera de forma iterativa. Realiza una pasada inicial de colocación y luego refina el resultado a través de iteraciones sucesivas, ajustando las posiciones de los elementos para satisfacer restricciones que pueden entrar en conflicto entre sí. Por ejemplo:

- Un encabezado debe mantenerse junto con su párrafo siguiente, lo que podría requerir mover ambos a la siguiente columna
- Mover contenido a la siguiente columna podría crear una viuda en la columna actual
- Eliminar esa viuda podría requerir traer contenido de vuelta, lo que podría romper la restricción encabezado-párrafo

Estas dependencias circulares se resuelven mediante un **bucle de convergencia** que ejecuta hasta cinco iteraciones. En la práctica, la mayoría de las maquetaciones convergen en dos o tres iteraciones. El motor detecta cuando no se pueden realizar más mejoras y se detiene anticipadamente.

El motor de maquetación produce una estructura de datos que describe la posición exacta y las dimensiones de cada elemento en cada página. Esta estructura es independiente del formato, lo que significa que contiene geometría pura sin información específica de renderización.

#### Capa de Salida

La etapa final es la **capa de salida**, que toma la geometría abstracta y la renderiza en un formato específico:

- **Renderizador web** produce elementos HTML con posicionamiento CSS preciso
   - Cada elemento se posiciona de forma absoluta dentro de su contenedor de página
   - El texto se renderiza con tamaños de fuente, alturas de línea y posiciones de línea base exactos
   - El resultado es un componente React que puede incrustarse en cualquier aplicación web
- **Renderizador PDF** produce documentos listos para imprimir
   - Utiliza los mismos datos geométricos que el renderizador web
   - Genera salida basada en vectores adecuada para la impresión profesional
   - Preserva todos los detalles tipográficos incluyendo las posiciones exactas de los caracteres

## Características Tipográficas

### Prevención de Huérfanas y Viudas

En la tipografía profesional, una **huérfana** es una sola línea de un párrafo que aparece aislada en la parte superior de una columna o página, separada del resto de su párrafo. Una **viuda** es una sola línea que aparece aislada en la parte inferior de una columna o página. Ambas se consideran defectos tipográficos graves porque interrumpen el ritmo visual del texto y dificultan que los lectores mantengan su fluidez de lectura.

Postext proporciona prevención configurable de huérfanas y viudas:

- El ajuste de _orphans_ especifica el número mínimo de líneas que deben aparecer al comienzo de un párrafo antes de un salto de columna
- El ajuste de _widows_ especifica el número mínimo de líneas que deben aparecer al final de un párrafo después de un salto de columna
- El motor ajustará los saltos de columna, moverá contenido entre columnas e incluso modificará los saltos de línea dentro de los párrafos para satisfacer estas restricciones
- Cuando las restricciones entran en conflicto, el motor utiliza un sistema de prioridades para determinar qué regla tiene precedencia

### Separación silábica y optimización del margen

La **separación silábica** es la práctica de dividir palabras en los límites silábicos cuando caen al final de una línea. Una separación silábica adecuada mejora la uniformidad de las longitudes de línea y reduce la perturbación visual causada por grandes espacios entre palabras en el texto justificado.

Postext soporta la separación silábica a través de diccionarios configurables:

- Patrones de separación silábica específicos por idioma que definen los puntos de quiebre válidos dentro de las palabras
- Conteos mínimos de caracteres antes y después del guion para prevenir quiebres inconvenientes
- Máximo de líneas consecutivas con separación silábica para evitar un efecto de escalera que distraiga en el margen derecho
- Valores de penalización de separación silábica que influyen en el algoritmo de Knuth-Plass al elegir entre un quiebre por sílaba y una línea más holgada

La **optimización del margen derecho** se refiere al suavizado del borde derecho del texto alineado a la izquierda, que se denomina _rag_. Un margen derecho sin optimizar puede parecer irregular, con líneas cortas seguidas de líneas largas en un patrón errático. Postext optimiza el margen derecho mediante:

1. Evaluación de la calidad visual del margen derecho a lo largo de múltiples líneas
2. Ajuste del espaciado entre palabras dentro de límites aceptables
3. Elección de puntos de quiebre que produzcan un margen derecho que varíe gradualmente en lugar de uno abrupto
4. Consideración de la separación silábica como herramienta para suavizar el margen derecho, no solo para ajustar líneas

### Espaciado y Ritmo

El espaciado vertical en la tipografía editorial sigue reglas estrictas que mantienen el ritmo visual de la página. Postext aplica estas reglas a través de su sistema de configuración:

- **Espaciado de encabezados** controla la distancia por encima y por debajo de los encabezados de cada nivel
   - Los encabezados más grandes reciben más espacio por encima para separarlos visualmente de la sección anterior
   - El espacio debajo de un encabezado es menor que el espacio por encima, creando una conexión visual entre el encabezado y su contenido
- **Espaciado de párrafos** puede configurarse como sangría o como espacios verticales
   - La tipografía de libros tradicional utiliza sangría de primera línea sin espacio vertical entre párrafos
   - La tipografía digital moderna suele usar espacios verticales sin sangría
   - Postext soporta ambos enfoques y permite mezclarlos
- **Espaciado de listas** controla la distancia entre elementos de la lista y entre niveles anidados
   - Los elementos dentro de una lista pueden estar espaciados de forma compacta o holgada
   - Las listas anidadas pueden tener sangría adicional y diferentes estilos de viñeta en cada nivel
- **Alineación a la cuadrícula de línea base** ajusta el texto a una cuadrícula vertical regular
   - Esto asegura que el texto en columnas adyacentes se alinee horizontalmente
   - Crea una sensación de orden y estabilidad en toda la página
   - Los elementos que rompen la cuadrícula, como los encabezados con tamaños de fuente más grandes, pueden configurarse para realinearse con la cuadrícula después

## Maquetación Basada en Columnas

### Flujo de Texto Multicolumna

Una de las características más distintivas de la maquetación editorial es el uso de múltiples columnas. Las columnas sirven a varios propósitos en la tipografía profesional:

- Mantienen las longitudes de línea dentro del rango óptimo para la comodidad de lectura, que se considera generalmente entre 45 y 75 caracteres por línea
- Permiten que más texto aparezca en una sola página sin requerir un tamaño de fuente incómodamente pequeño
- Crean variedad visual y estructura en la página
- Proporcionan oportunidades para la colocación sofisticada de recursos

Postext soporta configuraciones multicolumna flexibles:

1. **La cantidad de columnas** puede establecerse en cualquier entero positivo
   - Maquetaciones de una sola columna para viewports estrechos o lectura enfocada
   - Maquetaciones de dos columnas para artículos y ensayos
   - Tres o más columnas para boletines, revistas y materiales de referencia
2. **El ancho del medianil** controla el espacio entre columnas
   - Medianiles más anchos hacen que las columnas se sientan más independientes
   - Medianiles más estrechos permiten más texto por página pero requieren un separador visual
3. **Las líneas de columna** son líneas verticales opcionales dibujadas entre columnas
   - Su grosor, estilo y color son configurables
   - Ayudan a los lectores a distinguir entre columnas cuando los medianiles son estrechos
4. **El cruce de columnas** permite que ciertos elementos rompan la cuadrícula de columnas
   - Un encabezado podría abarcar dos de tres columnas
   - Una figura podría abarcar el ancho completo de la página
   - Una cita destacada podría flotar a través del medianil entre dos columnas

### Equilibrio de Columnas

Cuando el texto fluye a través de múltiples columnas, las columnas a menudo terminan a diferentes alturas. La última columna de una página podría contener solo unas pocas líneas mientras las demás están llenas. Esto se ve inacabado y poco profesional.

El **equilibrio de columnas** es el proceso de distribuir el texto uniformemente entre las columnas para que terminen aproximadamente a la misma altura. Este es un problema computacional sorprendentemente difícil porque:

- Mover texto entre columnas cambia los saltos de línea, lo que cambia la altura de cada columna
- Las figuras y otros elementos no textuales tienen alturas fijas que no pueden dividirse
- Las notas al pie asociadas con texto en una columna deben aparecer en la parte inferior de esa misma columna, consumiendo espacio
- Las restricciones de huérfanas y viudas pueden impedir ciertas distribuciones

Postext aborda el equilibrio de columnas mediante refinamiento iterativo:

1. Primero, llena las columnas secuencialmente para establecer una distribución base
2. Luego, calcula la altura ideal de columna dividiendo la altura total del contenido por el número de columnas
3. Redistribuye el contenido para acercarse a esta altura ideal, respetando todas las restricciones
4. Repite la redistribución hasta que las alturas de las columnas convergen o se alcanza el número máximo de iteraciones

### Estructuras de Columnas Mixtas

No todo el contenido de una página necesita seguir la misma estructura de columnas. Un patrón común en el diseño editorial es comenzar una sección con un párrafo introductorio a ancho completo, y luego hacer la transición a una maquetación multicolumna para el texto del cuerpo. Otro patrón coloca una imagen o tabla ancha a lo largo del ancho completo de la página, interrumpiendo el flujo multicolumna y reanudándolo debajo.

Postext soporta estas estructuras mixtas a través de **sobrecargas de sección**:

- Cada sección de un documento puede especificar su propia configuración de columnas
- Las transiciones entre tipos de sección se manejan automáticamente
- El motor gestiona el espacio vertical consumido por cada sección y asegura que el contenido fluya correctamente de una a la siguiente

## Colocación de Recursos

### Estrategias de Colocación

En el diseño editorial, los recursos como imágenes, tablas, figuras y citas destacadas no se insertan simplemente de forma inline en el punto donde se referencian. En su lugar, se colocan de acuerdo con estrategias que optimizan la calidad visual de la página y la legibilidad del texto circundante.

Postext soporta varias estrategias de colocación:

- **Parte superior de la columna** coloca el recurso en la parte superior de la columna actual o la siguiente disponible
   - Esta es la estrategia más común en publicaciones académicas y profesionales
   - El recurso se ancla en la parte superior de la columna y el texto fluye debajo
   - Si el recurso es demasiado alto para el espacio restante, se aplaza a la siguiente columna
- **En línea** coloca el recurso en el punto exacto donde se referencia en el texto
   - El flujo de texto se interrumpe, el recurso se inserta y el texto se reanuda debajo
   - Esta es la estrategia más simple pero puede llevar a saltos de página incómodos si el recurso cae cerca del final de una columna
- **Flotante izquierdo y flotante derecho** colocan el recurso en el borde izquierdo o derecho de la columna
   - El texto se envuelve alrededor del recurso, fluyendo hacia el lado opuesto
   - El recurso puede configurarse para extenderse hacia el medianil o el margen
   - Múltiples flotantes pueden coexistir en la misma columna si hay suficiente espacio
- **Quiebre a ancho completo** interrumpe la maquetación de columnas completamente
   - El recurso abarca el ancho completo de la página
   - Todas las columnas por encima y por debajo del recurso se sincronizan
   - Esto se usa comúnmente para imágenes grandes, tablas anchas o divisores de sección
- **Margen** coloca el recurso en el margen de la página
   - El recurso se alinea verticalmente con el párrafo que lo referencia
   - Esto se usa para pequeñas ilustraciones, iconos o anotaciones complementarias

### Relación de Aspecto y Dimensionado

Al colocar recursos, Postext preserva las relaciones de aspecto y proporciona múltiples opciones de dimensionado:

1. **Tamaño natural** utiliza las dimensiones intrínsecas del recurso
2. **Ancho de columna** escala el recurso para llenar el ancho de una sola columna
3. **Ancho de expansión** escala el recurso para abarcar un número especificado de columnas incluyendo medianiles
4. **Ancho completo** escala el recurso para llenar toda el área de texto
5. **Dimensiones personalizadas** permiten al desarrollador especificar valores exactos de ancho y alto

El motor asegura que los recursos nunca desborden sus contenedores y ajusta el flujo de texto circundante para acomodar las dimensiones finales.

## Sistemas de Referencias

### Notas al Pie

Las notas al pie son una de las características más complejas de la tipografía editorial. Una nota al pie debe aparecer en la parte inferior de la columna donde se referencia, y el espacio que ocupa debe restarse del área de texto disponible en esa columna. Esto crea un bucle de retroalimentación:

- Agregar una nota al pie a una columna reduce el espacio de texto disponible
- Reducir el espacio de texto podría empujar la referencia de la nota al pie a la siguiente columna
- Si la referencia se mueve, la nota al pie debe moverse con ella, cambiando el espacio de texto en ambas columnas

Postext maneja esta complejidad a través de su bucle de convergencia. El motor coloca las notas al pie provisionalmente, verifica si sus referencias todavía están en la misma columna y ajusta las posiciones iterativamente hasta que todo se estabiliza.

La configuración de notas al pie incluye:

- **Estilo de marcador** determina cómo se numeran o simbolizan las notas al pie
   - Los números en superíndice son la opción más común
   - Símbolos como asteriscos, óbelos y dobles óbelos son tradicionales en algunos contextos
   - Se pueden definir secuencias de marcadores personalizadas para aplicaciones especializadas
- **Separador** es la línea horizontal dibujada entre el área de texto y el área de notas al pie
   - Su ancho, estilo y espaciado son configurables
- **Tamaño de fuente** para el texto de las notas al pie es típicamente menor que el texto del cuerpo
   - El tamaño, la altura de línea y el espaciado son configurables de forma independiente

### Notas Finales

A diferencia de las notas al pie, las notas finales se recopilan y muestran al final de una sección o al final del documento completo. Son más simples de implementar porque no compiten por espacio con el texto del cuerpo en la misma columna. Sin embargo, todavía requieren numeración y referencias cruzadas cuidadosas.

Postext soporta la recopilación de notas finales tanto por sección como por documento:

- **Notas finales por sección** aparecen al final de cada sección principal, haciéndolas más fáciles de encontrar para los lectores
- **Notas finales por documento** se recopilan al final, siguiendo la convención académica tradicional
- La numeración puede reiniciarse en cada sección o continuar secuencialmente a lo largo del documento completo

### Notas Marginales

Las notas marginales son anotaciones breves que aparecen en el margen de la página, alineadas verticalmente con el párrafo que las referencia. Se usan comúnmente en libros de texto, manuales técnicos y ediciones anotadas para proporcionar contexto complementario sin interrumpir el flujo principal del texto.

Postext coloca las notas marginales con las siguientes consideraciones:

- La nota se alinea verticalmente con el inicio del párrafo que la referencia
- Si múltiples notas referencian párrafos que están cerca entre sí, las notas se apilan con el espaciado apropiado para evitar superposiciones
- El ancho disponible del margen determina el ancho máximo del texto de la nota
- Las notas marginales pueden aparecer en el margen izquierdo, el margen derecho, o alternar entre ambos en páginas enfrentadas

## Configuración y Personalización

### El Objeto de Configuración

Cada aspecto de la maquetación de Postext puede controlarse a través de un único objeto de configuración integral. Este objeto está profundamente estructurado, con secciones anidadas para cada área de interés:

- **Configuración de página**
   - Ancho y alto en unidades reales como centímetros, milímetros, pulgadas o puntos
   - Márgenes para cada lado de la página, configurables de forma independiente
   - Ajuste de DPI que controla la resolución para cálculos basados en píxeles
   - Color de fondo para la superficie de la página
   - Líneas de corte para producción de impresión
   - Ajustes de la cuadrícula de línea base incluyendo altura de línea y color de la cuadrícula
- **Configuración de columnas**
   - Número de columnas por página o sección
   - Ancho del medianil entre columnas
   - Apariencia y visibilidad de las líneas de columna
   - Comportamiento y tolerancia del equilibrio
- **Configuración tipográfica**
   - Conteos mínimos de líneas para huérfanas y viudas
   - Idioma de separación silábica, caracteres mínimos y máximo de guiones consecutivos
   - Modo de espaciado de párrafos, ya sea sangría o espacios verticales
   - Espaciado de encabezados por encima y por debajo de cada nivel
   - Reglas de agrupación que previenen saltos de página entre elementos relacionados
- **Configuración de colocación de recursos**
   - Estrategia de colocación predeterminada para cada tipo de recurso
   - Comportamiento de dimensionado y dimensiones máximas
   - Espaciado alrededor de los recursos colocados
- **Configuración de referencias**
   - Estilo de marcador de notas al pie y apariencia del separador
   - Modo de recopilación y numeración de notas finales
   - Posicionamiento y ancho de notas marginales

### Sobrecargas de Sección

Para documentos con maquetaciones variadas, Postext permite **sobrecargas a nivel de sección** que cambian la configuración para partes específicas del documento:

1. Una página de título podría usar una sola columna con márgenes amplios
2. El cuerpo principal podría usar dos columnas con márgenes estándar
3. Un apéndice podría usar tres columnas estrechas con márgenes mínimos
4. Una sección de imagen a página completa podría no tener columnas ni márgenes

Cada sobrecarga de sección especifica qué valores de configuración cambiar. Los valores no especificados se heredan de la configuración base. Este enfoque por capas mantiene la configuración manejable incluso para documentos complejos.

### Tamaños Predefinidos

Postext incluye un conjunto de **tamaños de página predefinidos** que corresponden a formatos comunes de libros y documentos:

- **11 x 17 cm** para libros de bolsillo pequeños y guías de bolsillo
- **12 x 19 cm** para libros de bolsillo de ficción estándar
- **17 x 24 cm** para libros de texto y manuales técnicos
- **21 x 28 cm** para publicaciones de gran formato y revistas
- **Personalizado** para cualquier formato no estándar

Cada tamaño predefinido establece automáticamente el ancho y la altura, pero el desarrollador puede sobrescribir dimensiones individuales o cambiar a valores completamente personalizados en cualquier momento.

## Visión del Proyecto y Hoja de Ruta

### Una Base para el Contenido Editorial en la Web

Postext no pretende reemplazar CSS para la maquetación de aplicaciones. Es una herramienta especializada para una necesidad específica y desatendida, concretamente la presentación de contenido largo y estructurado con la calidad visual que los lectores esperan de publicaciones producidas profesionalmente. El proyecto tiene como objetivo hacer que este nivel de calidad sea accesible para los desarrolladores web sin requerir experiencia en composición tipográfica tradicional.

La visión a largo plazo incluye:

- **Maquetaciones editoriales responsivas** que se adapten inteligentemente a diferentes tamaños de pantalla, no simplemente refluyendo el texto en una sola columna, sino eligiendo cantidades de columnas, tamaños de margen y estrategias de colocación de recursos apropiados para cada viewport
- **Edición colaborativa** donde los autores escriben contenido en Markdown y los diseñadores configuran las reglas de maquetación, cada uno trabajando en su área de experiencia
- **Salida accesible** que preserve la estructura semántica y soporte lectores de pantalla, navegación por teclado y modos de alto contraste
- **Paridad entre impresión y digital** donde el mismo contenido y configuración produzcan resultados visualmente consistentes tanto en formato web como PDF

### Fases de Desarrollo

El desarrollo de Postext está organizado en cuatro fases principales:

1. **Fundamentos**
   - Estructuras de datos centrales y sistema de tipos
   - Parser de Markdown con extensiones de recursos y notas
   - Maquetación básica de una sola columna con medición
   - Configuración predeterminada y sistema de presets
2. **Maquetación Editorial**
   - Flujo de texto multicolumna con reflow inteligente
   - Equilibrio de columnas con satisfacción de restricciones
   - Colocación de recursos con todas las estrategias soportadas
   - Prevención de huérfanas y viudas entre columnas y páginas
3. **Tipografía Profesional**
   - Separación silábica con diccionarios específicos por idioma
   - Optimización del margen derecho para texto alineado a la izquierda
   - Sistemas de notas al pie, notas finales y notas marginales
   - Reglas avanzadas de espaciado y alineación a la cuadrícula de línea base
   - Citas destacadas, capitulares decorativas y elementos ornamentales
4. **Salida e Integración**
   - Renderizador web con posicionamiento CSS preciso
   - Renderizador PDF para producción de impresión
   - Sandbox interactivo para experimentación y aprendizaje
   - Sistema de plugins para renderizadores y extensiones personalizadas
   - Documentación, tutoriales y proyectos de ejemplo

### Contribuir al Proyecto

Postext es un proyecto de código abierto que da la bienvenida a contribuciones de desarrolladores, diseñadores y tipógrafos. Hay muchas formas de participar:

- **Reportar incidencias** cuando se encuentren errores o comportamientos inesperados
- **Sugerir funcionalidades** que harían el motor más útil para las necesidades de cada uno
- **Contribuir código** tomando una incidencia abierta y enviando un pull request
- **Mejorar la documentación** escribiendo tutoriales, ejemplos o explicaciones
- **Compartir maquetaciones** para demostrar lo que Postext puede hacer e inspirar a otros

El proyecto se mantiene con un compromiso con la calidad, la claridad y el respeto por la larga tradición de artesanía tipográfica que busca llevar a la web.
`;
