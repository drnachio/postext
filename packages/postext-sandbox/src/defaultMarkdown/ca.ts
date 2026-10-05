export const DEFAULT_MARKDOWN_CA = `---
title: "Postext"
subtitle: "Un tipògraf programable per al web"
author: "Ignacio Ferro"
publishDate: "2026-10-04"
---

# Postext {style="cover" toc="false" kicker="Motor de maquetació de codi obert · La guia" publisher="postext.dev · Llicència MIT · Cada pàgina d'aquest llibre l'ha composta Postext al teu navegador"}

:::pagebreak

:::paragraphs{style="colophon"}
**Guia de Postext** és el llibre de mostra que acompanya el Sandbox. És alhora un recorregut pel motor i una demostració del que fa: la coberta, l'índex que es numera sol, les portadelles de part, les obertures de capítol, les capçaleres, cada figura i cada taula que flota fins al seu lloc… tot ho maqueta Postext, al teu navegador, a partir del Markdown que pots obrir a l'editor.

Compost en Fraunces, Lora, Bricolage Grotesque i Geist, servides per Google Fonts. Els diagrames són fitxers SVG senzills, que es dibuixen com a vectors al canvas, a la vista HTML i al PDF. Canvia el que vulguis —una paraula, un marge, un color de la paleta— i el llibre es torna a compondre.

Postext és de codi obert, amb llicència MIT. Text © 2026 Ignacio Ferro i les persones que contribueixen a Postext.
:::

# Índex {style="contents" toc="false"}

:::toc

:::part{number="I" title="Fonaments" palette="band=#2b4acb"}
1. Per què Postext
2. Com funciona el motor
:::

# Per què Postext {lead="La tipografia impresa va passar cinc segles aprenent a compondre una pàgina; els navegadors van aprendre a disposar una interfície. Postext porta el primer al segon: un motor que converteix Markdown en pàgines compostes amb criteri editorial." summary="La distància entre el web i la pàgina, i què la salva"}

Postext és un **motor de maquetació de codi obert** que porta al web l'ofici de la tipografia impresa professional. Rep **contingut semàntic** escrit en Markdown enriquit i un objecte de configuració, i calcula una maquetació completament resolta en què cada línia, cada títol, cada figura i cada taula té una posició precisa, mesurada en unitats tipogràfiques reals. Després la dibuixen tres renderitzadors —una previsualització viva en canvas, HTML posicionat i un PDF a punt per a impremta— que llegeixen la mateixa geometria, de manera que el que veus a la pantalla és exactament el que va a impremta, i les mateixes pàgines s'escriuen com a llibre electrònic EPUB 3.

Aquest llibre és la seva pròpia demostració. La coberta, l'índex que es numera sol, les portadelles en tres colors, la banda que obre cada capítol, les capçaleres d'aquestes pàgines i cada figura que flota fins al seu lloc les ha maquetat Postext, al teu navegador, fa un moment. Res no s'ha col·locat a mà: el Markdown només diu què és cada cosa, i la configuració decideix com es veu.

:::callout{type="try"}
Obre el tauler **Text** i tria aquest capítol al selector de capítols de la seva capçalera. Canvia una paraula d'aquest paràgraf o esborra una frase: la pàgina es torna a compondre, les columnes es reequilibren i els folis dels capítols següents s'actualitzen.
:::

## Com llegir aquest llibre

El llibre s'organitza en tres parts. **Fonaments**, la part en què ets, explica el problema que resol Postext i com està construït el motor: què hi entra, què en surt i què passa entremig. **L'ofici** tracta de tipografia: com es compon una línia, com s'emmarca una pàgina, on van les figures i les taules i com un conjunt de capítols es converteix en un llibre. **La pràctica** s'ocupa de les eines: el format del document, el Sandbox, els quatre formats de sortida —canvas, HTML, PDF i EPUB— i el projecte que els envolta.

Cada capítol s'obre amb una breu introducció sobre la seva banda, i la majoria tanquen les seves seccions amb un requadre titulat _Prova-ho al Sandbox_: un petit experiment que pots fer sobre aquest mateix llibre, ara mateix, per veure la funció en acció. Cap de les seves propostes no pot espatllar res —**Restaurar l'original…**, al menú de la fila de la guia del tauler **Llibres**, la torna al seu estat original—, així que canvia el que vulguis. Els capítols es poden llegir en qualsevol ordre; quan un depèn d'un altre, ho diu.

## Maquetació d'aplicacions i maquetació editorial

El CSS modern és una eina extraordinària per construir interfícies. Flexbox, Grid, les consultes de contenidor i el posicionament per àncores donen un control fi sobre com es disposen els components en una finestra. Però CSS es va dissenyar per a la _maquetació d'aplicacions_, i la lectura extensa necessita _maquetació editorial_. Són problemes diferents:

- **La maquetació d'aplicacions** disposa components interactius —botons, formularis, targetes, navegació— dins d'una finestra que el lector recorre lliurement
- **La maquetació editorial** fa fluir text, figures, taules i requadres per una seqüència de pàgines i columnes fixes, segons regles depurades durant segles d'impremta

El contrast de :ref{id="feature-comparison"} resumeix on divergeixen tots dos enfocaments en els documents llargs. (N'hi ha prou d'esmentar-la: la taula flota tota sola al primer buit lliure després d'aquest paràgraf, i mai no cal col·locar-la dues vegades).

La diferència no és de grau, sinó de naturalesa. Una interfície s'adapta a la finestra que la conté i el lector la recorre al seu ritme; una pàgina, en canvi, té una mida fixa, un principi i un final, i tot el que conté s'ha de resoldre dins d'aquests límits: què cap en aquesta columna i què passa a la següent, on va cada figura, com acaba cada línia i cada paràgraf. Aquestes decisions són les que defineixen la qualitat d'un llibre, i cap d'elles no es pot prendre mirant un sol element aïllat, per molta cura que s'hi posi.

CSS resol el primer cas de manera brillant. Per al segon, la plataforma no ha ofert mai les primitives que importen:

1. **Columnes equilibrades que coneixen el seu contingut.** La propietat _columns_ de CSS fa fluir el text, però no pot igualar columnes ajustant l'espai sobre els títols o la folgança d'un paràgraf; no coneix figures ni taules que hagin de flotar al capdamunt de la columna lliure següent, i no pot mantenir un títol amb el paràgraf que introdueix a través d'un salt de columna.
2. **Defectes de final de paràgraf i de columna.** Les _òrfenes_ i les _vídues_ existeixen en CSS, però el seu suport és desigual i no veuen la geometria de la pàgina sencera; i no hi ha cap regla per a la _línia curta_, la paraula que es queda sola a l'última línia d'un paràgraf.
3. **Tall de línies per paràgraf complet.** Els navegadors tallen les línies de manera voraç, una a una, i només poden repartir l'espai sobrant dins de cada línia, mentre que una justificació equilibrada necessita sospesar el paràgraf sencer alhora.
4. **Un ritme vertical compartit.** Llibres i revistes assenten cada línia en una retícula de línia de base comuna a totes les columnes de la pàgina, i CSS no té cap primitiva que ajusti les línies a una retícula entre columnes i pàgines.
5. **L'aparell d'un llibre.** Capçaleres que coneixen el capítol, folis en seqüències romanes o aràbigues, salts de capítol que respecten la paritat i un índex amb números de pàgina reals: res d'això no existeix en un document que es desplaça sense fi per la pantalla.

:::callout{type="quote" placement="top"}
_La tipografia editorial és un problema de satisfacció de restriccions. Al navegador no se li va donar mai el llenguatge per enunciar-les._
:::

CSS descriu amb gran detall l'_aparença_ de qualsevol regió de text. El que li falta és _optimització global_: la capacitat de sospesar un paràgraf, una columna i una pàgina sencers abans de decidir res.

## El que no resolen les eines existents

Altres eines aborden parts del problema. Els processadors de text paginen. Adobe InDesign ofereix un control editorial complet. LaTeX continua sent la referència de la composició acadèmica i matemàtica. Però cap no es va dissenyar per al web, i els seus supòsits les fan difícils d'encaixar en un flux de desenvolupament modern:

- No es poden incrustar com un component d'una aplicació web
- La seva sortida és estàtica i rarament conserva l'estructura semàntica de què depenen les eines d'accessibilitat
- Els seus formats d'origen són propietaris, binaris o difícils de generar per programa
- Viuen fora de les eines de frontend que un equip web ja fa servir

Postext adopta una altra posició, resumida a :ref{id="tools-comparison"}. És una **biblioteca de JavaScript** que s'executa al navegador, llegeix Markdown, aplica les regles de la tipografia professional i retorna una maquetació que es pot dibuixar com a canvas, HTML o PDF, o escriure com a llibre electrònic EPUB. Està pensada perquè la incrustin, la configurin i l'ampliïn desenvolupadors que volen pàgines de qualitat editorial sense sortir de les seves eines, i perquè la configurin dissenyadors que mai no necessiten tocar el codi.

## Un ofici amb molta memòria

Les regles que segueix Postext no es van inventar per a ell. Una línia còmoda té entre 45 i 75 caràcters, i per això els textos llargs es componen en columnes i no en línies tan amples com la pàgina. El text va justificat o en bandera, però en tots dos casos la seva textura ha de ser uniforme, sense els buits que es converteixen en rius quan s'apilen massa línies fluixes. Totes les línies d'una pàgina s'assenten en una retícula de línia de base comuna, de manera que es miren a través de l'espai entre columnes i es transparenten en registre a través del paper. Els títols continuen amb el text que anuncien, un paràgraf no deixa sola la seva primera ni la seva última línia a la vora d'una columna, i una figura apareix després de la frase que l'esmenta, mai abans.

Durant segles, aquestes regles es van aplicar a mà, per caixistes que llegien cada pàgina abans que entrés a màquina. L'autoedició en va convertir moltes en programari, però aquest programari va continuar sent un món a part, amb els seus propis fitxers i les seves pròpies eines. El que no va existir mai va ser un motor que les apliqués automàticament, a partir de text estructurat, dins de l'entorn on avui es llegeix la major part del que es llegeix. D'aquest buit tracta aquest llibre.

## Per a qui és Postext

Postext resulta útil allà on un text llarg i estructurat ha de semblar dissenyat i no simplement mostrat:

- **Editorials i equips editorials** que volen que el mateix original produeixi un PDF a punt per a impremta, una edició fidel en pantalla i un llibre electrònic, sense haver de mantenir diverses maquetacions sincronitzades
- **Plataformes de documentació i d'ensenyament** els llibres de text, manuals i cursos de les quals necessiten figures, taules, referències numerades i matemàtiques ben compostes a cada pàgina
- **Desenvolupadors** que construeixen experiències de lectura —informes, revistes, catàlegs, documents generats— i volen qualitat editorial d'una biblioteca en lloc d'una aplicació d'escriptori
- **Dissenyadors i tipògrafs** que volen descriure un disseny una sola vegada, com a regles, i veure'l aplicat amb coherència al llarg de centenars de pàgines

El que comparteixen és la preferència per descriure el resultat en lloc de col·locar-lo a mà, i la necessitat que el resultat sigui tan bo com el que hauria produït un caixista acurat.

## El que Postext no és

Tenir clar l'abast manté esmolat el nucli. Postext no substitueix CSS a les interfícies: és un motor especialitzat en contingut extens i estructurat. No és un editor WYSIWYG: tu escrius Markdown i descrius el disseny, i el motor compon les pàgines. No gestiona punts de ruptura adaptables: triar una configuració per a cada mida de pantalla és decisió de l'aplicació que l'allotja. No carrega les fonts per tu: el motor mesura amb les fonts que el navegador ja té, així que una pàgina ha de carregar els seus tipus abans de maquetar. I, de moment, el motor de maquetació només funciona al navegador, perquè les seves mesures provenen de les mètriques de font del canvas d'un navegador real; el renderitzador de PDF i el generador d'EPUB, en canvi, també funcionen a Node.

La mateixa modèstia s'aplica al contingut. Postext no intenta entendre el text que compon; aplica regles a l'estructura que rep. Un títol ha d'estar marcat com a títol, una figura s'ha de declarar com a recurs i una taula ha de ser una taula. A canvi, mai no esmena l'autor: res no es mou, no es reanomena ni es reescriu, i cada decisió que pren el motor és visible a la maquetació i es pot rastrejar fins a una regla de la configuració.

# Com funciona el motor {lead="Hi entren Markdown i un objecte de configuració; en surt un arbre en què cada línia té una posició en unitats reals. Entremig, una canonada breu que mesura el text sense tocar el DOM i itera fins que la pàgina s'assenta." summary="Analitzar, mesurar, maquetar, convergir"}

La manera més ràpida d'entendre el que Postext pot fer és seguir un document a través seu. El motor és una canonada, esbossada a :ref{id="layout-pipeline"}, en què cada etapa refina una única representació del document en memòria. Cap etapa no s'amaga darrere d'un format opac i cap no toca el disc. A més, la canonada és pura: amb el mateix contingut i la mateixa configuració produeix sempre la mateixa maquetació.

## Contingut i configuració

A la canonada hi entren dues coses, i totes dues estan pensades perquè les llegeixin i les editin persones:

1. **Contingut** en Markdown enriquit
   - Títols, paràgrafs, llistes, èmfasi, citacions en bloc i matemàtiques
   - Directives per a salts de pàgina, numeració de pàgines, parts, requadres i l'índex
   - Referències a recursos —figures, diagrames SVG i taules— declarats pel seu identificador fora del text
   - Metadades YAML opcionals amb el títol, el subtítol, l'autor i la data
2. **Configuració** que descriu el disseny
   - Mida de pàgina, marges, sang i numeració de pàgines
   - Estructura de columnes, espai entre columnes i filets de columna
   - Text, títols, llistes, peus, taules i matemàtiques
   - Estils de títol, de paràgraf i de requadre, parts i índex
   - Capçaleres, una paleta de colors amb nom i les opcions del PDF

Separar-los és deliberat. El mateix Markdown es pot convertir en un llibre de butxaca, en una revista a dues columnes o en un llibre de text amb columna lateral només canviant la configuració. Per això el motor es nega a posar decisions visuals al contingut.

## Anàlisi

L'analitzador llegeix el Markdown enriquit i produeix una llista plana de blocs: títols, paràgrafs, citacions en bloc, elements de llista, fórmules destacades i les directives que donen forma al llibre. No decideix res sobre la maquetació. El que fa és estructurar l'entrada amb cura: uneix les línies d'un paràgraf, segueix la imbricació de les llistes, separa el títol d'un encapçalament dels seus atributs, resol cada \`:ref\` contra els recursos declarats fora del text i registra, per a cada bloc, el tram exacte de l'original d'on prové.

El format en línia s'analitza alhora. La negreta, la cursiva i la seva combinació, els superíndexs i els subíndexs, les matemàtiques en línia, les mostres de color i les referències es converteixen en trams tipats dins del paràgraf, perquè l'etapa de mesura pugui donar a cadascun la seva pròpia font i el seu propi color. Les metadades del principi del document es llegeixen com a tals —el títol, el subtítol, l'autor i la data— i queden a disposició de tots els dissenys.

## Mesurar sense el DOM

Abans de col·locar res, el motor ha de saber quant espai necessita cada element, i aquí comença tot el projecte. Mesurar text en un navegador sol voler dir pintar-lo a la pàgina i llegir-ne la mida, un reflux que pot bloquejar el fil principal centenars de mil·lisegons en un document llarg.

Postext mesura amb _pretext_, una biblioteca de mesura de text sense DOM que fa servir les mètriques de font del canvas i pura aritmètica. El seu pas car, preparar un text per a una font donada, es desa a la memòria cau; compondre'l a una amplada concreta és gairebé gratuït. El mètode és entre 300 i 600 vegades més ràpid que mesurar mitjançant refluxos, com il·lustra :ref{id="measurement-speed"}, i a sobre el mòdul de mesura del motor hi afegeix trams enriquits de negreta, cursiva i matemàtiques, partició de mots, justificació i tall òptim de línies. Cada resultat es desa amb una clau que inclou el text, les fonts, l'amplada i totes les opcions que poden canviar una línia, de manera que escriure en un paràgraf torna a mesurar aquell paràgraf i cap altre.

La càrrega de les fonts és l'única part de la mesura que el motor deixa en mans de qui l'allotja. Mesurar amb una font que encara no ha arribat mesuraria en realitat la font de substitució, i totes les línies es mourien quan aparegués la definitiva. Per això la biblioteca espera que les fonts estiguin carregades abans de la primera compilació, i ofereix una manera de buidar les seves memòries cau de mesura quan una font arriba tard, perquè la compilació següent torni a mesurar amb les mètriques correctes. El Sandbox ho fa automàticament: carrega totes les famílies que anomena la configuració, des de Google Fonts o des del tauler Fonts, abans de maquetar una pàgina.

## Set passades i un bucle

La maquetació pròpiament dita es fa en set passades:

1. **Estructuració del contingut**: analitza el Markdown en una llista plana de blocs i resol els recursos pel seu identificador
2. **Mesura del text**: compon cada paràgraf en línies a l'amplada que ocuparà
3. **Col·locació en pàgines i columnes**: omple pàgines i columnes i reserva espai per a les capçaleres i els requadres de pàgina completa
4. **Col·locació de recursos**: fa flotar cada figura i taula citada fins al primer buit lliure després de la seva referència
5. **Refinament tipogràfic**: aplica les regles que mantenen els títols amb el seu text i les llistes amb la seva introducció
6. **Equilibrat de columnes**: iguala les columnes de cada pàgina
7. **Ritme vertical**: torna el text a la retícula de línia de base després de tot el que la trenca

Aquestes passades depenen les unes de les altres en cercle. Mantenir un títol amb el seu paràgraf pot empènyer tots dos a la columna següent; aquest moviment pot deixar una vídua; corregir la vídua torna una línia, cosa que pot tornar a separar el títol. Postext desfà el cercle amb el **bucle de convergència** de :ref{id="convergence-loop"}: les passades tres a set es repeteixen, marcant només el que ha canviat, fins que res no es mou. El bucle té un límit de cinc iteracions i els documents habituals s'assenten en una o dues. Una puntuació d'infraccions tipogràfiques acompanya cada iteració, així que, si mai s'arriba al límit, el motor es queda amb la millor maquetació que ha trobat, no amb l'última.

Les regles que s'apliquen en aquestes passades són, expressament, poques i estrictes. Un títol es manté sempre amb les primeres línies del que el segueix. Un paràgraf que acaba en dos punts es manté amb la llista que introdueix. Una figura i el seu peu no se separen mai. Un requadre de pàgina completa divideix la pàgina en bandes, i les columnes de cada banda s'equilibren pel seu compte, de manera que el text que queda sobre una taula ampla es llegeix de dalt a baix a les dues columnes abans de creuar per sota d'ella. Quan no es poden complir dues d'aquestes regles alhora, guanya la que menys perjudica la pàgina, i l'elecció es fa sempre de la mateixa manera.

## Una pulsació, pas a pas

Ajuda veure què passa quan escrius una sola lletra en un paràgraf d'aquest llibre. L'editor registra el canvi i el Markdown del capítol s'analitza de nou, cosa que és barata. Tots els blocs excepte el que has tocat troben la seva mesura a la memòria cau; el paràgraf editat es compon un altre cop a la seva amplada de columna, potser guanyant o perdent una línia. La maquetació del capítol es reconstrueix a partir d'aquestes mesures, fora del fil principal, i el bucle es repeteix fins que la pàgina s'assenta —normalment una vegada— abans que la previsualització dibuixi el resultat.

Com que cada capítol es maqueta per separat, a continuació dels anteriors, la resta del llibre no es toca tret que canviï el nombre de pàgines del capítol. Quan canvia, els capítols següents es tornen a paginar en segon pla, i l'índex recull els seus nous folis.

:::callout{type="figures" title="El motor en xifres" placement="top"}
:::columns{count=3 breaks="3,5"}
**300–600×** més ràpida la mesura del text que amb refluxos del DOM. Pretext mesura amb les mètriques de font del canvas i pura aritmètica, i això és el que permet tornar a compondre un capítol sencer entre dues pulsacions de tecla.

**7 passades** converteixen el Markdown en pàgines posicionades: estructuració, mesura, col·locació en pàgines i columnes, col·locació de recursos, refinament tipogràfic, equilibrat de columnes i ritme vertical.

**5 iteracions** com a màxim al bucle de convergència, gairebé sempre una o dues. Si mai s'arriba al límit, el motor es queda amb la millor maquetació que ha trobat pel camí, no amb l'última.

**8 llengües** amb partició de mots mitjançant els patrons de Liang que TeX fa servir des del 1983: anglès, castellà, francès, alemany, italià, portuguès, català i neerlandès.

**4 sortides** —canvas, HTML, PDF i EPUB 3— provenen d'una mateixa maquetació, de manera que la pàgina que revises a la pantalla és la pàgina que va a impremta.

**0 refluxos** de la pàgina mentre es maqueta. Tot es calcula en memòria, en un worker quan l'amfitrió ho demana, i la mateixa entrada produeix sempre les mateixes pàgines.
:::
:::

L'equilibrat convergeix tram a tram, entre obertures de capítol i salts de pàgina explícits. El resultat és una garantia que importa en els llibres: un capítol maquetat per separat i el mateix capítol dins del llibre complet surten idèntics, pàgina a pàgina.

## L'arbre virtual del document

El que sobreviu al bucle és el **VDT**, l'arbre virtual del document: pàgines que contenen columnes, columnes que contenen blocs, blocs que contenen línies, cadascun amb la seva caixa en unitats reals, al costat d'una llista plana de tots els blocs per accedir-hi ràpidament. L'arbre és geometria pura —no sap res de canvas, HTML, PDF ni EPUB— i això és justament el que permet que tots els renderitzadors dibuixin sortides que coincideixen. Cada línia recorda a més el tram de Markdown d'on prové, i així un clic a la pàgina porta el cursor de l'editor a la paraula correcta.

Les pàgines registren també per a què serveixen. Una pàgina pot ser de cos, una obertura de capítol, una portadella de part o una pàgina en blanc inserida per assolir la paritat correcta, i aquest paper és el que permet a les capçaleres, els folis i els ornaments decidir on apareixen. Les etiquetes de pàgina —el foli imprès dins de la seva seqüència— es calculen una sola vegada, a l'arbre, de manera que el canvas, l'HTML i el PDF hi coincideixen sense fer cadascun el seu propi compte. Un prefaci numerat en romans i un cos que torna a començar per u no necessiten cap cas especial en cap renderitzador: cadascun imprimeix l'etiqueta que li dona l'arbre, sense tornar a comptar.

## Fora del fil principal

Una maquetació pot trigar més que una pulsació de tecla, així que el motor es pot executar en un Web Worker. El worker conserva la seva pròpia memòria cau de mesura entre compilacions i es cancel·la de manera cooperativa: quan es demana una compilació nova, l'anterior s'atura al seu punt de control següent i guanya l'última petició. El Sandbox maqueta així totes les seves vistes, i el renderitzador de PDF i el generador d'EPUB tenen cadascun un worker propi, de manera que la interfície continua responent mentre es compon un llibre sencer o se'n genera el fitxer.

:::callout{type="note" title="En codi"}
\`buildDocument(content, config)\` retorna el VDT. \`renderPage\` dibuixa una pàgina en un canvas, \`renderToHtml\` retorna HTML posicionat i \`renderToPdf\`, del paquet _postext-pdf_, retorna els bytes d'un PDF, d'un document o d'un llibre sencer passat com una llista de capítols. \`renderToEpub\`, de _postext-epub_, escriu els mateixos capítols com un fitxer EPUB 3. \`createLayoutWorker\`, de _postext/worker_, executa la compilació fora del fil principal.
:::

:::part{number="II" title="L'ofici" palette="band=#b7820f"}
3. Compondre la línia
4. La pàgina i les seves columnes
5. Figures, taules i flotants
6. Llibres, parts i capçaleres
:::
# Compondre la línia {lead="Un paràgraf es compon sencer, no línia a línia. Postext sospesa totes les maneres possibles de tallar-lo, posa preu a l'espaiat, als guionets i a les paraules soltes, i tria el conjunt de talls que costa menys." summary="Tall òptim de línies, partició de mots, espaiat i els defectes que evita"}

La qualitat d'una pàgina es decideix primer en els paràgrafs. Un navegador talla les línies de manera voraç: omple una línia amb totes les paraules que hi caben, passa a la següent i només pot repartir l'espai sobrant dins de cada línia. Postext implementa l'**algorisme de Knuth-Plass**, el tallador de línies òptim que fa servir TeX des del 1981. Avalua totes les maneres viables de tallar el paràgraf sencer i tria la que minimitza el cost total, de manera que l'espaiat es manté uniforme de la primera línia a l'última.

## Caixes, gomes i penalitzacions

L'algorisme veu un paràgraf com una seqüència de tres primitives, dibuixades a tota l'amplada a :ref{id="knuth-plass-model"}:

- **Caixes**: paraules o trossos de paraula, d'amplada fixa
- **Gomes**: l'espai entre paraules, amb una amplada natural i capacitat per estirar-se o encongir-se
- **Penalitzacions**: possibles punts de tall amb un cost; una penalització _marcada_ assenyala un punt de guionet i dibuixa el guionet si s'utilitza

Per a cada línia candidata el motor calcula una raó d'ajust $r$, quant s'han d'estirar o encongir les gomes per omplir la mesura, i una mediania que creix amb el seu cub, $b = 100\\,|r|^3$. Les línies es classifiquen en quatre classes d'ajust —atapeïda, normal, folgada i molt folgada— i a cada tall se li carreguen els seus demèrits:

$$
d = (1 + b + p)^2
$$

on $p$ és la penalització del tall. Dues línies seguides amb guionet costen 3000 més, i un salt de més d'una classe d'ajust entre línies veïnes costa 100, de manera que l'optimitzador prefereix paràgrafs amb una textura que canvia suaument. Si no hi ha cap conjunt de talls viable, el motor recorre al tall voraç en lloc de fallar.

## Per què importa el paràgraf sencer

Pensa en un paràgraf amb una primera línia que acaba just després d'una paraula llarga. Un tallador voraç accepta el tall, perquè hi cap, i continua. La segona línia comença llavors amb una sèrie de paraules curtes, no arriba a omplir-se i cal estirar-la; la tercera hereta el problema i acaba amb un guionet; l'última acaba amb una sola paraula. Cap d'aquests defectes no es veu des de la primera línia, que és l'única que ha mirat el tallador voraç.

El tallador òptim veu la cadena sencera. Pot decidir acabar la primera línia una paraula abans, una mica més fluixa del que podria anar, perquè aquesta tria permet que la segona línia s'ompli amb naturalitat, treu el guionet de la tercera i baixa una segona paraula a l'última. El paràgraf en conjunt és millor encara que la primera línia, presa sola, no ho sigui. Aquesta és l'essència de l'algorisme de Knuth-Plass, i la raó per la qual produeix la textura grisa i uniforme que els lectors associen als llibres ben compostos.

## Partició de mots

La partició de mots fa servir els mateixos **patrons de Liang** en què TeX confia des del 1983, servits per la biblioteca _Hypher_, en vuit llengües: anglès, castellà, francès, alemany, italià, portuguès, català i neerlandès. La llengua del document es fixa una vegada, a la capçalera de la configuració, i també etiqueta el PDF per als lectors de pantalla. Els patrons deixen almenys dues lletres abans del guionet i tres després, de manera que les paraules de menys de cinc lletres no es divideixen mai, i cada guionet és una penalització marcada de 50 que l'optimitzador pot acceptar o rebutjar.

La partició només actua en el text justificat, on es guanya el sou. Hi ha dues oportunitats de tall sempre disponibles, sigui quin sigui l'ajust: un guionet entre dues lletres és un tall legítim, i una paraula més ampla que tota la mesura es divideix per l'última síl·laba que hi cap o, si no hi ha més remei, per l'últim caràcter.

Els guionets opcionals escrits en el text es respecten com a punts de tall, al mateix preu que els del patró. El català segueix les normes de l'Institut d'Estudis Catalans: una paraula amb _l·l_ geminada, com _col·lecció_, es divideix entre les dues _l_, i el guionet ocupa el lloc del punt volat, _col-_ a final d'una línia i _lecció_ a principi de la següent. La llengua també pot canviar dins d'un llibre: tots els capítols comparteixen la llengua de la configuració, de manera que una edició en diverses llengües, com aquesta, es configura una vegada per llengua, i cada versió de la guia divideix les paraules segons les seves pròpies regles.

## Espaiat i línies en bandera

Dos ajustos limiten quant pot estirar-se o encongir-se un espai: \`maxWordSpacing\`, per defecte el doble de l'espai natural, i \`minWordSpacing\`, 0,6 vegades. Estirar més enllà del màxim es paga per sobre de qualsevol altre defecte, de manera que el tallador prefereix posar un guionet, moure una paraula o acceptar una línia curta abans que obrir un riu. Hi ha línies que no es poden omplir —un URL llarg, la cua indivisible d'un element de llista— i, en lloc d'obrir-les amb buits de tres vegades l'espai natural, el motor les compon en bandera amb l'espaiat natural. L'última línia d'un paràgraf va sempre en bandera, tret de quan desborda: llavors els seus espais es comprimeixen perquè hi càpiga, igual que fa TeX amb les gomes.

## Xinès i escriptures de l'Àsia oriental

El xinès s'escriu sense espais entre paraules i no es parteix mai amb guionet: una línia pot acabar entre gairebé qualsevol parell de caràcters. Un paràgraf amb més caràcters xinesos, japonesos o coreans que espais entre paraules no passa per Knuth-Plass; el compon, línia a línia, el **compositor CJK**. El que aquest ha de respectar són les regles d'inici i final de línia: una coma, un punt o un signe de tancament no obren mai una línia, i un signe d'obertura no la tanca mai. El rigor depèn de la regió, que dona la llengua del document —\`zh-Hans\` segueix la norma de la Xina continental, GB/T 15834, i \`zh-Hant\` la pràctica de Taiwan i Hong Kong—, i \`cjk.lineBreak\` fixa el nivell a mà. Hi ha trams que no es parteixen mai: un guió llarg o uns punts suspensius de dos quadratins, un nombre amb la seva unitat. Una paraula llatina o una adreça web entre els caràcters passa sencera a la línia següent, tret que sigui més ampla que la línia; llavors la paraula es divideix i l'adreça es talla després d'una barra o davant d'un punt.

Cada signe de puntuació xinès ocupa un quadrat propi, meitat traç i meitat blanc, i quant d'aquest blanc conserva un llibre és qüestió d'estil de la casa, com mostra :ref{id="cjk-composition"}. A Taiwan cada signe ocupa un quadratí sencer. Hong Kong també compon els signes a quadratí sencer, però gairebé sempre ajunta dos signes seguits, i al parèntesi que obre o tanca una línia li treu la meitat exterior. L'estil Kaiming de la Xina continental, el predeterminat per a \`zh-Hans\`, compon les comes, els parèntesis, les cometes i els signes de títol en mig quadratí i deixa sencer el punt excepte a final de línia; on s'ajunten dos signes, desapareix també el blanc que hi ha entre ells. \`cjk.punctuationWidth\` tria l'estil; \`cjk.compressAdjacent\` i \`cjk.trimLineStart\` activen els dos ajustos, i amb \`cjk.hangingPunctuation\` una coma o un punt poden penjar més enllà del final de la línia. Els ajustos \`cjk\`, juntament amb la llengua del document i la direcció de l'escriptura, són al grup **Escriptura** del tauler **Disseny**.

Una línia xinesa justificada s'omple en un ordre fix: primer els espais entre paraules occidentals, després el quart de quadratí que el motor posa entre el text xinès i el llatí (\`cjk.latinSpacing\`; no es tecleja mai) i, finalment, cada buit entre dos caràcters, mai dins d'una paraula llatina ni d'un nombre. Quan un caràcter no pot obrir la línia següent, el compositor intenta primer ficar-lo a la línia traient blanc als signes que ja té, i només si no ho aconsegueix baixa amb ell a la línia següent el caràcter anterior. Una línia que necessitaria més de mig quadratí entre els caràcters es deixa curta, i el tauler **Revisió** l'assenyala com a línia CJK curta.

La resta d'un llibre xinès segueix els mateixos ajustos. Les plantilles de capítol, els folis, les llistes i els comptadors admeten els estils de numerals xinesos, entre els quals \`cjk-decimal\`, \`simp-chinese-informal\` i \`trad-chinese-informal\`, de manera que els capítols poden portar els seus ordinals xinesos; les figures i les taules prenen el nom en xinès i es numeren per capítol amb un guionet. \`cjk.grid\` fixa la caixa de text com un nombre de caràcters per línia i de línies per pàgina, la retícula sobre la qual es dissenyen els llibres xinesos. L'edició xinesa d'aquesta guia es compon en vertical i s'enquaderna per la dreta, com es van imprimir els llibres xinesos durant segles: anomena els capítols amb els ordinals xinesos, imprimeix els folis en numerals xinesos i numera les figures i les taules per capítol; la seva fila al tauler **Llibres** té un botó de llengua propi. Entre els llibres d'exemple, _Somni del pavelló vermell_ és una novel·la sencera composta en xinès, i la seva edició en caràcters tradicionals va en vertical sobre una retícula de 38 caràcters per 15 línies.

\`layout.writingMode: 'vertical-rl'\` compon un llibre en vertical. Les línies van de dalt a baix i se succeeixen de dreta a esquerra, dues columnes es converteixen en dos pisos apilats a la pàgina, les figures i les taules es mantenen dretes, les paraules llatines i els nombres llargs es tomben de costat, i cada signe pren el lloc o la forma que té en el text vertical: els parèntesis i les cometes adopten la forma vertical, i el punt passa a l'angle superior dret de la seva casella a la Xina continental i es queda centrat a Taiwan i Hong Kong. Un llibre així s'enquaderna per la dreta (\`page.binding\`): la primera pàgina queda sola a l'esquerra del llom, i el Sandbox mostra els plecs de dreta a esquerra. El canvas i el PDF componen les mateixes línies verticals; la vista HTML talla les seves pròpies línies a l'alçada de la seva pàgina, i posa dret o tomba cada caràcter igual que ells. Per defecte, un nombre de fins a dues xifres es posa dret en una sola casella, i \`cjk.uprightDigits\` pot pujar aquest límit a tres o quatre (\`:tcy[…]\` fa el mateix amb qualsevol tram curt).

Els llibres xinesos marquen a més el text de maneres que la tipografia llatina no coneix. L'èmfasi s'assenyala amb un punt al costat de cada caràcter i no amb cursiva, de manera que en un document xinès \`*…*\` posa punts d'èmfasi als caràcters xinesos que abasta, com \`:dots[…]\`; \`cjk.emphasis: 'italic'\` conserva la cursiva. \`:name[…]\` traça la línia recta dels noms propis, i \`:book[…]\` assenyala el títol d'una obra, i \`cjk.bookTitleMark\` tria com: amb els signes angulars dobles de la Xina continental o amb la línia ondulada de Taiwan i Hong Kong. \`:ruby[…]{rt="…"}\` compon una lectura, en pinyin sobre els caràcters o en zhuyin a la dreta de cadascun, i \`:warichu[…]\` compon una nota en dues files de mig cos dins de la línia, que continua a la línia o la pàgina següent quan no hi cap. Cap no canvia l'interlineat: el tauler **Revisió** avisa quan els punts, les línies o les lectures necessiten entre línies més espai del que deixa el paràgraf. En text vertical, els punts passen a la dreta de la columna, les línies a l'esquerra, i d'una nota es llegeix primer la fila de la dreta.

## L'àrab i el text de dreta a esquerra

L'àrab, el persa, l'urdú i l'hebreu s'escriuen de dreta a esquerra, i Postext els compon a partir del mateix Markdown i la mateixa configuració que qualsevol altra llengua. Ho decideix la llengua del document: amb \`locale: 'ar'\` les línies comencen a la dreta, la primera columna és la de la dreta, el llibre s'enquaderna per la vora dreta i els plecs es llegeixen de dreta a esquerra. El motor maqueta aquesta pàgina com una pàgina d'esquerra a dreta i després la gira sencera com en un mirall, pintant del dret cada paraula, cada imatge i cada fórmula, de manera que un disseny fet per a un llibre en anglès funciona sense canvis: un ajust que anomena un costat vol dir un costat del text, i \`start\` i \`end\` s'accepten com a noms explícits d'aquests costats. Les capçaleres i els folis es queden al lloc del full on els espera qui dissenya.

Dins d'una línia, els nombres, les paraules llatines i les cites continuen llegint-se d'esquerra a dreta. L'ordre d'aquests trams el fixa l'algorisme bidireccional d'Unicode, implementat sencer; el text es desa, es cerca i es copia en l'ordre en què es va escriure, i només se'n reordena el dibuix. Els parèntesis i les cometes baixes s'emmirallen en els trams de dreta a esquerra. Un bloc compost en el sentit contrari al del llibre porta \`{dir=ltr}\` o \`{dir=rtl}\`, i un tram de text \`:ltr[…]\` o \`:rtl[…]\`, un tram aïllat amb el qual el punt final ja no salta a l'altre extrem de la línia.

Les lletres àrabs s'enllacen, i cadascuna pren la forma que li demanen les veïnes, de manera que una paraula es mesura i es pinta com una sola cadena conformada, mai lletra a lletra; el PDF la conforma amb HarfBuzz i associa cada glif als seus caràcters, perquè el text copiat i els lectors de pantalla rebin les paraules que es van escriure. D'aquí surten tres regles: no hi ha partició de mots, ni espaiat entre lletres, ni tall dins d'una paraula, que desborda la línia i queda assenyalada en lloc de dividir-se. Les línies justificades s'estiren primer pels espais i després amb la **kashida**, l'allargament que un cal·lígraf traça entre dues lletres unides, posada només on ho permeten les regles del naskh i exclosa del text copiat. El tallador de línies compta aquest allargament com a estirament, i així tria els talls sabent on es pot eixamplar una línia. L'èmfasi es compon en negreta, perquè la lletra àrab no té cursiva, i el motor no inclina mai una lletra àrab.

Els signes vocàlics s'apilen damunt i davall de les lletres, dins de l'interlineat, que no creix mai pel seu compte: el tauler **Revisió** assenyala un paràgraf els signes del qual tocarien la línia de sobre, amb l'interlineat que necessitaria. Els números generats —folis i números de capítol, de figura i de nota— prenen les xifres de la regió, les aràbigues orientals a l'est del món àrab i les occidentals al Magrib, mentre que els números que escriu l'autor no es reescriuen mai; un títol pot escriure el seu número com un ordinal en lletres, i els preliminars poden comptar en l'ordre abjad dels manuscrits. Els poemes clàssics s'escriuen en \`:::verse\`, un vers per línia amb els dos hemistiquis separats per \`||\`: cada hemistiqui es porta a una mateixa amplada, primer amb kashides, perquè les rimes quedin alineades al llarg del poema. L'edició àrab d'aquesta guia es compon així, enquadernada per la dreta, i entre els llibres d'exemple _Les mil i una nits_ compon l'obra sencera en àrab, a la manera de la impremta de Bulaq.

## Èmfasi i trams

Un paràgraf poques vegades és un únic tram de text. La negreta, la cursiva i la negreta cursiva es componen amb els talls reals de la família —una cursiva veritable, no una rodona inclinada—, cadascun mesurat amb les seves pròpies mètriques, de manera que una paraula en negreta ocupa exactament el lloc que necessita. El color del text en negreta, del text en cursiva i de les referències es pot fixar per separat; en aquest llibre, les referències a figures i taules van en negreta i en el color de la part, perquè siguin fàcils de trobar a la pàgina i al PDF, on a més són enllaços.

Els superíndexs i els subíndexs es componen més petits i desplaçats de la línia de base sense alterar l'interlineat, i les mostres de color en línia s'assenten a la línia de base com una lletra més. Tots són atòmics: el tallador de línies pot tallar abans o després, però mai per dins, de manera que una fórmula o una mostra no acaben mai partides entre dues línies.

Dos trams més distingeixen paraules sense necessitar un tall propi de la família. \`:smallcaps[…]\` compon versaletes fetes a partir de les majúscules del tipus, iguals en totes les sortides, per a sigles i per als noms dels personatges d'una obra de teatre. \`:chip[…]\` posa una paraula dins d'una caixeta arrodonida que flueix amb la línia —tecles, etiquetes, el banc de paraules d'un exercici—, amb un estil que es tria pel nom; no es parteix mai per dins, i les seves paraules continuen sent text real a l'HTML i al PDF.

## Òrfenes, vídues i línies curtes

Una **òrfena** és la primera línia d'un paràgraf que es queda sola al peu d'una columna; una **vídua**, l'última línia portada sola al capdamunt de la següent. Totes dues trenquen el ritme de la lectura, i :ref{id="orphan-widow"} les mostra a banda i banda d'un salt de columna. Un tercer defecte, la **línia curta**, és una última línia amb una sola paraula breu, encallada sota un paràgraf ple.

Postext posa preu a totes tres. Quan un paràgraf travessa una columna, el motor compara tots els talls possibles i a cadascun li carrega l'espai que deixa sense fer servir, l'òrfena i la vídua —1000 per defecte cadascuna, amb almenys dues línies a cada costat—. Les línies curtes es paguen dins del mateix tallador, com a mediania, sempre que l'última línia faci menys de vint caràcters d'espai. Quan no es pot evitar una línia curta tallant d'una altra manera, el motor pot compondre el paràgraf una línia més curt, estrenyent els espais dins del seu mínim i, si cal, l'espaiat entre lletres com a molt deu mil·lèsimes de quadratí. Els elements de llista segueixen les mateixes regles, amb interruptors propis.

## Llistes

Les llistes segueixen la mateixa disciplina que els paràgrafs, amb una tipografia pròpia. Les llistes amb pics trien el caràcter del pic, la mida, el pes i el color, i l'espai i el sagnat francès que mantenen alineat el text de cada element; les llistes numerades trien entre nombres aràbics, lletres minúscules o majúscules i nombres romans en minúscula o majúscula, amb un separador que pot tenir estil propi i nombres alineats a la dreta, perquè els elements 9 i 10 quedin alineats. La imbricació arriba a cinc nivells, cadascun amb el seu propi sagnat i les seves pròpies marques, i les llistes de tasques dibuixen una casella per a cada element, marcada o no. Els elements poden anar junts o espaiats, i el motor tracta el final d'una llista com una de les seves palanques en equilibrar les columnes.

:::callout{type="try"}
Al tauler **Disseny**, cerca _fluixes_ i activa **Ressaltar línies fluixes**, al grup **Avançat**. Després estreny les columnes o puja \`maxWordSpacing\` i observa quines línies ha d'obrir el motor i com les redistribueix l'optimitzador.
:::

## Matemàtiques

Les fórmules són ciutadanes de ple dret. Les expressions en línia, com $e^{i\\pi}+1=0$, flueixen amb el text, compostes per MathJax com a traçats vectorials que es mantenen nítids a qualsevol ampliació. Quan una fórmula és més alta del que permet la línia, es redueix de manera uniforme perquè la retícula de base sobrevisqui, i el lector conserva el ritme del text per densa que sigui la notació, encara que la pàgina estigui plena de subíndexs, exponents i arrels. Les fórmules destacades ocupen línies pròpies, centrades a la columna, amb els seus propis marges, i el text que les segueix torna a la retícula:

$$
\\int_0^{\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

El canvas, la vista HTML i el PDF dibuixen els mateixos traçats, de manera que les fórmules coincideixen en les tres sortides i continuen sent vectors a la impremta.

Uns quants exemples més mostren la gamma de notació que fa servir el motor, i el que fa amb cada cas perquè la fórmula convisqui amb el text. El primer és una sèrie infinita, la suma dels inversos dels quadrats que Euler va resoldre el 1734. En una fórmula destacada, els límits del sumatori es col·loquen a sobre i a sota del símbol, com en un llibre d'anàlisi, i la fracció del resultat pren la mida completa en lloc de la versió reduïda que s'utilitza dins d'una línia.

$$
\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}
$$

Les matrius són una altra prova habitual, perquè exigeixen alinear files i columnes i ajustar l'alçada dels parèntesis a la del contingut. MathJax compon la matriu com una taula de cel·les centrades i estira els delimitadors fins a abastar-la; Postext rep el resultat com a traçats, mesura la caixa completa i reserva l'espai exacte abans de tornar el text a la retícula. El determinant d'una matriu de dos per dos es llegeix així.

$$
\\det \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} = ad - bc
$$

La distribució normal reuneix en una sola expressió gairebé tot el que complica la composició matemàtica: una arrel amb la seva barra, lletres gregues per a la mitjana i la desviació típica, i una fracció sencera dins d'un exponent, que s'ha de reduir dues vegades sense perdre llegibilitat. És la fórmula que apareix en qualsevol manual d'estadística, i aquí es compon amb les mateixes regles que faria servir TeX.

$$
f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}}\\, e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}
$$

Les definicions per casos tanquen la sèrie. Una clau agrupa les branques de la definició, cadascuna amb la seva condició alineada a la dreta, i l'alçada de la clau creix amb el nombre de casos. És un recurs freqüent en els textos de matemàtiques i d'informàtica, i també un bon exemple de fórmula que no cabria dins d'una línia de text.

$$
|x| = \\begin{cases} x & \\text{si } x \\ge 0 \\\\ -x & \\text{si } x < 0 \\end{cases}
$$

Les fórmules en línia segueixen altres regles, perquè han de conviure amb les paraules que les envolten. Les arrels de $ax^2+bx+c=0$ són $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$, el producte d'Euler s'escriu $\\prod_p (1-p^{-s})^{-1} = \\zeta(s)$ i la transformada de Fourier $\\hat f(\\xi) = \\int f(x)\\,e^{-2\\pi i x \\xi}\\,dx$ també es queda a la seva línia. En els tres casos el motor mesura l'alçada de la fórmula i, si supera la que permet l'interlineat, la redueix només el necessari, de manera que les línies del voltant conserven la seva posició a la retícula i el paràgraf manté la textura. Cap fórmula no trenca el ritme de la pàgina.

# La pàgina i les seves columnes {lead="Les pàgines són fixes, les columnes són finites i cada línia s'hauria d'assentar en un ritme compartit per tot el plec. Aquest capítol tracta del marc: la geometria de la pàgina, les estructures de columnes, la retícula de base i la manera d'acabar les columnes a la mateixa altura." summary="Geometria de pàgina, columnes, retícula de base i equilibri"}

Les columnes són l'expressió més visible del disseny editorial, i el lloc on es trenquen abans les solucions casolanes. Postext tracta la pàgina i les seves columnes com a objectes de primera classe, amb la seva pròpia geometria, el seu propi ritme i les seves pròpies regles per acabar bé.

## Geometria de la pàgina

Una pàgina comença per la mida. Postext ofereix com a predefinits els formats habituals de llibre i revista, recollits a :ref{id="preset-sizes"}, i qualsevol mida personalitzada en centímetres, mil·límetres, polzades o punts; aquesta guia es compon en el format de 21 × 28 cm. Els marges poden ser **simètrics**: el marge esquerre passa a ser l'interior, al costat del llom, i canvia de costat a cada verso. Per a la producció impresa, la pàgina pot portar sang i marques de tall, i un ajust de PPP controla la resolució de les mesures en píxels.

Els folis segueixen seqüències: aràbigues, romanes en minúscula o majúscula, alfabètiques en minúscula o majúscula, cadascuna amb el seu propi número inicial, de manera que un llibre pot numerar els preliminars i, ii, iii i començar el capítol u a l'1. El PDF registra les mateixes seqüències com a etiquetes de pàgina, i el visor mostra exactament el número imprès al peu.

## Mesura i interlineat

Les dues xifres que més decideixen com es llegeix una pàgina són la longitud de les línies i la distància entre elles. La configuració fixa el cos i l'interlineat en unitats reals —aquest llibre fa servir 9,4 punts sobre 13,6—, i l'amplada de columna es dedueix de la pàgina, els marges, l'estructura de columnes i l'espai entre columnes. Una línia de 45 a 75 caràcters és l'objectiu clàssic; molt més curta i l'ull salta massa sovint, molt més llarga i perd el camí de tornada a la línia següent. Dues columnes en una pàgina de 21 cm queden de sobres dins d'aquest interval, i aquesta és una de les raons per les quals el format és tan comú en revistes i llibres tècnics.

L'interlineat és a més la unitat de la retícula de base. Tota distància vertical que importa —l'espai sobre i sota un títol, al voltant d'una figura, entre els elements d'una llista— s'expressa millor com un nombre enter de línies de retícula, o es corregeix fins que ho sigui, perquè la pàgina mantingui un únic ritme de dalt a baix.

## Estructures de columnes

Tres estructures cobreixen la majoria de les publicacions, esbossades com a miniatures a :ref{id="column-layouts"}:

1. **Una columna**, per a novel·les, assajos i lectura concentrada
2. **Dues columnes**, per a revistes, informes i llibres com aquest
3. **Columna i mitja**: una columna principal al costat d'una altra de lateral més estreta
   - La columna lateral pot portar text que continua des de la principal
   - O pot ser un **canal de flotants** que només recull figures, taules, peus i requadres, com en els llibres de text amb una columna exterior de notes i diagrames

L'espai entre columnes és configurable, i s'hi pot dibuixar un filet opcional, amb el seu propi gruix i color. Els elements de pàgina completa —una figura, una taula, un requadre— tallen les columnes: el text que queda per sobre es reparteix a parts iguals entre elles, i les columnes continuen per sota.

## Títols

Els títols es configuren nivell a nivell, fins a sis nivells: tipus de lletra, cos, interlineat, pes, cursiva, majúscules, color, alineació i l'espai a sobre i a sota de cadascun. Un nivell es pot numerar amb una plantilla —\`{1}.{2}\` imprimeix 4.3 a la tercera secció del capítol 4, i formats com \`{1:I}\` o \`{1:a}\` passen un nivell a nombres romans o a lletres—. Un nivell també pot saltar a una pàgina nova, amb la paritat que demani, i ocupar tota l'amplada de la pàgina en lloc d'una columna: això és el que converteix un títol de primer nivell en una obertura de capítol.

Els títols es mantenen amb el que els segueix, de manera que un títol de secció no es queda mai esperant sol al peu d'una columna. També s'ajusten a la retícula de base: un títol més gran que el cos ocupa l'espai que necessita, i el text que el segueix torna a la retícula, de manera que les columnes a banda i banda de l'espai entre columnes continuen mirant-se línia a línia.

## La retícula de base

Els llibres professionals alineen la primera línia de base de cada columna a un ritme vertical comú, i totes les línies següents cauen a la mateixa retícula, de manera que es miren a través de l'espai entre columnes. Postext ajusta el text a una retícula derivada de l'interlineat del cos, com il·lustra :ref{id="baseline-grid"}. Després dels elements que la trenquen —un títol més gran que el cos, una figura, una fórmula destacada— es deixa l'espai necessari per tornar la línia següent al seu lloc. La retícula es pot dibuixar superposada mentre treballes, allà on hi ha text.

## Acabar les columnes a la mateixa altura

Quan una pàgina acaba enmig del text, les columnes haurien d'acabar a la mateixa altura. És l'**equilibri de columnes**, i és més difícil del que sembla: les línies van en passos enters de retícula, les figures no es poden partir, els títols han de continuar amb el seu text i els paràgrafs no poden deixar òrfenes. Postext iguala una columna curta amb tres palanques, fetes servir per ordre de preferència i dibuixades a :ref{id="column-balancing"}:

1. **Espai sobre els títols**, una línia de retícula sencera cada vegada, repartida per importància i mai al capdamunt d'una columna
2. **Una línia després del final d'una llista**
3. **Paràgrafs més solts**: un paràgraf compost una línia més llarg, la _looseness_ de TeX, acceptat només si cap de les seves línies no s'estira més enllà del límit d'espaiat; si ajuda, un toc d'espaiat entre lletres, com a molt deu mil·lèsimes de quadratí

Cada arranjament es verifica maquetant la pàgina de nou, fins a vuit vegades, i guanya el millor resultat. Algunes columnes es deixen en pau a propòsit: l'última abans d'un salt de pàgina forçat o d'una obertura de capítol, l'última pàgina del document, una columna sense res a estirar. Dues regles afins igualen les columnes del final d'un capítol i les que queden sobre un requadre de pàgina completa que es mou o es parteix.

## Bandes i requadres de pàgina completa

Una pàgina no sempre és un únic joc de columnes de dalt a baix. Una figura, una taula o un requadre de pàgina completa la talla en **bandes**: el text que queda a sobre del requadre omple les seves columnes com una banda pròpia, el requadre travessa la pàgina i les columnes tornen a començar a sota. Cada banda s'equilibra pel seu compte, de manera que el lector baixa per la primera columna i puja al capdamunt de la segona abans de travessar el requadre, com en un diari. Quan una banda acabaria desigual, un **topall de banda** escurça les columnes al mateix nombre de línies, i el text que ja no hi cap continua fluint per sota.

Les columnes finals d'un capítol reben el mateix tracte. En lloc de deixar l'última pàgina amb una columna plena i una altra gairebé buida, un topall final reparteix entre elles les línies que queden, i les palanques d'equilibri fan la resta. Els salts de columna explícits es respecten: \`:::columnbreak\` acaba una columna on vol l'autor, i l'equilibri deixa en pau el peu d'aquesta columna.

:::callout{type="try"}
Al tauler **Disseny**, obre **Títols i índex** i desactiva **Equilibrar columnes**. Mira el peu de les columnes d'aquest capítol; després torna a activar-lo i observa quina palanca ha fet servir el motor a cada pàgina.
:::
# Figures, taules i flotants {lead="Una referència és una promesa, no una posició. Esmenta una figura i Postext li busca lloc: el primer espai lliure després de la menció, numerada per ordre de lectura, amb el seu peu, i mai abans de les paraules que la criden." summary="On van a parar els recursos, com es numeren, taules que es parteixen"}

Tot allò que no és text que flueix —imatges, diagrames SVG, taules— és un **recurs**. Els recursos es declaren fora del text, cadascun amb el seu identificador, el seu tipus, el seu peu i les seves preferències de col·locació, i el Markdown es limita a esmentar-los. Al Sandbox viuen al tauler Recursos.

## N'hi ha prou amb una menció

Escriure \`:ref{id="…"}\` en una frase fa dues coses: imprimeix l'etiqueta del recurs i, la primera vegada, l'_incorpora_, de manera que flota fins al primer espai lliure després de la referència. Els espais es proven en ordre, com mostra :ref{id="float-slots"}: el peu de la columna que conté la referència, després el cap i el peu de la columna lliure següent, després una banda a la pàgina següent. El text no s'interromp mai.

Unes quantes regles mantenen honrats els flotants:

- Un flotant no cau mai abans de la seva referència i no s'encongeix mai per cabre
- Els flotants d'una mateixa seqüència de numeració conserven el seu ordre, de manera que la figura 12 no apareix mai abans que l'11; una taula que espera lloc no reté les figures
- Els flotants no s'escapen mai del seu capítol: les obertures de capítol, les portadelles de part i el final del document són barreres
- Un flotant que deixaria menys de tres línies de text en una pàgina nova espera a la següent
- Les bandes de cap i de peu s'alineen amb la retícula de línia de base, i el peu d'un flotant inferior comparteix la línia de base de l'última línia de text

## Col·locació

Cada recurs pot indicar on prefereix anar, i cada tipus de recurs té un valor per defecte; els camps es recullen a :ref{id="placement-options"}. Un recurs també es pot inserir en un punt exacte, quan la seva posició és _here_. I una taula o una figura massa ampla per a la pàgina pot girar un quart de volta: llavors ocupa una pàgina pròpia, enganxada al llom.

## Números i etiquetes

Els tipus de recurs defineixen les seves pròpies seqüències de numeració. Les figures i les taules vénen de sèrie i es tradueixen a la llengua del document; un tipus pot afegir un prefix, una etiqueta abreujada, una plantilla com \`{h1}.{n}\` per numerar per capítol —la figura 5.2 és la segona figura del capítol 5—, una regla de reinici i un format de comptador. Els números segueixen la **primera referència en l'ordre de lectura**: si insereixes una menció anterior, es mouen tots els números posteriors. Una referència pot imprimir només el número, l'etiqueta completa o l'abreujada, canviar-ne la caixa o imprimir un text propi.

La numeració es manté correcta en tot un llibre perquè forma part del que cada capítol hereta dels anteriors. El sisè capítol d'aquesta guia comença les figures a la 6.1 perquè així ho diu el comptador de capítols, no perquè ningú hagi escrit el número, i moure un capítol renumera tot el que ve després la vegada següent que es maqueta el llibre.

## Tipus propis

Les figures i les taules són només els dos tipus que necessita qualsevol llibre. Una configuració pot declarar tants tipus de recurs com faci servir una publicació —mapes, làmines, requadres, gràfics, documents—, cadascun amb un nom en singular i en plural, una etiqueta abreujada per a les referències, un prefix per als seus peus i una seqüència de numeració pròpia. Un catàleg pot numerar les làmines 1, 2, 3 al llarg de tot el llibre mentre les figures tornen a començar a cada capítol; un llibre de text pot numerar els requadres 1-1, 1-2 al capítol u i 2-1 al capítol dos. Cada tipus pot portar a més la seva col·locació per defecte i ajustar l'estil del peu, de manera que les làmines ocupin una pàgina sencera amb el peu a sobre mentre les figures floten a l'amplada de la columna.

Un tipus amb el prefix buit i sense peu també és útil: converteix una imatge en un ornament, una vinyeta o un logotip que es pot inserir exactament on s'esmenta, sense número i sense entrar mai a la llista de figures.

## Taules

Les taules porten el seu model a sobre: files de cel·les amb fusions de columnes i files, files de capçalera, alineació i amplades de columna relatives. Les cel·les admeten Markdown en línia, paràgrafs i llistes senzilles, un emplenament propi —els tres colors de part d'aquest llibre són :swatch{color="#2b4acb"} blau, :swatch{color="#b7820f"} or i :swatch{color="#c0452f"} vermelló— i fins i tot una imatge. L'estil de les taules es defineix una vegada per a tot el document: tipografia del cos i de la capçalera, emplenament de la capçalera i filets en retícula, només horitzontals, només exteriors o cap.

Les taules s'editen al tauler Recursos, en un editor que funciona com un petit full de càlcul: afegeix o treu files i columnes, fusiona i divideix cel·les, marca files i columnes de capçalera, alinea cel·les, fixa emplenaments i amplades de columna, deixa anar una imatge en una cel·la i enganxa un bloc de cel·les copiat d'un full de càlcul. Tots els canvis es poden desfer, i la taula de la pàgina segueix el que escrius.

Una taula més alta que la pàgina es parteix entre pàgines. Les seves files de capçalera es repeteixen a cada tram, el peu de cada continuació guanya el sufix _(cont.)_, un avís de _Continua_ tanca cada tram excepte l'últim, i cap tall no travessa una fusió de files. Una taula girada es parteix igual, pàgina rere pàgina.

## Figures al costat del text

En una maquetació de columna i mitja la columna lateral de la qual només porta flotants, els recursos poden viure al costat del text en lloc de dins seu. Una figura amb l'amplada _side_ s'apila a la columna lateral al costat del paràgraf que la cita; un requadre pot fer el mateix, i així els llibres de text poden mantenir definicions, conceptes clau i figures al marge al costat de les línies que expliquen. Una figura ampla pot portar a més el peu al costat, a la columna lateral, que és la disposició clàssica dels llibres de text il·lustrats i dels catàlegs d'exposició. Entre els presets de mostra hi ha un manual de bioquímica i una edició literària compostos exactament així.

## Peus i crèdits

Un peu és el prefix del tipus, el número i el text del peu, que admet Markdown en línia i referències pròpies. Els peus van a sobre o a sota del seu recurs, opcionalment sobre una barra de color, amb la tipografia i la mida de l'estil de peu; l'etiqueta pot anar en negreta o en color, com en aquest llibre. Un recurs pot portar a més una nota: una línia més petita de crèdit o de font a sota seu.

## Un quart de volta

Alguns recursos són més amples del que la pàgina és alta: una cronologia, una taula ampla de resultats, una làmina panoràmica. Un recurs així pot girar un quart de volta, en el sentit de les agulles del rellotge o en el contrari. Llavors ocupa una pàgina pròpia, enganxada al llom, perquè girar el llibre per llegir-lo resulti natural, i es dimensiona segons l'alçada de la pàgina i no segons l'amplada. Una taula girada més alta que una pàgina girada —és a dir, més ampla que l'alçada de la pàgina— es parteix en tantes pàgines com necessiti, repetint les files de capçalera, igual que una taula sense girar.

## Figures vectorials

Els diagrames SVG es dibuixen com a vectors a tot arreu. El PDF converteix el subconjunt habitual d'SVG —formes, traçats, grups, traçats de retall, emplenaments i traços sòlids, opacitat i text— en operacions de dibuix natives, i rasteritza a 600 ppp el que en queda fora; una figura també pot portar un màster PDF propi, que s'incrusta tal com és. Per imprimir a una tinta, un interruptor torna a acolorir tots els diagrames com a tintes d'un sol color, segons la seva luminància, en els tres renderitzadors.

El text d'un SVG continua sent text. Al PDF es compon amb fonts reals i es pot seleccionar i cercar, i al Sandbox es pot editar al seu lloc: el tauler Recursos obre el codi del diagrama amb només el text editable —el dibuix en si queda bloquejat tret que el desbloquegis—, de manera que una etiqueta es pot corregir o traduir sense obrir un programa de dibuix. Els diagrames d'aquest llibre es generen per a cada llengua, i per això les seves etiquetes són en català a l'edició catalana, en castellà a la castellana, en anglès a l'anglesa, en xinès a la xinesa i en àrab a l'edició àrab.

Tres figures compostes aquí ho demostren. La roseta de :ref{id="vector-rosette"} està feta de corbes de Bézier, traços finíssims i una línia de microtext de dos punts i mig d'alçada; el gràfic de :ref{id="vector-chart"} combina una àrea emplenada, una línia discontínua i etiquetes de text; i :ref{id="vector-clip"} fa servir un traçat de retall, un grup dibuixat amb transparència i una mateixa forma reutilitzada cinc vegades. Obre el PDF, amplia'l fins a diverses vegades la seva mida i mira'n les vores: continuen tan nítides com el text que les envolta, perquè es dibuixen amb els mateixos operadors i no s'enganxen com a imatges. Prova de seleccionar les etiquetes del gràfic, o de cercar-les: són text. El mateix val per al microtext de la roseta, llegible a qualsevol ampliació.

:::callout{type="try"}
Fes clic al peu de qualsevol figura del canvas: el tauler Recursos s'obre en aquell recurs, amb el camp del peu a punt. Canvia'n la col·locació d'_auto_ a _top_ i mira com es mou.
:::

## Vídeos

Un vídeo és un recurs més. Es menciona, es numera a part (Vídeo 1.1 al costat de Figura 1.1) i flota fins al primer buit lliure, com una figura. Pot venir de YouTube o de Vimeo, d'un fitxer desat al llibre o d'una adreça web: un MP4 o un WebM en un servidor, o un flux HLS, la llista \`.m3u8\` amb què se serveix un vídeo llarg a trossos i en diverses qualitats.

En paper s'imprimeix la seva portada, un fotograma triat, amb una marca de reproducció i un codi QR que obre el vídeo; al PDF la portada també és un enllaç. La vista HTML i l'EPUB el reprodueixen amb el seu propi reproductor, llevat dels de YouTube i Vimeo i dels fluxos HLS, que un llibre electrònic només pot enllaçar. A la vista Folio, un clic a la portada el reprodueix a la mateixa pàgina, i el vídeo continua mentre es passa el full.

# Llibres, parts i capçaleres {lead="Un llibre és més que els seus capítols: una coberta, un índex que es manté al dia, portadelles de part, obertures que anuncien cada capítol i capçaleres que saben on és el lector. Tot això és configuració." summary="Capítols, estils de títol, dissenys, parts, índex i folis"}

Aquesta guia és un llibre de tretze capítols, i cada capítol és un document Markdown propi. Un projecte del Sandbox és sempre un llibre: la configuració, els recursos i les fonts es comparteixen, i els capítols se succeeixen, com mostra :ref{id="book-anatomy"}.

## Els capítols fan el llibre

Cada capítol es maqueta per separat, _continuant_ els anteriors: n'hereta el nombre de pàgines i la paritat, els comptadors de capítols i de figures, la part oberta i les capçaleres. Per això les figures d'aquest capítol es numeren a partir de la 6.1, i per això editar un capítol no obliga mai el motor a compondre de nou el llibre sencer. Les previsualitzacions poden mostrar el capítol actual o el llibre complet, i el PDF es pot generar de qualsevol dels dos. Els capítols es poden afegir, canviar de nom, reordenar, dividir pels títols de primer nivell o fusionar amb l'anterior.

## El que hereta un capítol

La continuació que rep un capítol és petita i precisa. Porta el nombre de pàgines i la paritat de la pàgina següent, perquè una obertura que ha de caure en pàgina parella sàpiga si necessita una pàgina en blanc al davant. Porta els comptadors: el número de capítol, els números de cada seqüència de recursos, la seqüència de numeració de les etiquetes de pàgina. Porta la part oberta, amb el títol, el número i la paleta, perquè un capítol enmig d'una part en conservi els colors. I porta l'esquema del llibre, perquè un índex al capítol dos pugui imprimir la pàgina on comença el capítol deu.

Com que la continuació és tot el que un capítol necessita de la resta del llibre, els capítols es poden maquetar de manera independent, en segon pla, i unir-se per a la vista del llibre complet i per al PDF. El resultat és el mateix que maquetar el llibre sencer d'una vegada, pàgina a pàgina: una propietat que el motor està construït per garantir.

## Estils de títol

Un títol pot portar atributs, escrits entre claus al final de la seva línia. El més potent és l'**estil**: \`{style="cover"}\` aplica un estil de títol amb nom, que canvia la tipografia i el disseny del títol i, per a la secció que obre, pot canviar les capçaleres, els marges de pàgina, la disposició de columnes, la tipografia del cos i la paleta. La coberta d'aquest llibre és un estil de títol amb marges propis, sense capçaleres i amb un disseny a pàgina completa; l'índex n'és un altre. Un estil també pot deixar sense numerar els seus títols, perquè un pròleg no desplaci la numeració dels capítols, i deixar-los fora de l'índex.

## Una ullada a la configuració d'aquest llibre

Val la pena veure com estan construïdes les pàgines que llegeixes. La coberta és el títol de primer nivell del primer capítol, amb l'estil _cover_. L'estil dona a aquesta secció uns marges que empenyen qualsevol text al peu de la pàgina, treu les capçaleres i dibuixa un disseny a pàgina completa: una caixa que omple la sang amb el color nit, la il·lustració de coberta com a element d'imatge ancorat a la part superior de la sang, un avanttítol en versals daurades amb un espaiat generós, el títol de les metadades en Fraunces a 88 punts, un filet daurat curt, el subtítol en Lora cursiva i una línia de crèdits al peu. L'avanttítol i els crèdits provenen d'atributs del títol, escrits a la seva línia del Markdown.

Les obertures de capítol són un disseny del primer nivell de títol. Una caixa omple la part superior de la sang amb el color de part; el número de capítol s'imprimeix en gran al costat de la vora exterior, l'avanttítol combina la paraula _Capítol_, el número i el títol de la part, i sota un filet blanc curt vénen el títol i la introducció del capítol, presa de l'atribut \`lead\` del títol. L'atribut \`summary\` del mateix títol és el que l'índex imprimeix sota cada entrada. Res en aquests dissenys no és propi d'aquest llibre: qualsevol configuració pot compondre els seus.

## Dissenys

Les capçaleres, els peus de pàgina, les obertures de capítol i les portadelles es dibuixen amb **dissenys**: petites composicions lliures de textos, filets, caixes i imatges. Cada element s'ancora a la pàgina, a la sang, a la caixa de text o a un altre element, amb desplaçaments i mides en unitats reals, i el seu text pot portar **marcadors** com \`{pageNumber}\`, \`{chapterTitle}\`, \`{partTitle}\` o qualsevol atribut del títol, com el \`{attr.lead}\` que posa l'entradeta a la banda d'aquest capítol. Els elements es poden limitar a les pàgines parelles o senars i a les pàgines d'un paper concret —cos, obertura, part o blanca—, i així les capçaleres d'aquest llibre desapareixen a les obertures de capítol mentre apareix un foli al peu. Els elements de text poden ajustar-se, partir mots, retallar-se amb punts suspensius, dibuixar una caixa al darrere i obrir amb una caplletra.

Les capçaleres són un disseny corrent, amb elements filtrats per paritat i per paper. A les pàgines parelles d'aquest llibre, el foli en el color de part i el títol del llibre van al costat de la vora exterior; a les senars, el títol del capítol i el foli. Només apareixen a les pàgines de cos; les obertures porten en lloc seu un foli al peu, i les portadelles de part no en porten cap. La pàgina negra que queda enfront de cada portadella de part també és un element de disseny: una caixa que omple la sang, visible només a les pàgines parelles en blanc, que, en un llibre els capítols del qual obren en pàgina parella i les parts del qual obren en pàgina senar, són exactament les pàgines que queden enfront d'una part.

## Parts i paletes

\`:::part\` obre una portadella de part: una pàgina pròpia, portada a la paritat que demana la configuració, dibuixada amb el disseny de part i seguida d'un cos, normalment la llista dels seus capítols. Les parts s'arrosseguen, de manera que les capçaleres i les obertures dels capítols següents poden anomenar la part a què pertanyen, i apareixen tant a l'índex com als marcadors del PDF.

En aquest llibre cada part s'obre com un plec: una pàgina parella negra a l'esquerra i la portadella a la dreta. Les parts salten amb la paritat _sempre senar_, que col·loca un full en blanc davant de cada portadella i n'afegeix un segon quan el capítol anterior acaba en pàgina parella, de manera que la portadella cau sempre en pàgina senar amb una pàgina parella en blanc al davant. El primer capítol de la part s'obre llavors al dors de la portadella, en pàgina parella, com tots els capítols.

Una part també pot canviar el color del llibre. Els colors de la configuració es poden enllaçar a entrades amb nom de la **paleta**, i l'atribut \`palette\` d'una part substitueix entrades fins a la part següent. Aquest llibre defineix una entrada, el _color de part_, i cada part li dona un valor: blau per als fonaments, or per a l'ofici, vermelló per a la pràctica. Les bandes dels capítols, els números dels títols, els folis i els peus el segueixen.

## Un índex que es manté al dia

\`:::toc\` imprimeix l'índex: una entrada per cada títol dels nivells indicats i una fila per cada part, amb números, títols, punts guia, folis i, si es vol, una línia presa d'un atribut del títol; en aquest llibre, el resum de cada capítol. Els folis són reals: el motor maqueta el llibre, llegeix on ha caigut cada títol i torna a compondre l'índex fins que els números s'assenten, cosa que requereix com a màxim tres passades més. Al PDF les entrades són enllaços.

## Salts de pàgina i numeració

\`:::pagebreak\` comença una pàgina nova i pot demanar que sigui senar o parella, afegint una pàgina en blanc si cal. \`:::numbering\` canvia la seqüència de folis a partir de la pàgina següent; així, uns preliminars numerats en romans donen pas als aràbics al capítol u. I on un passatge demana una mica més d'aire a sobre, \`:::space\` deixa una línia en blanc, o \`:::space{lines=2}\` dues; les línies en blanc de més no hi afegeixen res.

:::part{number="III" title="La pràctica" palette="band=#c0452f"}
7. Escriure per a Postext
8. El Sandbox
9. Sortida: canvas, HTML, PDF i EPUB
10. El llibre en 3D
11. Full de ruta i comunitat
:::

# Escriure per a Postext {lead="Tot aquest llibre s'ha escrit en Markdown corrent amb un grapat d'extensions. Es llegeixen bé en qualsevol editor de text i diuen què és el text, mai on va." summary="Markdown, directives, requadres i estils de paràgraf"}

Els documents de Postext són, abans de res, Markdown. Qui sap Markdown pot escriure per a Postext des del primer dia; les extensions només apareixen on un llibre necessita alguna cosa per a la qual Markdown no va tenir mai paraules.

## Markdown corrent

Títols d'un a sis coixinets, paràgrafs, cites en bloc, llistes amb pics, numerades i de tasques —niades amb dos espais per nivell, fins a cinc nivells— i matemàtiques destacades entre dobles signes de dòlar. En línia, la negreta i la cursiva de sempre, més superíndexs entre accents circumflexos, com a 10^-8^, subíndexs entre titlles, com a H~2~O, matemàtiques en línia entre signes de dòlar i barres inverses per escriure caràcters literals.

Convé conèixer alguns detalls. Les línies consecutives d'un paràgraf s'uneixen, de manera que els salts de línia de l'original no arriben mai a la pàgina; un paràgraf nou necessita una línia en blanc. Les llistes toleren una sola línia en blanc entre elements, però dues línies en blanc les acaben. Les llistes ordenades conserven el número amb què comencen, de manera que una llista pot començar en 0 o en 5. I un títol pot forçar un salt de línia en el seu text amb dues barres inverses, cosa que només afecta els dissenys que imprimeixen el títol en gran —obertures i portadelles de part—, mentre que les capçaleres, l'índex i els marcadors del PDF el mantenen en una sola línia.

Una part de Markdown es deixa fora expressament, perquè un llibre té altres maneres de dir-ho: les imatges són recursos i no dibuixos en línia, les taules són recursos amb un model i no taules de barres, i l'HTML en brut no significa res en una pàgina impresa. Els enllaços funcionen a la vista HTML i al PDF; donar al codi en línia un estil propi és al full de ruta.

## Directives i contenidors

Tota la resta s'expressa amb un petit vocabulari de directives, recollit a :ref{id="document-format"}. Les directives d'una línia comencen amb tres dos punts i actuen al punt on apareixen. Els contenidors embolcallen blocs entre una línia d'obertura amb atributs i una línia de tancament amb tres dos punts; es poden niar, i un que no s'ha tancat es tanca al final del capítol, amb un avís.

Els valors dels atributs poden anar entre cometes dobles o simples, o sense cometes quan són una sola paraula, i una clau sense valor és un indicador. Una directiva que el motor no coneix no es descarta en silenci: s'imprimeix com un paràgraf, perquè res no desaparegui, i el tauler Revisió l'assenyala amb el seu capítol i la seva línia. El mateix passa amb un estil de requadre o un estil de paràgraf que la configuració no defineix.

## Esmentar recursos

Les referències mereixen una mirada més atenta, perquè amb elles s'escriu la major part de l'aparell d'un llibre. \`:ref{id="…"}\` imprimeix per defecte l'etiqueta abreujada i el número —_Fig. 5.1_ a l'edició catalana d'aquest llibre— i incorpora el recurs la primera vegada que apareix. Un atribut \`style\` imprimeix només el número o l'etiqueta completa, _Figura 5.1_; \`case\` passa l'etiqueta a minúscules, a majúscules o a majúscula inicial, perquè una referència a principi de frase es llegeixi bé; i \`text\` imprimeix qualsevol text sense deixar d'incorporar i enllaçar el recurs. Una referència a un identificador que no existeix imprimeix un signe d'interrogació i un avís, de manera que les referències trencades es troben abans que el llibre vagi a impremta.

\`::resource{id="…"}\`, en una línia pròpia, insereix un recurs en aquell punt exacte quan la seva col·locació diu _here_; altrament, compta simplement com una menció. Aquest llibre no el fa servir enlloc i deixa flotar totes les figures, que sol ser la millor elecció.

## Referències creuades i cites

El mateix \`:ref\` anomena qualsevol lloc del llibre que porti un identificador: un títol escrit \`## Método {#metodo}\`, un requadre obert amb \`{#id}\` o una frase marcada \`[estas palabras]{#clave}\`. Imprimeix _secció 3.2_ o _capítol 4_, el títol amb \`style=title\` o la pàgina amb \`style=page\`, i la pàgina és la correcta perquè el motor torna a compondre el llibre fins que no canvia. Cadascuna d'aquestes referències és un enllaç al PDF, a l'HTML i en aquestes previsualitzacions.

Les obres es citen com les escriu Pandoc, \`[@garcia2020, pág. 33]\` o \`@garcia2020\` dins de la frase, amb les referències al front matter o en un bloc \`:::references\` de BibTeX. L'estil de cita és un ajust, no una propietat del text: APA, Chicago, MLA, IEEE, Vancouver, ISO 690, GB/T 7714 o un estil propi, que es tria a Disseny › Cites, on una previsualització mostra el resultat. La bibliografia va després de l'últim capítol, o allà on s'escrigui \`:::bibliography\`.

## Notes a peu de pàgina

Una nota es crida amb \`[^id]\` just després de la paraula o del signe de puntuació a què pertany, i s'escriu en qualsevol lloc del capítol com un paràgraf que comença amb \`[^id]:\`. Les notes es numeren en l'ordre en què es criden per primera vegada, començant per u a cada capítol; \`footnotes.numbering\` pot continuar la numeració al llarg del llibre o reiniciar-la a cada pàgina, com fan els llibres xinesos i els àrabs clàssics, i els números es poden imprimir dins d'un cercle o entre parèntesis. Una nota es compon al peu de la columna que conté la línia que la crida, sota un filet curt, i la línia i la seva nota comparteixen sempre columna: quan la nota no hi cap, la línia passa amb ella a la columna següent. \`footnotes.placement: 'chapterEnd'\` aplega en canvi les notes d'un capítol després del seu últim bloc. Una crida sense nota i una nota que no es crida enlloc s'assenyalen totes dues al tauler **Revisió**. Aquesta guia no té notes; entre els llibres d'exemple, _El paradís perdut_ en porta vuit-centes, identificades amb lletres que tornen a començar a cada pàgina.

## Un índex analític al final

Un índex analític s'escriu allà on el text tracta cada terme. \`:index[anèmia]\` imprimeix la paraula i la registra; \`:index{term="Cor!vàlvules"}\` no imprimeix res i registra la pàgina sota una subentrada. Un indicador \`main\` posa la pàgina en negreta, \`range="start"\` i \`range="end"\` delimiten una explicació que ocupa diverses pàgines, i \`see\` i \`seealso\` escriuen remissions. \`:::index\` imprimeix l'índex allà on és, normalment sota un títol l'estil del qual el compon a dues columnes, i al costat del principal hi pot haver índexs amb nom propi, de persones o de llocs.

El motor llegeix la pàgina de cada marca després de maquetar, de manera que els números segueixen el text: afegeix un paràgraf, mou un capítol o canvia la mida de pàgina, i l'índex imprimeix les pàgines noves. Les entrades s'ordenen segons l'ordre alfabètic de la llengua del document i s'agrupen sota la seva inicial, les pàgines consecutives s'uneixen en un interval i cada número és un enllaç al PDF. Un índex en àrab no té en compte l'article _al-_ en ordenar, i un en xinès ordena per la lectura de cada caràcter.

## Requadres

\`:::callout\` compon una caixa amb un títol opcional, en un dels estils que defineix la configuració. Aquest llibre en defineix quatre: els requadres _Prova-ho_ que t'envien al Sandbox, les notes tècniques, les cites destacades en cursiva de rètol i un tauler fosc de pàgina completa amb xifres clau. Un estil decideix el fons, la vora, la franja i el radi de les cantonades de la caixa, una icona o marca opcional, la tipografia del seu títol, el seu cos i les seves llistes, i on va: en el flux, al cap o al peu d'una columna, a l'amplada de la pàgina, a la columna lateral d'una maquetació de columna i mitja o fix en una posició de la pàgina.

Un requadre llarg es pot partir entre els seus paràgrafs, o fins i tot entre les seves línies, deixant-ne almenys dues a cada costat; la continuació omet el títol. Dins d'un requadre, \`:::columns\` compon el contingut en columnes equilibrades, com el tauler de xifres del capítol 2.

Els atributs d'un requadre poden substituir el seu estil per a una sola caixa: un \`title\`, un \`span\` de columna, de pàgina o lateral, una \`placement\` i una \`label\` impresa en una pestanya de la seva cantonada superior, com les etiquetes _Requadre 1-1_ d'un llibre de text. Els estils també poden aturar els flotants a la seva vora, perquè una figura esmentada dins d'una caixa no s'escapi mai més enllà, i poden decidir si una caixa massa alta per a la seva columna s'ha de partir o ha d'avisar.

:::callout{type="note" title="Per què un vocabulari tan petit"}
Cada extensió respon a una pregunta que un llibre es fa i que Markdown no sap contestar: on acaba una pàgina, com es numeren les pàgines, què és una part, quins paràgrafs pertanyen a una caixa. Tot el que té a veure amb el seu aspecte viu a la configuració, i així el mateix text es pot compondre com a llibre de butxaca o com a revista sense tocar ni una coma.
:::

## Matemàtiques a l'original

Les matemàtiques s'escriuen en notació LaTeX. Les fórmules en línia van entre signes de dòlar senzills, enmig d'una frase; les fórmules destacades van entre dobles signes de dòlar, en una línia pròpia o com un bloc de diverses línies. Un signe de dòlar que s'hagi d'imprimir com a tal s'escapa amb una barra inversa. Una fórmula que no es tanca mai, o que MathJax no pot llegir, s'assenyala al tauler Revisió i se substitueix a la pàgina per un marcador vermell, perquè no es pugui colar al PDF sense que ningú se n'adoni.

## Estils de paràgraf

\`:::paragraphs{style="…"}\` aplica un estil de paràgraf amb nom als paràgrafs que embolcalla: un epígraf, una dedicatòria, una bibliografia, un colofó. Un estil pot canviar el tipus de lletra, el cos, l'interlineat, el color, l'alineació —també centrada i a la dreta—, el sagnat i l'espaiat. El colofó del dors de la coberta d'aquest llibre n'és un.

## Escriure bé per al motor

Uns quants costums faciliten la feina del motor i milloren les pàgines. Introdueix cada llista amb una frase, perquè la llista no sigui mai el primer que hi ha sota un títol; el tauler Revisió pot assenyalar les que ho són. Mantén els títols en ordre, sense saltar-te nivells. Esmenta cada figura i cada taula al text, a prop d'on la vols: la menció decideix on pot anar el recurs i quin número rep. Deixa la col·locació a la configuració tret que un recurs necessiti de debò una posició pròpia. I escriu un text alternatiu per a cada figura, perquè el PDF accessible l'ofereix als lectors que no poden veure la imatge.

## Metadades

Les metadades d'un llibre van en un bloc YAML al principi del seu primer capítol: títol, subtítol, autor i data de publicació, disponibles com a marcadors en tots els dissenys. La coberta d'aquest llibre n'imprimeix el títol i el subtítol. Qualsevol altra clau es desa per a l'aplicació que allotja el motor; les metadades dels capítols posteriors s'ignoren, amb un avís.
# El Sandbox {lead="El Sandbox és el motor amb un editor al voltant: la pàgina que estàs llegint, el Markdown del qual surt i cada ajust que li ha donat forma, l'un al costat de l'altre i en directe." summary="L'editor, els taulers, els projectes, els presets i compartir"}

Tot el que explica aquest llibre es pot provar ara mateix, sense escriure codi. El Sandbox no és una demo construïda sobre Postext: és el mateix motor, en una interfície pensada per a dos públics alhora, els qui desenvolupen i avaluen la biblioteca i els qui dissenyen i volen veure què fa cada opció.

## Un recorregut per la interfície

La interfície segueix la disposició d'un editor conegut, esbossada a :ref{id="sandbox-ui"}. Una **barra d'activitat** a l'esquerra canvia entre set taulers —Llibres, Capítols, Text, Recursos, Fonts, Disseny i Revisió, aquest últim amb el nombre d'assumptes pendents—. Una **barra lateral** redimensionable acull el tauler actiu; si fas clic a la icona activa, es plega. El **visor**, a la dreta, mostra la mateixa maquetació en cinc pestanyes: Canvas, PDF, Folio, HTML i EPUB 3. La interfície està en anglès, castellà, català, xinès simplificat, japonès i àrab, i en àrab va de dreta a esquerra; l'ajust **Botons i camps grans** fa que cada control sigui més fàcil d'encertar amb el dit o amb una mà poc ferma.

La barra lateral i el visor comparteixen la finestra, i la frontera entre tots dos es pot arrossegar. Cada tauler i el visor recorden el seu estat entre visites: l'ampliació i el mode de vista del canvas, el mode de columnes de la vista HTML, els grups oberts al tauler Disseny. El tema i l'idioma de la interfície es canvien des del peu de la barra d'activitat, i l'idioma de la interfície és independent de la llengua del llibre.

## Editar un llibre

L'editor del tauler **Text** ressalta les metadades i les matemàtiques, i la seva barra d'eines insereix format, llistes, salts de pàgina i canvis de numeració. A la capçalera, un **selector de capítols** recorre els capítols del llibre i en mostra les pàgines; cada capítol conserva el seu propi historial de desfer i el seu cursor. L'editor i les pàgines se segueixen en els dos sentits: fer clic en una paraula de la pàgina hi porta el cursor al Markdown, i seleccionar text el ressalta a la pàgina. El tauler **Capítols** mostra el llibre obert d'una vegada, amb els capítols en ordre i les pàgines de cadascun.

A més, l'editor vigila el llibre sencer. El seu menú de capítols llista cada capítol amb les pàgines que ocupa tan bon punt es coneixen, i passar a un altre capítol hi canvia les previsualitzacions. Els capítols es poden crear, reanomenar, reordenar, dividir pels seus títols de primer nivell o fusionar amb l'anterior, i el capítol sencer es pot exportar com a fitxer Markdown o substituir per un altre.

## Configuració

El tauler **Disseny** edita la configuració completa —més de cinc-cents camps— per grups: pàgina i columnes, escriptura, colors, tipografia, títols i índex, llistes, figures i taules, requadres, capçaleres i peus, parts, exportació, Folio (el llibre en 3D) i el grup Avançat. Un cercador troba qualsevol opció pel nom, i el filtre **Canviats** mostra el que difereix dels valors per defecte. Cada camp i cada secció es poden restablir per separat, i la configuració es pot exportar i importar com a fitxer.

## Les cinc vistes

La vista **canvas** és la previsualització de treball: amplia des d'un quart de la mida real fins a quatre vegades, ajusta la pàgina a l'amplada o a l'alçada del visor i mostra pàgines soltes o plecs, amb la primera pàgina sola com a pàgina senar, tal com s'obre un llibre imprès. La vista **PDF** genera un PDF real al navegador i el mostra al visor del mateix navegador, amb botons per generar-lo de nou, baixar-lo i imprimir-lo. La vista **Folio** mostra el llibre enquadernat i obert sobre una taula, en tres dimensions, amb fulls que es passen amb la mà; té un capítol propi, _El llibre en 3D_. La vista **HTML** mostra la mateixa maquetació com a HTML posicionat, aïllat de la resta de la pàgina, amb un control de la mida del text i dos modes de lectura: una columna que es desplaça o tantes columnes com càpiguen a la pantalla. La vista **EPUB 3** genera al navegador un llibre electrònic amb una de dues maquetacions: la **fixa** conserva les pàgines impreses línia a línia, amb text real que es pot seleccionar i cercar; la **fluida** deixa que el text s'adapti a la pantalla i a la mida de lletra de qui llegeix. Un petit lector dins de la pestanya mostra el fitxer que estàs a punt de baixar: les tecles de fletxa, lliscar el dit al mòbil o els botons en passen les pàgines, una llista porta a qualsevol capítol, i un llibre de maquetació fluida es pot llegir amb la lletra més gran o més petita.

Les vistes canvas, HTML i Folio poden maquetar el capítol actual o el llibre complet; el PDF té la seva pròpia elecció, de manera que es pot corregir ràpidament un sol capítol mentre les previsualitzacions mostren el llibre; l'EPUB és sempre el llibre complet. Aquesta guia s'obre en el mode de llibre complet. Un llibre compost en vertical, com l'edició xinesa d'aquesta guia, es llegeix a la vista HTML només pàgina a pàgina, perquè en una única columna que es desplaça les seves línies quedarien ajagudes.

## Al mòbil

Per sota de l'amplada d'una tauleta, el Sandbox es reorganitza. La barra de taulers passa al peu de la pantalla, un tauler obert cobreix la previsualització en lloc de quedar-se al seu costat, i en tancar-lo la previsualització continua a la pàgina que mostrava. Les barres d'eines de les previsualitzacions es col·loquen al llarg de la vora inferior, on arriba el polze, i passen a una segona fila quan la pantalla és estreta. Un mòbil no pot mostrar un PDF dins d'una pàgina, així que la vista PDF ofereix obrir el fitxer; i com que un mòbil dona a una pestanya del navegador menys memòria de la que necessita un llibre en tres dimensions, allà no hi apareix la vista Folio.

## Recursos i fonts

El tauler **Recursos** llista els recursos del llibre per tipus. Les imatges i els fitxers SVG s'hi poden arrossegar, les taules s'editen en un editor de tipus full de càlcul amb cel·les combinades, emplenaments, imatges, amplades de columna i enganxament des d'un full de càlcul, i el text d'un diagrama SVG es pot editar al seu lloc. Si fas clic en un peu, una nota, una cel·la o el text d'un diagrama de la previsualització, s'obre al tauler. El tauler Fonts afegeix famílies pròpies, pes a pes, en els formats web i d'escriptori habituals; una família pròpia té prioritat sobre una font de Google amb el mateix nom.

Cada recurs té una vista de detall amb el seu identificador, el seu tipus, el seu peu, la seva nota i el seu text alternatiu, la seva col·locació —posició, amplada de columna, gir, amplada, alineació i un peu al costat— i una previsualització en directe. Esborrar un recurs avisa quan el text encara l'esmenta. El tauler Fonts, per la seva banda, comprova que cada família que anomena la configuració tingui els pesos i els estils que necessita, i avisa de les variants que falten o estan duplicades.

## Avisos

El tauler **Revisió** llista tot el que el motor ha detectat en compondre el llibre: fonts que no s'han carregat, línies massa espaiades, nivells de títol que se salten, contenidors sense tancar i directives desconegudes, estils que no existeixen, marcadors que no imprimeixen res, recursos que falten i requadres massa alts per a la seva columna. Cada avís indica el capítol i la línia, i amb un clic t'hi porta.

## Projectes, presets i compartir

La teva feina es desa al navegador mentre escrius. Els **projectes** són llibres desats localment, a **Els meus llibres** dins del tauler **Llibres**, cadascun amb el seu nom, la seva descripció i la seva imatge de coberta; es poden duplicar, exportar i importar. Els **presets** són llibres de només lectura des dels quals començar, a **Llibres d'exemple**: aquesta guia i una galeria d'edicions de mostra —una revista d'astronomia, un _Quixot_ il·lustrat, una revista de medi ambient, un catàleg d'exposició, dos manuals universitaris, _Somni del pavelló vermell_ en xinès, _Les mil i una nits_ en àrab, enquadernat per la dreta, i _El paradís perdut_ anotat, amb les làmines de Doré—, cadascuna amb un disseny propi. **Fer una còpia pròpia** en converteix un en un projecte teu.

Els presets segueixen el seu origen. Quan un paquet de preset canvia al servidor, el Sandbox ho detecta en qüestió de segons: un preset sense tocar es recarrega sol, i un que has editat mostra un avís que ofereix recarregar-lo, de manera que la feina en curs no se sobreescriu mai. Els presets es poden amagar de la llista i tornar a mostrar, i cadascun es pot obrir en qualsevol de les seves llengües quan en té més d'una, com aquesta guia, que es pot llegir en anglès, castellà, català, xinès simplificat, àrab i japonès.

Un llibre viatja com un únic fitxer **.postext**: els seus capítols, la seva configuració, els seus recursos i les seves fonts, a més de la paginació ja calculada, de manera que s'obre paginat. Les receptes del Receptari s'obren al Sandbox de la mateixa manera, com a llibres teus; una recepta que ja havies obert abans et pregunta si vols **Obrir la meva còpia**, amb els teus canvis, o **Substituir per la versió publicada**, que pot haver estat corregida després. I la barra d'adreces conté sempre un enllaç permanent al que estàs veient: el llibre, la llengua, el visor, el capítol i la pàgina.

:::callout{type="try"}
Ves fins a una pàgina que t'agradi i copia l'adreça del navegador: en obrir aquest enllaç veuràs el mateix llibre, al mateix visor, a la mateixa pàgina.
:::

## Incrustar el Sandbox

El Sandbox també és un paquet, _postext-sandbox_, un component de React que qualsevol aplicació web pot incrustar. Qui l'allotja decideix el Markdown i la configuració inicials, l'idioma de la interfície i cada etiqueta, els orígens dels presets que ofereix, i el selector de tema, el selector d'idioma i l'enllaç d'inici que mostra. El Sandbox que fas servir és exactament aquest component, incrustat al lloc web de Postext.

# Sortida: canvas, HTML, PDF i EPUB {lead="Un arbre, quatre sortides. El canvas previsualitza, l'HTML es llegeix en pantalla, el PDF va a impremta i l'EPUB va al dispositiu de qui llegeix, i totes surten de la mateixa maquetació." summary="Els renderitzadors, el PDF accessible, els llibres EPUB i l'ús de la biblioteca"}

Com que tots els renderitzadors llegeixen el mateix VDT, la promesa de _el que veus és el que obtens_ és literal: els salts de línia, els límits de pàgina i la posició de cada figura coincideixen al canvas, a l'HTML i al PDF, i un EPUB de maquetació fixa també els conserva. Un EPUB de maquetació fluida renuncia expressament a la pàgina i conserva tota la resta del que ha resolt la maquetació: els números, les notes, les referències i els folis impresos.

## Canvas

El renderitzador de canvas dibuixa una pàgina en un canvas HTML, a qualsevol resolució. Al Sandbox és la previsualització en directe, amb ampliació, ajust a l'amplada o a l'alçada, pàgines soltes o plecs, i pàgines que es dibuixen a mesura que entren a la pantalla, de manera que els llibres llargs continuen responent.

Les imatges dels recursos es registren al renderitzador una sola vegada, per identificador de fitxer, i es reutilitzen a totes les pàgines. Les pàgines es poden dibuixar en qualsevol canvas a qualsevol escala, cosa que fa útil el mateix renderitzador per a miniatures, previsualitzacions d'impressió i exportació a imatge: els exemples en directe de la documentació dibuixen una pàgina i la converteixen en un PNG.

## HTML

El renderitzador HTML retorna HTML amb posicionament absolut i CSS editorial: cada línia on la va posar la maquetació, amb la seva font, el seu cos i la seva línia de base exactes. Una variant indexada indica quines parts de la pàgina han canviat, perquè un visor només apedaci aquestes. Al Sandbox, la pestanya HTML aïlla la sortida en un Shadow DOM i hi afegeix un mode de lectura amb una sola columna que es desplaça o amb tantes columnes com càpiguen a la pantalla, amb un control de mida de lletra. Un conjunt d'ajustos només per a pantalla pot adaptar el disseny a la lectura en pantalla sense tocar les pàgines impreses.

El renderitzador rep una funció que converteix l'identificador de fitxer d'un recurs en una URL, perquè les imatges es puguin servir des de qualsevol lloc, i un color de fons per a la pàgina. La seva sortida és marcatge i CSS sense res més, sense cap script, cosa que la fa adequada per a allotjament estàtic, previsualitzacions de correu electrònic o emmagatzematge en un servidor un cop calculada la maquetació en un navegador.

## PDF

El paquet _postext-pdf_ converteix el VDT en un PDF real, d'un document o d'un llibre sencer. No torna a mesurar mai: les mètriques del canvas són la referència i el PDF només les transporta, per això les línies es tallen exactament als mateixos llocs. Incrusta fonts reals, una d'estàtica per pes, així que la negreta és negreta, la cursiva és cursiva i el text es pot seleccionar. Sobre les pàgines hi afegeix marcadors a partir dels títols i les parts, etiquetes de pàgina que coincideixen amb els folis impresos, referències clicables, figures SVG com a vectors i una elecció d'espai de color —RGB, CMYK o escala de grisos— per a la impremta.

Les fonts arriben al PDF a través d'un **proveïdor de fonts**, una funció que retorna els bytes d'una família en un pes i un estil donats. El proveïdor del Sandbox baixa cares estàtiques de Fontsource, un fitxer per pes, i les descomprimeix des de WOFF2; les fonts pròpies vénen del tauler Fonts. Els bytes dels recursos es lliuren de la mateixa manera, per identificador de fitxer. El renderitzat informa del seu progrés, s'executa en un worker propi quan se li demana i accepta un llibre sencer com una llista de documents de capítol, del qual produeix un únic PDF amb etiquetes de pàgina contínues, marcadors i enllaços.

## Accessible per defecte

Tot PDF surt **etiquetat** per defecte, segons la norma PDF/UA-1: un arbre d'estructura amb títols, paràgrafs, llistes, taules i figures en ordre de lectura, text alternatiu per a cada figura, la llengua del document i els elements decoratius marcats com a artefactes perquè els lectors de pantalla se'ls saltin. L'accessibilitat no és una opció d'exportació que calgui recordar: és la manera com es fabrica el fitxer.

L'etiquetatge segueix la maquetació i no l'original. Els paràgrafs partits entre columnes i pàgines s'etiqueten com un sol paràgraf, les llistes mantenen junts els seus elements, les taules conserven les cel·les de capçalera i les figures porten el seu text alternatiu —o el seu peu, o la seva etiqueta, quan no s'ha escrit text alternatiu—. El títol i la llengua del document viatgen a les metadades, les capçaleres i els ornaments de pàgina es marquen com a artefactes, i les referències entre el text i les figures que esmenta són enllaços reals.

## Color per a impremta

Els colors de la configuració s'escriuen com a valors hexadecimals, opcionalment enllaçats a la paleta, i això és el que dibuixa el PDF per defecte. Per a la producció impresa, el PDF es pot forçar a un espai de color: CMYK per a la impressió òfset o escala de grisos per a treballs a una tinta. Juntament amb els diagrames a una tinta, un llibre pot passar d'una edició en pantalla plena de color a una edició impresa a una tinta canviant dos ajustos, sense tocar el text ni les figures.

## Llibres sencers

El PDF d'un llibre no és una concatenació de fitxers solts. El renderitzador rep la maquetació de cada capítol i escriu un únic document: les etiquetes de pàgina continuen d'un capítol a l'altre, els marcadors formen un sol arbre amb les parts per sobre dels seus capítols, i l'estructura accessible del llibre sencer és un únic arbre en ordre de lectura. Com que cada capítol es va maquetar com a continuació dels anteriors, les pàgines del capítol set al PDF del llibre són exactament les pàgines del capítol set imprès per separat.

El Sandbox ofereix les dues coses: la vista PDF pot alternar entre el capítol actual, per a proves ràpides, i el llibre complet, per al fitxer definitiu. Compilar el llibre sencer porta més temps, així que s'executa al worker de PDF i informa del seu progrés pàgina a pàgina.

## Les fonts al PDF

Un PDF val el que valen les fonts que porta a dins. Postext incrusta cada tipus que ha fet servir la maquetació —un fitxer estàtic per pes i estil—, de manera que una paraula en negreta es compon amb la negreta real i una cursiva amb la cursiva real, mai amb una imitació inclinada o engruixida. Els tipus TrueType es redueixen als glifs que el llibre fa servir de debò, cosa que manté els fitxers lleugers fins i tot amb quatre famílies; els tipus OpenType amb contorns PostScript s'incrusten sencers, perquè alguns visors no en saben llegir els subconjunts. Cada font incrustada porta un mapa dels glifs als caràcters, lligadures incloses, de manera que en copiar una frase del PDF s'obté la frase que es va escriure, i en cercar al document es troben totes les paraules.

Les famílies arriben d'allà on el Sandbox les va trobar. Les de Google Fonts es baixen tipus a tipus des de Fontsource i es descomprimeixen al vol; les que es pugen al tauler Fonts s'incrusten a partir dels fitxers que els vas donar. Una família disponible només en WOFF no s'admet al PDF, perquè aquest format no es pot incrustar amb garanties; WOFF2, TrueType i OpenType funcionen.

## EPUB 3

El paquet _postext-epub_ escriu un llibre maquetat com un fitxer EPUB 3, el format de les botigues de llibres electrònics, de les biblioteques i de les aplicacions de lectura. Llegeix els mateixos documents de capítol que el PDF d'un llibre sencer, de manera que els números de pàgina, les notes, les cites, les referències creuades, l'índex i l'índex analític hi arriben resolts, i retorna el fitxer com a bytes, al navegador o a Node, sense cap servidor. L'EPUB defineix dues maquetacions, posades l'una al costat de l'altra a :ref{id="epub-renditions"}, i el generador produeix qualsevol de les dues a partir de la mateixa maquetació del motor.

La **maquetació fixa** conserva la pàgina impresa. Cada pàgina es converteix en un document propi, a la mida de la pàgina, amb el text on el posa el PDF i en les fonts del llibre, de manera que les columnes, els flotants, les capçaleres, les obertures i cada salt de línia es mantenen. El text continua sent text: es pot seleccionar, cercar i llegir en veu alta, i els enllaços del llibre —referències creuades, notes, l'índex imprès i l'índex analític— funcionen d'una pàgina a l'altra. Les pàgines s'aparellen en plecs com en el llibre imprès, i un llibre enquadernat per la dreta, en àrab o en xinès vertical, es passa de dreta a esquerra. És la maquetació adequada per als llibres les pàgines dels quals es dissenyen com a pàgines, un llibre il·lustrat, un manual, un catàleg o una revista, llegits en una pantalla gran; en un mòbil la pàgina es redueix i qui llegeix l'ha d'ampliar per llegir-la.

## Llibres de maquetació fluida

Un llibre de **maquetació fluida** renuncia a la pàgina i conserva el text. Cada capítol es converteix en un sol document que el sistema de lectura torna a compondre per a la seva pantalla, amb el tipus de lletra, la mida i els marges que tria qui llegeix. El generador no torna al Markdown: reconstrueix cada paràgraf a partir de les línies que ha compost el motor, treu els guionets que hi han afegit els salts de línia i conserva els que formen part de la paraula, de manera que un paràgraf partit entre dues columnes o dues pàgines torna a ser un sol paràgraf. Les figures i les taules segueixen el text que les cita, amb els seus peus numerats i el seu text alternatiu; les taules continuen sent taules de veritat, amb files de capçalera i cel·les combinades; els requadres passen a ser blocs complementaris amb el seu títol, i les notes enllacen amb el final del capítol i tornen al text. Cada pàgina impresa deixa una marca allà on comença el seu text, de manera que es pot trobar la pàgina 112 de l'edició impresa, i l'índex analític apunta a aquestes marques.

L'aspecte surt de la configuració. Un full d'estil derivat d'ella dona als títols, els requadres, les taules, els peus i les llistes les seves mides i els seus colors, relatius al text del cos, de manera que la mida de lletra que tria qui llegeix s'aplica a tot. Els paràgrafs compostos amb un estil de paràgraf el conserven, perquè la maquetació registra quin estil ha compost cada bloc, i els nivells de l'índex analític es distingeixen de la mateixa manera; un capítol configurat d'una altra manera, o una part que canvia el color del llibre, hi afegeix un segon full amb només les regles que canvien. Una cita destacada repeteix paraules del text, així que es mostra però s'amaga als lectors de pantalla i a la lectura en veu alta, i les seves paraules es llegeixen una sola vegada. El xinès vertical conserva les línies verticals, i un llibre en àrab va de dreta a esquerra.

Totes dues maquetacions porten la mateixa navegació: un índex fet a partir dels títols i les parts, una llista de les pàgines impreses i punts de referència per a la coberta, l'índex imprès i el començament del text. S'hi incrusta cada família que anomena el disseny, tret que estigui marcada com a no redistribuïble, i cada imatge hi entra una sola vegada. Totes dues porten les metadades d'EPUB Accessibility 1.1 i passen sense cap error ni avís l'EPUBCheck del W3C, el validador que les botigues de llibres electrònics apliquen als fitxers que reben; així passa amb aquesta guia i amb tots els llibres d'exemple. Al Sandbox, la pestanya **EPUB 3** genera el fitxer en un worker, de manera que la pàgina continua responent mentre s'escriu un llibre llarg.

## Triar una sortida

Les quatre sortides comparteixen la maquetació, però serveixen a moments diferents de la vida d'un llibre. El **canvas** és la vista de treball: ràpida, fidel, la que el Sandbox manté oberta mentre escrius i dissenyes. L'**HTML** serveix per llegir en pantalla i per publicar dins d'una aplicació web: les mateixes pàgines com a marcatge posicionat, o el text reorganitzat en els modes de lectura del visor, aïllat dels estils de la pàgina que l'envolta. El **PDF** és l'objecte acabat: el fitxer que va a la impremta, a un arxiu o al dispositiu d'un lector, etiquetat, amb marcadors i amb cerca. L'**EPUB** és per als lectors i les botigues de llibres electrònics: una maquetació fixa quan el que compta és la pàgina, una de fluida quan el que compta és el text.

Res no obliga a triar entre elles. Un llibre es pot escriure al Sandbox amb el canvas obert, el pot revisar al visor HTML algú que llegeix al mòbil i es pot enviar a impremta com a PDF i a una botiga de llibres electrònics com a EPUB aquella mateixa tarda, des de la mateixa font i la mateixa configuració, sense que cap s'aparti de les altres.

## Fer servir la biblioteca

El motor es distribueix a npm com a _postext_, per a la maquetació i els renderitzadors de canvas i HTML, amb un paquet per a cada sortida més pesant: _postext-pdf_ per al PDF, _postext-epub_ per a l'EPUB 3 i _postext-folio_ per al llibre en 3D. Tots són mòduls ES amb llicència MIT i també es poden importar directament des d'una CDN. La documentació inclou exemples en directe que converteixen una pàgina en imatge, en HTML i en PDF, a punt per copiar i modificar.

El motor de maquetació s'executa al navegador, on pot mesurar amb les fonts que veu el lector; _postext-pdf_ i _postext-epub_ també s'executen al navegador, i a més a Node, de manera que un PDF o un EPUB es poden produir en un servidor a partir d'una maquetació calculada en un altre lloc. Un llibre sencer fa el mateix camí: \`openBundle\` llegeix un fitxer .postext, \`buildBundle\` en maqueta els capítols per ordre, i el resultat passa directament a \`renderToPdf\` o a \`renderToEpub\`. Els paquets són només mòduls ES, amb els tipus de TypeScript inclosos, i alguns empaquetadors necessiten un ajust d'una línia per al descompressor WOFF2 que fa servir el paquet de PDF. La documentació recorre tot el camí, des d'instal·lar els paquets fins a un primer PDF.

:::callout{type="note" title="Quatre passos"}
1. Carrega les fonts que anomena la configuració, perquè el navegador les pugui mesurar
2. Compila el document amb \`buildDocument(content, config)\`
3. Dibuixa'n les pàgines amb \`renderPage\` o genera-les amb \`renderToHtml\`
4. Per a impremta, passa el mateix document a \`renderToPdf\` amb un proveïdor de fonts; per a llibres electrònics, passa els capítols a \`renderToEpub\`
:::

El motor i el seu renderitzador de PDF es publiquen junts, amb el mateix número de versió, perquè tots dos coincideixin sempre en la forma de la maquetació que comparteixen. El generador d'EPUB i el visor Folio tenen números de versió propis i declaren el motor com a dependència _peer_, de manera que un projecte els actualitza junts.

## Pàgines com a imatges

Una pàgina no necessita un navegador per convertir-se en imatge. El renderitzador de canvas dibuixa en qualsevol canvas que parli la interfície de dibuix del navegador, i a Node ho fa un canvas precompilat: es maqueta el llibre, es dibuixa la pàgina i es codifica com a JPEG o PNG. Així revisa la seva pròpia feina l'skill d'agent que adapta llibres existents a Postext. Després de cada canvi a la configuració o al text torna a maquetar el llibre, dibuixa només les pàgines en què treballa i les llegeix com a imatges, en un segon o dos, sense generar un PDF ni retallar-ne imatges. El PDF es genera al final, per a les comprovacions que només un PDF pot respondre: les fonts incrustades, les imatges a la seva resolució, l'estructura etiquetada.

# El llibre en 3D {lead="Una maquetació és un conjunt de pàgines, però un llibre és un objecte: un paper d'un cert gramatge i color, una enquadernació que obre d'una certa manera, un gruix que nota la mà. La vista Folio mostra les pàgines com aquest objecte abans d'imprimir res." summary="La vista Folio, els papers, les enquadernacions, les cobertes i la llum"}

Les proves en pantalla són planes. Un plec vist com dos rectangles no diu res de com serà el llibre obert sobre una taula: si el llom s'empassa el marge interior, si una làmina en paper brillant recull la llum, si tres-centes pàgines de paper ossi formen un bloc massa gruixut per a l'enquadernació. La vista **Folio** respon aquestes preguntes amb les pàgines que Postext ja ha compost. Mostra el llibre enquadernat, obert sobre una superfície, il·luminat, amb fulls que es corben i es passen amb la mà.

Res del que s'hi veu no és una segona maquetació. Les pàgines són les que pinta el canvas, dibuixades als píxels exactes de la pantalla, així que el text a Folio és tan nítid com a la vista Canvas i el mateix línia a línia. El que Folio afegeix és tot el que envolta les pàgines: el paper, l'enquadernació, les cobertes, la taula i la llum. Tot surt d'una part de la configuració, \`folio\`, que la maquetació no llegeix mai. Canviar el paper o l'enquadernació torna a dibuixar el llibre a l'instant i no mou ni una línia.

## Passar les pàgines

Una pàgina es passa com es passa una pàgina: s'agafa per la vora i s'arrossega a l'altre costat. Si la deixes anar passada la meitat, cau a l'altre costat; si la deixes anar abans, torna al seu lloc. Un clic en una pàgina també la passa, endavant a la pàgina dreta i enrere a l'esquerra, i el mateix fan les fletxes de la barra d'eines i, quan el llibre té el focus, les tecles de fletxa, Re Pàg i Av Pàg, Inici i Fi. El camp de pàgina de la barra d'eines admet un número de pàgina i porta el llibre a aquell plec.

Cada full es corba segons el seu paper. El paper bíblia, fi, s'enrotlla en una corba tancada i deixa veure el que hi ha imprès a l'altra cara; la cartolina gira en un arc ampli; el cartró, com en un llibre de cartró per a infants petits, gira com una planxa rígida sobre la seva frontissa. Les cobertes també giren com cartrons. Un salt de més de deu pàgines no les passa una a una: el bloc de pàgines intermedi s'aixeca com una sola peça, tan gruixuda com aquestes pàgines, i es posa a l'altre costat.

La vista també es mou. Arrossegar amb el botó dret del ratolí gira al voltant del llibre, fins a un angle rasant, per veure el llom, el tall davanter o el gruix del bloc, i es pot fer mentre els fulls encara giren. La vista es queda on la vas deixar fins que **Restablir la vista** la torna a l'angle que fixa la configuració. En una finestra estreta el llibre mostra una pàgina cada vegada, i continua passant el full per sobre del llom; quan el sistema demana moviment reduït, els plecs canvien sense el gir.

Tres botons de la barra d'eines trien què fa el punter sobre el llibre: passar les pàgines a mà, orbitar la vista, que és el que necessita un trackpad o una tauleta en lloc de l'arrossegament amb el botó dret, o seleccionar text. La selecció funciona sobre les pàgines tal com es veuen, inclinades o girades, igual que a la vista canvas: un clic porta el cursor de l'editor a aquella paraula, un arrossegament selecciona, un doble clic agafa una paraula i un enllaç se segueix. També funciona a l'inrevés: el cursor i la selecció de l'editor es dibuixen sobre les pàgines, i portar el cursor a una pàgina que no és a la vista passa el llibre fins allà.

Els vídeos es reprodueixen a la pàgina. Amb el punter en mode de passar pàgines, un clic a la portada d'un vídeo el posa en marxa allà mateix, i la imatge continua movent-se mentre el full gira i es corba. Un altre clic el posa en pausa, començar-ne un altre atura l'anterior, i el vídeo s'atura quan el llibre queda obert per un plec que ja no el mostra; la barra espaiadora fa el mateix amb el vídeo del plec obert. Funciona amb els vídeos d'un fitxer o d'una adreça; els de YouTube i Vimeo no es poden dibuixar dins de la pàgina, de manera que un clic sobre ells passa el full com a qualsevol altre lloc.

:::callout{type="try"}
Obre la pestanya Folio amb aquesta guia, passa unes quantes pàgines arrossegant-ne les cantonades i després gira el llibre arrossegant amb el botó dret per veure'n el plec grapat. Restablir la vista el torna al seu lloc.
:::

## El paper

El paper es tria com ho demanaria un impressor: per **tipus**, la classe de paper, i per **gramatge**, el seu pes en grams per metre quadrat. Cada tipus porta els valors que li són habituals, recollits a :ref{id="paper-stocks"}, i qualsevol es pot canviar per separat: un paper de llibre ossi de 70 grams en lloc de 80, un òfset sense estucar en un to més càlid.

El gruix surt de dos números. La **mà** d'un paper, en centímetres cúbics per gram, diu quant espai ocupa un gram de paper; el gramatge per la mà dona el gruix d'un full en micres. El bloc d'un llibre és el seu nombre de fulls per aquest gruix, i per això les mateixes tres-centes pàgines fan un volum prim en paper estucat i un de gruixut en paper de llibre d'alta mà. Folio compta el llibre sencer, així que un capítol mostrat sol continua entre les pàgines anteriors i posteriors, amb el seu gruix real.

La superfície té tres ajustos. L'**acabat** diu si el paper és sense estucar, amb la seva fibra i sense brillantor, o estucat i calandrat fins a un acabat mat, semimat o brillant, que reflecteix l'habitació. La **textura** és el relleu: llisa, el gra fi de la vitel·la, la trama regular del paper uniforme, les línies del verjurat, un gofrat de tela o les marques irregulars del feltre; la seva intensitat es pot abaixar o apujar. El **to** és el color del paper abans d'imprimir, blanc, natural o ossi, i la **transparència** deixa veure tènuement el que hi ha imprès al revers del paper fi, i com més pesa el paper, menys se'n veu.

## Enquadernacions i cobertes

Hi ha cinc enquadernacions. El **cartonatge** porta tapes de cartró una mica més grans que les pàgines. La **rústica fresada** té el llom fresat i encolat, i obre menys. La **rústica cosida** conserva els seus quaderns cosits sota una coberta tova i obre amb més facilitat. L'**enquadernació plana** obre del tot, sense que les pàgines s'enfonsin cap al llom. El **grapat a cavall** forma un fullet de plecs doblegats i grapats pel plec, com una revista o un programa de mà, i no té llom pla. Un llibre gruixut obre com obre un llibre gruixut, amb el llom dret entre els dos blocs de pàgines.

Les cobertes surten d'un de dos llocs. Per defecte, Folio dibuixa **una tapa al voltant de les pàgines**, de tela, cartolina o pell i del color de la coberta. Quan el document ja porta les seves cobertes, com aquesta guia, poden ser **les pàgines del document**: la primera pàgina passa a ser la coberta i l'última, si cau en pàgina parella, la contracoberta. Llavors el llibre reposa tancat sobre la coberta fins que el lector l'obre, la coberta gira com un cartró rígid i en passar l'últim full el llibre es torna a tancar.

El llom pot portar una imatge. Qualsevol imatge o SVG del tauler Recursos s'hi pot imprimir, vista com es veu el llom en un prestatge, amb el cap a dalt i la coberta a la dreta; s'escala fins a cobrir el llom, així que convé que deixi una mica d'aire a les vores. Un fullet grapat a cavall no té llom on imprimir.

## Làmines en un altre paper

Els llibres sovint canvien de paper durant unes poques pàgines: un quadern de làmines en color sobre estucat en una novel·la impresa en paper de llibre, una separata de cartolina, uns fulls de paper de color. A Postext això és un contenidor al text:

:::callout{type="note" title="Un quadern de làmines"}
\`:::paper{type=coatedGloss grammage=130}\` obre el tram i \`:::\` el tanca. Tot el que queda entre tots dos s'imprimeix en aquest paper.
:::

Un paper ocupa plecs sencers, així que el contingut del tram comença en una pàgina nova i el que el segueix també. Cada pàgina composta dins del tram porta el seu paper a la maquetació, i la vista Folio dibuixa aquests fulls amb el color, la superfície, el gruix i la rigidesa d'aquell paper; el canvas, l'HTML i el PDF els componen com qualsevol altra pàgina. Els atributs que s'ometen segueixen el paper del llibre, i un tram dins d'un altre només canvia el que fixa.

## La taula i la llum

El llibre reposa sobre una **superfície**: roure, noguera, lli, feltre, pell, marbre, un color llis o res, que deixa veure el fons de la pàgina. Cada superfície és una textura fotografiada, i un tint canvia el color de qualsevol d'elles. Cinc **llums** creen l'escena: estudi, llum de dia, làmpada de lectura, cel cobert i nit. Cadascuna és un parell: l'entorn que reflecteixen els papers estucats i brillants quan gira un full, i una llum principal que projecta les ombres del bloc i d'una pàgina aixecada sobre les pàgines de sota. L'**exposició** aclareix o enfosqueix l'escena, i les ombres es poden desactivar en un equip lent. La **inclinació** fixa quant s'aparta la vista de la vertical, fins a setanta graus, i el **gir** quant envolta el llibre; Desar com a vista per defecte desa tots dos tal com els veus.

Aquesta guia està muntada com un fullet grapat a cavall, en paper estucat brillant de 170 grams, sobre un tapet de feltre blau i amb llum d'estudi. Les seves cobertes són la seva pròpia primera i última pàgina, així que s'obre per la coberta i es tanca en passar l'últim full. Tot això és al grup **Folio** del tauler **Disseny**, i res d'aquest grup no canvia ni una sola línia de les pàgines.

## On funciona Folio

Folio dibuixa amb WebGL2, els gràfics tridimensionals del navegador, amb una textura per cada cara de cada pàgina pintada. Pintar només els plecs que envolten el que està obert redueix la memòria d'un llibre llarg a la d'unes poques pàgines, però un mòbil continua donant a una pestanya del navegador menys memòria de la que necessita un llibre, així que el Sandbox ofereix la pestanya Folio en ordinadors i tauletes i l'omet als mòbils i als navegadors sense WebGL2.

:::callout{type="note" title="En codi"}
El visor és un paquet propi, _postext-folio_, construït sobre three.js. \`createFolioFromDocument(container, doc)\` mostra un document maquetat com un llibre; \`setDocument\` mostra la maquetació següent a la mateixa pàgina, \`setAppearance\` canvia el paper, l'enquadernació o la llum, i \`resetView\` torna la vista al seu lloc. \`createFolio\` fa el mateix amb qualsevol conjunt d'imatges de pàgina.
:::

El mateix paquet passa les pàgines de les receptes del Receptari, i pot anar a qualsevol pàgina web que vulgui presentar un llibre com un llibre: el catàleg d'una editorial, una prova enviada a un autor, una previsualització abans que la comanda vagi a la impremta.
# Full de ruta i comunitat {lead="Postext és jove i obert. La cadena principal, el format del document i el sistema de configuració ja estan fets; el que vindrà després es decideix en públic." summary="On és el projecte i com participar-hi"}

Postext no aspira a ser una plataforma documental universal. Aspira a ser un motor de maquetació editorial molt bo per al web, i manté un abast estret perquè el nucli continuï esmolat. La seva ambició a llarg termini és esdevenir el motor de maquetació de referència per al contingut editorial al web: una eina que editorials, revistes, plataformes de llibres i equips de desenvolupament puguin adoptar i sobre la qual puguin construir.

## On és el projecte

La feina s'organitza en quatre fases, resumides a :ref{id="development-phases"}. No són fites estrictes: descriuen l'ordre en què les capacitats esdevenen prou estables per a producció.

Les dues primeres fases estan pràcticament acabades: el model de dades, l'analitzador i la capa de mesura, el format del document, el motor de columnes amb el seu equilibrat, els seus flotants i les seves taules, i la maquinària de llibre de capítols, parts, índex i capçaleres. La tercera fase n'ha lliurat el nucli —tall òptim de línies amb penalitzacions editorials, partició de mots en vuit llengües, matemàtiques, notes a peu de pàgina i notes de final de capítol, cites bibliogràfiques, un índex analític, el xinès i el japonès en horitzontal i en vertical, i l'àrab de dreta a esquerra amb justificació per kashida— i té pendents les notes al marge. La quarta, la sortida, ha publicat el canvas, l'HTML, un PDF etiquetat i llibres EPUB 3, juntament amb el worker, el Sandbox i els seus presets, i la vista Folio, que mostra una maquetació com un llibre imprès.

El que falta importa tant com el que ja està fet. Les **notes al marge** tenen un lloc en el model de dades, però encara no es maqueten. El codi en línia no té estil propi, el text encara no envolta obstacles, el coreà es compon amb les regles del xinès i no amb les seves, i la maquetació només té lloc al navegador. Són els problemes següents que val la pena resoldre, i aquells en què l'ajuda compta més.

## Com participar-hi

El projecte viu a GitHub, i totes les converses tenen lloc a la vista: **issues** per a errors, peticions i tasques concretes; **pull requests** per al codi, revisat en públic; **discussions** per a idees, qüestions de disseny i tot allò que encara no és prou concret per ser una issue. Les issues amb l'etiqueta _good first issue_ són la porta d'entrada més senzilla.

El camí habitual de la idea al codi és curt: una issue descriu el problema, una discussion fixa l'enfocament quan n'hi ha més d'un, una pull request l'implementa, i el canvi es fusiona a la branca de desenvolupament i es publica des d'allà. Obrir una issue abans d'una pull request gran estalvia temps a tothom, perquè l'enfocament es pot acordar abans d'escriure el codi.

## On compta l'ajuda

Totes les parts del projecte donen la benvinguda a qui hi vulgui contribuir. El **motor** té problemes profunds —tall de línies, equilibrat, numeració, col·locació de flotants— i d'altres de més accessibles en les proves i les mesures de rendiment. El **backend de PDF** té la incrustació de fonts, la gestió del color i l'accessibilitat. El **Sandbox** té els seus taulers, els seus editors i les seves traduccions, organitzats perquè cada text de la interfície s'afegeixi de la mateixa manera en tots els idiomes. **El disseny i la tipografia** necessiten persones que coneguin les tradicions editorials, sobretot les d'escriptures que el motor encara no atén bé. I la **documentació** i les seves traduccions, avui en anglès, castellà, català, xinès simplificat, japonès i àrab, estan obertes a qualsevol que sàpiga explicar alguna cosa amb claredat.

El millor primer pas és petit: llegeix la guia de contribució del repositori, presenta't a les discussions, tria una issue amb l'etiqueta _good first issue_ o tradueix una pàgina de la documentació.

La majoria de les contribucions no exigeixen escriure codi:

- **Informar de problemes** amb un exemple mínim del document i de la configuració
- **Compartir les teves maquetacions** i convertir-les en presets des dels quals altres puguin començar
- **Millorar la documentació** amb tutorials, exemples i explicacions
- **Traduir** la interfície i la documentació a nous idiomes
- **Aportar coneixement tipogràfic**, sobretot d'escriptures i tradicions encara poc ateses
- **Contribuir amb codi** al motor, als renderitzadors o al Sandbox

## El que quedarà fora

Hi ha coses en què Postext no es convertirà expressament, i dir-ho forma part de mantenir honest el projecte. No serà un processador de textos: no hi ha cap pla per editar la pàgina directament, perquè la pàgina és el resultat de les regles, no la seva entrada. No gestionarà els punts de ruptura adaptatius de qui l'allotja, perquè aquesta decisió correspon a l'aplicació. No carregarà les fonts pel seu compte, perquè la càrrega de fonts és cosa de la pàgina que l'incrusta. I no creixerà fins a convertir-se en una plataforma documental general, amb emmagatzematge, col·laboració i fluxos de publicació, quan altres eines fan bé aquestes coses i Postext s'hi pot incrustar.

Altres coses, senzillament, encara no estan fetes. Maquetar en un servidor, sense navegador, és un abast posterior: avui el motor mesura amb les mètriques d'un navegador real, i una versió de servidor necessitaria les mateixes mètriques per produir les mateixes pàgines. La col·laboració en temps real, compartir una sessió viva mitjançant un enllaç, és a la llista d'idees del Sandbox. Totes dues es discutiran en públic abans d'escriure una sola línia de codi.

## Llicència

Postext es publica amb la **llicència MIT**: el motor, el renderitzador de PDF, el generador d'EPUB, el visor Folio i el Sandbox es poden usar, modificar i incrustar tant en projectes oberts com tancats, amb finalitats comercials o no, sempre que l'avís de llicència acompanyi el codi. Els tipus de lletra d'aquest llibre són fonts obertes servides per Google Fonts, els diagrames formen part del codi del Sandbox i el text d'aquesta guia pertany al projecte i a qui hi contribueix.

## Valors

Tres valors guien el projecte, i hi són per fer-los servir, no per emmarcar-los: quan dues bones idees estiren en direccions diferents, són la manera de decidir.

_El disseny meditat abans que la pressa._ La tipografia acumula segles de saviesa, i el motor l'hauria d'honrar en lloc de reinventar-la malament. Una funcionalitat arriba quan fa el correcte en una pàgina real, no quan simplement funciona en una demostració; una regla presa de la impremta s'estudia en els llibres que la fan servir abans de convertir-se en una opció. Algunes funcionalitats triguen més així. Les que es publiquen no cal retirar-les després.

_La claredat abans que l'enginy._ El codi, la configuració i la documentació han de ser fàcils de llegir, canviar i explicar. Una opció que necessita un paràgraf d'advertiments indica que el disseny encara no està acabat; una funció que només entén qui la va escriure no sobreviurà a les seves vacances. La configuració fa servir unitats reals i noms planers, el format del document continua sent llegible en qualsevol editor, i cada decisió del motor es pot rastrejar fins a una regla que algú pot assenyalar.

_La col·laboració abans que el territori._ Les decisions es prenen en públic, en issues i discussions que qualsevol pot llegir i a les quals qualsevol es pot sumar, i cap part del codi pertany a una sola persona. Es reconeix cada contribució —codi, documentació, traduccions, informes d'errors, consell tipogràfic i els llibres d'exemple que mostren el que el motor pot fer—, perquè un motor de maquetació per a tothom només el poden construir moltes persones.

Si alguna cosa d'això et ressona, el repositori és el pas següent. Obre una issue, fes una pregunta a les discussions o canvia alguna cosa d'aquest llibre i mira què en fa el motor.

:::paragraphs{style="signature"}
postext.dev · github.com/drnachio/postext
:::

# Contracoberta {style="back" toc="false" book="Postext" blurb="Postext compon Markdown com a llibres, revistes i manuals, al navegador: cada paràgraf tallat sencer, columnes que acaben alhora, figures que arriben després de les paraules que les criden, un PDF a punt per a impremta i un EPUB per als lectors de llibres electrònics. Cada pàgina d'aquesta guia l'ha composta el mateix Postext." licence="Codi obert · Llicència MIT"}
`;
