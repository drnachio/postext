# Vectores {style="cap-es-2" splash="El poste indicador da información sobre las distancias y direcciones a las ciudades o a otros lugares en relación con la ubicación del poste. La distancia es una cantidad escalar. Para llegar a la ciudad no basta con conocer la distancia, sino que también hay que saber la dirección desde el poste indicador hasta la ciudad. La dirección, junto con la distancia, es una cantidad vectorial comúnmente llamada vector de desplazamiento. Por lo tanto, el poste indicador da información sobre los vectores de desplazamiento desde el poste hasta las ciudades (créditos: modificación de la obra de ”studio tdes”/Flickr, thedailyenglishshow.com)."}

:::callout{type="esquema" title="Esquema del capítulo"}
2.1 Escalares y vectores
2.2 Sistemas de coordenadas y componentes de un vector
2.3 Álgebra de vectores
2.4 Productos de los vectores
:::

Los vectores son esenciales para la física y la ingeniería. Muchas magnitudes físicas fundamentales son vectores, como el desplazamiento, la velocidad, la fuerza y los campos vectoriales eléctricos y magnéticos. Los productos escalares de los vectores definen otras magnitudes físicas escalares fundamentales, como la energía. Los productos vectoriales de los vectores definen otras magnitudes físicas vectoriales fundamentales, como el torque y el momento angular. En otras palabras, los vectores son un componente de la física del mismo modo que las frases son un componente de la literatura.

En la física introductoria, los vectores son cantidades euclidianas, que tienen representaciones geométricas como flechas en una dimensión (en una línea), en dos dimensiones (en un plano) o en tres dimensiones (en el espacio). Se pueden sumar, restar o multiplicar. En este capítulo, exploramos elementos del álgebra vectorial para aplicaciones en mecánica y en electricidad y magnetismo. Las operaciones vectoriales también tienen numerosas generalizaciones en otras ramas de la física.

## Escalares y vectores

:::callout{type="objetivos" title="Objetivos de aprendizaje"}
- Describir la diferencia entre cantidades vectoriales y escalares.
- Identificar la magnitud y la dirección de un vector.
- Explicar el efecto de multiplicar una cantidad vectorial por un escalar.
- Describir cómo se suman o restan cantidades vectoriales unidimensionales.
- Explicar la construcción geométrica para la suma o la resta de vectores en un plano.
- Distinguir entre una ecuación vectorial y una ecuación escalar.
:::

Muchas magnitudes físicas conocidas pueden especificarse completamente con un solo número y la unidad apropiada. Por ejemplo, "un periodo de clase dura 50 min" o "el tanque de gasolina de mi auto tiene capacidad de 65 L" o "la distancia entre dos postes es de 100 m". La cantidad física que puede especificarse completamente de esta manera se denomina **cantidad escalar**. Escalar es sinónimo de "número". El tiempo, la masa, la distancia, la longitud, el volumen, la temperatura y la energía son ejemplos de cantidades **escalares**.

Las cantidades escalares que tienen las mismas unidades físicas pueden sumarse o restarse según las reglas habituales del álgebra de los números. Por ejemplo, una clase que termina 10 min antes de los 50 min dura $50\,\text{min}-10\,\text{min}=40\,\text{min}$. Del mismo modo, una porción de 60 calorías (cal) de maíz seguida de una porción de 200 calorías de donas da $60\,\text{cal}+200\,\text{cal}=260\,\text{cal}$ de energía. Cuando multiplicamos una cantidad escalar por un número, obtenemos la misma cantidad escalar, pero con un valor mayor (o menor). Por ejemplo, si el desayuno de ayer tenía 200 cal de energía y el de hoy tiene cuatro veces más energía que ayer, entonces el desayuno de hoy tiene $4(200\,\text{cal})=800\,\text{cal}$ de energía. Dos cantidades escalares también pueden multiplicarse o dividirse entre sí para formar una cantidad escalar derivada. Por ejemplo, si un tren recorre una distancia de 100 km en 1,0 h, su rapidez es de 100,0 km/1,0 h = 27,8 m/s, donde la rapidez es una cantidad escalar derivada que se obtiene al dividir la distancia entre el tiempo.

Sin embargo, muchas cantidades físicas no pueden describirse completamente con un solo número de unidades físicas. Por ejemplo, cuando los guardacostas estadounidenses envían un barco o un helicóptero para una misión de rescate, el equipo de rescate debe conocer, no solo la distancia a la que se encuentra la señal de socorro, sino también la dirección de la que procede esta para poder llegar a su origen lo antes posible. Las cantidades físicas que se especifican completamente con un número de unidades (magnitud) y una dirección se llaman **cantidades vectoriales**. Algunos ejemplos de cantidades vectoriales son el desplazamiento, la velocidad, la posición, la fuerza y el torque. En el lenguaje matemático, las cantidades físicas vectoriales se representan mediante objetos matemáticos, denominados **vectores** (:ref{id="es-2-cnx-uphysics-02-01-dog"}). Podemos sumar o restar dos vectores, y podemos multiplicar un vector por un escalar o por otro vector, pero no podemos dividir por un vector. La operación de división por un vector no está definida.

Examinemos el álgebra vectorial con un método gráfico para conocer los términos básicos y desarrollar una comprensión cualitativa. En la práctica, sin embargo, cuando se trata de resolver problemas de física, utilizamos métodos analíticos, que veremos en la siguiente sección. Los métodos analíticos son más sencillos desde el punto de vista computacional y más precisos que los métodos gráficos. A partir de ahora, para distinguir entre una cantidad vectorial y una escalar, adoptamos la convención común de que una letra en negritas con una flecha encima denota un vector, y una letra sin flecha denota un escalar. Por ejemplo, una distancia de 2,0 km, que es una cantidad escalar, se denota por *d* = 2,0 km, mientras que un desplazamiento de 2,0 km en alguna dirección, que es una cantidad vectorial, se denota por $\vec{d}$.

Supongamos que le dice a un amigo con el que está de acampada que ha descubierto un estupendo agujero para pescar a 6 km de su carpa. Es poco probable que su amigo encuentre el agujero con facilidad, a menos que también le comunique la dirección en la que se encuentre con respecto a su campamento. Puede decir, por ejemplo, "camine unos 6 km al noreste de mi carpa". El concepto clave aquí es que hay que dar no uno, sino *dos* datos: la distancia o magnitud (6 km) *y* la dirección (noreste).

Desplazamiento es un término general que se utiliza para describir un *cambio de posición*, por ejemplo, durante un viaje desde la carpa hasta el agujero de pesca. El desplazamiento es un ejemplo de cantidad vectorial. Si se camina desde la carpa (lugar *A*) hasta el agujero (lugar *B*), como se muestra en la :ref{id="es-2-cnx-uphysics-02-01-hole"}, el vector $\vec{D}$, que representa su **desplazamiento**, se dibuja como la flecha que se origina en el punto *A* y termina en el punto *B*. La punta de la flecha marca el final del vector. La dirección del vector de desplazamiento $\vec{D}$ es la dirección de la flecha. La longitud de la flecha representa la **magnitud** *D* del vector $\vec{D}$. Aquí, *D* = 6 km. Como la magnitud de un vector es su longitud, que es un número positivo, la magnitud también se indica al colocar la notación de valor absoluto alrededor del símbolo que denota el vector; por lo tanto, podemos escribir de forma equivalente que $D\equiv |\vec{D}|$. Para resolver un problema vectorial gráficamente, necesitamos dibujar el vector $\vec{D}$ a escala. Por ejemplo, si suponemos que 1 unidad de distancia (1 km) está representada en el dibujo por un segmento de línea de longitud *u* = 2 cm, entonces el desplazamiento total en este ejemplo está representado por un vector de longitud $d=6u=6(2\,\text{cm})=12\,\text{cm}$, como se muestra en la :ref{id="es-2-cnx-uphysics-02-01-vector01"}. Observe que aquí, para evitar confusiones, utilizamos $D=6\,\text{km}$ para denotar la magnitud del desplazamiento real y *d* = 12 cm para denotar la longitud de su representación en el dibujo.

Supongamos que su amigo camina desde el campamento en *A* hasta el estanque de pesca en *B* y luego regresa: desde el estanque de pesca en *B* hasta el campamento en *A*. La magnitud del vector de desplazamiento ${\vec{D}}_{AB}$ de *A* a *B* es igual a la magnitud del vector de desplazamiento ${\vec{D}}_{BA}$ de *B* a *A* (es igual a 6 km en ambos casos), por lo que podemos escribir ${D}_{AB}={D}_{BA}$. Sin embargo, el vector ${\vec{D}}_{AB}$ *no* es igual al vector ${\vec{D}}_{BA}$ porque estos dos vectores tienen direcciones diferentes: ${\vec{D}}_{AB}\ne {\vec{D}}_{BA}$. En la :ref{id="es-2-cnx-uphysics-02-01-hole"}, el vector ${\vec{D}}_{BA}$ se representaría mediante un vector con origen en el punto *B* y final en el punto *A*, lo cual indica que el vector ${\vec{D}}_{BA}$ apunta al suroeste, que es exactamente $180\text{°}$ opuesto a la dirección del vector ${\vec{D}}_{AB}$. Diremos que el vector ${\vec{D}}_{BA}$ es **antiparalelo** al vector ${\vec{D}}_{AB}$ y escribimos ${\vec{D}}_{AB}=\text{−}{\vec{D}}_{BA}$, donde el signo menos indica la dirección antiparalela.

Se dice que dos vectores que tienen direcciones idénticas son **vectores paralelos**, es decir, que son *paralelos* entre sí. Dos vectores paralelos $\vec{A}$ y $\vec{B}$ son iguales, indicado por $\vec{A}=\vec{B}$, si y solo si tienen magnitudes iguales $|\vec{A}|=|\vec{B}|$. Se dice que dos vectores con direcciones perpendiculares entre sí son **vectores ortogonales**. Estas relaciones entre vectores se ilustran en la :ref{id="es-2-cnx-uphysics-02-01-vector02"}.

:::callout{type="comprobacion" title="Compruebe lo aprendido"}
Dos lanchas a motor llamadas *Alice* y *Bob* se desplazan por un lago. Dada la información sobre sus vectores de velocidad en cada una de las siguientes situaciones, indique si sus vectores de velocidad son iguales o no. (a) *Alice* se desplaza hacia el norte a 6 nudos y *Bob* se desplaza hacia el oeste a 6 nudos. (b) *Alice* se desplaza hacia el oeste a 6 nudos y *Bob* se desplaza hacia el oeste a 3 nudos. (c) *Alice* se desplaza hacia el noreste a 6 nudos y *Bob* se desplaza hacia el sur a 3 nudos. (d) *Alice* se desplaza hacia el noreste a 6 nudos y *Bob* se desplaza hacia el suroeste a 6 nudos. (e) *Alice* se desplaza hacia el noreste a 2 nudos y *Bob* se acerca a la costa hacia el noreste a 2 nudos.

**Respuesta.** a. no son iguales porque son ortogonales; b. no son iguales porque tienen magnitudes diferentes; c. no son iguales porque tienen magnitudes y direcciones diferentes; d. no son iguales porque son antiparalelos; e. son iguales.
:::

### Álgebra de vectores en una dimensión

Los vectores pueden multiplicarse por escalares, sumarse a otros vectores o restarse de otros. Podemos ilustrar estos conceptos vectoriales con un ejemplo de excursión de pesca, que se ve en la :ref{id="es-2-cnx-uphysics-02-01-fishtrip"}.

Supongamos que su amigo parte del punto *A* (el campamento) y camina en dirección al punto *B* (el estanque de pesca), pero, por el camino, se detiene a descansar en algún punto *C* situado a tres cuartas partes de la distancia entre *A* y *B*, partiendo del punto *A* (:ref{id="es-2-cnx-uphysics-02-01-fishtrip"}(a)). ¿Cuál es su vector de desplazamiento ${\vec{D}}_{AC}$ cuando llega al punto *C*? Sabemos que si camina hasta *B*, su vector de desplazamiento con respecto a *A* es ${\vec{D}}_{AB}$, que tiene una magnitud ${D}_{AB}=6\,\text{km}$ y una dirección al noreste. Si camina solo una fracción de 0,75 de la distancia total, y mantiene la dirección noreste, en el punto *C* debe estar a $0{,}75{D}_{AB}=4{,}5\,\text{km}$ lejos del campamento en *A*. Así, su vector de desplazamiento en el punto de reposo *C* tiene magnitud ${D}_{AC}=4{,}5\,\text{km}=0{,}75{D}_{AB}$ y es paralelo al vector de desplazamiento ${\vec{D}}_{AB}$. Todo esto se puede resumir en la siguiente **ecuación vectorial**:

$$
{\vec{D}}_{AC}=0{,}75{\vec{D}}_{AB}.
$$

En una ecuación vectorial, ambos lados de la ecuación son vectores. La ecuación anterior es un ejemplo de vector multiplicado por un escalar positivo (número) $\alpha =0{,}75$. El resultado, ${\vec{D}}_{AC}$, de tal multiplicación es un nuevo vector con una dirección paralela a la dirección del vector original ${\vec{D}}_{AB}$.

En general, cuando un vector $\vec{A}$ se multiplica por un escalar *positivo* $\alpha$, el resultado es un nuevo vector $\vec{B}$ que es *paralelo* a $\vec{A}$:

:::callout{type="nota" title="Nota"}
$$
\vec{B}=\alpha \vec{A}.
$$
:::

La magnitud $|\vec{B}|$ de este nuevo vector se obtiene al multiplicar la magnitud $|\vec{A}|$ del vector original, expresada por la **ecuación escalar**:

:::callout{type="nota" title="Nota"}
$$
B=|\alpha |A.
$$
:::

En una ecuación escalar, ambos lados de la ecuación son números. La aquí es una ecuación escalar porque las magnitudes de los vectores son cantidades escalares (y números positivos). Si el escalar $\alpha$ es *negativo* en la ecuación vectorial de la aquí, entonces la magnitud $|\vec{B}|$ del nuevo vector sigue siendo dada por la aquí, pero la dirección del nuevo vector $\vec{B}$ es *antiparalela* a la dirección de $\vec{A}$. Estos principios se ilustran en la :ref{id="es-2-cnx-uphysics-02-01-vector03"}(a) con dos ejemplos en los que la longitud del vector $\vec{A}$ es de 1,5 unidades. Cuando $\alpha =2$, el nuevo vector $\vec{B}=2\vec{A}$ tiene longitud $B=2A=3{,}0\,\text{unidades}$ (el doble de largo que el vector original) y es paralelo al vector original. Cuando $\alpha =−2$, el nuevo vector $\vec{C}=−2\vec{A}$ tiene longitud $C=|-2|A=3{,}0\,\text{unidades}$ (dos veces más largo que el vector original) y es antiparalelo al vector original.

Supongamos ahora que su compañero de pesca parte del punto *A* (el campamento), y camina en dirección al punto *B* (el agujero de pesca), pero se da cuenta de que ha perdido su caja de anzuelos cuando se ha parado a descansar en el punto *C* (situado a tres cuartas partes de la distancia entre *A* y *B*, al partir del punto *A*). Entonces, da la vuelta y vuelve sobre sus pasos en dirección al campamento y encuentra la caja tirada en el camino en un punto *D* a solo 1,2 km del punto *C* (vea la :ref{id="es-2-cnx-uphysics-02-01-fishtrip"}(b)). ¿Cuál es su vector de desplazamiento ${\vec{D}}_{AD}$ cuando encuentra la caja en el punto *D*? ¿Cuál es su vector de desplazamiento ${\vec{D}}_{DB}$ desde el punto *D* hasta el agujero? Ya hemos establecido que en el punto de reposo *C* su vector de desplazamiento es ${\vec{D}}_{AC}=0{,}75{\vec{D}}_{AB}$. Partiendo del punto *C*, camina hacia el suroeste (hacia el campamento), lo que significa que su nuevo vector de desplazamiento ${\vec{D}}_{CD}$ del punto *C* al punto *D* es antiparalelo a ${\vec{D}}_{AB}$. Su magnitud $|{\vec{D}}_{CD}|$ es ${D}_{CD}=1{,}2\,\text{km}=0{,}2{D}_{AB}$, por lo que su segundo vector de desplazamiento es ${\vec{D}}_{CD}=−0{,}2{\vec{D}}_{AB}$. Su desplazamiento total ${\vec{D}}_{AD}$ con respecto al campamento es la **suma vectorial** de los dos vectores de desplazamiento: vector ${\vec{D}}_{AC}$ (desde el campamento hasta el punto de descanso) y el vector ${\vec{D}}_{CD}$ (desde el punto de descanso hasta el punto donde encuentra su caja):

:::callout{type="nota" title="Nota"}
$$
{\vec{D}}_{AD}={\vec{D}}_{AC}+{\vec{D}}_{CD}.
$$
:::

La suma vectorial de dos (o más) vectores se denomina **vector resultante** o, para abreviar, la *resultante*. Cuando se conocen los vectores del lado derecho de la aquí, podemos encontrar la resultante ${\vec{D}}_{AD}$ de la siguiente forma:

$$
{\vec{D}}_{AD}={\vec{D}}_{AC}+{\vec{D}}_{CD}=0{,}75{\vec{D}}_{AB}-0{,}2\,{\vec{D}}_{AB}=(0{,}75-0{,}2){\vec{D}}_{AB}=0{,}55{\vec{D}}_{AB}.
$$

Cuando su amigo llega finalmente al estanque en *B*, su vector de desplazamiento ${\vec{D}}_{AB}$ desde el punto *A* es la suma vectorial de su vector de desplazamiento ${\vec{D}}_{AD}$ del punto *A* al punto *D* y su vector de desplazamiento ${\vec{D}}_{DB}$ desde el punto *D* hasta el agujero de pesca: ${\vec{D}}_{AB}={\vec{D}}_{AD}+{\vec{D}}_{DB}$ (vea la :ref{id="es-2-cnx-uphysics-02-01-fishtrip"}(c)). Esto significa que su vector de desplazamiento ${\vec{D}}_{DB}$ es la **diferencia de dos vectores**:

$$
{\vec{D}}_{DB}={\vec{D}}_{AB}-{\vec{D}}_{AD}={\vec{D}}_{AB}+(\text{−}{\vec{D}}_{AD}).
$$

Observe que una diferencia de dos vectores no es más que la suma vectorial de dos vectores porque el segundo término de la aquí es el vector $\text{−}{\vec{D}}_{AD}$ (que es antiparalelo a ${\vec{D}}_{AD})$. Cuando sustituimos la aquí en la aquí, obtenemos el segundo vector de desplazamiento:

$$
{\vec{D}}_{DB}={\vec{D}}_{AB}-{\vec{D}}_{AD}={\vec{D}}_{AB}-0{,}55{\vec{D}}_{AB}=(1{,}0-0{,}55){\vec{D}}_{AB}=0{,}45{\vec{D}}_{AB}.
$$

Este resultado significa que su amigo caminó ${D}_{DB}=0{,}45{D}_{AB}=0{,}45(6{,}0\,\text{km})=2{,}7\,\text{km}$ desde el punto donde encuentra su caja de anzuelos hasta el agujero de pesca.

Cuando los vectores $\vec{A}$ y $\vec{B}$ se encuentran a lo largo de una línea (es decir, en una dimensión), como en el ejemplo del campamento, su resultante $\vec{R}=\vec{A}+\vec{B}$ y su diferencia $\vec{D}=\vec{A}-\vec{B}$ ambas se encuentran en la misma dirección. Podemos ilustrar la suma o la resta de vectores dibujando los vectores correspondientes a escala en una dimensión, como se muestra en la :ref{id="es-2-cnx-uphysics-02-01-vector03"}.

Para ilustrar la resultante cuando $\vec{A}$ y $\vec{B}$ son dos vectores paralelos, los dibujamos a lo largo de una línea al colocar el origen de un vector en el extremo del otro vector en forma de cabeza a cola (vea la :ref{id="es-2-cnx-uphysics-02-01-vector03"}(b)). La magnitud de esta resultante es la suma de sus magnitudes: *R* = *A* + *B*. La dirección de la resultante es paralela a ambos vectores. Cuando el vector $\vec{A}$ es antiparalelo al vector $\vec{B}$, los dibujamos a lo largo de una línea, ya sea de cabeza a cabeza (:ref{id="es-2-cnx-uphysics-02-01-vector03"}(c)) o de cola a cola. La magnitud de la diferencia de vectores, entonces, es el *valor absoluto* $D=|A-B|$ de la diferencia de sus magnitudes. La dirección de la diferencia de vectores $\vec{D}$ es paralela a la dirección del vector más largo.

En general, en una dimensión, así como en dimensiones superiores, como en un plano o en el espacio, podemos sumar cualquier número de vectores y podemos hacerlo en cualquier orden porque la suma de vectores es **conmutativa**,

:::callout{type="nota" title="Nota"}
$$
\vec{A}+\vec{B}=\vec{B}+\vec{A},
$$
:::

y **asociativa**,

:::callout{type="nota" title="Nota"}
$$
(\vec{A}+\vec{B})+\vec{C}=\vec{A}+(\vec{B}+\vec{C}).
$$
:::

Además, la multiplicación por un escalar es **distributiva**:

:::callout{type="nota" title="Nota"}
$$
{\alpha }_{1}\vec{A}+{\alpha }_{2}\vec{A}=({\alpha }_{1}+{\alpha }_{2})\vec{A}.
$$
:::

Utilizamos la propiedad distributiva en la aquí y la aquí.

Al sumar muchos vectores en una dimensión, es conveniente utilizar el concepto de **vector unitario**. Un vector unitario, que se denota con un símbolo de letra con acento circunflejo, como $\hat{u}$, tiene una magnitud de uno y no tiene ninguna unidad física de modo que $|\hat{u}|\equiv u=1$. La única función de un vector unitario es especificar la dirección. Por ejemplo, en lugar de decir que el vector ${\vec{D}}_{AB}$ tiene una magnitud de 6,0 km y una dirección de noreste, podemos introducir un vector unitario $\hat{u}$ que apunta al noreste y decir de forma resumida que ${\vec{D}}_{AB}=(6{,}0\,\text{km})\hat{u}$. Entonces la dirección suroeste viene dada simplemente por el vector unitario $\text{−}\hat{u}$. De este modo, el desplazamiento de 6,0 km en dirección suroeste se expresa mediante el vector

$$
{\vec{D}}_{BA}=(−6{,}0\,\text{km})\hat{u}.
$$

:::callout{type="ejemplo" title="Una mariquita caminante"}
Una larga regla para medir se apoya en la pared de un laboratorio de física con su extremo de 200 cm en el suelo. Una mariquita se posa en la marca de 100 cm y se arrastra aleatoriamente por la regla. Primero camina 15 cm hacia el suelo, luego camina 56 cm hacia la pared, y después vuelve a caminar 3 cm hacia el suelo. A continuación, tras una breve parada, continúa 25 cm hacia el suelo y luego, de nuevo, se arrastra 19 cm hacia la pared antes de detenerse por completo (:ref{id="es-2-cnx-uphysics-02-01-ladybug"}). Halle el vector de su desplazamiento total y su posición final de reposo en la regla.

**Estrategia.** Si elegimos la dirección a lo largo de la regla hacia el suelo como la dirección del vector unitario $\hat{u}$, entonces la dirección hacia el suelo es $+\hat{u}$ y la dirección hacia la pared es $\text{−}\hat{u}$. La mariquita realiza un total de cinco desplazamientos:

$$
\begin{array}{l} {\vec{D}}_{1}=(15\,\text{cm})(+\hat{u}), \\ {\vec{D}}_{2}=(56\,\text{cm})(\text{−}\hat{u}), \\ {\vec{D}}_{3}=(3\,\text{cm})(+\hat{u}), \\ {\vec{D}}_{4}=(25\,\text{cm})(+\hat{u}),\,\text{y} \\ {\vec{D}}_{5}=(19\,\text{cm})(\text{−}\hat{u}). \end{array}
$$

El desplazamiento total $\vec{D}$ es la resultante de todos sus vectores de desplazamiento. (:ref{id="es-2-cnx-uphysics-02-01-ladybug" case="lower"})

**Solución.** La resultante de todos los vectores de desplazamiento es

$$
\begin{array}{ll} \vec{D} & ={\vec{D}}_{1}+{\vec{D}}_{2}+{\vec{D}}_{3}+{\vec{D}}_{4}+{\vec{D}}_{5} \\ & =(15\,\text{cm})(+\hat{u})+(56\,\text{cm})(\text{−}\hat{u})+(3\,\text{cm})(+\hat{u})+(25\,\text{cm})(+\hat{u})+(19\,\text{cm})(\text{−}\hat{u}) \\ & =(15-56+3+25-19)\text{cm}\hat{u} \\ & =−32\,\text{cm}\hat{u}. \end{array}
$$

En este cálculo, utilizamos la ley distributiva dada por la aquí. El resultado es que el vector de desplazamiento total apunta lejos de la marca de 100 cm (lugar de aterrizaje inicial) hacia el extremo de la regla para medir que toca la pared. El extremo que toca la pared está marcado 0 cm, por lo que la posición final de la mariquita está en la marca (100 - 32)cm = 68 cm.
:::

:::callout{type="comprobacion" title="Compruebe lo aprendido"}
Un buceador de cuevas entra en un largo túnel submarino. Cuando su desplazamiento con respecto al punto de entrada es de 20 m, se le cae accidentalmente la cámara, pero no se da cuenta de que no la tiene hasta que se adentra unos 6 m en el túnel. Vuelve a nadar 10 m pero no encuentra la cámara, así que decide terminar la inmersión. ¿A qué distancia está del punto de entrada? Tomando la dirección positiva de salida del túnel, ¿cuál es su vector de desplazamiento con respecto al punto de entrada?

**Respuesta.** 16 m; $\vec{D}=−16\,\text{m}\hat{u}$
:::

### Álgebra de vectores en dos dimensiones

Cuando los vectores se encuentran en un plano, es decir, cuando están en dos dimensiones, pueden multiplicarse por escalares, sumarse a otros vectores o restarse de otros de acuerdo con las leyes generales expresadas por la aquí, la aquí, la aquí y la aquí. Sin embargo, la regla de adición de dos vectores en un plano se complica más que la regla de adición de vectores en una dimensión. Tenemos que utilizar las leyes de la geometría para construir vectores resultantes, seguidos de la trigonometría para encontrar las magnitudes y direcciones de los vectores. Este enfoque geométrico se utiliza habitualmente en la navegación (:ref{id="es-2-cnx-uphysics-02-01-navigation"}). En este apartado, necesitamos tener a mano dos reglas, una escuadra, un transportador, un lápiz y una goma de borrar para dibujar vectores a escala mediante construcciones geométricas.

Para una construcción geométrica de la suma de dos vectores en un plano, seguimos **la regla del paralelogramo**. Supongamos que dos vectores $\vec{A}$ y $\vec{B}$ están en las posiciones arbitrarias indicadas en la :ref{id="es-2-cnx-uphysics-02-01-vector04"}. Traslade cualquiera de ellos en paralelo al inicio del otro vector, de forma que, luego de la traslación, ambos vectores tengan su origen en el mismo punto. Ahora, al final del vector $\vec{A}$ dibujamos una línea paralela al vector $\vec{B}$ y al final del vector $\vec{B}$ dibujamos una línea paralela al vector $\vec{A}$ (las líneas discontinuas en la :ref{id="es-2-cnx-uphysics-02-01-vector04"}). De este modo, obtenemos un paralelogramo. Desde el origen de los dos vectores dibujamos una diagonal que es la resultante $\vec{R}$ de los dos vectores: $\vec{R}=\vec{A}+\vec{B}$ (:ref{id="es-2-cnx-uphysics-02-01-vector04"}(a)). La otra diagonal de este paralelogramo es la diferencia de los dos vectores $\vec{D}=\vec{A}-\vec{B}$, como se muestra en la :ref{id="es-2-cnx-uphysics-02-01-vector04"}(b). Observe que el final de la diferencia de vectores se sitúa al final del vector $\vec{A}$.

De la regla del paralelogramo se deduce que ni la magnitud del vector resultante ni la magnitud de la diferencia de vectores pueden expresarse como una simple suma o diferencia de las magnitudes *A* y *B*, porque la longitud de una diagonal no puede expresarse como una simple suma de las longitudes de los lados. Cuando se utiliza una construcción geométrica para encontrar las magnitudes $|\vec{R}|$ y $|\vec{D}|$, tenemos que utilizar las leyes de la trigonometría para los triángulos, lo que puede llevar a un álgebra complicada. Hay dos maneras de evitar esta complejidad algebraica. Una forma es utilizar el método de los componentes, que examinamos en la siguiente sección. La otra forma es dibujar los vectores a escala, como se hace en la navegación, y leer las longitudes y ángulos aproximados de los vectores (direcciones) a partir de los gráficos. En esta sección examinamos el segundo enfoque.

Si necesitamos sumar tres o más vectores, repetimos la regla del paralelogramo para los pares de vectores hasta encontrar la resultante de todas las resultantes. Para tres vectores, por ejemplo, primero encontramos la resultante del vector 1 y el vector 2, y luego encontramos la resultante de esta resultante y el vector 3. El orden en el que seleccionemos los pares de vectores no importa porque la operación de suma de vectores es conmutativa y asociativa (vea la aquí y la aquí). Antes de enunciar una regla general que derive de las aplicaciones repetidas de la regla del paralelogramo, veamos el siguiente ejemplo.

Suponga que planea un viaje de vacaciones en Florida. Saliendo de Tallahassee, la capital del estado, planea visitar a su tío Joe en Jacksonville, ver a su primo Vinny en Daytona Beach, realizar una parada para divertirse un poco en Orlando, ver un espectáculo de circo en Tampa y visitar la Universidad de Florida en Gainesville. Su ruta se puede representar por cinco vectores de desplazamiento $\vec{A},$ $\vec{B}$, $\vec{C}$, $\vec{D}$ y $\vec{E}$, que se indican con los vectores rojos en la :ref{id="es-2-cnx-uphysics-02-01-vector05"}. ¿Cuál es su desplazamiento total al llegar a Gainesville? El desplazamiento total es la suma vectorial de los cinco vectores de desplazamiento, que se puede encontrar con la regla del paralelogramo cuatro veces. Alternativamente, recordemos que el vector de desplazamiento tiene su comienzo en la posición inicial (Tallahassee) y su final en la posición final (Gainesville), por lo que el vector de desplazamiento total puede dibujarse directamente como una flecha que conecta Tallahassee con Gainesville (vea el vector verde en la :ref{id="es-2-cnx-uphysics-02-01-vector05"}). Cuando usamos la regla del paralelogramo cuatro veces, la resultante $\vec{R}$ que obtenemos es exactamente este vector verde que conecta Tallahassee con Gainesville: $\vec{R}=\vec{A}+\vec{B}+\vec{C}+\vec{D}+\vec{E}$.

El dibujo del vector resultante de muchos vectores puede generalizarse con la siguiente **construcción geométrica de cola a cabeza**. Supongamos que queremos dibujar el vector resultante $\vec{R}$ de cuatro vectores $\vec{A}$, $\vec{B}$, $\vec{C}$ y $\vec{D}$ (:ref{id="es-2-cnx-uphysics-02-01-vector06"}(a)). Seleccionamos cualquiera de los vectores como primer vector y hacemos una traslación paralela de un segundo vector a una posición en la que el origen ("cola") del segundo vector coincide con el final ("cabeza") del primer vector. Luego, seleccionamos un tercer vector y realizamos una traslación paralela del tercer vector a una posición en la que el origen del tercer vector coincida con el final del segundo vector. Repetimos este procedimiento hasta que todos los vectores estén en una disposición de cabeza a cola como la que se muestra en la :ref{id="es-2-cnx-uphysics-02-01-vector06"}. Dibujamos el vector resultante $\vec{R}$ conectando el origen ("cola") del primer vector con el final ("cabeza") del último vector. El final del vector resultante está en el final del último vector. Como la suma de vectores es asociativa y conmutativa, obtenemos el mismo vector resultante, independientemente del vector que elijamos como primero, segundo, tercero o cuarto en esta construcción.

:::callout{type="ejemplo" title="Construcción geométrica de la resultante"}
Los tres vectores de desplazamiento $\vec{A}$, $\vec{B}$ y $\vec{C}$ en la :ref{id="es-2-cnx-uphysics-02-01-vector07"} se especifican por sus magnitudes *A* = 10,0, *B* = 7,0 y *C* = 8,0, respectivamente, y por sus respectivos ángulos direccionales con la dirección horizontal $\alpha =35\text{°}$, $\beta =−110\text{°}$ y $\gamma =30\text{°}$. Las unidades físicas de las magnitudes son los centímetros. Elija una escala conveniente y utilice una regla y un transportador para encontrar las siguientes sumas vectoriales: (a) $\vec{R}=\vec{A}+\vec{B}$, (b) $\vec{D}=\vec{A}-\vec{B}\text{, y}$ (c) $\vec{S}=\vec{A}-3\vec{B}+\vec{C}$.

**Estrategia.** En la construcción geométrica, encontrar un vector significa encontrar su magnitud y su ángulo direccional con la dirección horizontal. La estrategia consiste en dibujar a escala los vectores que aparecen en el lado derecho de la ecuación y construir el vector resultante. Luego, utilice una regla y un transportador para leer la magnitud de la resultante y el ángulo direccional. Para las partes (a) y (b) utilizamos la regla del paralelogramo. Para (c) utilizamos el método de cola a cabeza.

**Solución.** Para las partes (a) y (b), unimos el origen del vector $\vec{B}$ al origen del vector $\vec{A}$, como se muestra en la :ref{id="es-2-cnx-uphysics-02-01-vector08"}, y construimos un paralelogramo. La diagonal más corta de este paralelogramo es la suma $\vec{A}+\vec{B}$. La mayor de las diagonales es la diferencia $\vec{A}-\vec{B}$. Utilizamos una regla para medir las longitudes de las diagonales y un transportador para medir los ángulos con la horizontal. Para la resultante $\vec{R}$, obtenemos *R* = 5,8 cm y ${\theta }_{R}\approx 0\text{°}$. Para la diferencia $\vec{D}$, obtenemos *D* = 16,2 cm y ${\theta }_{D}=49{,}3\text{°}$, que se muestran en la :ref{id="es-2-cnx-uphysics-02-01-vector08"}.

Para (c), podemos empezar con el vector $−3\vec{B}$ y dibujar los vectores restantes de cola a cabeza como se muestra en la :ref{id="es-2-cnx-uphysics-02-01-vector09"}. En la suma de vectores, el orden en el que dibujamos los vectores no es importante, pero dibujar los vectores a escala sí es muy importante. A continuación, dibujamos el vector $\vec{S}$ desde el origen del primer vector hasta el final del último vector y colocamos la punta de la flecha al final de $\vec{S}$. Utilizamos una regla para medir la longitud de $\vec{S}$, y encontramos que su magnitud es 
*S* = 36,9 cm. Usamos un transportador y encontramos que su ángulo direccional es ${\theta }_{S}=52{,}9\text{°}$. Esta solución se muestra en la :ref{id="es-2-cnx-uphysics-02-01-vector09"}.
:::

:::callout{type="comprobacion" title="Compruebe lo aprendido"}
Utilizando los tres vectores de desplazamiento $\vec{A}$, $\vec{B}$ y $\vec{F}$ en la :ref{id="es-2-cnx-uphysics-02-01-vector07"}, elija una escala conveniente y utilice una regla y un transportador para encontrar el vector $\vec{G}$ dado por la ecuación vectorial $\vec{G}=\vec{A}+2\vec{B}-\vec{F}$.

**Respuesta.** *G* = 28,2 cm, ${\theta }_{G}=291\text{°}$
:::

:::callout{type="nota" title="Enlace"}
Observe la suma de vectores en un plano consultando esta [calculadora de vectores](https://openstax.org/l/21compveccalc) y participando en la simulación Phet a continuación.
:::

### Resumen

- La cantidad vectorial es cualquier cantidad que tiene magnitud y dirección, como el desplazamiento o la velocidad. Las cantidades vectoriales se representan mediante objetos matemáticos llamados vectores.
- Geométricamente, los vectores se representan mediante flechas, con el extremo marcado por una punta de flecha. La longitud del vector es su magnitud, que es un escalar positivo. En un plano, la dirección de un vector viene dada por el ángulo que forma el vector con una dirección de referencia, a menudo un ángulo con la horizontal. El ángulo direccional de un vector es un escalar.
- Dos vectores son iguales si y solo si tienen las mismas magnitudes y direcciones. Los vectores paralelos tienen los mismos ángulos direccionales, aunque pueden tener diferentes magnitudes. Los vectores antiparalelos tienen ángulos direccionales que difieren en $180\text{°}$. Los vectores ortogonales tienen ángulos direccionales que difieren en $90\text{°}$.
- Cuando un vector se multiplica por un escalar, el resultado es otro vector de longitud diferente a la del vector original. La multiplicación por un escalar positivo no cambia la dirección original; solo afecta la magnitud. La multiplicación por un escalar negativo invierte el sentido original. El vector resultante es antiparalelo al vector original. La multiplicación por un escalar es distributiva. Los vectores pueden dividirse entre escalares distintos a cero, pero no pueden dividirse entre vectores.
- Dos o más vectores pueden sumarse para formar otro vector. La suma vectorial se denomina vector resultante. Podemos sumar vectores a vectores o escalares a escalares, pero no podemos sumar escalares a vectores. La suma de vectores es conmutativa y asociativa.
- Para construir geométricamente un vector resultante de dos vectores en un plano, utilizamos la regla del paralelogramo. Para construir geométricamente un vector resultante de muchos vectores en un plano, utilizamos el método de la cola a la cabeza.

### Preguntas conceptuales

1. El pronóstico meteorológico indica que la temperatura será $−5\,\text{ °}\text{C}$ al día siguiente. ¿Es la temperatura un vector o una cantidad escalar? Explique.

2. ¿Cuál de los siguientes es un vector: la altura de una persona, la altitud del monte Everest, la velocidad de una mosca, la edad de la Tierra, el punto de ebullición del agua, el costo de un libro, la población de la Tierra o la aceleración de la gravedad?

3. Dé un ejemplo concreto de un vector; indique su magnitud, unidades y dirección.

4. ¿Qué tienen en común los vectores y los escalares? ¿En qué se diferencian?

5. Supongamos que suma dos vectores $\vec{A}$ y $\vec{B}$. ¿Qué dirección relativa entre ellos produce la resultante de mayor magnitud? ¿Cuál es la magnitud máxima? ¿Qué dirección relativa entre ellos produce la resultante de menor magnitud? ¿Cuál es la magnitud mínima?

6. ¿Es posible sumar una cantidad escalar a una cantidad vectorial?

7. ¿Es posible que dos vectores de distinta magnitud sumen cero? ¿Es posible que tres vectores de diferentes magnitudes sumen cero? Explique.

8. ¿El cuentakilómetros de un automóvil indica una cantidad escalar o vectorial?

9. Cuando un corredor de 10.000 metros que compite en una pista de 400 metros cruza la línea de meta, ¿cuál es el desplazamiento neto del corredor? ¿Este desplazamiento puede ser cero? Explique.

10. Un vector tiene magnitud cero. ¿Es necesario especificar su dirección? Explique.

11. ¿Puede la magnitud de un vector ser negativa?

12. ¿Puede la magnitud del desplazamiento de una partícula ser mayor que la distancia recorrida?

13. Si dos vectores son iguales, ¿qué puede decir de sus componentes? ¿Qué puede decir sobre sus magnitudes? ¿Qué puede decir de sus direcciones?

14. Si tres vectores suman cero, ¿qué condición geométrica cumplen?

### Términos clave

:::paragraphs{style="termino"}
**vectores antiparalelos** dos vectores con direcciones que difieren en $180\text{°}$

**asociativa** los términos pueden agruparse de cualquier manera

**conmutativa** las operaciones pueden realizarse en cualquier orden

**diferencia de dos vectores** suma vectorial del primer vector con el vector antiparalelo al segundo

**desplazamiento** cambio de posición

**distributiva** la multiplicación se puede distribuir entre los términos de la suma

**magnitud** longitud de un vector

**vectores ortogonales** dos vectores con direcciones que difieren exactamente en $90\text{°}$, sinónimo de vectores perpendiculares

**regla del paralelogramo** construcción geométrica de la suma vectorial en un plano

**vectores paralelos** dos vectores con ángulos direccionales exactamente iguales

**vector resultante** suma vectorial de dos (o más) vectores

**escalar** un número, sinónimo de cantidad escalar en física

**ecuación escalar** ecuación en la que los lados izquierdo y derecho son números

**cantidad escalar** cantidad que puede especificarse completamente por un solo número con una unidad física apropiada

**construcción geométrica de cola a cabeza** construcción geométrica para dibujar el vector resultante de muchos vectores

**vector unitario** vector de una magnitud unitaria que especifica la dirección; no tiene unidad física

**vector** objeto matemático con magnitud y dirección

**ecuación vectorial** ecuación en la que los lados izquierdo y derecho son vectores

**cantidad vectorial** cantidad física descrita por un vector matemático, es decir, donde se especifica tanto su magnitud como su dirección; sinónimo de vector en física

**suma vectorial** resultante de la combinación de dos (o más) vectores
:::

## Sistemas de coordenadas y componentes de un vector

:::callout{type="objetivos" title="Objetivos de aprendizaje"}
- Describir vectores en dos y tres dimensiones en términos de sus componentes, mediante el empleo de vectores unitarios a lo largo de los ejes.
- Distinguir entre los componentes vectoriales de un vector y los componentes escalares de un vector.
- Explicar cómo se define la magnitud de un vector en términos de sus componentes.
- Identificar el ángulo direccional de un vector en un plano.
- Explicar la relación entre las coordenadas polares y las coordenadas cartesianas en un plano.
:::

Los vectores suelen describirse en términos de sus componentes en un **sistema de coordenadas**. Incluso en la vida cotidiana invocamos de forma natural el concepto de proyecciones ortogonales en un sistema de coordenadas rectangulares. Por ejemplo, si pregunta a alguien cómo llegar a un lugar determinado, es más probable que le digan que vaya 40 km al este y 30 km al norte que 50 km en la dirección $37\text{°}$ al norte del este.

En un sistema de coordenadas *xy* rectangular (cartesiano) en un plano, un punto en un plano se describe por un par de coordenadas (la *x*, la *y*). De forma similar, un vector $\vec{A}$ en un plano se describe mediante un par de sus coordenadas *vectoriales*. La coordenada *x* del vector $\vec{A}$ se llama su componente *x* y la coordenada *y* del vector $\vec{A}$ se llama su componente *y*. El componente *x* del vector es un vector denotado por ${\vec{A}}_{x}$. El componente *y* del vector es un vector denotado por ${\vec{A}}_{y}$. En el sistema cartesiano, los **componentes vectoriales** *x* y *y* de un vector son las proyecciones ortogonales de este vector sobre los ejes de la *x* y la *y*, respectivamente. De este modo, siguiendo la regla del paralelogramo para la suma de vectores, cada vector en un plano cartesiano puede expresarse como la suma vectorial de sus componentes vectoriales:

$$
\vec{A}={\vec{A}}_{x}+{\vec{A}}_{y}.
$$

Como se ilustra en la :ref{id="es-2-cnx-uphysics-02-02-comp01"}, el vector $\vec{A}$ es la diagonal del rectángulo donde el componente *x* ${\vec{A}}_{x}$ es el lado paralelo al eje de la *x* y el componente *y* ${\vec{A}}_{y}$ es el lado paralelo al eje de la *y*. El componente vectorial ${\vec{A}}_{x}$ es ortogonal al componente vectorial ${\vec{A}}_{y}$.

Es habitual denotar la dirección positiva en el eje de la *x* por el vector unitario $\hat{i}$ y la dirección positiva en el eje de la *y* por el vector unitario $\hat{j}$. **Los vectores unitarios de los ejes**, $\hat{i}$ y $\hat{j}$, definen dos direcciones ortogonales en el plano. Como se muestra en la :ref{id="es-2-cnx-uphysics-02-02-comp01"}, los componentes *x* y *y* de un vector pueden escribirse ahora en términos de los vectores unitarios de los ejes:

$$
\{\begin{array}{l} {\vec{A}}_{x}={A}_{x}\hat{i} \\ {\vec{A}}_{y}={A}_{y}\hat{j}. \end{array}
$$

Los vectores ${\vec{A}}_{x}$ y ${\vec{A}}_{y}$ definidos por la aquí son los *componentes vectoriales* del vector $\vec{A}$. Las cifras ${A}_{x}$ y ${A}_{y}$ que definen los componentes vectoriales en la aquí son los componentes** escalares** del vector $\vec{A}$. Combinando la aquí con la aquí, obtenemos **la forma en componentes de un vector**:

:::callout{type="nota" title="Nota"}
$$
\vec{A}={A}_{x}\hat{i}+{A}_{y}\hat{j}.
$$
:::

Si conocemos las coordenadas $b({x}_{b},{y}_{b})$ del punto de origen de un vector (donde *b* significa "comienzo") y las coordenadas $e({x}_{e},{y}_{e})$ del punto final de un vector (donde *e* significa "final"), podemos obtener los componentes escalares de un vector simplemente al restar las coordenadas del punto de origen de las coordenadas del punto final:

:::callout{type="nota" title="Nota"}
$$
\{\begin{array}{l} {A}_{x}={x}_{e}-{x}_{b} \\ {A}_{y}={y}_{e}-{y}_{b}. \end{array}
$$
:::

:::callout{type="ejemplo" title="Desplazamiento de un puntero de ratón"}
Un puntero de ratón en el monitor de una computadora en su posición inicial está en el punto (6,0 cm, 1,6 cm) con respecto a la esquina inferior izquierda. Si mueve el puntero a un icono situado en el punto (2,0 cm, 4,5 cm), ¿cuál es el vector de desplazamiento del puntero?

**Estrategia.** El origen del sistema de coordenadas *xy* es la esquina inferior izquierda del monitor de la computadora. Por lo tanto, el vector unitario $\hat{i}$ en el eje de la *x* apunta horizontalmente a la derecha y el vector unitario $\hat{j}$ en el eje de la *y* apunta verticalmente hacia arriba. El origen del vector de desplazamiento está situado en el punto *b* (6,0, 1,6) y el final del vector de desplazamiento está situado en el punto *e* (2,0, 4,5). Sustituya las coordenadas de estos puntos en la aquí para encontrar los componentes escalares ${D}_{x}$ y ${D}_{y}$ del vector de desplazamiento $\vec{D}$. Por último, sustituya las coordenadas en la aquí para escribir el vector de desplazamiento en forma de componente vectorial.

**Solución.** Identificamos ${x}_{b}=6{,}0$, ${x}_{e}=2{,}0$, ${y}_{b}=1{,}6$ y ${y}_{e}=4{,}5$, donde la unidad física es 1 cm. Los componentes escalares *x* y *y* del vector de desplazamiento son

$$
\begin{array}{ll} {D}_{x} & ={x}_{e}-{x}_{b}=(2{,}0-6{,}0)\text{cm}=−4{,}0\,\text{cm}, \\ {D}_{y} & ={y}_{e}-{y}_{b}=(4{,}5-1{,}6)\text{cm}=+2{,}9\,\text{cm}. \end{array}
$$

La forma de componente vectorial del vector de desplazamiento es

$$
\vec{D}={D}_{x}\hat{i}+{D}_{y}\hat{j}=(−4{,}0\,\text{cm})\hat{i}+(2{,}9\,\text{cm})\hat{j}=(−4{,}0\hat{i}+2{,}9\hat{j})\text{cm}.
$$

Esta solución se muestra en la :ref{id="es-2-cnx-uphysics-02-02-comp02"}.

**Importancia.** Observe que la unidad física (aquí, 1 cm) puede colocarse con cada componente inmediatamente antes del vector unitario o globalmente para ambos componentes, como en la aquí. A menudo, esta última forma es más conveniente porque es más sencilla.

El componente *x* del vector ${\vec{D}}_{x}=−4{,}0\hat{i}=4{,}0(\text{−}\hat{i})$ del vector de desplazamiento tiene la magnitud $|{\vec{D}}_{x}|=|-4{,}0||\hat{i}|=4{,}0$ porque la magnitud del vector unitario es $|\hat{i}|=1$. Observe también que la dirección del componente *x* es $\text{−}\hat{i}$, que es antiparalela a la dirección del eje de la *x* +; por lo tanto, el componente *x* del vector ${\vec{D}}_{x}$ apunta a la izquierda, como se muestra en la :ref{id="es-2-cnx-uphysics-02-02-comp02"}. El componente escalar *x* del vector $\vec{D}$ es ${D}_{x}=−4{,}0$.

Del mismo modo, el componente *y* del vector ${\vec{D}}_{y}=+2{,}9\hat{j}$ del vector de desplazamiento tiene una magnitud $|{\vec{D}}_{y}|=|2{,}9||\hat{j}|=\,2{,}9$ porque la magnitud del vector unitario es $|\hat{j}|=1$. La dirección del componente *y* es $+\hat{j}$, que es paralela a la dirección del eje de la +*y*. Por lo tanto, el componente *y* del vector ${\vec{D}}_{y}$ apunta hacia arriba, como se ve en la :ref{id="es-2-cnx-uphysics-02-02-comp02"}. El componente escalar *y* del vector $\vec{D}$ es ${D}_{y}=+2{,}9$. El vector de desplazamiento $\vec{D}$ es la resultante de sus dos componentes *vectoriales*.

La forma de componente vectorial del vector de desplazamiento en la aquí nos indica que el puntero del ratón se ha movido en el monitor 4,0 cm hacia la izquierda y 2,9 cm hacia arriba desde su posición inicial.
:::

:::callout{type="comprobacion" title="Compruebe lo aprendido"}
Una mosca azul se posa en una hoja de papel cuadriculado en un punto situado a 10,0 cm a la derecha de su borde izquierdo y a 8,0 cm por encima de su borde inferior y camina lentamente hasta un punto situado a 5,0 cm del borde izquierdo y a 5,0 cm del borde inferior. Elija el sistema de coordenadas rectangulares con el origen en la esquina inferior izquierda del papel y halle el vector de desplazamiento de la mosca. Ilustre su solución con un gráfico.

**Respuesta.** $\vec{D}=(−5{,}0\hat{i}-3{,}0\hat{j})\text{cm}$; la mosca se desplazó 5,0 cm hacia la izquierda y 3,0 cm hacia abajo desde su lugar de aterrizaje.
:::

Cuando conocemos las componentes escalares ${A}_{x}$ y ${A}_{y}$ de un vector $\vec{A}$, podemos encontrar su magnitud *A* y su ángulo direccional ${\theta }_{A}$. El **ángulo direccional**, o dirección para abreviar, es el ángulo que forma el vector con la dirección positiva en el eje de la *x*. El ángulo ${\theta }_{A}$ se mide en la *dirección contraria a las agujas del reloj* desde el eje de la *x* + hasta el vector (:ref{id="es-2-cnx-uphysics-02-02-comp03"}). Como las longitudes *A*, ${A}_{x}$ y ${A}_{y}$ forman un triángulo rectángulo, están relacionadas por el teorema de Pitágoras:

:::callout{type="nota" title="Nota"}
$$
{A}^{2}={A}_{x}^{2}+{A}_{y}^{2}\,⇔\,A=\sqrt{{A}_{x}^{2}+{A}_{y}^{2}}.
$$
:::

Esta ecuación funciona incluso si los componentes escalares de un vector son negativos. El ángulo direccional ${\theta }_{A}$ de un vector se define a través de la función tangente del ángulo ${\theta }_{A}$ en el triángulo mostrado en la :ref{id="es-2-cnx-uphysics-02-02-comp03"}:

:::callout{type="nota" title="Nota"}
$$
\text{tan}\,\theta =\frac{{A}_{y}}{{A}_{x}}
$$
:::

Cuando el vector se encuentra en el primer cuadrante o en el cuarto cuadrante, donde el componente ${A}_{x}$ es positivo (:ref{id="es-2-cnx-uphysics-02-02-comp04"}), el ángulo $\theta$ en la aquí es idéntico al ángulo direccional ${\theta }_{A}$. Para los vectores del cuarto cuadrante, el ángulo $\theta$ es negativo, lo que significa que para estos vectores, el ángulo direccional ${\theta }_{A}$ se mide en el *sentido de las agujas del reloj* desde el eje de la *x* positiva. Del mismo modo, para los vectores del segundo cuadrante, el ángulo $\theta$ es negativo. Cuando el vector se encuentra en el segundo o tercer cuadrante, donde el componente ${A}_{x}$ es negativo, el ángulo direccional es ${\theta }_{A}=\theta +180\text{°}$ (:ref{id="es-2-cnx-uphysics-02-02-comp04"}).

:::callout{type="ejemplo" title="Magnitud y dirección del vector de desplazamiento"}
Usted mueve el puntero del ratón en la pantalla del monitor desde su posición inicial en el punto (6,0 cm, 1,6 cm) a un icono situado en el punto (2,0 cm, 4,5 cm). ¿Cuáles son la magnitud y la dirección del vector de desplazamiento del puntero?

**Estrategia.** En el aquí, encontramos el vector de desplazamiento $\vec{D}$ del puntero del ratón (vea la aquí). Identificamos sus componentes escalares ${D}_{x}=−4{,}0\,\text{cm}$ y ${D}_{y}=+2{,}9\,\text{cm}$ y sustituimos en la aquí y la aquí para encontrar la magnitud *D* y la dirección ${\theta }_{D}$, respectivamente.

**Solución.** La magnitud del vector $\vec{D}$ es

$$
D=\sqrt{{D}_{x}^{2}+{D}_{y}^{2}}=\sqrt{{(−4{,}0\,\text{cm})}^{2}+{(2{,}9\,\text{cm})}^{2}}=\sqrt{{(4{,}0)}^{2}+{(2{,}9)}^{2}}\,\text{cm}=4{,}9\,\text{cm}.
$$

El ángulo direccional es

$$
\text{tan}\,\theta =\frac{{D}_{y}}{{D}_{x}}=\frac{+2{,}9\,\text{cm}}{−4{,}0\,\text{cm}}=−0{,}725\,\Rightarrow \,\theta ={\text{tan}}^{−1}(−0{,}725)=−35{,}9\text{°}.
$$

Vector $\vec{D}$ se encuentra en el segundo cuadrante, por lo que su ángulo direccional es

$$
{\theta }_{D}=\theta +180\text{°}=−35{,}9\text{°}+180\text{°}=144{,}1\text{°}.
$$
:::

:::callout{type="comprobacion" title="Compruebe lo aprendido"}
Si el vector de desplazamiento de una mosca azul que camina sobre una hoja de papel cuadriculado es $\vec{D}=(−5{,}00\hat{i}-3{,}00\hat{j})\text{cm}$, halle su magnitud y dirección.

**Respuesta.** 5,83 cm, $211\text{°}$
:::

En muchas aplicaciones, se conocen las magnitudes y direcciones de las cantidades vectoriales y necesitamos encontrar la resultante de muchos vectores. Por ejemplo, imagine que 400 autos circulan por el puente Golden Gate de San Francisco con un fuerte viento. Cada auto da al puente un empuje diferente en varias direcciones y nos gustaría saber cuán grande puede ser el empuje resultante. Ya hemos adquirido cierta experiencia con la construcción geométrica de sumas vectoriales. En tal sentido, sabemos que la tarea de hallar la resultante al dibujar los vectores y medir sus longitudes y ángulos puede ser intratable con bastante rapidez, lo que ocasiona grandes errores. Preocupaciones como estas no surgen cuando utilizamos métodos analíticos. El primer paso en un enfoque analítico es encontrar los componentes vectoriales cuando se conocen su dirección y la magnitud.

Volvamos al triángulo rectángulo en la :ref{id="es-2-cnx-uphysics-02-02-comp03"}. El cociente del lado adyacente ${A}_{x}$ a la hipotenusa *A* es la función coseno (cos) del ángulo direccional ${\theta }_{A}$, ${A}_{x}\text{/}A=\text{cos}\,{\theta }_{A}$, y el cociente del lado opuesto ${A}_{y}$ a la hipotenusa *A* es la función seno (sen) de ${\theta }_{A}$, ${A}_{y}\text{/}A=\text{sen}\,{\theta }_{A}$. Cuando la magnitud *A* y la dirección ${\theta }_{A}$ son conocidas, podemos resolver estas relaciones para los componentes escalares:

:::callout{type="nota" title="Nota"}
$$
\{\begin{array}{l} {A}_{x}=A\,\text{cos}\,{\theta }_{A} \\ {A}_{y}=A\,\text{sen}\,{\theta }_{A} \end{array}.
$$
:::

Al calcular los componentes del vector con la aquí, hay que tener cuidado con el ángulo. El ángulo direccional ${\theta }_{A}$ de un vector es el ángulo medido *en sentido contrario a las agujas del reloj* desde la dirección positiva del eje de la *x* hasta el vector. La medición en el sentido de las agujas del reloj da un ángulo negativo.

:::callout{type="ejemplo" title="Componentes de los vectores de desplazamiento"}
Un grupo de rescate de un niño desaparecido sigue a un perro de búsqueda llamado Trooper. Trooper deambula y olfatea bastante por muchos senderos diferentes. Finalmente, Trooper encuentra al niño y la historia tiene un final feliz, pero su desplazamiento en diversos tramos luce realmente complejo. En uno de los tramos camina 200,0 m hacia el sureste y luego corre hacia el norte unos 300,0 m. En el tercer tramo, examina cuidadosamente los olores durante 50,0 m en la dirección $30\text{°}$ al oeste del norte. En el cuarto tramo, Trooper va directamente al sur durante 80,0 m, capta un nuevo olor y gira $23\text{°}$ al oeste del sur durante 150,0 m. Halle los componentes escalares de los vectores de desplazamiento de Trooper y sus vectores de desplazamiento en forma de componente vectorial para cada tramo.

**Estrategia.** Adoptemos un sistema de coordenadas rectangular con el eje de la *x* positiva en la dirección del este geográfico, con la dirección de la *y* positiva apuntando al norte geográfico. Explícitamente, el vector unitario $\hat{i}$ del eje de la *x* apunta al este y el vector unitario $\hat{j}$ del eje de la *y* apunta al norte. Trooper recorre cinco tramos, por lo que hay cinco vectores de desplazamiento. Comenzamos por identificar sus magnitudes y ángulos direccionales, luego utilizamos la aquí para encontrar los componentes escalares de cada desplazamiento y la aquí para los vectores de desplazamiento.

**Solución.** En el primer tramo, la magnitud del desplazamiento es ${L}_{1}=200{,}0\,\text{m}$ y la dirección es sureste. Para el ángulo direccional ${\theta }_{1}$ podemos tomar cualquiera de los dos $45\text{°}$ medido en el sentido de las agujas del reloj desde la dirección este o $45\text{°}+270\text{°}$ medido en sentido contrario a las agujas del reloj desde la dirección este. Con la primera opción, ${\theta }_{1}=−45\text{°}$. Con la segunda opción, ${\theta }_{1}=+315\text{°}$. Podemos utilizar cualquiera de estos dos ángulos. Los componentes son

$$
\begin{array}{l} {L}_{1x}={L}_{1}\,\text{cos}\,{\theta }_{1}=(200{,}0\,\text{m})\,\text{cos}\,315\text{°}=141{,}4\,\text{m,} \\ {L}_{1y}={L}_{1}\,\text{sen}\,{\theta }_{1}=(200{,}0\,\text{m})\,\text{sen}\,315\text{°}=-141{,}4\,\text{m}. \end{array}
$$

El vector de desplazamiento del primer tramo es

$$
{\vec{L}}_{1}={L}_{1x}\hat{i}+{L}_{1y}\hat{j}=(141{,}4\hat{i}-141{,}4\hat{j})\,\text{m}.
$$

En el segundo tramo de las andanzas de Trooper, la magnitud del desplazamiento es ${L}_{2}=300{,}0\,\text{m}$ y la dirección es norte. El ángulo direccional es ${\theta }_{2}=+90\text{°}$. Obtenemos los siguientes resultados:

$$
\begin{array}{lll} {L}_{2x} & = & {L}_{2}\,\text{cos}\,{\theta }_{2}=(300{,}0\,\text{m})\,\text{cos}\,90\text{°}=0{,}0\,, \\ {L}_{2y} & = & {L}_{2}\,\text{sen}\,{\theta }_{2}=(300{,}0\,\text{m})\,\text{sen}\,90\text{°}=300{,}0\,\text{m,} \\ {\vec{L}}_{2} & = & {L}_{2x}\hat{i}+{L}_{2y}\hat{j}=(300{,}0\,\text{m})\hat{j}. \end{array}
$$

En el tercer tramo, la magnitud del desplazamiento es ${L}_{3}=50{,}0\,\text{m}$ y la dirección es $30\text{°}$ al oeste del norte. El ángulo direccional medido en sentido contrario a las agujas del reloj desde la dirección este es ${\theta }_{3}=30\text{°}+90\text{°}=+120\text{°}$. Esto da las siguientes respuestas:

$$
\begin{array}{lll} {L}_{3x} & = & {L}_{3}\,\text{cos}\,{\theta }_{3}=(50{,}0\,\text{m})\,\text{cos}\,120\text{°}=−25{,}0\,\text{m,} \\ {L}_{3y} & = & {L}_{3}\,\text{sen}\,{\theta }_{3}=(50{,}0\,\text{m})\,\text{sen}\,120\text{°}=+43{,}3\,\text{m,} \\ {\vec{L}}_{3} & = & {L}_{3x}\hat{i}+{L}_{3y}\hat{j}=(−25{,}0\hat{i}+43{,}3\hat{j})\text{m}. \end{array}
$$

En el cuarto tramo de la excursión, la magnitud del desplazamiento es ${L}_{4}=80{,}0\,\text{m}$ y la dirección es sur. El ángulo de dirección puede tomarse como ${\theta }_{4}=−90\text{°}$ o ${\theta }_{4}=+270\text{°}$. Obtenemos

$$
\begin{array}{lll} {L}_{4x} & = & {L}_{4}\,\text{cos}\,{\theta }_{4}=(80{,}0\,\text{m})\,\text{cos}\,(−90\text{°})=0\,, \\ {L}_{4y} & = & {L}_{4}\,\text{sen}\,{\theta }_{4}=(80{,}0\,\text{m})\,\text{sen}\,(−90\text{°})=−80{,}0\,\text{m,} \\ {\vec{L}}_{4} & = & {L}_{4x}\hat{i}+{L}_{4y}\hat{j}=(−80{,}0\,\text{m})\hat{j}. \end{array}
$$

En el último tramo, la magnitud es ${L}_{5}=150{,}0\,\text{m}$ y el ángulo es ${\theta }_{5}=−23\text{°}+270\text{°}=+247\text{°}$ $(23\text{°}$ al oeste del sur), lo que da

$$
\begin{array}{lll} {L}_{5x} & = & {L}_{5}\,\text{cos}\,{\theta }_{5}=(150{,}0\,\text{m})\,\text{cos}\,247\text{°}=−58{,}6\,\text{m,} \\ {L}_{5y} & = & {L}_{5}\,\text{sen}\,{\theta }_{5}=(150{,}0\,\text{m})\,\text{sen}\,247\text{°}=-138{,}1\,\text{m,} \\ {\vec{L}}_{5} & = & {L}_{5x}\hat{i}+{L}_{5y}\hat{j}=(−58{,}6\hat{i}-138{,}1\hat{j})\text{m}. \end{array}
$$
:::

:::callout{type="comprobacion" title="Compruebe lo aprendido"}
Si Trooper corre 20 m hacia el oeste antes de descansar, ¿cuál es su vector de desplazamiento?

**Respuesta.** $\vec{D}=(−20\,\text{m})\hat{i}$
:::

### Coordenadas polares

Para describir ubicaciones de puntos o vectores en un plano, necesitamos dos direcciones ortogonales. En el sistema de coordenadas cartesianas estas direcciones vienen dadas por vectores unitarios $\hat{i}$ y $\hat{j}$ a lo largo del eje de la *x* y del eje de la *y*, respectivamente. El sistema de coordenadas cartesianas es muy conveniente para describir los desplazamientos y las velocidades de los objetos y las fuerzas que actúan sobre ellos. Sin embargo, es engorroso cuando necesitamos describir la rotación de los objetos. Al describir la rotación, solemos trabajar en el **sistema de coordenadas polares**.

En el sistema de coordenadas polares, la ubicación del punto *P* en un plano viene dada por dos **coordenadas polares** (:ref{id="es-2-cnx-uphysics-02-02-polar"}). La primera coordenada polar es la **coordenada radial** *r*, que es la distancia del punto *P* al origen. La segunda coordenada polar es un ángulo $\varphi$ que el vector radial hace con alguna dirección elegida, normalmente la dirección de la *x* positiva. En coordenadas polares, los ángulos se miden en radianes, o rads. El vector radial se fija en el origen y apunta lejos del origen hacia el punto *P.* Esta dirección radial se describe por un vector radial unitario $\hat{r}$. El segundo vector unitario $\hat{t}$ es un vector ortogonal a la dirección radial $\hat{r}$. La dirección positiva $+\hat{t}$ indica cómo el ángulo $\varphi$ cambia en dirección contraria a las agujas del reloj. De este modo, un punto *P* que tiene coordenadas (*x*, *y*) en el sistema rectangular puede describirse por equivalencia en el sistema de coordenadas polares mediante las dos coordenadas polares $(r,\varphi )$. La aquí es válida para cualquier vector, por lo que podemos utilizarla para expresar las coordenadas de la *x* y la *y* del vector $\vec{r}$. De este modo, obtenemos la conexión entre las coordenadas polares y las coordenadas rectangulares del punto *P*:

:::callout{type="nota" title="Nota"}
$$
\{\begin{array}{l} x=r\,\text{cos}\,\varphi \\ y=r\,\text{sen}\,\varphi \end{array}.
$$
:::

:::callout{type="ejemplo" title="Coordenadas polares"}
Un buscador de tesoros encuentra una moneda de plata en un lugar situado a 20,0 m de un pozo seco en la dirección $20\text{°}$ al norte del este y encuentra una moneda de oro en un lugar a 10,0 m del pozo en la dirección $20\text{°}$ al norte del oeste. ¿Cuáles son las coordenadas polares y rectangulares de estos hallazgos con respecto al pozo?

**Estrategia.** El pozo marca el origen del sistema de coordenadas y el este es la dirección de la *x* +. Identificamos las distancias radiales de los lugares al origen, que son ${r}_{S}=20{,}0\,\text{m}$ (para la moneda de plata) y ${r}_{G}=10{,}0\,\text{m}$ (para la moneda de oro). Para encontrar las coordenadas angulares, convertimos $20\text{°}$ a radianes: $20\text{°}=\pi 20\text{/}180=\pi \text{/}9$. Utilizamos la aquí para encontrar las coordenadas de la *x* y la *y* de las monedas.

**Solución.** La coordenada angular de la moneda de plata es ${\varphi }_{S}=\pi \text{/}9$, mientras que la coordenada angular de la moneda de oro es ${\varphi }_{G}=\pi -\pi \text{/}9=8\pi \text{/}9$. Por lo tanto, las coordenadas polares de la moneda de plata son $({r}_{S},{\varphi }_{S})=(20{,}0\,\text{m},\pi \text{/}9)$ y las de la moneda de oro son $({r}_{G},{\varphi }_{G})=(10{,}0\,\text{m},8\pi \text{/}9)$. Sustituimos estas coordenadas en la aquí para obtener coordenadas rectangulares. Para la moneda de oro, las coordenadas son

$$
\{\begin{array}{l} {x}_{G}={r}_{G}\,\text{cos}\,{\varphi }_{G}=(10{,}0\,\text{m})\,\text{cos}\,8\pi \text{/}9=−9{,}4\,\text{m} \\ {y}_{G}={r}_{G}\,\text{sen}\,{\varphi }_{G}=(10{,}0\,\text{m})\,\text{sen}\,8\pi \text{/}9=3{,}4\,\text{m} \end{array}\,\Rightarrow \,({x}_{G},{y}_{G})=(−9{,}4\,\text{m},3{,}4\,\text{m}).
$$

Para la moneda de plata, las coordenadas son

$$
\{\begin{array}{l} {x}_{S}={r}_{S}\,\text{cos}\,{\varphi }_{S}=(20{,}0\,\text{m})\,\text{cos}\,\pi \text{/}9=18{,}9\,\text{m} \\ {y}_{S}={r}_{S}\,\text{sen}\,{\varphi }_{S}=(20{,}0\,\text{m})\,\text{sen}\,\pi \text{/}9=6{,}8\,\text{m} \end{array}\,\Rightarrow \,({x}_{S},{y}_{S})=(18{,}9\,\text{m},6{,}8\,\text{m}).
$$
:::

### Vectores en tres dimensiones

Para especificar la ubicación de un punto en el espacio, necesitamos tres coordenadas (*x*, *y*, *z*), donde las coordenadas de la *x* y de la *y* especifican ubicaciones en un plano, y la coordenada de la *z* da una posición vertical por encima o por debajo del plano. El espacio tridimensional tiene tres direcciones ortogonales, por lo que no necesitamos dos, sino *tres* vectores unitarios para definir un sistema de coordenadas tridimensional. En el sistema de coordenadas cartesianas, los dos primeros vectores unitarios son el vector unitario del eje de la *x* $\hat{i}$ y el vector unitario del eje de la *y* $\hat{j}$. El tercer vector unitario $\hat{k}$ es la dirección del eje *z* (:ref{id="es-2-cnx-uphysics-02-02-ijknew"}). El orden en que se marcan los ejes, que es el orden en que aparecen los tres vectores unitarios, es importante porque define la orientación del sistema de coordenadas. El orden *x*-*y*-*z*, que equivale al orden $\hat{i}$ - $\hat{j}$ - $\hat{k}$, define el sistema de coordenadas estándar de la mano derecha (orientación positiva).

En el espacio tridimensional, el vector $\vec{A}$ tiene tres componentes vectoriales: el componente *x* ${\vec{A}}_{x}={A}_{x}\hat{i}$, que es la parte del vector $\vec{A}$ a lo largo del eje de la *x*, el componente *y* ${\vec{A}}_{y}={A}_{y}\hat{j}$, que es la parte de $\vec{A}$ a lo largo del eje de la *y*, y el componente *z* ${\vec{A}}_{z}={A}_{z}\hat{k}$, que es la parte del vector a lo largo del eje *z*. Un vector en un espacio tridimensional es la suma vectorial de sus tres componentes vectoriales (:ref{id="es-2-cnx-uphysics-02-02-vector3d"}):

:::callout{type="nota" title="Nota"}
$$
\vec{A}={A}_{x}\hat{i}+{A}_{y}\hat{j}+{A}_{z}\hat{k}.
$$
:::

Si conocemos las coordenadas de su origen $b({x}_{b},{y}_{b},{z}_{b})$ y de su fin $e({x}_{e},{y}_{e},{z}_{e})$, sus componentes escalares se obtienen al tomar sus diferencias: ${A}_{x}$ y ${A}_{y}$ vienen dados por la aquí y el componente *z* viene dado por

:::callout{type="nota" title="Nota"}
$$
{A}_{z}={z}_{e}-{z}_{b}.
$$
:::

La magnitud *A* se obtiene al generalizar la aquí a tres dimensiones:

:::callout{type="nota" title="Nota"}
$$
A=\sqrt{{A}_{x}^{2}+{A}_{y}^{2}+{A}_{z}^{2}}.
$$
:::

Esta expresión para la magnitud del vector proviene de aplicar el teorema de Pitágoras dos veces. Como se ve en la :ref{id="es-2-cnx-uphysics-02-02-vector3d"}, la diagonal en el plano *xy* tiene una longitud $\sqrt{{A}_{x}^{2}+{A}_{y}^{2}}$ y su potencia al cuadrado se suma al cuadrado ${A}_{z}^{2}$ para dar ${A}^{2}$. Observe que, cuando el componente *z* es cero, el vector se encuentra completamente en el plano *xy* y su descripción se reduce a dos dimensiones.

:::callout{type="ejemplo" title="Despegue de un dron"}
Durante un despegue del IAI Heron (:ref{id="es-2-cnx-uphysics-02-02-heron"}), su posición con respecto a una torre de control es de 100 m sobre el suelo, 300 m al este y 200 m al norte. Un minuto después, su posición es de 250 m sobre el suelo, 1200 m al este y 2100 m al norte. ¿Cuál es el vector de desplazamiento del dron con respecto a la torre de control? ¿Cuál es la magnitud de su vector de desplazamiento?

**Estrategia.** Tomamos el origen del sistema de coordenadas cartesianas como la torre de control. La dirección del eje de la *x* + viene dada por el vector unitario $\hat{i}$ al este, la dirección del eje de la *y* + viene dada por el vector unitario $\hat{j}$ al norte, y la dirección del eje de la *z* + viene dada por el vector unitario $\hat{k}$, que apunta hacia arriba desde el suelo. La primera posición del dron es el origen (o, equivalentemente, el comienzo) del vector de desplazamiento y su segunda posición es el final del vector de desplazamiento.

**Solución.** Identificamos *b*(300,0 m, 200,0 m, 100,0 m) y *e*(1200 m, 2100 m, 250 m), y utilizamos la aquí y la aquí para encontrar las componentes escalares del vector de desplazamiento del dron:

$$
\{\begin{array}{l} {D}_{x}={x}_{e}-{x}_{b}=1200{,}0\,\text{m}-300{,}0\,\text{m}=900{,}0\,\text{m}, \\ {D}_{y}={y}_{e}-{y}_{b}=2100{,}0\,\text{m}-200{,}0\,\text{m}=1.900,0\,\text{m,} \\ {D}_{z}={z}_{e}-{z}_{b}=250{,}0\,\text{m}-100{,}0\,\text{m}=150{,}0\,\text{m}. \end{array}
$$

Sustituimos estos componentes en la aquí para encontrar el vector de desplazamiento:

$$
\vec{D}={D}_{x}\hat{i}+{D}_{y}\hat{j}+{D}_{z}\hat{k}=900{,}0\,\text{m}\hat{i}+1.900,0\,\text{m}\hat{j}+150{,}0\,\text{m}\hat{k}=(0{,}90\hat{i}+1{,}90\hat{j}+0{,}15\hat{k})\,\text{km}.
$$

Sustituimos en la aquí para encontrar la magnitud del desplazamiento:

$$
D=\sqrt{{D}_{x}^{2}+{D}_{y}^{2}+{D}_{z}^{2}}=\sqrt{{(0{,}90\,\text{km})}^{2}+{(1{,}90\,\text{km})}^{2}+{(0{,}15\,\text{km})}^{2}}=2{,}11\,\text{km}.
$$
:::

:::callout{type="comprobacion" title="Compruebe lo aprendido"}
Si el vector de velocidad media del dron en el desplazamiento en el aquí es $\vec{u}=(15{,}0\hat{i}+31{,}7\hat{j}+2{,}5\hat{k})\text{m}\text{/}\text{s}$, ¿cuál es la magnitud del vector velocidad del dron?

**Respuesta.** 35,2 m/s = 126,4 km/h
:::

### Resumen

- Los vectores se describen en términos de sus componentes en un sistema de coordenadas. En dos dimensiones (en un plano), los vectores tienen dos componentes. En tres dimensiones (en el espacio), los vectores tienen tres componentes.
- Un componente vectorial de un vector es su parte en la dirección de un eje. El componente vectorial es el producto del vector unitario de un eje por su componente escalar a lo largo de dicho eje. Un vector es la resultante de sus componentes vectoriales.
- Las componentes escalares de un vector son diferencias de coordenadas, donde las coordenadas del origen se restan de las coordenadas del punto final de un vector. En un sistema rectangular, la magnitud de un vector es la raíz cuadrada de la suma de los cuadrados de sus componentes.
- En un plano, la dirección de un vector viene dada por el ángulo que tiene el vector con el eje de la *x* positiva. Este ángulo direccional se mide en sentido contrario a las agujas del reloj. El componente escalar *x* de un vector puede expresarse como el producto de su magnitud por el coseno de su ángulo direccional, y el componente escalar *y* puede expresarse como el producto de su magnitud por el seno de su ángulo de dirección.
- En un plano, hay dos sistemas de coordenadas equivalentes. El sistema de coordenadas cartesianas está definido por vectores unitarios $\hat{i}$ y $\hat{j}$ a lo largo del eje de la *x* y del eje de la *y*, respectivamente. El sistema de coordenadas polares está definido por el vector unitario radial $\hat{r}$, que da la dirección desde el origen, y un vector unitario $\hat{t}$, que es perpendicular (ortogonal) a la dirección radial.

### Preguntas conceptuales

1. Dé un ejemplo de un vector distinto de cero que tenga un componente de cero.

2. Explique por qué un vector no puede tener un componente mayor que su propia magnitud.

3. Si dos vectores son iguales, ¿qué puede decir de sus componentes?

4. Si los vectores $\vec{A}$ y $\vec{B}$ son ortogonales, ¿cuál es el componente de $\vec{B}$ a lo largo de la dirección de $\vec{A}$? ¿Cuál es el componente de $\vec{A}$ a lo largo de la dirección de $\vec{B}$?

5. Si uno de los dos componentes de un vector es distinto de cero, ¿puede ser cero la magnitud del otro componente de este vector?

6. Si dos vectores tienen la misma magnitud, ¿sus componentes tienen que ser iguales?

### Términos clave

:::paragraphs{style="termino"}
**forma en componentes de un vector** un vector escrito como la suma vectorial de sus componentes en términos de vectores unitarios

**ángulo direccional** en un plano, un ángulo entre la dirección positiva del eje de la *x* y el vector, medido en sentido contrario a las agujas del reloj desde el eje hasta el vector

**sistema de coordenadas polares** un sistema de coordenadas ortogonales en el que la ubicación en un plano viene dada por coordenadas polares

**coordenadas polares** una coordenada radial y un ángulo

**coordenada radial** distancia al origen en un sistema de coordenadas polares

**componente escalar** un número que multiplica un vector unitario en un componente vectorial de un vector

**vectores unitarios de los ejes** vectores unitarios que definen direcciones ortogonales en un plano o en el espacio

**componentes vectoriales** componentes ortogonales de un vector; un vector es la suma vectorial de sus componentes vectoriales
:::

## Álgebra de vectores

:::callout{type="objetivos" title="Objetivos de aprendizaje"}
- Aplicar los métodos analíticos del álgebra vectorial para encontrar vectores resultantes y resolver ecuaciones vectoriales para vectores desconocidos.
- Interpretar situaciones físicas en términos de expresiones vectoriales.
:::

Los vectores pueden sumarse y multiplicarse por escalares. La suma de vectores es asociativa (aquí) y conmutativa (aquí), y la multiplicación de vectores por una suma de escalares es distributiva (aquí). Además, la multiplicación escalar por una suma de vectores es distributiva:

:::callout{type="nota" title="Nota"}
$$
\alpha (\vec{A}+\vec{B})=\alpha \vec{A}+\alpha \vec{B}.
$$
:::

En esta ecuación, $\alpha$ es un número cualquiera (un escalar). Por ejemplo, un vector antiparalelo al vector $\vec{A}={A}_{x}\hat{i}+{A}_{y}\hat{j}+{A}_{z}\hat{k}$ se puede expresar simplemente multiplicando $\vec{A}$ por el escalar $\alpha =−1$:

:::callout{type="nota" title="Nota"}
$$
\text{−}\vec{A}=\text{−}{A}_{x}\hat{i}-{A}_{y}\hat{j}-{A}_{z}\hat{k}.
$$
:::

:::callout{type="ejemplo" title="Dirección del movimiento"}
En un sistema de coordenadas cartesianas donde $\hat{i}$ indica el este geográfico, $\hat{j}$ indica el norte geográfico, y $\hat{k}$ indica la altitud sobre el nivel del mar, un convoy militar avanza su posición a través de un territorio desconocido con velocidad $\vec{v}=(4{,}0\hat{i}+3{,}0\hat{j}+0{,}1\hat{k})\text{km}\text{/}\text{h}$. Si el convoy tuviera que retirarse, ¿en qué dirección geográfica se movería?

**Solución.** El vector velocidad tiene el tercer componente ${\vec{v}}_{z}=(+0{,}1\text{km}\text{/}\text{h})\hat{k}$, que informa que el convoy sube a 100 m/h por un terreno montañoso. Al mismo tiempo, su velocidad es de 4,0 km/h hacia el este y 3,0 km/h hacia el norte, por lo que se desplaza sobre el terreno en dirección ${\text{tan}}^{−1}(3\,\text{/}4)\approx 37\text{°}$ al norte del este. Si el convoy tuviera que retirarse, su nuevo vector velocidad $\vec{u}$ tendría que ser antiparalelo a $\vec{v}$ y ser de la forma $\vec{u}=\text{−}\alpha \vec{v}$, donde $\alpha$ es un número positivo. Así, la velocidad de retirada sería $\vec{u}=\alpha (−4{,}0\hat{i}-3{,}0\hat{j}-0{,}1\hat{k})\text{km}\text{/}\text{h}$. El signo negativo del tercer componente indica que el convoy estaría descendiendo. El ángulo direccional de la velocidad de retirada es ${\text{tan}}^{−1}(−3\alpha \text{/}-4\alpha )\approx 37\text{°}$ al sur del oeste. Por lo tanto, el convoy se movería sobre el terreno en dirección $37\text{°}$ al sur del oeste mientras desciende en su camino de regreso.
:::

La generalización del número cero al álgebra vectorial se denomina **vector nulo**, denotado por $\vec{0}$. Todos los componentes del vector nulo son cero, $\vec{0}=0\hat{i}+0\hat{j}+0\hat{k}$, por lo que el vector nulo no tiene longitud ni dirección.

Dos vectores $\vec{A}$ y $\vec{B}$ son **vectores iguales** si y solo si su diferencia es el vector nulo:

$$
\vec{0}=\vec{A}-\vec{B}=({A}_{x}\hat{i}+{A}_{y}\hat{j}+{A}_{z}\hat{k})-({B}_{x}\hat{i}+{B}_{y}\hat{j}+{B}_{z}\hat{k})=({A}_{x}-{B}_{x})\hat{i}+({A}_{y}-{B}_{y})\hat{j}+({A}_{z}-{B}_{z})\hat{k}.
$$

Esta ecuación vectorial significa que debemos tener simultáneamente ${A}_{x}-{B}_{x}=0$, ${A}_{y}-{B}_{y}=0$ y ${A}_{z}-{B}_{z}=0$. De allí que podemos escribir $\vec{A}=\vec{B}$ si y solo si los componentes correspondientes de los vectores $\vec{A}$ y $\vec{B}$ son iguales:

:::callout{type="nota" title="Nota"}
$$
\vec{A}=\vec{B}\,⇔\,\{\begin{array}{l} {A}_{x}={B}_{x} \\ {A}_{y}={B}_{y} \\ {A}_{z}={B}_{z} \end{array}.
$$
:::

Dos vectores son iguales cuando sus componentes escalares correspondientes son iguales.

Resolver los vectores en sus componentes escalares (es decir, encontrar sus componentes escalares) y expresarlos analíticamente en forma de componentes vectoriales (dados por la aquí) nos permite utilizar el álgebra vectorial para encontrar sumas o diferencias de muchos vectores *analíticamente* (es decir, sin utilizar métodos gráficos). Por ejemplo, para encontrar la resultante de dos vectores $\vec{A}$ y $\vec{B}$, simplemente los sumamos componente por componente, de la siguiente manera:

$$
\vec{R}=\vec{A}+\vec{B}=({A}_{x}\hat{i}+{A}_{y}\hat{j}+{A}_{z}\hat{k})+({B}_{x}\hat{i}+{B}_{y}\hat{j}+{B}_{z}\hat{k})=({A}_{x}+{B}_{x})\hat{i}+({A}_{y}+{B}_{y})\hat{j}+({A}_{z}+{B}_{z})\hat{k}.
$$

De este modo, utilizando la aquí, los componentes escalares del vector resultante $\vec{R}={R}_{x}\hat{i}+{R}_{y}\hat{j}+{R}_{z}\hat{k}$ son las sumas de los correspondientes componentes escalares de los vectores $\vec{A}$ y $\vec{B}$:

$$
\{\begin{array}{l} {R}_{x}={A}_{x}+{B}_{x}, \\ {R}_{y}={A}_{y}+{B}_{y}, \\ {R}_{z}={A}_{z}+{B}_{z}. \end{array}
$$

Se pueden utilizar métodos analíticos para encontrar los componentes de una resultante de muchos vectores. Por ejemplo, si tenemos que sumar $N$ vectores ${\vec{F}}_{1},{\vec{F}}_{2},{\vec{F}}_{3},\ldots ,{\vec{F}}_{N}$, donde cada vector es ${\vec{F}}_{k}={F}_{kx}\hat{i}+{F}_{ky}\hat{j}+{F}_{kz}\hat{k}$, el vector resultante ${\vec{F}}_{R}$ es

$$
\begin{array}{ll} {\vec{F}}_{R}={\vec{F}}_{1}+{\vec{F}}_{2}+{\vec{F}}_{3}+\text{…}+{\vec{F}}_{N} & ={\sum }_{k=1}^{N}{\vec{F}}_{k}={\sum }_{k=1}^{N}({F}_{kx}\hat{i}+{F}_{ky}\hat{j}+{F}_{kz}\hat{k}) \\ & =({\sum }_{k=1}^{N}{F}_{kx})\hat{i}+({\sum }_{k=1}^{N}{F}_{ky})\hat{j}+({\sum }_{k=1}^{N}{F}_{kz})\hat{k}. \end{array}
$$

Por lo tanto, los componentes escalares del vector resultante son

:::callout{type="nota" title="Nota"}
$$
\{\begin{array}{l} {F}_{Rx}={\sum }_{k=1}^{N}{F}_{kx}={F}_{1x}+{F}_{2x}+\text{…}+{F}_{Nx} \\ {F}_{Ry}={\sum }_{k=1}^{N}{F}_{ky}={F}_{1y}+{F}_{2y}+\text{…}+{F}_{Ny} \\ {F}_{Rz}={\sum }_{k=1}^{N}{F}_{kz}={F}_{1z}+{F}_{2z}+\text{…}+{F}_{Nz}. \end{array}
$$
:::

Una vez hallados los componentes escalares, podemos escribir la resultante en forma de componente vectorial:

$$
{\vec{F}}_{R}={F}_{Rx}\hat{i}+{F}_{Ry}\hat{j}+{F}_{Rz}\hat{k}.
$$

Los métodos analíticos para hallar la resultante y, en general, para resolver ecuaciones vectoriales son muy importantes en física porque muchas cantidades físicas son vectores. Por ejemplo, utilizamos este método en cinemática para encontrar vectores de desplazamiento resultantes y vectores de velocidad resultantes, en mecánica para encontrar vectores de fuerza resultantes y las resultantes de muchas cantidades vectoriales derivadas, y en electricidad y magnetismo para encontrar campos vectoriales eléctricos o magnéticos resultantes.

:::callout{type="ejemplo" title="Cálculo analítico de una resultante"}
Tres vectores de desplazamiento $\vec{A}$, $\vec{B}$ y $\vec{C}$ en un plano (aquí) se especifican por sus magnitudes *A* = 10,0, *B* = 7,0 y *C* = 8,0, respectivamente, y por sus respectivos ángulos direccionales con la horizontal $\alpha =35\text{°},$ $\beta =−110\text{°}$ y $\gamma =30\text{°}$. Las unidades físicas de las magnitudes son los centímetros. Resuelva los vectores a sus componentes escalares y halle las siguientes sumas vectoriales: (a) $\vec{R}=\vec{A}+\vec{B}+\vec{C}$, (b) $\vec{D}=\vec{A}-\vec{B}$, y (c) $\vec{S}=\vec{A}-3\vec{B}+\vec{C}$.

**Estrategia.** En primer lugar, utilizamos la aquí para encontrar los componentes escalares de cada vector y luego expresamos cada vector en su forma de componente vectorial dada por la aquí. Luego, utilizamos los métodos analíticos del álgebra vectorial para encontrar las resultantes.

**Solución.** Resolvemos los vectores dados a sus componentes escalares:

$$
\begin{array}{l} \{\begin{array}{l} {A}_{x}=A\,\text{cos}\,\alpha =(10{,}0\,\text{cm})\,\text{cos}\,35\text{°}=8{,}19\,\text{cm} \\ {A}_{y}=A\,\text{sen}\,\alpha =(10{,}0\,\text{cm})\,\text{sen}\,35\text{°}=5{,}73\,\text{cm} \end{array} \\ \{\begin{array}{l} {B}_{x}=B\,\text{cos}\,\beta =(7{,}0\,\text{cm})\,\text{cos}\,(−110\text{°})=−2{,}39\,\text{cm} \\ {B}_{y}=B\,\text{sen}\,\beta =(7{,}0\,\text{cm})\,\text{sen}\,(−110\text{°})=−6{,}58\,\text{cm} \end{array} \\ \{\begin{array}{l} {C}_{x}=C\,\text{cos}\,\gamma =(8{,}0\,\text{cm})\,\text{cos}\,30\text{°}=6{,}93\,\text{cm} \\ {C}_{y}=C\,\text{sen}\,\gamma =(8{,}0\,\text{cm})\,\text{sen}\,30\text{°}=4{,}00\,\text{cm} \end{array} \end{array}.
$$

Para (a) podemos sustituir directamente en la aquí para encontrar los componentes escalares de la resultante:

$$
\{\begin{array}{l} {R}_{x}={A}_{x}+{B}_{x}+{C}_{x}=8{,}19\,\text{cm}-2{,}39\,\text{cm}+6{,}93\,\text{cm}=12{,}73\,\text{cm} \\ {R}_{y}={A}_{y}+{B}_{y}+{C}_{y}=5{,}73\,\text{cm}-6{,}58\,\text{cm}+4{,}00\,\text{cm}=3{,}15\,\text{cm} \end{array}.
$$

Por lo tanto, el vector resultante es $\vec{R}={R}_{x}\hat{i}+{R}_{y}\hat{j}=(12{,}7\hat{i}+3{,}1\hat{j})\text{cm}$.

Para (b), podemos escribir la diferencia de vectores como

$$
\vec{D}=\vec{A}-\vec{B}=({A}_{x}\hat{i}+{A}_{y}\hat{j})-({B}_{x}\hat{i}+{B}_{y}\hat{j})=({A}_{x}-{B}_{x})\hat{i}+({A}_{y}-{B}_{y})\hat{j}.
$$

Luego, los componentes escalares de la diferencia vectorial son

$$
\{\begin{array}{l} {D}_{x}={A}_{x}-{B}_{x}=8{,}19\,\text{cm}-(−2{,}39\,\text{cm})=10{,}58\,\text{cm} \\ {D}_{y}={A}_{y}-{B}_{y}=5{,}73\,\text{cm}-(−6{,}58\,\text{cm})=12{,}31\,\text{cm} \end{array}.
$$

Por lo tanto, el vector de diferencia es $\vec{D}={D}_{x}\hat{i}+{D}_{y}\hat{j}=(10{,}6\hat{i}+12{,}3\hat{j})\text{cm}$.

Para (c), podemos escribir el vector $\vec{S}$ en la siguiente forma explícita:

$$
\begin{array}{ll} \vec{S} & =\vec{A}-3\vec{B}+\vec{C}=({A}_{x}\hat{i}+{A}_{y}\hat{j})-3({B}_{x}\hat{i}+{B}_{y}\hat{j})+({C}_{x}\hat{i}+{C}_{y}\hat{j}) \\ & =({A}_{x}-3{B}_{x}+{C}_{x})\hat{i}+({A}_{y}-3{B}_{y}+{C}_{y})\hat{j}. \end{array}
$$

Luego, los componentes escalares de $\vec{S}$ son

$$
\{\begin{array}{l} {S}_{x}={A}_{x}-3{B}_{x}+{C}_{x}=8{,}19\,\text{cm}-3(−2{,}39\,\text{cm})+6{,}93\,\text{cm}=22{,}29\,\text{cm} \\ {S}_{y}={A}_{y}-3{B}_{y}+{C}_{y}=5{,}73\,\text{cm}-3(−6{,}58\,\text{cm})+4{,}00\,\text{cm}=29{,}47\,\text{cm} \end{array}.
$$

El vector es $\vec{S}={S}_{x}\hat{i}+{S}_{y}\hat{j}=(22{,}3\hat{i}+29{,}5\hat{j})\text{cm}$.

**Importancia.** Una vez hallados los componentes del vector, podemos ilustrar los vectores mediante un gráfico o podemos calcular las magnitudes y los ángulos direccionales, como se muestra en la :ref{id="es-2-cnx-uphysics-02-03-illustr"}. Los resultados de las magnitudes en (b) y (c) pueden compararse con los resultados de los mismos problemas obtenidos con el método gráfico, mostrados en la aquí y la aquí. Observe que el método analítico produce resultados exactos y su exactitud no está limitada por la resolución de una regla o un transportador, como ocurría con el método gráfico utilizado en el aquí para hallar esta misma resultante.
:::

:::callout{type="comprobacion" title="Compruebe lo aprendido"}
Tres vectores de desplazamiento $\vec{A}$, $\vec{B}$ y $\vec{F}$ (aquí) se especifican por sus magnitudes *A* = 10,00, *B* = 7,00 y *F* = 20,00, respectivamente, y por sus respectivos ángulos direccionales con la horizontal $\alpha =35\text{°}$, $\beta =−110\text{°}$ y $\varphi =110\text{°}$. Las unidades físicas de las magnitudes son los centímetros. Utilice el método analítico para encontrar el vector $\vec{G}=\vec{A}+2\vec{B}-\vec{F}$. Compruebe que *G* = 28,15 cm y que ${\theta }_{G}=-68{,}65\text{°}$.

**Respuesta.** $\vec{G}=(10{,}25\hat{i}-26{,}22\hat{j})\text{cm}$
:::

:::callout{type="ejemplo" title="El juego de tira y afloja"}
Cuatro perros llamados Astro, Balto, Clifford y Dug juegan al tira y afloja con un juguete (:ref{id="es-2-cnx-uphysics-02-03-dogs"}). Astro hala el juguete en dirección $\alpha =55\text{°}$ al sur del este, Balto hala en dirección $\beta =60\text{°}$ al este del norte, y Clifford hala en dirección $\gamma =55\text{°}$ al oeste del norte. Astro hala fuertemente con 160,0 unidades de fuerza (N), que abreviamos como *A* = 160,0 N. Balto hala aún más fuerte que Astro con una fuerza de magnitud *B* = 200,0 N, y Clifford hala con una fuerza de magnitud *C* = 140,0 N. Cuando Dug hala del juguete de forma que su fuerza equilibra la resultante de las otras tres fuerzas, el juguete no se mueve en ninguna dirección. ¿Con qué fuerza y en qué dirección debe halar Dug el juguete para que esto ocurra?

**Estrategia.** Suponemos que el este es la dirección del eje de la *x* positiva y el norte es la dirección del eje de la *y* positiva. Como en el aquí, tenemos que resolver las tres fuerzas dadas, $\vec{A}$ (el tirón de Astro), $\vec{B}$ (el tirón de Balto), y $\vec{C}$ (el tirón de Clifford), en sus componentes escalares y luego encontrar los componentes escalares del vector resultante $\vec{R}=\vec{A}+\vec{B}+\vec{C}$. Cuando la fuerza de tracción $\vec{D}$ de Dug equilibra esta resultante, la suma de $\vec{D}$ y $\vec{R}$ debe dar el vector nulo $\vec{D}+\vec{R}=\vec{0}$. Esto significa que $\vec{D}=\text{−}\vec{R}$, por lo que el tirón de Dug debe ser antiparalelo a $\vec{R}$.

**Solución.** Los ángulos direccionales son ${\theta }_{A}=\text{−}\alpha =−55\text{°}$, ${\theta }_{B}=90\text{°}-\beta =30\text{°}$ y ${\theta }_{C}=90\text{°}+\gamma =145\text{°}$, y sustituyéndolos en la aquí se obtienen los componentes escalares de las tres fuerzas dadas:

$$
\begin{array}{l} \{\begin{array}{l} {A}_{x}=A\,\text{cos}\,{\theta }_{A}=(160{,}0\,\text{N})\,\text{cos}\,(−55\text{°})=+91{,}8\,\text{N} \\ {A}_{y}=A\,\text{sen}\,{\theta }_{A}=(160{,}0\,\text{N})\,\text{sen}\,(−55\text{°})=−131{,}1\,\text{N} \end{array} \\ \{\begin{array}{l} {B}_{x}=B\,\text{cos}\,{\theta }_{B}=(200{,}0\,\text{N})\,\text{cos}\,30\text{°}=+173{,}2\,\text{N} \\ {B}_{y}=B\,\text{sen}\,{\theta }_{B}=(200{,}0\,\text{N})\,\text{sen}\,30\text{°}=+100{,}0\,\text{N} \end{array} \\ \{\begin{array}{l} {C}_{x}=C\,\text{cos}\,{\theta }_{C}=(140{,}0\,\text{N})\,\text{cos}\,145\text{°}=-114{,}7\,\text{N} \\ {C}_{y}=C\,\text{sen}\,{\theta }_{C}=(140{,}0\,\text{N})\,\text{sen}\,145\text{°}=+80{,}3\,\text{N} \end{array} \end{array}.
$$

Ahora calculamos los componentes escalares del vector resultante $\vec{R}=\vec{A}+\vec{B}+\vec{C}$:

$$
\{\begin{array}{l} {R}_{x}={A}_{x}+{B}_{x}+{C}_{x}=+91{,}8\,\text{N}+173{,}2\,\text{N}-114{,}7\,\text{N}=+150{,}3\,\text{N} \\ {R}_{y}={A}_{y}+{B}_{y}+{C}_{y}=−131{,}1\,\text{N}+100{,}0\,\text{N}+80{,}3\,\text{N}=+49{,}2\,\text{N} \end{array}.
$$

El vector antiparalelo a la resultante $\vec{R}$ es

$$
\vec{D}=\text{−}\vec{R}=\text{−}{R}_{x}\hat{i}-{R}_{y}\hat{j}=(−150{,}3\hat{i}-49{,}2\hat{j})\,\text{N}.
$$

La magnitud de la fuerza de tracción de Dug es

$$
D=\sqrt{{D}_{x}^{2}+{D}_{y}^{2}}=\sqrt{{(−150{,}3)}^{2}+{(−49{,}2)}^{2}}\,\text{N}=158{,}1\,\text{N}.
$$

La dirección de la fuerza de tracción de Dug es

$$
\theta ={\text{tan}}^{−1}(\frac{{D}_{y}}{{D}_{x}})={\text{tan}}^{−1}(\frac{−49{,}2\,\text{N}}{−150{,}3\,\text{N}})={\text{tan}}^{−1}(\frac{49{,}2}{150{,}3})=18{,}1\text{°}.
$$

Dug hala en la dirección $18{,}1\text{°}$ al sur del oeste porque ambos componentes son negativos, lo que significa que el vector de tracción se encuentra en el tercer cuadrante (aquí).
:::

:::callout{type="comprobacion" title="Compruebe lo aprendido"}
Supongamos que Balto en el aquí abandona el juego para atender asuntos más importantes, pero Astro, Clifford y Dug siguen jugando. El tirón de Astro y Clifford sobre el juguete no cambia, pero Dug corre y muerde el juguete en otro lugar. ¿Con qué fuerza y en qué dirección debe Dug halar ahora del juguete para equilibrar los tirones combinados de Clifford y Astro? Ilustre esta situación dibujando un diagrama vectorial que indique todas las fuerzas implicadas.

**Respuesta.** *D* = 55,7 N; dirección $65{,}7\text{°}$ al norte del este
:::

:::callout{type="ejemplo" title="Álgebra vectorial"}
Halle la magnitud del vector $\vec{C}$ que satisface la ecuación $2\vec{A}-6\vec{B}+3\vec{C}=2\hat{j}$, donde $\vec{A}=\hat{i}-2\hat{k}$ y $\vec{B}=\text{−}\hat{j}+\hat{k}\text{/}2$.

**Estrategia.** Primero resolvemos la ecuación dada para el vector desconocido $\vec{C}$. Luego sustituimos $\vec{A}$ y $\vec{B}$; agrupamos los términos a lo largo de cada una de las tres direcciones $\hat{i}$, $\hat{j}$ y $\hat{k}$; e identificamos los componentes escalares ${C}_{x}$, ${C}_{y}$ y ${C}_{z}$. Finalmente, sustituimos en la aquí para encontrar la magnitud *C*.

$$
\begin{array}{lll} 2\vec{A}-6\vec{B}+3\vec{C} & = & 2\hat{j} \\ 3\vec{C} & = & 2\hat{j}-2\vec{A}+6\vec{B} \\ \vec{C} & = & \frac{2}{3}\hat{j}-\frac{2}{3}\vec{A}+2\vec{B} \\ & = & \frac{2}{3}\hat{j}-\frac{2}{3}(\hat{i}-2\hat{k})+2(\text{−}\hat{j}+\frac{\hat{k}}{2})=\frac{2}{3}\hat{j}-\frac{2}{3}\hat{i}+\frac{4}{3}\hat{k}-2\hat{j}+\hat{k} \\ & = & -\frac{2}{3}\hat{i}+(\frac{2}{3}-2)\hat{j}+(\frac{4}{3}+1)\hat{k} \\ & = & -\frac{2}{3}\hat{i}-\frac{4}{3}\hat{j}+\frac{7}{3}\hat{k}. \end{array}
$$

Los componentes son ${C}_{x}=\text{−}2\,\text{/}3$, ${C}_{y}=−4\text{/}3$ y ${C}_{z}=7\,\text{/}3$, y al sustituir en la aquí obtenemos

$$
C=\sqrt{{C}_{x}^{2}+{C}_{y}^{2}+{C}_{z}^{2}}=\sqrt{{(−2\text{/}3)}^{2}+{(\text{−}4\,\text{/}3)}^{2}+{(7\,\text{/}3)}^{2}}=\sqrt{23\text{/}3}.
$$
:::

:::callout{type="ejemplo" title="Desplazamiento de un esquiador"}
Partiendo de un albergue de esquí, un esquiador de fondo recorre 5,0 km hacia el norte, luego 3,0 km hacia el oeste y finalmente 4,0 km hacia el suroeste antes de tomar un descanso. Halle su vector de desplazamiento total con respecto al albergue cuando está en el punto de descanso. ¿A qué distancia y en qué dirección debe esquiar desde el punto de descanso para volver directamente al albergue?

**Estrategia.** Suponemos un sistema de coordenadas rectangular con el origen en el albergue de esquí y con el vector unitario $\hat{i}$ que apunta al este y el vector unitario $\hat{j}$ que apunta al norte. Hay tres desplazamientos: ${\vec{D}}_{1}$, ${\vec{D}}_{2}$ y ${\vec{D}}_{3}$. Identificamos sus magnitudes como ${D}_{1}=5{,}0\,\text{km}$, ${D}_{2}=3{,}0\,\text{km}$ y ${D}_{3}=4{,}0\,\text{km}$. Identificamos que sus direcciones son los ángulos ${\theta }_{1}=90\text{°}$, ${\theta }_{2}=180\text{°}$ y ${\theta }_{3}=180\text{°}+45\text{°}=225\text{°}$. Resolvemos cada vector de desplazamiento en sus componentes escalares y los sustituimos en la aquí para obtener los componentes escalares del desplazamiento resultante $\vec{D}$ desde el albergue hasta el punto de descanso. En el camino de regreso desde el punto de descanso hasta el albergue, el desplazamiento es $\vec{B}=\text{−}\vec{D}$. Por último, encontramos la magnitud y la dirección de $\vec{B}$.

**Solución.** Las componentes escalares de los vectores de desplazamiento son

$$
\begin{array}{l} \{\begin{array}{l} {D}_{1x}={D}_{1}\,\text{cos}\,{\theta }_{1}=(5{,}0\,\text{km})\,\text{cos}\,90\text{°}=0 \\ {D}_{1y}={D}_{1}\,\text{sen}\,{\theta }_{1}=(5{,}0\,\text{km})\,\text{sen}\,90\text{°}=5{,}0\,\text{km} \end{array} \\ \{\begin{array}{l} {D}_{2x}={D}_{2}\,\text{cos}\,{\theta }_{2}=(3{,}0\,\text{km})\,\text{cos}\,180\text{°}=−3{,}0\,\text{km} \\ {D}_{2y}={D}_{2}\,\text{sen}\,{\theta }_{2}=(3{,}0\,\text{km})\,\text{sen}\,180\text{°}=0 \end{array} \\ \{\begin{array}{l} {D}_{3x}={D}_{3}\,\text{cos}\,{\theta }_{3}=(4{,}0\,\text{km})\,\text{cos}\,225\text{°}=−2{,}8\,\text{km} \\ {D}_{3y}={D}_{3}\,\text{sen}\,{\theta }_{3}=(4{,}0\,\text{km})\,\text{sen}\,225\text{°}=−2{,}8\,\text{km} \end{array} \end{array}.
$$

Los componentes escalares del vector de desplazamiento neto son

$$
\{\begin{array}{l} {D}_{x}={D}_{1x}+{D}_{2x}+{D}_{3x}=(0-3{,}0-2{,}8)\text{km}=−5{,}8\,\text{km} \\ {D}_{y}={D}_{1y}+{D}_{2y}+{D}_{3y}=(5{,}0+0-2{,}8)\text{km}=+2{,}2\,\text{km} \end{array}.
$$

Por lo tanto, el vector de desplazamiento neto del esquiador es $\vec{D}={D}_{x}\hat{i}+{D}_{y}\hat{j}=(−5{,}8\hat{i}+2{,}2\hat{j})\text{km}$. En el camino de regreso al albergue, su desplazamiento es $\vec{B}=\text{−}\vec{D}=\text{−}(−5{,}8\hat{i}+2{,}2\hat{j})\text{km}=(5{,}8\hat{i}-2{,}2\hat{j})\text{km}$. Su magnitud es $B=\sqrt{{B}_{x}^{2}+{B}_{y}^{2}}=\sqrt{{(5{,}8)}^{2}+{(−2{,}2)}^{2}}\,\text{km}=6{,}2\,\text{km}$ y su ángulo direccional es $\theta ={\text{tan}}^{−1}(−2{,}2\text{/}5{,}8)=-20{,}8\text{°}$. Por lo tanto, para volver al albergue, deberá recorrer 6,2 km en una dirección de $21\text{°}$ al sur del este.

**Importancia.** Observe que no se necesita ninguna figura para resolver este problema por el método analítico. Las figuras son necesarias cuando se utiliza un método gráfico; sin embargo, podemos comprobar si nuestra solución tiene sentido haciendo un esquema, lo cual es un paso final útil para resolver cualquier problema vectorial.
:::

:::callout{type="ejemplo" title="Desplazamiento de un corredor"}
Un corredor sube un tramo de 200 escalones idénticos hasta la cima de una colina y luego corre a lo largo de la cima de la colina 50,0 m antes de detenerse en un bebedero (:ref{id="es-2-cnx-uphysics-02-03-jogger"}). Su vector de desplazamiento desde el punto *A* en la parte inferior de los escalones hasta el punto *B* en el bebedero es ${\vec{D}}_{AB}=(−90{,}0\hat{i}+30{,}0\hat{j})\text{m}$. ¿Cuál es la altura y el ancho de cada escalón en el tramo? ¿Cuál es la distancia real que recorre el corredor? Si hace un circuito y vuelve al punto *A*, ¿cuál es su vector de desplazamiento neto?

**Estrategia.** El vector de desplazamiento ${\vec{D}}_{AB}$ es la suma vectorial del vector de desplazamiento del corredor ${\vec{D}}_{AT}$ a lo largo de la escalera (desde el punto *A* en la parte inferior de la escalera hasta el punto *T* en la parte superior de la misma) y su vector de desplazamiento ${\vec{D}}_{TB}$ en la cima de la colina (desde el punto *A* en la cima de las escaleras hasta el bebedero en el punto *T*). Debemos encontrar los componentes horizontales y verticales de ${\vec{D}}_{AT}$. Si cada escalón tiene un ancho *w* y una altura *h*, el componente horizontal de ${\vec{D}}_{AT}$ deberá tener una longitud de 200 *w* y el componente vertical deberá tener una longitud de 200 *h.* La distancia real que recorre el corredor es la suma de la distancia que recorre por las escaleras y la distancia de 50,0 m que recorre en la cima de la colina.

**Solución.** En el sistema de coordenadas indicado en la :ref{id="es-2-cnx-uphysics-02-03-jogger"}, el vector de desplazamiento del corredor en la cima de la colina es ${\vec{D}}_{TB}=(−50{,}0\,\text{m})\hat{i}$. Su vector de desplazamiento neto es

$$
{\vec{D}}_{AB}={\vec{D}}_{AT}+{\vec{D}}_{TB}.
$$

Por lo tanto, su vector de desplazamiento ${\vec{D}}_{TB}$ a lo largo de las escaleras es

$$
\begin{array}{ll} {\vec{D}}_{AT} & ={\vec{D}}_{AB}-{\vec{D}}_{TB}=(−90{,}0\hat{i}+30{,}0\hat{j})\text{m}-(−50{,}0\,\text{m})\hat{i}=[(−90{,}0+50{,}0)\hat{i}+30{,}0\hat{j})]\text{m} \\ & =(−40{,}0\hat{i}+30{,}0\hat{j})\text{m}. \end{array}
$$

Sus componentes escalares son ${D}_{ATx}=−40{,}0\,\text{m}$ y ${D}_{ATy}=30{,}0\,\text{m}$. Por lo tanto, debemos tener

$$
200w=|-40{,}0|\text{m}\,\text{y}\,200h=30{,}0\,\text{m}.
$$

De allí que el ancho del escalón es *w* = 40,0 m/200 = 0,2 m = 20 cm, y la altura del escalón sea *h* = 30,0 m/200 = 0,15 m = 15 cm. La distancia que recorre el corredor por las escaleras es

$$
{D}_{AT}=\sqrt{{D}_{ATx}^{2}+{D}_{ATy}^{2}}=\sqrt{{(−40{,}0)}^{2}+{(30{,}0)}^{2}}\,\text{m}=50{,}0\,\text{m}.
$$

Así, la distancia real que recorre es ${D}_{AT}+{D}_{TB}=50{,}0\,\text{m}+50{,}0\,\text{m}=100{,}0\,\text{m}$. Cuando hace un circuito y vuelve desde el bebedero a su posición inicial en el punto *A*, la distancia total que recorre es el doble de esta distancia, es decir, 200,0 m. Sin embargo, su vector de desplazamiento neto es cero, porque cuando su posición final es la misma que su posición inicial, los componentes escalares de su vector de desplazamiento neto son cero (aquí).
:::

En muchas situaciones físicas, a menudo necesitamos conocer la dirección de un vector. Por ejemplo, quizá queramos conocer la dirección de un vector de campo magnético en algún punto o la dirección del movimiento de un objeto. Ya hemos dicho que la dirección viene dada por un vector unitario, que es una entidad adimensional, es decir, no tiene unidades físicas asociadas. Cuando el vector en cuestión se encuentra a lo largo de uno de los ejes en un sistema cartesiano de coordenadas, la respuesta es sencilla, porque entonces su vector unitario de dirección es paralelo o antiparalelo a la dirección del vector unitario de un eje. Por ejemplo, la dirección del vector $\vec{d}=−5\,\text{m}\hat{i}$ es el vector unitario $\hat{d}=\text{−}\hat{i}$. La regla general para encontrar el vector unitario $\hat{V}$ de dirección para cualquier vector $\vec{V}$ es dividirlo entre su magnitud *V*:

:::callout{type="nota" title="Nota"}
$$
\hat{V}=\frac{\vec{V}}{V}.
$$
:::

Vemos en esta expresión que, efectivamente, el vector unitario de dirección es adimensional porque el numerador y el denominador en la aquí tienen la misma unidad física. De este modo, la aquí nos permite expresar el vector unitario de dirección en términos de vectores unitarios de los ejes. El siguiente ejemplo ilustra este principio.

:::callout{type="ejemplo" title="El vector unitario de dirección"}
Si el vector de velocidad del convoy militar en el aquí es $\vec{v}=(4{,}000\hat{i}+3{,}000\hat{j}+0{,}100\hat{k})\text{km}\text{/}\text{h}$, ¿cuál es el vector unitario de su dirección de movimiento?

**Estrategia.** El vector unitario de la dirección de movimiento del convoy es el vector unitario $\hat{v}$ que es paralelo al vector de velocidad. El vector unitario se obtiene al dividir un vector entre su magnitud, de acuerdo con la aquí.

**Solución.** La magnitud del vector $\vec{v}$ es

$$
v=\sqrt{{v}_{x}^{2}+{v}_{y}^{2}+{v}_{z}^{2}}=\sqrt{{4{,}000}^{2}+{3{,}000}^{2}+{0{,}100}^{2}}\text{km}\text{/}\text{h}=5{,}001\text{km}\text{/}\text{h}.
$$

Para obtener el vector unitario $\hat{v}$, dividimos $\vec{v}$ entre su magnitud:

$$
\begin{array}{ll} \hat{v} & =\frac{\vec{v}}{v}=\frac{(4{,}000\hat{i}+3{,}000\hat{j}+0{,}100\hat{k})\text{km}\text{/}\text{h}}{5{,}001\text{km}\text{/}\text{h}} \\ & =\frac{(4{,}000\hat{i}+3{,}000\hat{j}+0{,}100\hat{k})}{5{,}001} \\ & =\frac{4{,}000}{5{,}001}\hat{i}+\frac{3{,}000}{5{,}001}\hat{j}+\frac{0{,}100}{5{,}001}\hat{k} \\ & =(79{,}98\hat{i}+59{,}99\hat{j}+2{,}00\hat{k})\,\times \,{10}^{−2}. \end{array}
$$

**Importancia.** Tenga en cuenta que, cuando utilice el método analítico con una calculadora, es aconsejable realizar sus cálculos con al menos tres decimales y luego redondear la respuesta final al número requerido de cifras significativas, que es la forma en que realizamos los cálculos en este ejemplo. Si redondea su respuesta parcial demasiado pronto, se arriesga a que su respuesta final tenga un gran error numérico y esté muy lejos de la respuesta exacta o de un valor medido en un experimento.
:::

:::callout{type="comprobacion" title="Compruebe lo aprendido"}
Verifique que el vector $\hat{v}$ obtenido en el aquí es efectivamente un vector unitario calculando su magnitud. Si el convoy del aquí se desplazara por una llanura desértica (es decir, si el tercer componente de su velocidad fuera cero), ¿cuál es el vector unitario de su dirección de movimiento? ¿Qué dirección geográfica representa?

**Respuesta.** $\hat{v}=0{,}8\hat{i}+0{,}6\hat{j}$, $36{,}87\text{°}$ al norte del este
:::

### Resumen

- Los métodos analíticos del álgebra vectorial nos permiten encontrar las resultantes de las sumas o diferencias de vectores sin tener que dibujarlas. Los métodos analíticos de suma de vectores son exactos, al contrario que los métodos gráficos, que son aproximados.
- Los métodos analíticos del álgebra vectorial se utilizan habitualmente en mecánica, electricidad y magnetismo. Son importantes herramientas matemáticas de la física.

### Términos clave

:::paragraphs{style="termino"}
**vectores iguales** dos vectores son iguales si y solo si todos sus componentes correspondientes son iguales; alternativamente, dos vectores paralelos de magnitudes iguales

**vector nulo** un vector con todos sus componentes iguales a cero
:::

## Productos de los vectores

:::callout{type="objetivos" title="Objetivos de aprendizaje"}
- Explicar la diferencia entre el producto escalar y el producto vectorial de dos vectores.
- Determinar el producto escalar de dos vectores.
- Determinar el producto vectorial de dos vectores.
- Describir cómo se utilizan los productos de vectores en física.
:::

Un vector puede multiplicarse por otro vector pero no puede dividirse entre otro vector. Hay dos tipos de productos de vectores que se utilizan ampliamente en la física y la ingeniería. Un tipo de multiplicación es la *multiplicación escalar de dos vectores*. El producto escalar de dos vectores da como resultado un número (un escalar), como su nombre lo indica. Los productos escalares se utilizan para definir las relaciones de trabajo y energía. Por ejemplo, el trabajo que una fuerza (un vector) realiza sobre un objeto y provoca su desplazamiento (un vector) se define como un producto escalar del vector de fuerza por el vector de desplazamiento. Otro tipo de multiplicación muy diferente es la *multiplicación vectorial de vectores*. El producto vectorial de dos vectores da como resultado un vector, como su nombre lo indica. Los productos vectoriales se utilizan para definir otras cantidades vectoriales derivadas. Por ejemplo, al describir las rotaciones, una cantidad vectorial llamada *torque* se define como un producto vectorial de una fuerza aplicada (un vector) y su distancia desde el pivote a la fuerza (un vector). Es importante distinguir entre estos dos tipos de multiplicaciones vectoriales porque el producto escalar es una cantidad escalar y el producto vectorial es una cantidad vectorial.

### El producto escalar de dos vectores (el producto punto)

La multiplicación escalar de dos vectores da como resultado un producto escalar.

**Producto escalar (producto punto).** El **producto escalar** $\vec{A}\cdot \vec{B}$ de dos vectores $\vec{A}$ y $\vec{B}$ es un número definido por la ecuación

$$
\vec{A}\cdot \vec{B}=AB\,\text{cos}\,\varphi ,
$$

donde $\varphi$ es el ángulo entre los vectores (mostrado en la :ref{id="es-2-cnx-uphysics-02-04-prod-s"}). El producto escalar también se denomina **producto punto** por la notación de punto que lo indica.

En la definición del producto punto, la dirección del ángulo $\varphi$ no importa, y $\varphi$ se puede medir desde cualquiera de los dos vectores hacia el otro porque $\text{cos}\,\varphi =\text{cos}\,(\text{−}\varphi )=\text{cos}\,(2\pi -\varphi )$. El producto punto es un número negativo cuando $90\text{°}<\varphi \le 180\text{°}$ y es un número positivo cuando $0\text{°}\le \varphi <90\text{°}$. Además, el producto punto de dos vectores paralelos es $\vec{A}\cdot \vec{B}=AB\,\text{cos}\,0\text{°}=AB$, y el producto punto de dos vectores antiparalelos es $\vec{A}\cdot \vec{B}=AB\,\text{cos}\,180\text{°}=\text{−}AB$. El producto escalar de dos *vectores ortogonales* es igual a cero: $\vec{A}\cdot \vec{B}=AB\,\text{cos}\,90\text{°}=0$. El producto escalar de un vector consigo mismo es el cuadrado de su magnitud:

$$
{\vec{A}}^{2}\equiv \vec{A}\cdot \vec{A}=AA\,\text{cos}\,0\text{°}={A}^{2}.
$$

:::callout{type="ejemplo" title="El producto escalar"}
Para los vectores mostrados en la aquí, halle el producto escalar $\vec{A}\cdot \vec{F}$.

**Estrategia.** A partir de la aquí, la magnitud de los vectores $\vec{A}$ y $\vec{F}$ son *A* = 10,0 y *F* = 20,0. El ángulo $\theta$, entre ellos, es la diferencia: $\theta =\varphi -\alpha =110\text{°}-35\text{°}=75\text{°}$. Sustituyendo estos valores en la aquí obtenemos el producto escalar.

**Solución.** Un cálculo sencillo nos da

$$
\vec{A}\cdot \vec{F}=AF\,\text{cos}\,\theta =(10{,}0)(20{,}0)\,\text{cos}\,75\text{°}=51{,}76.
$$
:::

:::callout{type="comprobacion" title="Compruebe lo aprendido"}
Para los vectores dados en la aquí, halle el producto escalar $\vec{A}\cdot \vec{B}$ y $\vec{F}\cdot \vec{C}$.

**Respuesta.** $\vec{A}\cdot \vec{B}=-57{,}3$, $\vec{F}\cdot \vec{C}=27{,}8$
:::

En el sistema de coordenadas cartesianas, los productos escalares del vector unitario de un eje con otros vectores unitarios de ejes siempre son iguales a cero porque estos vectores unitarios son ortogonales:

$$
\begin{array}{l} \hat{i}\cdot \hat{j}=|\hat{i}||\hat{j}|\,\text{cos}\,90\text{°}=(1)(1)(0)=0, \\ \hat{i}\cdot \hat{k}=|\hat{i}||\hat{k}|\,\text{cos}\,90\text{°}=(1)(1)(0)=0, \\ \hat{k}\cdot \hat{j}=|\hat{k}||\hat{j}|\,\text{cos}\,90\text{°}=(1)(1)(0)=0. \end{array}
$$

En estas ecuaciones, utilizamos el hecho de que la magnitud de todos los vectores unitarios es uno: $|\hat{i}|=|\hat{j}|=|\hat{k}|=1$. Para los vectores unitarios de los ejes, la aquí da las siguientes identidades:

$$
\hat{i}\cdot \hat{i}={i}^{2}=\hat{j}\cdot \hat{j}={j}^{2}=\hat{k}\cdot \hat{k}={k}^{2}=1.
$$

El producto escalar $\vec{A}\cdot \vec{B}$ también puede interpretarse como el producto de *B* con la proyección ${A}_{ǁ}$ del vector $\vec{A}$ en la dirección del vector $\vec{B}$ (:ref{id="es-2-cnx-uphysics-02-04-prod-s"}(b)) o el producto de *A* con la proyección ${B}_{ǁ}$ del vector $\vec{B}$ en la dirección del vector $\vec{A}$ (:ref{id="es-2-cnx-uphysics-02-04-prod-s"}(c)):

$$
\begin{array}{ll} \vec{A}\cdot \vec{B} & =AB\,\text{cos}\,\varphi \\ & =B(A\,\text{cos}\,\varphi )=B{A}_{ǁ} \\ & =A(B\,\text{cos}\,\varphi )=A{B}_{ǁ}. \end{array}
$$

Por ejemplo, en el sistema de coordenadas rectangulares en un plano, el componente escalar *x* de un vector es su producto punto con el vector unitario $\hat{i}$, y el componente escalar *y* de un vector es su producto punto con el vector unitario $\hat{j}$:

$$
\{\begin{array}{l} \vec{A}\cdot \hat{i}=|\vec{A}||\hat{i}|\,\text{cos}\,{\theta }_{A}=A\,\text{cos}\,{\theta }_{A}={A}_{x} \\ \vec{A}\cdot \hat{j}=|\vec{A}||\hat{j}|\,\text{cos}\,(90\text{°}-{\theta }_{A})=A\,\text{sen}\,{\theta }_{A}={A}_{y} \end{array}.
$$

La multiplicación escalar de vectores es conmutativa,

:::callout{type="nota" title="Nota"}
$$
\vec{A}\cdot \vec{B}=\vec{B}\cdot \vec{A},
$$
:::

y obedece a la ley distributiva:

:::callout{type="nota" title="Nota"}
$$
\vec{A}\cdot (\vec{B}+\vec{C})=\vec{A}\cdot \vec{B}+\vec{A}\cdot \vec{C}.
$$
:::

Podemos utilizar las leyes conmutativa y distributiva para derivar varias relaciones para los vectores, como expresar el producto punto de dos vectores en términos de sus componentes escalares.

:::callout{type="comprobacion" title="Compruebe lo aprendido"}
Para el vector $\vec{A}={A}_{x}\hat{i}+{A}_{y}\hat{j}+{A}_{z}\hat{k}$ en un sistema de coordenadas rectangulares, utilice la aquí hasta aquí para demostrar que $\vec{A}\cdot \hat{i}={A}_{x}$ $\vec{A}\cdot \hat{j}={A}_{y}$ y $\vec{A}\cdot \hat{k}={A}_{z}$.
:::

Cuando los vectores en la aquí se dan en sus formas de componentes vectoriales,

$$
\vec{A}={A}_{x}\hat{i}+{A}_{y}\hat{j}+{A}_{z}\hat{k}\,\text{y}\,\vec{B}={B}_{x}\hat{i}+{B}_{y}\hat{j}+{B}_{z}\hat{k},
$$

podemos calcular su producto escalar de la siguiente manera:

$$
\begin{array}{lll} \vec{A}\cdot \vec{B} & = & ({A}_{x}\hat{i}+{A}_{y}\hat{j}+{A}_{z}\hat{k})\cdot ({B}_{x}\hat{i}+{B}_{y}\hat{j}+{B}_{z}\hat{k}) \\ & = & \,{A}_{x}{B}_{x}\hat{i}\cdot \hat{i}+{A}_{x}{B}_{y}\hat{i}\cdot \hat{j}+{A}_{x}{B}_{z}\hat{i}\cdot \hat{k} \\ & & +{A}_{y}{B}_{x}\hat{j}\cdot \hat{i}+{A}_{y}{B}_{y}\hat{j}\cdot \hat{j}+{A}_{y}{B}_{z}\hat{j}\cdot \hat{k} \\ & & +{A}_{z}{B}_{x}\,\hat{k}\cdot \hat{i}+{A}_{z}{B}_{y}\hat{k}\cdot \hat{j}+{A}_{z}{B}_{z}\,\hat{k}\cdot \hat{k}. \end{array}
$$

Como los productos escalares de dos vectores unitarios diferentes de los ejes dan cero, y los productos escalares de los vectores unitarios con ellos mismos dan uno (vea la aquí y la aquí), solo hay tres términos que no son cero en esta expresión. Por lo tanto, el producto escalar se simplifica a

:::callout{type="nota" title="Nota"}
$$
\vec{A}\cdot \vec{B}={A}_{x}{B}_{x}+{A}_{y}{B}_{y}+{A}_{z}{B}_{z}.
$$
:::

Podemos utilizar la aquí para el producto escalar en términos de componentes escalares de vectores para encontrar el **ángulo entre dos vectores**. Si dividimos la aquí entre *AB*, obtenemos la ecuación para $\text{cos}\,\varphi$, en la que sustituimos la aquí:

:::callout{type="nota" title="Nota"}
$$
\text{cos}\,\varphi =\frac{\vec{A}\cdot \vec{B}}{AB}=\frac{{A}_{x}{B}_{x}+{A}_{y}{B}_{y}+{A}_{z}{B}_{z}}{AB}.
$$
:::

El ángulo $\varphi$ entre los vectores $\vec{A}$ y $\vec{B}$ se obtiene tomando el coseno inverso de la expresión en la aquí.

:::callout{type="ejemplo" title="Ángulo entre dos fuerzas"}
Tres perros halan de un palo en diferentes direcciones, como se muestra en la :ref{id="es-2-cnx-uphysics-02-04-dogs"}. El primer perro hala con fuerza ${\vec{F}}_{1}=(10{,}0\hat{i}-20{,}4\hat{j}+2{,}0\hat{k})\text{N}$, el segundo perro hala con fuerza ${\vec{F}}_{2}=(−15{,}0\hat{i}-6{,}2\hat{k})\text{N}$, y el tercer perro hala con fuerza ${\vec{F}}_{3}=(5{,}0\hat{i}+12{,}5\hat{j})\text{N}$. ¿Cuál es el ángulo entre las fuerzas ${\vec{F}}_{1}$ y ${\vec{F}}_{2}$?

**Estrategia.** Los componentes del vector de fuerza ${\vec{F}}_{1}$ son ${F}_{1x}=10{,}0\,\text{N}$, ${F}_{1y}=−20{,}4\,\text{N}$ y ${F}_{1z}=2{,}0\,\text{N}$, mientras que los del vector de fuerza ${\vec{F}}_{2}$ son ${F}_{2x}=−15{,}0\,\text{N}$, ${F}_{2y}=0{,}0\,\text{N}$ y ${F}_{2z}=−6{,}2\,\text{N}$. Calculando el producto escalar de estos vectores y sus magnitudes, y sustituyendo en la aquí se obtiene el ángulo de interés.

**Solución.** Las magnitudes de las fuerzas ${\vec{F}}_{1}$ y ${\vec{F}}_{2}$ son

$$
{F}_{1}=\sqrt{{F}_{1x}^{2}+{F}_{1y}^{2}+{F}_{1z}^{2}}=\sqrt{{10{,}0}^{2}+{20{,}4}^{2}+{2{,}0}^{2}}\,\text{N}=22{,}8\,\text{N}
$$

y

$$
{F}_{2}=\sqrt{{F}_{2x}^{2}+{F}_{2y}^{2}+{F}_{2z}^{2}}=\sqrt{{15{,}0}^{2}+{6{,}2}^{2}}\,\text{N}=16{,}2\,\text{N}.
$$

Sustituyendo los componentes escalares en la aquí produce el producto escalar

$$
\begin{array}{ll} {\vec{F}}_{1}\cdot {\vec{F}}_{2} & ={F}_{1x}{F}_{2x}+{F}_{1y}{F}_{2y}+{F}_{1z}{F}_{2z} \\ & =(10{,}0\,\text{N})(−15{,}0\,\text{N})+(−20{,}4\,\text{N})(0{,}0\,\text{N})+(2{,}0\,\text{N})(−6{,}2\,\text{N}) \\ & =−162{,}4\,{\text{N}}^{2}. \end{array}
$$

Finalmente, sustituyendo todo en la aquí se obtiene el ángulo

$$
\text{cos}\,\varphi =\frac{{\vec{F}}_{1}\cdot {\vec{F}}_{2}}{{F}_{1}{F}_{2}}=\frac{−162{,}4\,{\text{N}}^{2}}{(22{,}8\,\text{N})(16{,}2\,\text{N})}=−0{,}439\Rightarrow \,\varphi ={\text{cos}}^{−1}(−0{,}439)=116{,}0\text{°}.
$$

**Importancia.** Observe que, cuando los vectores se dan en términos de los vectores unitarios de los ejes, podemos encontrar el ángulo entre ellos sin conocer los detalles de las direcciones geográficas que representan los vectores unitarios. En este caso, por ejemplo, la dirección de la *x* + puede ser hacia el este y la dirección de la +*y* puede ser hacia el norte. Sin embargo, el ángulo entre las fuerzas en el problema es el mismo si la dirección de la *x* + está al oeste y la dirección de la +*y* está al sur.
:::

:::callout{type="comprobacion" title="Compruebe lo aprendido"}
Halle el ángulo entre las fuerzas ${\vec{F}}_{1}$ y ${\vec{F}}_{3}$ en el aquí.

**Respuesta.** $131{,}9\text{°}$
:::

:::callout{type="ejemplo" title="El trabajo de una fuerza"}
Cuando la fuerza $\vec{F}$ hala de un objeto y cuando provoca su desplazamiento $\vec{D}$, decimos que la fuerza realiza un trabajo. La cantidad de trabajo que realiza la fuerza es el producto escalar $\vec{F}\cdot \vec{D}$. Si el palo en el aquí se mueve momentáneamente y se desplaza por el vector $\vec{D}=(−7{,}9\hat{j}-4{,}2\hat{k})\,\text{cm}$, ¿cuánto trabajo hace el tercer perro en el aquí?

**Estrategia.** Calculamos el producto escalar del vector de desplazamiento $\vec{D}$ con el vector de fuerza ${\vec{F}}_{3}=(5{,}0\hat{i}+12{,}5\hat{j})\text{N}$, que es el tirón del tercer perro. Utilicemos ${W}_{3}$ para denotar el trabajo realizado por la fuerza ${\vec{F}}_{3}$ en el desplazamiento $\vec{D}$.

**Solución.** El cálculo del trabajo es la aplicación directa del producto punto:

$$
\begin{array}{ll} {W}_{3} & ={\vec{F}}_{3}\cdot \vec{D}={F}_{3x}{D}_{x}+{F}_{3y}{D}_{y}+{F}_{3z}{D}_{z} \\ & =(5{,}0\,\text{N})(0{,}0\,\text{cm})+(12{,}5\,\text{N})(−7{,}9\,\text{cm})+(0{,}0\,\text{N})(-4{,}2\,\text{cm}) \\ & =-98{,}7\,\text{N}\cdot \text{cm}. \end{array}
$$

**Importancia.** La unidad de trabajo del SI se denomina julio $(\text{J})$, donde 1 J = 1 $\text{N}\cdot \text{m}$. La unidad $\text{cm}\cdot \text{N}$ puede escribirse como ${10}^{−2}\text{m}\cdot \text{N}={10}^{−2}\text{J}$, por lo que la respuesta puede expresarse como ${W}_{3}=-0{,}9875\,\text{J}\approx −1{,}0\,\text{J}$.
:::

:::callout{type="comprobacion" title="Compruebe lo aprendido"}
¿Cuánto trabajo realizan el primer perro y el segundo en el aquí sobre el desplazamiento en el aquí?

**Respuesta.** ${W}_{1}=1{,}5\,\text{J}$, ${W}_{2}=0{,}3\,\text{J}$
:::

### El producto vectorial de dos vectores (el producto cruz)

La multiplicación de dos vectores da como resultado un producto vectorial.

**Producto vectorial (producto cruz).** El **producto vectorial** de dos vectores $\vec{A}$ y $\vec{B}$ se denota por $\vec{A}\,\times \,\vec{B}$ y suele denominarse **producto cruz**. El producto vectorial es un vector que tiene su dirección perpendicular a ambos vectores $\vec{A}$ y $\vec{B}$. En otras palabras, el vector $\vec{A}\,\times \,\vec{B}$ es perpendicular al plano que contiene los vectores $\vec{A}$ y $\vec{B}$, como se muestra en la :ref{id="es-2-cnx-uphysics-02-04-prod-v"}. La magnitud del producto vectorial se define como

$$
|\vec{A}\,\times \,\vec{B}|=\,AB\,\text{sen}\,\varphi ,
$$

donde el ángulo $\varphi$, entre los dos vectores, se mide desde el vector $\vec{A}$ (primer vector del producto) al vector $\vec{B}$ (segundo vector del producto), como se indica en la :ref{id="es-2-cnx-uphysics-02-04-prod-v"}, y está entre $0\text{°}$ y $180\text{°}$.

Según la aquí, el producto vectorial es igual a cero para pares de vectores que son paralelos $(\varphi =0\text{°})$ o antiparalelos $(\varphi =180\text{°})$ porque $\text{sen}\,0\text{°}=\text{sen}\,180\text{°}=0$. (:ref{id="es-2-cnx-uphysics-02-04-prod-v" case="lower"})

En la línea perpendicular al plano que contiene los vectores $\vec{A}$ y $\vec{B}$ hay dos direcciones alternativas: hacia arriba o hacia abajo, como se muestra en la :ref{id="es-2-cnx-uphysics-02-04-prod-v"}, y la dirección del producto vectorial puede ser cualquiera de ellas. En la orientación estándar de la mano derecha, donde el ángulo entre los vectores se mide en sentido contrario a las agujas del reloj desde el primer vector, el vector $\vec{A}\,\times \,\vec{B}$ apunta *hacia arriba*, como se ve en la :ref{id="es-2-cnx-uphysics-02-04-prod-v"}(a). Si invertimos el orden de la multiplicación, de modo que ahora $\vec{B}$ es lo primero en el producto, entonces el vector $\vec{B}\,\times \,\vec{A}$ debe apuntar *hacia abajo*, como se ve en la :ref{id="es-2-cnx-uphysics-02-04-prod-v"}(b). Esto significa que los vectores $\vec{A}\,\times \,\vec{B}$ y $\vec{B}\,\times \,\vec{A}$ son *antiparalelos* entre sí y que la multiplicación de vectores *no* es conmutativa, sino *anticonmutativa*. La **anticonmutatividad** significa que el producto vectorial invierte el signo cuando se invierte el orden de la multiplicación:

:::callout{type="nota" title="Nota"}
$$
\vec{A}\,\times \,\vec{B}=\text{−}\vec{B}\,\times \,\vec{A}.
$$
:::

La **regla de la mano derecha** es un mnemotécnico común que sirve para determinar la dirección del producto vectorial. Como se muestra en la :ref{id="es-2-cnx-uphysics-02-04-corkscrew"}, un sacacorchos se coloca en una dirección perpendicular al plano que contiene los vectores $\vec{A}$ y $\vec{B}$, y su mango se gira en la dirección del primer al segundo vector del producto. La dirección del producto cruz se da por la progresión del sacacorchos.

:::callout{type="ejemplo" title="El torque de una fuerza"}
La ventaja mecánica que proporciona una herramienta familiar llamada *llave inglesa* (:ref{id="es-2-cnx-uphysics-02-04-wrench"}) depende de la magnitud *F* de la fuerza aplicada, de su dirección con respecto al mango de la llave y de la distancia a la que se aplica esta fuerza. La distancia *R* desde la tuerca hasta el punto donde el vector de fuerza $\vec{F}$ se une está representado por el vector radial $\vec{R}$. La cantidad física vectorial que hace girar la tuerca se denomina *torque* (denotado por $\vec{\tau })$, y es el producto vectorial de la distancia entre el pivote a la fuerza con la fuerza: $\vec{\tau }=\vec{R}\,\times \,\vec{F}$.

Para aflojar una tuerca oxidada, se aplica una fuerza de 20,00 N al mango de la llave en ángulo $\varphi =40\text{°}$ y a una distancia de 0,25 m de la tuerca, como se muestra en la :ref{id="es-2-cnx-uphysics-02-04-wrench"}(a). Calcule la magnitud y la dirección del torque aplicado a la tuerca. ¿Cuál sería la magnitud y la dirección del torque si la fuerza se aplicara con un ángulo $\varphi =45\text{°}$, como se muestra en la :ref{id="es-2-cnx-uphysics-02-04-wrench"}(b)? ¿Para qué valor del ángulo $\varphi$ el torque tiene la mayor magnitud?

**Estrategia.** Adoptamos el marco de referencia mostrado en la :ref{id="es-2-cnx-uphysics-02-04-wrench"}, donde los vectores $\vec{R}$ y $\vec{F}$ se encuentran en el plano *xy* y el origen está en la posición de la tuerca. La dirección radial a lo largo del vector $\vec{R}$ (apuntando lejos del origen) es la dirección de referencia para medir el ángulo $\varphi$ porque $\vec{R}$ es el primer vector del producto vectorial $\vec{\tau }=\vec{R}\,\times \,\vec{F}$. El vector $\vec{\tau }$ debe estar a lo largo del eje de la *z* porque este es el eje perpendicular al plano *xy*, donde ambos $\vec{R}$ y $\vec{F}$ están. Para calcular la magnitud de $\tau$, utilizamos la aquí. Para encontrar la dirección de $\vec{\tau }$, utilizamos la regla de la mano derecha (:ref{id="es-2-cnx-uphysics-02-04-corkscrew"}).

**Solución.** Para la situación de (a), la regla del sacacorchos nos da la dirección de $\vec{R}\,\times \,\vec{F}$ en la dirección positiva del eje *z*. Físicamente, significa que el vector de torque $\vec{\tau }$ apunta fuera de la página, perpendicular al mango de la llave. Identificamos *F* = 20,00 N y *R* = 0,25 m, y calculamos la magnitud utilizando la aquí:

$$
\tau \,=|\vec{R}\,\times \,\vec{F}|=\,RF\,\text{sen}\,\varphi =(0{,}25\,\text{m})(20{,}00\,\text{N})\,\text{sen}\,40\text{°}=3{,}21\,\text{N}\cdot \text{m}.
$$

Para la situación en (b), la regla del sacacorchos da la dirección de $\vec{R}\,\times \,\vec{F}$ en la dirección negativa del eje *z*. Físicamente, significa que el vector $\vec{\tau }$ apunta a la página, perpendicular al mango de la llave. La magnitud de este torque es

$$
\tau \,=|\vec{R}\,\times \,\vec{F}|=\,RF\,\text{sen}\,\varphi =(0{,}25\,\text{m})(20{,}00\,\text{N})\,\text{sen}\,45\text{°}=3{,}53\,\text{N}\cdot \text{m}.
$$

El torque tiene el mayor valor cuando el $\text{sen}\,\varphi =1$, lo que se produce cuando $\varphi =90\text{°}$. Físicamente, significa que la llave inglesa es más eficaz, es decir, nos proporciona la mejor ventaja mecánica, cuando aplicamos la fuerza perpendicular al mango de la llave. Para la situación de este ejemplo, este valor óptimo de torque es ${\tau }_{\text{óptimo}}=RF=(0{,}25\,\text{m})(20{,}00\,\text{N})=5{,}00\,\text{N}\cdot \text{m}$.

**Importancia.** Cuando resolvemos problemas de mecánica, a menudo no necesitamos utilizar la regla del sacacorchos en absoluto, como veremos ahora en la siguiente solución equivalente. Observe que una vez que hemos identificado ese vector $\vec{R}\,\times \,\vec{F}$ que se encuentra a lo largo del eje *z*, podemos escribir este vector en términos del vector unitario $\hat{k}$ del eje *z*:

$$
\vec{R}\,\times \,\vec{F}=RF\,\text{sen}\,\varphi \hat{k}.
$$

En esta ecuación, el número que multiplica $\hat{k}$ es el componente escalar *z* del vector $\vec{R}\,\times \,\vec{F}$. En el cálculo de este componente, hay que tener en cuenta que el ángulo $\varphi$ se mide *en sentido contrario a las agujas del reloj* desde $\vec{R}$ (primer vector) al $\vec{F}$ (segundo vector). Siguiendo este principio para los ángulos, obtenemos $RF\,\text{sen}\,(+40\text{°})=+3{,}2\,\text{N}\cdot \text{m}$ para la situación en (a), y obtenemos $RF\,\text{sen}\,(−45\text{°})=−3{,}5\,\text{N}\cdot \text{m}$ para la situación en (b). En este último caso, el ángulo es negativo porque el gráfico en la :ref{id="es-2-cnx-uphysics-02-04-wrench"} indica que el ángulo se mide en el sentido de las agujas del reloj; pero, el mismo resultado se obtiene cuando este ángulo se mide en sentido contrario a las agujas del reloj porque $+(360\text{°}-45\text{°})=+315\text{°}$ y $\text{sen}\,(+315\text{°})=\text{sen}\,(−45\text{°})$. De este modo, obtenemos la solución sin referencia a la regla del sacacorchos. Para la situación en (a), la solución es $\vec{R}\,\times \,\vec{F}=+3{,}2\,\text{N}\cdot \text{m}\hat{k}$; para la situación en (b), la solución es $\vec{R}\,\times \,\vec{F}=−3{,}5\,\text{N}\cdot \text{m}\hat{k}$.
:::

:::callout{type="comprobacion" title="Compruebe lo aprendido"}
Para los vectores dados en la aquí, halle el producto vectorial $\vec{A}\,\times \,\vec{B}$ y $\vec{C}\,\times \,\vec{F}$.

**Respuesta.** $\vec{A}\,\times \,\vec{B}=-40{,}1\hat{k}$ o, de forma equivalente, $|\vec{A}\,\times \,\vec{B}|=40{,}1$, y la dirección es hacia la página $\vec{C}\,\times \,\vec{F}=+157{,}6\hat{k}$ o, de forma equivalente, $|\vec{C}\,\times \,\vec{F}|=157{,}6$, y la dirección es hacia fuera de la página.
:::

Al igual que el producto punto (aquí), el producto cruz tiene la siguiente propiedad distributiva:

:::callout{type="nota" title="Nota"}
$$
\vec{A}\,\times \,(\vec{B}+\vec{C})=\vec{A}\,\times \,\vec{B}+\vec{A}\,\times \,\vec{C}.
$$
:::

La propiedad distributiva se aplica frecuentemente cuando los vectores se expresan en sus formas componentes, en términos de vectores unitarios de ejes cartesianos.

Cuando aplicamos la definición del producto cruz, la aquí, a los vectores unitarios $\hat{i}$, $\hat{j}$ y $\hat{k}$ que definen las direcciones de la *x*, la *y* y la *z* positivas en el espacio, encontramos que

$$
\hat{i}\,\times \,\hat{i}=\hat{j}\,\times \,\hat{j}=\hat{k}\,\times \,\hat{k}=0.
$$

Todos los demás productos cruz de estos tres vectores unitarios deben ser vectores de magnitud unitaria porque $\hat{i}$, $\hat{j}$ y $\hat{k}$ son ortogonales. Por ejemplo, para el par $\hat{i}$ y $\hat{j}$, la magnitud es $|\hat{i}\,\times \,\hat{j}|=ij\,\text{sen}\,90\text{°}=(1)(1)(1)=1$. La dirección del producto vectorial $\hat{i}\,\times \,\hat{j}$ debe ser ortogonal al plano *xy*, lo que significa que debe estar a lo largo del eje de la *z*. Los únicos vectores unitarios a lo largo del eje *z* son $\text{−}\hat{k}$ o $+\hat{k}$. Por la regla del sacacorchos, la dirección del vector $\hat{i}\,\times \,\hat{j}$ debe ser paralela al eje *z* positivo. Por lo tanto, el resultado de la multiplicación $\hat{i}\,\times \,\hat{j}$ es idéntico a $+\hat{k}$. Podemos repetir un razonamiento similar para los pares restantes de vectores unitarios. Los resultados de estas multiplicaciones son

:::callout{type="nota" title="Nota"}
$$
\{\begin{array}{l} \hat{i}\,\times \,\hat{j}=+\hat{k}, \\ \hat{j}\,\times \,\hat{k}=+\hat{i}, \\ \hat{k}\,\times \,\hat{i}=+\hat{j}. \end{array}
$$
:::

Observe que en la aquí, los tres vectores unitarios $\hat{i}$, $\hat{j}$ y $\hat{k}$ aparecen en el *orden cíclico* que se muestra en el diagrama de la :ref{id="es-2-cnx-uphysics-02-04-uniprod"}(a). El orden cíclico significa que en la fórmula del producto, $\hat{i}$ le sigue $\hat{k}$ y viene antes de $\hat{j}$, o $\hat{k}$ le sigue $\hat{j}$ y viene antes de $\hat{i}$, o $\hat{j}$ le sigue $\hat{i}$ y viene antes de $\hat{k}$. El producto cruz de dos vectores unitarios diferentes siempre es un tercer vector unitario. Cuando dos vectores unitarios en el producto cruz aparecen en el orden cíclico, el resultado de dicha multiplicación es el vector unitario restante, como se ilustra en la :ref{id="es-2-cnx-uphysics-02-04-uniprod"}(b). Cuando los vectores unitarios en el producto cruz aparecen en un orden diferente, el resultado es un vector unitario antiparalelo al vector unitario restante (es decir, el resultado es con el signo menos, como muestran los ejemplos de la :ref{id="es-2-cnx-uphysics-02-04-uniprod"}(c) y la :ref{id="es-2-cnx-uphysics-02-04-uniprod"}(d). En la práctica, cuando la tarea es encontrar productos cruz de vectores que están dados en forma de componentes vectoriales, esta regla para la multiplicación cruzada de vectores unitarios es muy útil.

Supongamos que queremos encontrar el producto cruz $\vec{A}\,\times \,\vec{B}$ para los vectores $\vec{A}={A}_{x}\hat{i}+{A}_{y}\hat{j}+{A}_{z}\hat{k}$ y $\vec{B}={B}_{x}\hat{i}+{B}_{y}\hat{j}+{B}_{z}\hat{k}$. Podemos utilizar la propiedad distributiva (aquí), la anticonmutatividad (aquí), y los resultados en la aquí y la aquí para vectores unitarios para realizar la siguiente operación de álgebra:

$$
\begin{array}{lll} \vec{A}\,\times \,\vec{B} & = & ({A}_{x}\hat{i}+{A}_{y}\hat{j}+{A}_{z}\hat{k})\,\times \,({B}_{x}\hat{i}+{B}_{y}\hat{j}+{B}_{z}\hat{k}) \\ & = & {A}_{x}\hat{i}\,\times \,({B}_{x}\hat{i}+{B}_{y}\hat{j}+{B}_{z}\hat{k})+{A}_{y}\hat{j}\,\times \,({B}_{x}\hat{i}+{B}_{y}\hat{j}+{B}_{z}\hat{k})+{A}_{z}\hat{k}\,\times \,({B}_{x}\hat{i}+{B}_{y}\hat{j}+{B}_{z}\hat{k}) \\ & = & \,{A}_{x}{B}_{x}\hat{i}\,\times \,\hat{i}+{A}_{x}{B}_{y}\hat{i}\,\times \,\hat{j}+{A}_{x}{B}_{z}\hat{i}\,\times \,\hat{k} \\ & & +{A}_{y}{B}_{x}\hat{j}\,\times \,\hat{i}+{A}_{y}{B}_{y}\hat{j}\,\times \,\hat{j}+{A}_{y}{B}_{z}\hat{j}\,\times \,\hat{k} \\ & & +{A}_{z}{B}_{x}\hat{k}\,\times \,\hat{i}+{A}_{z}{B}_{y}\hat{k}\,\times \,\hat{j}+{A}_{z}{B}_{z}\hat{k}\,\times \,\hat{k} \\ & = & \,{A}_{x}{B}_{x}(0)+{A}_{x}{B}_{y}(+\hat{k})+{A}_{x}{B}_{z}(\text{−}\hat{j}) \\ & & +{A}_{y}{B}_{x}(\text{−}\hat{k})+{A}_{y}{B}_{y}(0)+{A}_{y}{B}_{z}(+\hat{i}) \\ & & +{A}_{z}{B}_{x}(+\hat{j})+{A}_{z}{B}_{y}(\text{−}\hat{i})+{A}_{z}{B}_{z}(0). \end{array}
$$

Cuando se realicen operaciones algebraicas que impliquen el producto cruz, hay que tener mucho cuidado en mantener el orden correcto de la multiplicación, ya que el producto cruz es anticonmutativo. Los dos últimos pasos que nos quedan por hacer para completar nuestra tarea son, primero, agrupar los términos que contienen un vector unitario común y, segundo, factorizar. De esta manera obtenemos la siguiente expresión muy útil para el cálculo del producto cruz:

:::callout{type="nota" title="Nota"}
$$
\vec{C}=\vec{A}\,\times \,\vec{B}=({A}_{y}{B}_{z}-{A}_{z}{B}_{y})\hat{i}+({A}_{z}{B}_{x}-{A}_{x}{B}_{z})\hat{j}+({A}_{x}{B}_{y}-{A}_{y}{B}_{x})\hat{k}.
$$
:::

En esta expresión, los componentes escalares del vector del producto cruz son

$$
\{\begin{array}{l} {C}_{x}={A}_{y}{B}_{z}-{A}_{z}{B}_{y}, \\ {C}_{y}={A}_{z}{B}_{x}-{A}_{x}{B}_{z}, \\ {C}_{z}={A}_{x}{B}_{y}-{A}_{y}{B}_{x}. \end{array}
$$

Al momento de encontrar el producto cruz, en la práctica, podemos utilizar tanto la aquí como la aquí, dependiendo de cuál de ellas nos parezca menos compleja computacionalmente. Ambas conducen al mismo resultado final. Una forma de asegurarse de que el resultado final es correcto es utilizar ambas.

:::callout{type="ejemplo" title="Una partícula en un campo magnético"}
Al moverse en un campo magnético, algunas partículas pueden experimentar una fuerza magnética. Sin entrar en detalles, el estudio detallado de los fenómenos magnéticos se aborda en capítulos posteriores, reconozcamos que el campo magnético $\vec{B}$ es un vector, la fuerza magnética $\vec{F}$ es un vector, y la velocidad $\vec{u}$ de la partícula es un vector. El vector de fuerza magnética es proporcional al producto vectorial del vector de velocidad por el vector de campo magnético, que expresamos como $\vec{F}=\zeta \vec{u}\,\times \,\vec{B}$. En esta ecuación, una constante $\zeta$ se encarga de la coherencia en unidades físicas, por lo que podemos omitir las unidades físicas en los vectores $\vec{u}$ y $\vec{B}$. En este ejemplo, vamos a suponer que la constante $\zeta$ es positiva.

Una partícula que se mueve en el espacio con un vector de velocidad $\vec{u}=−5{,}0\hat{i}-2{,}0\hat{j}+3{,}5\hat{k}$ entra en una región con un campo magnético y experimenta una fuerza magnética. Halle la fuerza magnética $\vec{F}$ sobre esta partícula en el punto de entrada a la región donde el vector de campo magnético es (a) $\vec{B}=7{,}2\hat{i}-\hat{j}-2{,}4\hat{k}$ y (b) $\vec{B}=4{,}5\hat{k}$. En cada caso, halle la magnitud *F* de la fuerza magnética y el ángulo $\theta$ que el vector de fuerza $\vec{F}$ hace con el vector de campo magnético dado $\vec{B}$.

**Estrategia.** Primero, queremos encontrar el producto vectorial $\vec{u}\,\times \,\vec{B}$, porque entonces podemos determinar la fuerza magnética utilizando $\vec{F}=\zeta \vec{u}\,\times \,\vec{B}$. La magnitud *F* puede hallarse mediante el uso de componentes, $F=\sqrt{{F}_{x}^{2}+{F}_{y}^{2}+{F}_{z}^{2}}$, o calculando la magnitud $|\vec{u}\,\times \,\vec{B}|$ utilizando directamente la aquí. En este último enfoque, tendríamos que encontrar el ángulo entre los vectores $\vec{u}$ y $\vec{B}$. Cuando tenemos $\vec{F}$, el método general para encontrar el ángulo direccional $\theta$ implica el cálculo del producto escalar $\vec{F}\cdot \vec{B}$ y la sustitución en la aquí. Para calcular el producto vectorial podemos utilizar la aquí o calcular el producto directamente, lo que sea más sencillo.

**Solución.** Los componentes del vector velocidad son ${u}_{x}=−5{,}0$, ${u}_{y}=−2{,}0$ y ${u}_{z}=3{,}5$.

(a) Los componentes del vector de campo magnético son ${B}_{x}=7{,}2$, ${B}_{y}=−1{,}0$ y ${B}_{z}=−2{,}4$. Sustituyéndolos en la aquí se obtienen los componentes escalares del vector $\vec{F}=\zeta \vec{u}\,\times \,\vec{B}$:

$$
\{\begin{array}{l} {F}_{x}=\zeta ({u}_{y}{B}_{z}-{u}_{z}{B}_{y})=\zeta [(−2{,}0)(−2{,}4)-(3{,}5)(−1{,}0)]=8{,}3\zeta \\ {F}_{y}=\zeta ({u}_{z}{B}_{x}-{u}_{x}{B}_{z})=\zeta [(3{,}5)(7{,}2)-(−5{,}0)(−2{,}4)]=13{,}2\zeta \\ {F}_{z}=\zeta ({u}_{x}{B}_{y}-{u}_{y}{B}_{x})=\zeta [(−5{,}0)(−1{,}0)-(−2{,}0)(7{,}2)]=19{,}4\zeta \end{array}.
$$

Por lo tanto, la fuerza magnética es $\vec{F}=\zeta (8{,}3\hat{i}+13{,}2\hat{j}+19{,}4\hat{k})$ y su magnitud es

$$
F=\sqrt{{F}_{x}^{2}+{F}_{y}^{2}+{F}_{z}^{2}}=\zeta \sqrt{{(8{,}3)}^{2}+{(13{,}2)}^{2}+{(19{,}4)}^{2}}=24{,}9\zeta .
$$

Para calcular el ángulo $\theta$, tendríamos que encontrar la magnitud del vector de campo magnético,

$$
B=\sqrt{{B}_{x}^{2}+{B}_{y}^{2}+{B}_{z}^{2}}=\sqrt{{(7{,}2)}^{2}+{(−1{,}0)}^{2}+{(−2{,}4)}^{2}}=7{,}6,
$$

y el producto escalar $\vec{F}\cdot \vec{B}$:

$$
\vec{F}\cdot \vec{B}={F}_{x}{B}_{x}+{F}_{y}{B}_{y}+{F}_{z}{B}_{z}=(8{,}3\zeta )(7{,}2)+(13{,}2\zeta )(−1{,}0)+(19{,}4\zeta )(−2{,}4)=0.
$$

Ahora, sustituyendo en la aquí obtenemos el ángulo $\theta$:

$$
\text{cos}\,\theta =\frac{\vec{F}\cdot \vec{B}}{FB}=\frac{0}{(18{,}2\zeta )(7{,}6)}=0\,\Rightarrow \,\theta =90\text{°}.
$$

Por lo tanto, el vector de fuerza magnética es perpendicular al vector de campo magnético. (Podríamos haber ahorrado algo de tiempo si hubiéramos calculado antes el producto escalar).

(b) Dado que el vector $\vec{B}=4{,}5\hat{k}$ tiene un solo componente, podemos realizar la operación de álgebra rápidamente y encontrar el producto vectorial directamente:

$$
\begin{array}{ll} \vec{F} & =\zeta \vec{u}\,\times \,\vec{B}=\zeta (−5{,}0\hat{i}-2{,}0\hat{j}+3{,}5\hat{k})\,\times \,(4{,}5\hat{k}) \\ & =\zeta [(−5{,}0)(4{,}5)\hat{i}\,\times \,\hat{k}+(−2{,}0)(4{,}5)\hat{j}\,\times \,\hat{k}+(3{,}5)(4{,}5)\hat{k}\,\times \,\hat{k}] \\ & =\zeta [-22{,}5(\text{−}\hat{j})-9{,}0(+\hat{i})+0]=\zeta (−9{,}0\hat{i}+22{,}5\hat{j}). \end{array}
$$

La magnitud de la fuerza magnética es

$$
F=\sqrt{{F}_{x}^{2}+{F}_{y}^{2}+{F}_{z}^{2}}=\zeta \sqrt{{(−9{,}0)}^{2}+{(22{,}5)}^{2}+{(0{,}0)}^{2}}=24{,}2\zeta .
$$

Dado que el producto escalar es

$$
\vec{F}\cdot \vec{B}={F}_{x}{B}_{x}+{F}_{y}{B}_{y}+{F}_{z}{B}_{z}=(−9{,}0\zeta )(0)+(22{,}5\zeta )(0)+(0)(4{,}5)=0,
$$

el vector de fuerza magnética $\vec{F}$ es perpendicular al vector de campo magnético $\vec{B}$.

**Importancia.** Incluso sin calcular el producto escalar, podemos predecir que el vector de fuerza magnética debe ser siempre perpendicular al vector de campo magnético debido a la forma en que se construye este vector. En concreto, el vector de fuerza magnética es el producto vectorial $\vec{F}=\zeta \vec{u}\,\times \,\vec{B}$ y, por la definición del producto vectorial (vea la :ref{id="es-2-cnx-uphysics-02-04-prod-v"}), el vector $\vec{F}$ debe ser perpendicular a ambos vectores $\vec{u}$ y $\vec{B}$.
:::

:::callout{type="comprobacion" title="Compruebe lo aprendido"}
Dados dos vectores $\vec{A}=\text{−}\hat{i}+\hat{j}$ y $\vec{B}=3\hat{i}-\hat{j}$, halle: (a) $\vec{A}\,\times \,\vec{B}$, (b) $|\vec{A}\,\times \,\vec{B}|$, (c) el ángulo entre $\vec{A}$ y $\vec{B}$, y (d) el ángulo entre $\vec{A}\,\times \,\vec{B}$ y el vector $\vec{C}=\hat{i}+\hat{k}$.

**Respuesta.** a. $−2\hat{k}$, b. 2, c. $153{,}4\text{°}$, d. $135\text{°}$
:::

Para concluir esta sección, queremos destacar que el "producto punto" y el "producto cruz" son objetos matemáticos totalmente diferentes que tienen significados distintos. El producto punto es un escalar; el producto cruz es un vector. En capítulos posteriores se utilizan indistintamente los términos *producto punto* y *producto escalar*. Asimismo, los términos *producto cruz* y *producto vectorial* se utilizan indistintamente.

### Resumen

- Hay dos tipos de multiplicación para los vectores. Un tipo de multiplicación es el producto escalar, también conocido como producto punto. El otro tipo de multiplicación es el producto vectorial, también conocido como producto cruz. El producto escalar de vectores es un número (escalar). El producto vectorial de vectores es un vector.
- Ambos tipos de multiplicación tienen la propiedad distributiva, pero solo el producto escalar tiene la propiedad conmutativa. El producto vectorial tiene la anticonmutatividad, lo que significa que, cuando cambiamos el orden en que se multiplican dos vectores, el resultado adquiere un signo menos.
- El producto escalar de dos vectores se obtiene multiplicando sus magnitudes por el coseno del ángulo entre ellos. El producto escalar de vectores ortogonales es igual a cero; el producto escalar de vectores antiparalelos es negativo.
- El producto vectorial de dos vectores es un vector perpendicular a ambos. Su magnitud se obtiene multiplicando sus magnitudes por el seno del ángulo entre ellas. La dirección del producto vectorial se puede determinar mediante la regla de la mano derecha. El producto vectorial de dos vectores paralelos o antiparalelos es igual a cero. La magnitud del producto vectorial es mayor para los vectores ortogonales.
- El producto escalar de vectores se utiliza para encontrar ángulos entre vectores y en las definiciones de magnitudes físicas escalares derivadas, como el trabajo o la energía.
- El producto cruz de vectores se utiliza en las definiciones de cantidades físicas vectoriales derivadas, como el torque o la fuerza magnética, y en la descripción de rotaciones.

### Ecuaciones clave

- Multiplicación por un escalar (ecuación vectorial): $\vec{B}=\alpha \vec{A}$
- Multiplicación por un escalar (ecuación escalar para las magnitudes): $B=|\alpha |A$
- Resultante de dos vectores: ${\vec{D}}_{AD}={\vec{D}}_{AC}+{\vec{D}}_{CD}$
- Ley conmutativa: $\vec{A}+\vec{B}=\vec{B}+\vec{A}$
- Ley asociativa: $(\vec{A}+\vec{B})+\vec{C}=\vec{A}+(\vec{B}+\vec{C})$
- Ley distributiva: ${\alpha }_{1}\vec{A}+{\alpha }_{2}\vec{A}=({\alpha }_{1}+{\alpha }_{2})\vec{A}$
- La forma en componentes de un vector en dos dimensiones: $\vec{A}={A}_{x}\hat{i}+{A}_{y}\hat{j}$
- Componentes escalares de un vector en dos dimensiones: $\{\begin{array}{l} {A}_{x}={x}_{e}-{x}_{b} \\ {A}_{y}={y}_{e}-{y}_{b} \end{array}$
- Magnitud de un vector en un plano: $A=\sqrt{{A}_{x}^{2}+{A}_{y}^{2}}$
- El ángulo direccional de un vector en un plano: ${\theta }_{A}={\text{tan}}^{−1}(\frac{{A}_{y}}{{A}_{x}})$
- Componentes escalares de un vector en un plano: $\{\begin{array}{l} {A}_{x}=A\,\text{cos}\,{\theta }_{A} \\ {A}_{y}=A\,\text{sen}\,{\theta }_{A} \end{array}$
- Coordenadas polares en un plano: $\{\begin{array}{l} x=r\,\text{cos}\,\varphi \\ y=r\,\text{sen}\,\varphi \end{array}$
- La forma en componentes de un vector en tres dimensiones: $\vec{A}={A}_{x}\hat{i}+{A}_{y}\hat{j}+{A}_{z}\hat{k}$
- El componente escalar *z* de un vector en tres dimensiones: ${A}_{z}={z}_{e}-{z}_{b}$
- Magnitud de un vector en tres dimensiones: $A=\sqrt{{A}_{x}^{2}+{A}_{y}^{2}+{A}_{z}^{2}}$
- Propiedad distributiva: $\alpha (\vec{A}+\vec{B})=\alpha \vec{A}+\alpha \vec{B}$
- Vector antiparalelo a $\vec{A}$: $\text{−}\vec{A}=\text{−}{A}_{x}\hat{i}-{A}_{y}\hat{j}-{A}_{z}\hat{k}$
- Vectores iguales: $\vec{A}=\vec{B}\,⇔\,\{\begin{array}{l} {A}_{x}={B}_{x} \\ {A}_{y}={B}_{y} \\ {A}_{z}={B}_{z} \end{array}$
- Componentes de la resultante de *N* vectores: $\{\begin{array}{l} {F}_{Rx}={\sum }_{k=1}^{N}{F}_{kx}={F}_{1x}+{F}_{2x}+\text{…}+{F}_{Nx} \\ {F}_{Ry}={\sum }_{k=1}^{N}{F}_{ky}={F}_{1y}+{F}_{2y}+\text{…}+{F}_{Ny} \\ {F}_{Rz}={\sum }_{k=1}^{N}{F}_{kz}={F}_{1z}+{F}_{2z}+\text{…}+{F}_{Nz} \end{array}$
- Vector unitario general: $\hat{V}=\frac{\vec{V}}{V}$
- Definición del producto escalar: $\vec{A}\cdot \vec{B}=AB\,\text{cos}\,\varphi$
- Propiedad conmutativa del producto escalar: $\vec{A}\cdot \vec{B}=\vec{B}\cdot \vec{A}$
- Propiedad distributiva del producto escalar: $\vec{A}\cdot (\vec{B}+\vec{C})=\vec{A}\cdot \vec{B}+\vec{A}\cdot \vec{C}$
- Producto escalar en términos de componentes escalares de vectores: $\vec{A}\cdot \vec{B}={A}_{x}{B}_{x}+{A}_{y}{B}_{y}+{A}_{z}{B}_{z}$
- Coseno del ángulo entre dos vectores: $\text{cos}\,\varphi =\frac{\vec{A}\cdot \vec{B}}{AB}$
- Productos punto de vectores unitarios: $\hat{i}\cdot \hat{j}=\hat{j}\cdot \hat{k}=\hat{k}\cdot \hat{i}=0$
- Magnitud del producto vectorial (definición): $|\vec{A}\,\times \,\vec{B}|=AB\,\text{sen}\,\varphi$
- Anticonmutatividad del producto vectorial: $\vec{A}\,\times \,\vec{B}=\text{−}\vec{B}\,\times \,\vec{A}$
- Propiedad distributiva del producto vectorial: $\vec{A}\,\times \,(\vec{B}+\vec{C})=\vec{A}\,\times \,\vec{B}+\vec{A}\,\times \,\vec{C}$
- Productos cruz de vectores unitarios: $\{\begin{array}{l} \hat{i}\,\times \,\hat{j}=+\hat{k}, \\ \hat{j}\,\times \,\hat{k}=+\hat{i}, \\ \hat{k}\,\times \,\hat{i}=+\hat{j}. \end{array}$
- El producto cruz en términos de componentes escalares de vectores: $\vec{A}\,\times \,\vec{B}=({A}_{y}{B}_{z}-{A}_{z}{B}_{y})\hat{i}+({A}_{z}{B}_{x}-{A}_{x}{B}_{z})\hat{j}+({A}_{x}{B}_{y}-{A}_{y}{B}_{x})\hat{k}$

### Preguntas conceptuales

1. ¿Cuál es el error en las siguientes expresiones? ¿Cómo puede corregirlas? (a) $C=\vec{A}\vec{B}$, (b) $\vec{C}=\vec{A}\vec{B}$, (c) $C=\vec{A}\,\times \,\vec{B}$, (d) $C=A\vec{B}$, (e) $C+2\vec{A}=B$, (f) $\vec{C}=A\,\times \,\vec{B}$, (g) $\vec{A}\cdot \vec{B}=\vec{A}\,\times \,\vec{B}$, (h) $\vec{C}=2\vec{A}\cdot \vec{B}$, (i) $C=\vec{A}\text{/}\vec{B}$, y (j) $C=\vec{A}\text{/}B$.

2. Si el producto cruz de dos vectores es igual a cero, ¿qué se puede decir de sus direcciones?

3. Si el producto punto de dos vectores es igual a cero, ¿qué se puede decir de sus direcciones?

4. ¿Cuál es el producto punto de un vector con el producto cruz que este vector tiene con otro vector?

### Términos clave

:::paragraphs{style="termino"}
**anticonmutatividad** el cambio en el orden de la operación introduce el signo menos

**regla de la mano derecha** una regla utilizada para determinar la dirección del producto vectorial

**producto cruz** el resultado de la multiplicación vectorial de vectores es un vector llamado producto cruz; también llamado producto vectorial

**producto punto** el resultado de la multiplicación escalar de dos vectores es un escalar llamado producto punto; también llamado producto escalar

**producto escalar** el resultado de la multiplicación escalar de dos vectores es un escalar llamado producto escalar; también llamado producto punto

**producto vectorial** el resultado de la multiplicación vectorial de vectores es un vector llamado producto vectorial; también llamado producto cruz
:::

:::paragraphs{style="fuente"}
Texto y figuras de *Física universitaria, volumen 1* (OpenStax, Rice University), licencia Creative Commons Atribución 4.0. Acceso gratuito en https://openstax.org/details/books/física-universitaria-volumen-1
:::
