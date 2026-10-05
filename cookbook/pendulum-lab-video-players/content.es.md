---
title: "Física en el laboratorio"
subtitle: "Cuaderno de prácticas, de 16 a 18 años"
---

# El periodo de un péndulo {kicker="Unidad 4 · Oscilaciones · Práctica 4.2" lead="Dos péndulos de la misma longitud, soltados desde 10° y desde 80°. Cronometra los dos en vídeo y averigua si el periodo depende de la amplitud de la oscilación."}

:::callout{type="aim" title="Objetivo"}
Medir en vídeo el periodo de un péndulo de 1,00 m y ver hasta dónde vale la fórmula de las oscilaciones pequeñas.

**Necesitas** los vídeos, un móvil o una pantalla y una calculadora.
:::

## Los dos vídeos

El :ref{id="small"} y el :ref{id="large"} se generaron a partir de una solución numérica de la ecuación del movimiento del péndulo, θ″ = −(*g*/*L*) sen θ, calculada en pasos de un milisegundo para un péndulo de 1,00 m. Cada uno dura 8,00 s a 25 fotogramas por segundo, así que un fotograma son 0,04 s. El modelo no tiene rozamiento, así que las oscilaciones no se apagan.

La imagen impresa de cada vídeo es su primer fotograma, y el código de la esquina lo abre. Escanéalo con el móvil o mira los vídeos en la edición de pantalla. Los dos se repiten en bucle, empiezan sin sonido y tienen un menú de velocidad: bájala a la mitad para contar.

## Fundamento

Un péndulo simple es una lenteja pequeña y pesada colgada de un hilo ligero que no se estira. Si se aparta y se suelta, oscila a uno y otro lado de su punto más bajo. El **periodo**, *T*, es el tiempo que tarda en ir y volver al punto de partida.

Galileo observó que un péndulo conserva el periodo mientras sus oscilaciones se apagan, y los relojeros se apoyaron en ello durante tres siglos. En oscilaciones pequeñas, el periodo solo depende de la longitud *L* y de la intensidad del campo gravitatorio *g*:

:::paragraphs{style="formula"}
*T*~0~ = 2π (*L*/*g*)^1/2^
:::

Con *L* = 1,00 m y *g* = 9,81 m s^−2^, *T*~0~ vale 2,006 s. Para deducirla se sustituye sen θ por θ en radianes, lo que solo vale con un error menor del 1 % hasta unos 14°. Más allá, la fuerza que devuelve la lenteja al centro crece más despacio que el ángulo, la lenteja se entretiene cerca de los extremos y cada oscilación tarda algo más. Con la amplitud θ~0~, el ángulo desde el que se suelta la lenteja, y *K*, la integral elíptica completa de primera especie, el periodo exacto es

:::paragraphs{style="formula"}
*T* = 4 (*L*/*g*)^1/2^ *K*(sen ½θ~0~)
:::

## Procedimiento

:::callout{type="method"}
1. Reproduce el primer vídeo desde el principio. La lenteja se suelta desde el reposo en el primer fotograma.
2. Cuenta las oscilaciones completas, de ida y vuelta al punto de partida, hasta que el vídeo acaba a los 8,00 s. Estima la última con una precisión de un cuarto de oscilación.
3. Divide 8,00 s entre el número de oscilaciones para obtener el periodo.
4. Repite con el segundo vídeo y completa la tabla.
:::

## Resultados

::resource{id="data"}

Los valores de la :ref{id="periods"} salen de la fórmula exacta, con tres decimales. Compara tus periodos con las filas de 10° y de 80°.

::resource{id="periods"}

## Cuestiones

:::callout{type="sheet"}
1. ¿Qué vídeo tiene el periodo más largo, y en qué porcentaje?

:::callout{type="answer"}
Respuesta
:::space{lines=3}
:::

2. La lenteja del segundo vídeo recorre un arco mucho más largo. ¿Por qué su periodo no crece en la misma proporción?

:::callout{type="answer"}
Respuesta
:::space{lines=4}
:::

3. La primera corrección a la fórmula de las oscilaciones pequeñas da *T* = *T*~0~ (1 + θ~0~^2^/16), con θ~0~ en radianes. Calcúlala para 80° y compárala con la tabla. ¿Basta con un término?

:::callout{type="answer"}
Respuesta
:::space{lines=4}
:::

4. Un reloj de pie oscila 4° a cada lado de la vertical. ¿Necesitaría su relojero la fórmula exacta?

:::callout{type="answer"}
Respuesta
:::space{lines=3}
:::
:::

:::paragraphs{style="colophon"}
Física en el laboratorio, práctica 4.2 · Compuesto en Source Serif 4, Red Hat Display y Red Hat Mono (SIL Open Font License) · Texto y vídeos: Postext Cookbook, CC BY 4.0.
:::
