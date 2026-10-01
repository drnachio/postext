---
title: "Corte óptimo de líneas en el navegador"
author: "Irene Valcárcel, Tomás Brandt y Aiko Nwosu"
---

# Corte óptimo de líneas en el navegador: \\ cuánto cuesta y cuándo compensa {style="paper" venue="DocWeb ’26 · Taller de Ingeniería Documental para la Web" a1="Irene Valcárcel\nDpto. de Ciencias de la Computación\nUniversidad de Almenara\nAlmenara, España\nivalcarcel@almenara.example" a2="Tomás Brandt\nGrupo de Composición Tipográfica\nNorthgate College\nDunmore, Reino Unido\ntbrandt@northgate.example" a3="Aiko Nwosu\nEscuela de Diseño\nHarrow Hill Institute\nHarrow Hill, Canadá\nanwosu@harrowhill.example"}

:::callout{type="abstract"}
***Resumen*—**Los navegadores cortan el texto justificado línea a línea, y las líneas flojas que eso deja son la principal queja contra el texto justificado en pantalla. El método de ajuste total que usa TeX elige a la vez los cortes de todo el párrafo y evita la mayoría, pero se lo considera demasiado lento para una página que se recompone cada vez que cambia de tamaño. Compusimos un corpus de 2400 párrafos en cuatro lenguas a seis anchos de columna con ambos métodos, con un programa que se ejecuta en el navegador, y medimos el tiempo por párrafo y el espaciado de cada línea. El ajuste total tardó 0,21 ms por párrafo en un portátil de gama media, 3,4 veces lo que tarda el primer ajuste, y redujo la proporción de líneas cuyos espacios se estiran más de una vez y media su ancho natural del 11,8 % al 1,9 %. La mejora es mayor en columnas estrechas y en alemán. Concluimos que el coste es asumible para un texto que se compone una vez por cambio de tamaño, y damos una regla para saber cuándo basta con el primer ajuste.

***Palabras clave*—**corte de líneas, justificación, división silábica, composición tipográfica, navegadores web, rendimiento
:::

## Introducción {#sec:intro}

El navegador corta un párrafo justificado línea a línea. Cada línea toma tantas palabras como caben, y el espacio sobrante se reparte entre ellas. El método es rápido y previsible, y explica la mala fama del texto justificado en la web, con sus calles y sus líneas flojas: una línea seguida de una palabra larga tiene que llenar con espacio el hueco de esa palabra, y nada de lo que hay antes en el párrafo puede ayudarla.

Los impresores disponen de un método mejor desde hace cuarenta años. @knuthplass1981 tratan el párrafo como un todo. Cada corte posible es un nodo de un grafo, cada línea una arista con su peso, y los cortes elegidos son los del camino de menor penalización total, de modo que una línea algo apretada al principio puede ahorrar otra muy floja más adelante. Los patrones de división de Liang, el trabajo de Plass sobre el corte de páginas y el propio TeX salieron del mismo proyecto de Stanford [@liang1983; @plass1981; @knuth1984], y el método sigue siendo la referencia con la que se juzga cualquier otro.

No ha llegado al navegador. La razón que suele darse es la velocidad: una página que se recompone cada vez que la ventana cambia de tamaño no puede permitirse una búsqueda en cada párrafo. Ponemos a prueba esa razón. La :ref{id="sec:related"} sitúa la cuestión entre los trabajos anteriores, la :ref{id="sec:method"} describe el corpus y el banco de medida, y la :ref{id="sec:results"}, en la :ref{id="sec:results" style=page}, da los resultados. La :ref{id="sec:discussion"} los convierte en una regla que un diseñador de páginas puede aplicar.

## Trabajos relacionados {#sec:related}

@knuthplass1981 describieron el algoritmo de ajuste total por completo, con el modelo de cajas, pegamento y penalizaciones que conservaron las implementaciones posteriores. En el peor caso la búsqueda es cuadrática, pero un corte factible solo puede caer a menos de una línea del anterior, y en la práctica la lista de cortes candidatos se mantiene corta. Los autores dan tiempos para un ordenador central de la época; no conocemos ninguna medida en un motor de navegador moderno.

La división de palabras es la otra mitad del problema. Los patrones de @liang1983 encuentran la mayoría de los cortes admisibles de una palabra inglesa con una tabla de unos pocos miles de entradas, y en ellos se basan los diccionarios de división que todavía incluyen navegadores y procesadores de texto. Un algoritmo de ajuste total que no puede dividir palabras pierde casi toda su ventaja en columnas estrechas, y por eso medimos las dos cosas juntas.

La práctica tipográfica fija el objetivo. @bringhurst2004 pide una medida de 45 a 75 caracteres y considera los espacios que se abren más allá de su ancho natural la primera señal de un párrafo mal compuesto. Los estudios de lectura sugieren por qué: el ojo avanza en sacadas de siete a nueve caracteres, y una textura irregular cambia el punto donde cae [@rayner1998]. En pantalla, @dyson2001 observaron que la longitud de línea afecta de modo distinto a la velocidad y a la comprensión, lo que aconseja no juzgar una maqueta por un solo número. Aquí medimos el espaciado de las líneas y no la lectura, que dejamos para un trabajo posterior.

## Método {#sec:method}

El corpus tiene 2400 párrafos, 600 en cada lengua (inglés, español, alemán y francés), tomados de novelas y ensayos de dominio público. Se descartaron los párrafos de menos de cuatro líneas en la medida más ancha, porque un párrafo tan corto deja poco que elegir.

Cada párrafo se compuso a seis anchos de columna, de 30 a 80 caracteres de la letra del texto, con dos algoritmos: el primer ajuste, que toma la línea más larga que cabe, y el ajuste total descrito en [-@knuthplass1981]. Los dos usaron los mismos patrones de Liang para cada lengua, el mismo pegamento (un espacio de un tercio de cuadratín que puede estirarse la mitad y encogerse un tercio) y la misma letra, medida una vez por palabra con la API de texto del canvas. El programa que lo hace se ejecuta en el navegador, sin servidor.

En cada composición registramos el tiempo de corte del párrafo, sin contar la medida de las palabras, que ambos métodos comparten, y la razón de estiramiento de cada línea salvo la última. Una línea cuya razón pasa de 1,5 cuenta como floja. Los tiempos son de un portátil con un procesador de gama media de 2023, en la versión estable de tres navegadores, con cada párrafo medido cincuenta veces tras diez de calentamiento.

## Resultados {#sec:results}

El ajuste total tardó de media 0,21 ms por párrafo, frente a 0,062 ms del primer ajuste: una razón de 3,4. La razón creció con el ancho de la columna, de 2,6 a 30 caracteres a 4,1 a 80, porque una línea más ancha admite más cortes candidatos. El párrafo más lento, uno alemán de 31 líneas a 80 caracteres, tardó 1,9 ms. Un artículo largo de 120 párrafos se corta en unos 25 ms, muy por debajo del tiempo que un navegador se concede para responder a un cambio de tamaño.

El espaciado mejoró en todas las lenguas y en todos los anchos. En el conjunto del corpus, la proporción de líneas flojas bajó del 11,8 % al 1,9 %. En columnas de 30 a 40 caracteres, la medida de una página a dos columnas en un teléfono, bajó del 27 % al 4,6 %. El alemán fue el que más ganó, del 16,3 % al 2,2 %, porque sus compuestos largos dejan al primer ajuste las decisiones más difíciles; el inglés, el que menos, del 8,9 % al 1,6 %. El número de líneas con división aumentó en una quinta parte con el ajuste total, que acepta un guion donde así se ahorra una línea floja más abajo.

A partir de 70 caracteres, el primer ajuste dejó flojas menos del 4 % de sus líneas en todas las lenguas. Con esa medida la diferencia entre los métodos apenas se ve en la página, y un lector que viera juntas las dos composiciones de un mismo párrafo rara vez sabría decir cuál es cuál.

## Discusión {#sec:discussion}

El ajuste total cuesta unas décimas de milisegundo por párrafo, y el texto de una página corriente se corta en menos tiempo del que el navegador tarda en pintarla. Para un texto que se compone una vez y después se lee, como un artículo, un capítulo de libro o una ponencia como esta, el coste no es un argumento en contra. La edición en vivo es otro caso: allí solo hay que volver a cortar el párrafo que se edita, y el tiempo de un párrafo es pequeño.

Los resultados dan también una regla para saber cuándo basta con el primer ajuste. En una sola columna de 70 caracteres o más, el lector rara vez encontrará una línea floja con cualquiera de los dos métodos, y el diseñador que no puede elegir el algoritmo pierde poco. En columnas estrechas, y en lenguas de palabras largas, la diferencia es grande y se ve, y el ajuste total con división de palabras es el método que hay que pedir. Coincide con el consejo de los impresores [@bringhurst2004, cap. 2], que prefieren componer en bandera una columna estrecha antes que justificarla sin cuidado.

## Conclusión

Medimos en un navegador el coste de cortar párrafos como lo hace TeX y resultó pequeño: 0,21 ms por párrafo, 3,4 veces lo que cuesta el método del propio navegador, a cambio de seis veces menos líneas flojas. La objeción al ajuste total en pantalla descansa en la velocidad, y con el equipo actual la velocidad ya no la sostiene.

## Agradecimientos {style="back"}

Los autores agradecen sus comentarios al borrador a los lectores del comité de DocWeb ’26. Compuesto en STIX Two Text y Schibsted Grotesk (SIL OFL). Texto: original, CC BY 4.0. Los autores, las instituciones y las medidas son inventados para este ejemplo.

## Referencias {style="back"}

:::bibliography{title=""}

:::references{format=bibtex}
@article{knuthplass1981,
  author = {Knuth, Donald E. and Plass, Michael F.}, title = {Breaking paragraphs into lines},
  journal = {Software: Practice and Experience}, volume = 11, number = 11,
  pages = {1119--1184}, year = 1981, doi = {10.1002/spe.4380111102}}
@phdthesis{liang1983,
  author = {Liang, Franklin Mark}, title = {Word Hy-phen-a-tion by Com-put-er},
  school = {Stanford University}, address = {Stanford, CA}, year = 1983}
@phdthesis{plass1981,
  author = {Plass, Michael Frederick},
  title = {Optimal Pagination Techniques for Automatic Typesetting Systems},
  school = {Stanford University}, address = {Stanford, CA}, year = 1981}
@book{knuth1984,
  author = {Knuth, Donald E.}, title = {The {TeX}book}, publisher = {Addison-Wesley},
  address = {Reading, MA}, year = 1984}
@book{bringhurst2004,
  author = {Bringhurst, Robert}, title = {The Elements of Typographic Style}, edition = {3rd},
  publisher = {Hartley \& Marks}, address = {Point Roberts, WA}, year = 2004}
@article{rayner1998,
  author = {Rayner, Keith},
  title = {Eye movements in reading and information processing: 20 years of research},
  journal = {Psychological Bulletin}, volume = 124, number = 3, pages = {372--422}, year = 1998,
  doi = {10.1037/0033-2909.124.3.372}}
@article{dyson2001,
  author = {Dyson, Mary C. and Haselgrove, Mark},
  title = {The influence of reading speed and line length on the effectiveness of reading from screen},
  journal = {International Journal of Human-Computer Studies}, volume = 54, number = 4,
  pages = {585--612}, year = 2001, doi = {10.1006/ijhc.2001.0458}}
:::
