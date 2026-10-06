id: tbl-truth
caption: Resultados de la investigación y relaciones verdaderas
Resultado de la investigación	Relación verdadera		
	Sí	No	Total
Sí	$c(1-\beta)R/(R+1)$	$c\alpha/(R+1)$	$c(R+\alpha-\beta R)/(R+1)$
No	$c\beta R/(R+1)$	$c(1-\alpha)/(R+1)$	$c(1-\alpha+\beta R)/(R+1)$
Total	$cR/(R+1)$	$c/(R+1)$	$c$

id: tbl-bias
caption: Resultados de la investigación y relaciones verdaderas en presencia de sesgo
Resultado de la investigación	Relación verdadera		
	Sí	No	Total
Sí	$(c[1-\beta]R+uc\beta R)/(R+1)$	$c\alpha+uc(1-\alpha)/(R+1)$	$c(R+\alpha-\beta R+u-u\alpha+u\beta R)/(R+1)$
No	$(1-u)c\beta R/(R+1)$	$(1-u)c(1-\alpha)/(R+1)$	$c(1-u)(1-\alpha+\beta R)/(R+1)$
Total	$cR/(R+1)$	$c/(R+1)$	$c$

id: tbl-teams
caption: Resultados de la investigación y relaciones verdaderas cuando hay varios estudios
Resultado de la investigación	Relación verdadera		
	Sí	No	Total
Sí	$cR(1-\beta^n)/(R+1)$	$c(1-[1-\alpha]^n)/(R+1)$	$c(R+1-[1-\alpha]^n-R\beta^n)/(R+1)$
No	$cR\beta^n/(R+1)$	$c(1-\alpha)^n/(R+1)$	$c([1-\alpha]^n+R\beta^n)/(R+1)$
Total	$cR/(R+1)$	$c/(R+1)$	$c$

id: tbl-ppv
caption: VPP de los resultados de la investigación para varias combinaciones de potencia, razón entre relaciones verdaderas y no verdaderas (*R*) y sesgo (*u*)
note: Los VPP (valores predictivos positivos) estimados suponen una tasa de error de tipo I de 0,05 para un único estudio; aquí se calculan con la ecuación (2).\\ECA, ensayo controlado aleatorizado.
$1-\beta$	$R$	$u$	Ejemplo práctico	VPP
0,80	1:1	0,10	ECA con potencia adecuada, poco sesgo y una razón previa de 1:1	
0,95	2:1	0,30	Metaanálisis confirmatorio de ECA de buena calidad	
0,80	1:3	0,40	Metaanálisis de estudios pequeños no concluyentes	
0,20	1:5	0,20	ECA de fase I/II con potencia insuficiente, pero bien hecho	
0,20	1:5	0,80	ECA de fase I/II con potencia insuficiente y mal hecho	
0,80	1:10	0,30	Estudio epidemiológico exploratorio con potencia adecuada	
0,20	1:10	0,30	Estudio epidemiológico exploratorio con potencia insuficiente	
0,20	1:1000	0,80	Investigación exploratoria orientada al descubrimiento, con pruebas masivas	
0,20	1:1000	0,20	Como el anterior, pero con un sesgo más limitado (más normalizada)	

id: fig-bias
caption: VPP (probabilidad de que un resultado de la investigación sea verdadero) en función de la razón de probabilidades previa al estudio para varios niveles de sesgo, *u*
note: Los paneles corresponden a una potencia de 0,80, 0,50 y 0,20. Dibujada en código con la ecuación (2) para los valores de *u* de la leyenda de 2005, con la curva sin sesgo (*u* = 0) en trazo discontinuo; las curvas impresas en 2005 corresponden a *u* = 0; 0,05; 0,20 y 0,80.
alt: Tres paneles de curvas crecientes: el VPP aumenta con la razón previa y baja cuando crece el sesgo.

id: fig-teams
caption: VPP (probabilidad de que un resultado de la investigación sea verdadero) en función de la razón de probabilidades previa al estudio para distintos números de estudios, *n*
note: Los paneles corresponden a una potencia de 0,80, 0,50 y 0,20. Dibujada en código con la ecuación (3).
alt: Tres paneles de curvas crecientes: el VPP baja cuando más equipos estudian la misma pregunta.
