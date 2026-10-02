# El banco de baterías {#sec:battery lead="La batería sostiene la cabaña todas las noches y en los días grises en que los paneles casi no producen. Su tamaño es una decisión sobre cuántos de esos días seguidos estás dispuesto a aguantar."}

El campo del @sec:array-size trabaja entre las diez y las cuatro, la cabaña sobre todo de noche, y en un día cubierto de diciembre las 2,8 horas de sol pico de la @fig:sun bajan a media hora o menos. El banco de baterías salva las dos distancias.

## Días de autonomía {#sec:autonomy}

La autonomía es el número de días que el banco puede alimentar la cabaña sin nada de sol. El ejemplo usa tres, lo habitual en un valle con niebla:

:::paragraphs{style="formula"}
3 días × 1160 Wh = 3480 Wh útiles
:::

El consumo diario es el total de la @tbl:loads, sin el margen del @sec:winter-margin (:ref{id="sec:winter-margin" style=page}), que queda en reserva.

## Qué química elegir {#sec:chemistry}

La @tbl:chemistry compara las tres químicas que se venden para instalaciones aisladas pequeñas. Las celdas de litio-ferrofosfato (LiFePO4) admiten descargas hasta el 20 % cada noche durante miles de ciclos. Las de plomo-ácido duran más si nunca bajan de la mitad de su carga, así que la misma energía útil exige un banco un 60 % mayor y cinco veces más pesado.

La ida y vuelta también cuenta. El factor total de 0,79 de la @tbl:losses supone el 0,95 del banco de litio. Con un banco AGM de 0,85 el factor baja a 0,71, y la fórmula del @sec:array-size pide 586 W en lugar de 524 W. Los dos paneles de 310 W siguen bastando, con un margen del 6 % en vez del 18 %. Si cambia la batería, las tablas [-@tbl:losses] y [-@tbl:chemistry] se tienen que leer de nuevo juntas.

La cabaña de ejemplo usa un banco LiFePO4 de 200 Ah a 25,6 V: 5,1 kWh nominales y 4,1 kWh útiles, algo más de tres días.

## Una semana de nubes {#sec:cloud-week}

La @fig:soc sigue el estado de carga del banco durante cinco días de diciembre: uno despejado, tres cubiertos con media hora de sol pico y otro despejado al final. El banco empieza al 80 %, sube al 94 % la primera tarde y luego pierde un 17 % al día, con un bajón cada tarde por el pico de la @fig:profile. En su punto más bajo, la última noche de nubes, conserva el 27 %, por encima del suelo del 20 %.

Ahí se ve el punto débil de dimensionar para el día medio de diciembre. Un día despejado el campo produce unos 1370 Wh después de pérdidas, solo 210 Wh más de lo que gasta la cabaña, así que un banco vaciado por tres días grises tarda unos doce días de sol en llenarse. Un tercer panel, con su propio regulador, sube el sobrante de un día despejado de 210 Wh a unos 900 Wh; un pequeño generador de gasolina con cargador llena el banco en una tarde.
