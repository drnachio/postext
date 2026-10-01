# El campo solar {#sec:array lead="Los paneles se dimensionan para diciembre, cuando los días son cortos y el sol va bajo. En verano el mismo campo produce el doble de lo que la cabaña necesita, y ese es el precio de un invierno que funciona."}

El @sec:load terminó con un consumo diario de 1160 Wh, el total de la @tbl:loads. Este capítulo busca el campo de paneles que entrega esa energía en un día medio de diciembre, después de todas las pérdidas entre el panel y el enchufe.

## Horas de sol por mes {#sec:sun-hours}

La radiación que recibe un lugar se expresa en horas de sol pico: las horas a una intensidad estándar de 1000 W/m² que darían la misma energía que el día entero. Un panel de 300 W produce unos 300 Wh por cada hora de sol pico, antes de pérdidas. Las cifras salen de una base de datos solar para las coordenadas del lugar y la inclinación de los paneles; la @fig:sun las da para la cabaña de ejemplo, a 42° N y con los paneles inclinados 60°.

Una inclinación fuerte cede algo de producción en verano a cambio del sol bajo del invierno. Aun así, diciembre rinde la mitad que julio: 2,8 horas de sol pico frente a 5,6. Diciembre es, por tanto, el mes de diseño, y todos los cálculos de este capítulo usan su cifra.

## Pérdidas entre el panel y el enchufe {#sec:losses}

Cada etapa de la cadena se queda una parte, y las partes se multiplican. La @tbl:losses las recoge para la instalación de ejemplo.

La mayor pérdida es la del inversor, y solo afecta a los consumos de 230 V. En una cabaña donde el frigorífico, la bomba y las luces funcionen a 24 V, el factor total sube de 0,79 a cerca de 0,85. La parte de la batería es su pérdida de ida y vuelta, la energía que entra y no vuelve a salir; es pequeña en las celdas de litio y mayor en las de plomo, como explica el @sec:chemistry en la :ref{id="sec:chemistry" style=page}.

## El tamaño del campo {#sec:array-size}

El campo tiene que producir el consumo diario, dividido por el factor de pérdidas, en las horas de sol pico de diciembre:

:::paragraphs{style="formula"}
1160 Wh ÷ (2,8 h × 0,79) = 524 W
:::

El ejemplo usa dos paneles de 310 W en serie, 620 W en total, que dejan un margen del 18 % para un panel envejecido, una quincena nublada o un consumo que ha crecido.

Los paneles trabajan de día y la cabaña gasta de noche (@fig:profile); la batería que media entre ambos es el asunto del @sec:battery.
