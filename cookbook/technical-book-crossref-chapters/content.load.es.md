# El consumo diario {#sec:load lead="Todos los componentes de una instalación aislada se dimensionan a partir de un solo número: la energía que gasta la cabaña en un día de invierno. Si ese número está mal, nada de lo que venga después lo arregla."}

Una instalación solar para una cabaña se calcula al revés. Se empieza por los enchufes, se suma lo que la cabaña consume en un día y solo entonces se decide cuántos paneles y cuántas baterías hacen falta para dar esa energía en el peor mes del año. Este capítulo llega a ese número: 1159 vatios hora al día, que el resto del libro redondea a 1160. El @sec:array lo convierte en paneles, y el @sec:battery, en baterías.

El ejemplo es una cabaña de piedra de 48 m² a 1100 m de altitud, en un valle orientado al sudeste, que se usa todos los fines de semana y tres semanas en invierno. La calefacción y la cocina son de leña y de butano; la electricidad mueve las luces, un frigorífico, una bomba de agua, un portátil y un rúter.

## La lista de consumos {#sec:load-list}

Recorre la cabaña con una libreta y apunta todo lo que se enchufa o va cableado, con su potencia en vatios y las horas que funciona en un día de invierno. La potencia figura en la placa de características o en el manual; para cualquier aparato con motor o compresor, un medidor de enchufe que se deja un día entero da una cifra más fiel que la placa. La @tbl:loads es la lista de la cabaña de ejemplo.

Dos líneas de la tabla se olvidan con facilidad. El inversor, que convierte los 24 V de la batería en los 230 V de los enchufes, consume 8 W desde que se enciende, haya algo enchufado o no: en un día suma más que las luces. El rúter también pasa la noche encendido. A los dos les conviene un temporizador o un interruptor junto a la puerta, y el ahorro se calcula en el @sec:winter-margin.

La cifra del frigorífico pide cuidado. Un arcón de 100 litros consume 55 W mientras funciona el compresor, y en una cabaña fresca el compresor trabaja unas cinco horas de cada veinticuatro. En agosto puede llegar a nueve, pero agosto no es el mes que dimensiona la instalación, como muestra el @sec:sun-hours en la :ref{id="sec:sun-hours" style=page}.

## Cuándo se gasta la energía {#sec:load-profile}

El total dice cuánta energía necesita la cabaña, no cuándo. La @fig:profile reparte esos mismos 1160 Wh entre las horas de un día de invierno. El frigorífico, el rúter y el inversor forman un suelo de unos 27 W que nunca desaparece. El portátil añade un bloque por la mañana, y la tarde trae el mayor consumo del día, cuando las luces, el ventilador de la estufa y la bomba coinciden después de la puesta de sol.

Ese pico de la tarde pesa más de lo que parece. Casi todo cae cuando ya no hay sol, así que nada de él puede salir directamente de los paneles: lo pone la batería y se le devuelve al día siguiente. El banco de baterías del @sec:autonomy se dimensiona justo para eso, y para los días en que el sol no lo devuelve.

## El margen de invierno {#sec:winter-margin}

Una lista hecha en octubre es una suposición sobre enero. En pleno invierno las luces están encendidas más tiempo, en Año Nuevo vienen invitados y siempre hay alguien que trae un secador de pelo. En lugar de inflar cada línea de la @tbl:loads, conviene que la lista sea honrada y añadir el margen una sola vez, al final, donde se vea.

Para una cabaña de fin de semana basta un margen del 15 %, y el ejemplo lo saca de los propios consumos en vez de sumarlo encima: apagar el inversor y el rúter por la noche ahorra 8 W y 8 W durante diez horas, 160 Wh al día, casi el 14 % del total. La instalación se calcula para los 1160 Wh completos, y la costumbre del interruptor junto a la puerta es el margen.

Fijado el consumo, falta saber cuánto puede cubrir el sol en el mes más oscuro. De eso se ocupa el @sec:array, que parte de las horas de sol del lugar, en la :ref{id="sec:sun-hours" style=page}.
