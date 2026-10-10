---
title: "Galerada"
subtitle: "Cuadernos de composición · n.º 12"
author: "Galerada"
---

# El problema de los ríos {kicker="Galerada · n.º 12 · Justificación" standfirst="En una columna estrecha y justificada, los espacios entre palabras son lo primero que se abre. Cómo un algoritmo que sopesa el párrafo entero mantiene uniforme el gris, y los ocho ajustes que lo gobiernan."}

Sostén una página de periódico con el brazo extendido y entorna los ojos. En una buena columna, el texto se vuelve un gris uniforme. En una mala, unos canales pálidos la recorren de arriba abajo, de un hueco al de la línea siguiente. Los tipógrafos los llaman ríos, o calles. Se forman cuando los espacios se abren en varias líneas a la vez y coinciden en vertical, y nada los abre tanto como una medida estrecha.

En una columna de cuarenta caracteres, cada línea tiene cinco o seis espacios entre palabras. Si una palabra larga pasa a la línea siguiente, esos pocos espacios se reparten todo su ancho, y cada uno puede llegar al doble. Si la columna mide el doble, lo reparten el doble de espacios y cada uno crece la mitad.

## Cajas y cola

En 1981, Donald E. Knuth y Michael F. Plass describieron un párrafo tal como todavía lo ve TeX. Las palabras son cajas de ancho fijo. Los espacios son cola: tienen un ancho natural y un límite a lo que pueden estirarse o encogerse. Las penalizaciones marcan los puntos donde una línea puede terminar, y su precio: acabar en guion cuesta algo; entre dos palabras, nada. El dibujo que abre el artículo muestra una línea en esos términos, medida y compuesta, con su cola estirada hasta llenar la medida.

Después, el algoritmo pone precio a cada línea según lo que se ha movido su cola, lo eleva al cubo, para que una línea muy floja cueste más que varias un poco flojas, y le suma las penalizaciones. De todos los cortes posibles del párrafo, se queda con el de menor coste total, sumadas todas sus líneas.

## Línea a línea o en bloque

El método antiguo, el del primer ajuste, sobrevive en la web. Llena cada línea con las palabras que caben y pasa a la siguiente sin volver atrás, así que meter ahora una palabra corta más puede dejar la línea siguiente con un hueco imposible de cerrar. El del párrafo entero afloja un poco una línea para ahorrarle un hueco a la siguiente. Repetido a lo largo de una columna, ese intercambio deja menos líneas flojas que el primer ajuste y, con ellas, menos huecos que se alineen en ríos.

## Límites para la cola

La cola tiene dos límites: cada espacio puede encogerse hasta el 80 % de su ancho natural y crecer hasta el 160 %. Si se estrechan, el algoritmo se queda sin maneras de llenar la línea; si se aflojan, el ojo ve los huecos. Pasado el límite superior, cada estirón cuesta más que un guion o una línea final corta, así que el algoritmo prueba antes otra salida: partir una palabra o llevarla a otra línea.

:::callout{type="settings"}
minWordSpacing: 0.8

maxWordSpacing: 1.6
:::

:::callout{type="bench" title="Banco de pruebas · un párrafo, tres ajustes"}
:::columns{count=2 breaks="3"}
:::callout{type="ragged" title="bandera · textAlign: 'left'"}
Si no se parten las palabras, unos pocos espacios cargan con todo lo que una medida estrecha no admite. Partirlas permite cortar también dentro de una palabra, y la holgura se reparte en ajustes tan pequeños que no se notan.
:::

:::callout{type="unhyphenated" title="justificado · hyphenation: false"}
Si no se parten las palabras, unos pocos espacios cargan con todo lo que una medida estrecha no admite. Partirlas permite cortar también dentro de una palabra, y la holgura se reparte en ajustes tan pequeños que no se notan.
:::

:::callout{type="justified" title="justificado · hyphenation: true"}
Si no se parten las palabras, unos pocos espacios cargan con todo lo que una medida estrecha no admite. Partirlas permite cortar también dentro de una palabra, y la holgura se reparte en ajustes tan pequeños que no se notan.
:::

Las mismas palabras, compuestas de tres maneras en una medida algo más estrecha que estas columnas. En bandera solo se cortan entre palabras, si no pides otra cosa. Justificadas y sin partir, unos pocos espacios cargan con toda la holgura. Con partición, los espacios se igualan a cambio de unos cuantos guiones.
:::
:::

## Partir palabras

La separación silábica le da al algoritmo más puntos donde terminar una línea, y en una medida estrecha es imprescindible. Postext usa los patrones de TeX del idioma del documento, indicado con un código exacto: *es* en esta edición y *en-us* en la inglesa. Con un código sin patrones, como *eu-ES*, recurre al inglés estadounidense y da aviso. Los patrones solo actúan en texto justificado: en bandera, las líneas se cortan entre palabras y una columna estrecha queda muy desigual.

## Viudas y huérfanas

Una primera línea sola al pie de una columna y una última línea sola en la cabeza de la siguiente son la pareja que los manuales prohíben, aunque nadie se ha puesto de acuerdo en cuál es la viuda. Postext lo resuelve por posición: avoidWidows actúa al pie de cada columna, y avoidOrphans, en su cabeza.

:::callout{type="settings"}
widowPenalty: 1000

orphanPenalty: 1000

slackWeight: 10
:::

Cada regla es un precio que el algoritmo compara con el blanco que dejaría cumplirla. Una línea sola cuesta su penalización, y las líneas vacías que un corte dejaría al pie de la columna cuestan diez veces el cuadrado de su número. Gana lo más barato.

Una línea corta es una última línea que no llega a sostenerse sola: una palabra, o el final de una, bajo un párrafo lleno. Postext le pone precio dentro del algoritmo de corte, así que gana el juego de cortes que baje una segunda palabra, si los límites lo permiten. Si no lo permite ninguno, compone el párrafo con una línea menos: aprieta los espacios y, si hace falta, las letras, sin pasar de diez milésimas de cuadratín.

:::callout{type="settings"}
runtMinCharacters: 20

runtPenalty: 1000

maxRuntTracking: 10
:::

## Lo que el ojo perdona

Una palabra larga aún puede hacer que una línea de una columna estrecha quede algo más floja que sus vecinas, y un párrafo que ha de acabar en algún sitio a veces acaba en una línea corta. El algoritmo puede pasar de una línea a otra el espacio que sobra, pero no quitarlo. Junto a una palabra larga, lo reparte entre cinco líneas en vez de dejarlo entero en un solo hueco, que se vería incluso con el brazo extendido.

Una línea que aún se abre más de la cuenta queda para el corrector, que casi siempre la cierra con cambiar una palabra de la frase por otra más corta o más larga.

:::paragraphs{style="colophon"}
Galerada se compone en Petrona, Bricolage Grotesque y Source Code Pro (SIL Open Font License). Texto y diagrama: originales, CC BY 4.0.
:::
