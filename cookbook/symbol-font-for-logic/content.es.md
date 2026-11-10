---
title: "Cartilla de lógica"
author: "Ignacio Ferro"
---

# Leer los signos {kicker="Cartilla de lógica · Capítulo 1" signs="∀ ∃ → ∈ ∪ ∅ ℵ"}

Una página de lógica parece una página de álgebra que ha perdido los números. Sus letras representan enunciados, objetos y colecciones de objetos, y una docena de signos los mantiene unidos. La mayoría de esos signos es más joven que el teléfono: Giuseppe Peano imprimió el primero de los modernos en 1889, y Gerhard Gentzen añadió el último de los habituales en 1935. Este capítulo los lee uno a uno, en el orden en que los encuentra un primer curso, y da a cada uno su nombre en palabras, para que cualquier fórmula pueda leerse en voz alta como una frase.

## Enunciados y conectivas

Una letra como *p* o *q* representa un enunciado entero, que es verdadero o falso: *llueve*, *el tren llega tarde*. Cinco signos forman enunciados largos a partir de otros más cortos. ¬*p* se lee «no *p*» y es verdadero justo cuando *p* es falso. *p* ∧ *q*, «*p* y *q*», es verdadero cuando lo son los dos. *p* ∨ *q*, «*p* o *q*», es verdadero cuando lo es al menos uno; el signo es una *v* estilizada, por el latín *vel*, la «o» que admite las dos cosas. *p* → *q*, «si *p*, entonces *q*», solo es falso en un caso: cuando *p* es verdadero y *q* es falso. *p* ↔ *q*, «*p* si y solo si *q*», es verdadero cuando los dos lados coinciden.

La tabla 1.1 pone las cinco una junto a otra. Cada fila es una manera en que podría estar el mundo, y cada columna es un enunciado, que se obtiene de las dos letras de la izquierda.

::resource{id="truth"}

La tabla zanja cuestiones en las que la intuición se equivoca. Las filas tercera y cuarta muestran que *p* → *q* es verdadero siempre que *p* es falso, diga lo que diga *q*: una promesa cuya condición nunca se cumplió no se ha roto. La tabla demuestra también las leyes de De Morgan, que convierten la negación de una «o» en una «y» de negaciones, y al revés:

:::paragraphs{style="formula"}
¬(*p* ∨ *q*) ↔ (¬*p* ∧ ¬*q*) \
¬(*p* ∧ *q*) ↔ (¬*p* ∨ ¬*q*)
:::

## Cuantificadores: ∀ y ∃

Las letras de enunciado no ven el interior de un enunciado. *Todos los humanos son mortales* y *Sócrates es humano* no comparten ninguna letra y, sin embargo, juntas dan *Sócrates es mortal*. La lógica de predicados separa un enunciado en un predicado y las cosas de las que se dice: *Hx* para «*x* es humano», *Mx* para «*x* es mortal», *s* para Sócrates. Dos cuantificadores dicen entonces de cuántas cosas vale un predicado. ∀*x*, «para todo *x*», es una A puesta del revés; ∃*x*, «existe un *x*», una E vuelta hacia atrás.

:::paragraphs{style="formula"}
∀*x* (*Hx* → *Mx*) \
*Hs* → *Ms*
:::

La primera línea es la premisa mayor del silogismo más antiguo de los manuales, y la segunda, lo que esa premisa dice de Sócrates en particular. Los dos cuantificadores están ligados por la negación. Negar que todo tenga una propiedad es decir que algo carece de ella, y negar que algo la tenga es decir que todo carece de ella:

:::paragraphs{style="formula"}
¬∀*x* φ ↔ ∃*x* ¬φ \
¬∃*x* φ ↔ ∀*x* ¬φ
:::

Las letras griegas φ y ψ no forman parte del lenguaje de las fórmulas. Cada una representa una fórmula cualquiera, así que cada línea de arriba es un esquema con infinitos casos. Los lógicos reservan el alfabeto griego para hablar de las fórmulas y el latino para las fórmulas mismas. Una gamma mayúscula, Γ, suele nombrar un conjunto de premisas, y Γ ⊢ φ dice que φ se puede deducir de ellas.

## Conjuntos: ∈, ∪, ∩ y ∅

Un conjunto es una colección tomada como un solo objeto. *a* ∈ *A* dice que *a* es elemento de *A*, y *a* ∉ *A*, que no lo es. *A* ⊆ *B* dice que todo elemento de *A* es elemento de *B*; *A* ⊂ *B* añade que *B* tiene algún elemento más. Con las conectivas y los cuantificadores, cada una de estas relaciones se reduce a un enunciado sobre elementos:

:::paragraphs{style="formula"}
*A* ⊆ *B* ↔ ∀*x* (*x* ∈ *A* → *x* ∈ *B*) \
*x* ∈ *A* ∪ *B* ↔ (*x* ∈ *A* ∨ *x* ∈ *B*) \
*x* ∈ *A* ∩ *B* ↔ (*x* ∈ *A* ∧ *x* ∈ *B*)
:::

La unión ∪ se construye sobre la «o», y la intersección ∩, sobre la «y», y las formas dejan ver el parentesco: ∪ se abre hacia arriba como ∨, ∩ hacia abajo como ∧. El conjunto vacío ∅ no tiene elementos, ∀*x* (*x* ∉ ∅), y es subconjunto de cualquier conjunto *A*, porque la condición de ∀*x* (*x* ∈ ∅ → *x* ∈ *A*) no se cumple nunca.

No toda condición define un conjunto. En junio de 1902, Bertrand Russell escribió a Gottlob Frege sobre la colección de todos los conjuntos que no son elementos de sí mismos. Llamémosla *R*. Si *R* ∈ *R*, *R* no cumple su propia condición, luego *R* ∉ *R*; si *R* ∉ *R*, la cumple, luego *R* ∈ *R*. El sistema de Frege admitía *R*, y con ella *R* ∈ *R* ↔ *R* ∉ *R*, una contradicción. Las teorías de conjuntos que se enseñan hoy no dejan que una colección así sea un conjunto.

## Contar el infinito: ℵ

Dos conjuntos tienen el mismo tamaño cuando sus elementos pueden emparejarse uno a uno. Los números naturales, ℕ, y los números pares se emparejan llevando cada *n* a 2*n*, de modo que un conjunto infinito puede ser tan grande como una parte de sí mismo. Georg Cantor designó el tamaño de ℕ con ℵ~0~, alef cero, la primera letra del alfabeto hebreo, y demostró en 1891 que los números reales no pueden emparejarse con ℕ: cualquier lista de ellos deja alguno fuera. Hay, por tanto, al menos dos tamaños infinitos, y sus alefs ℵ~0~, ℵ~1~, ℵ~2~ los nombran por orden.

## De dónde vienen los signos

Los signos de este capítulo llegaron a la imprenta uno a uno y de manos distintas; la tabla 1.2 dice quién puso en uso cada uno.

::resource{id="signs"}

:::paragraphs{style="colophon"}
Compuesto en Crimson Pro, Cormorant Garamond e IBM Plex Sans Condensed, con los signos de Noto Sans Math (SIL Open Font License) · Texto: original, CC BY 4.0.
:::
