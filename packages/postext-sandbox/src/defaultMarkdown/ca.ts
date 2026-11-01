export const DEFAULT_MARKDOWN_CA = `---
title: "Postext"
subtitle: "Un tipògraf programable per al web"
author: "Ignacio Ferro"
publishDate: "2026-10-04"
---

# Postext {style="cover" toc="false" kicker="Motor de maquetació de codi obert · La guia" publisher="postext.dev · Llicència MIT · Cada pàgina d'aquest llibre l'ha composta Postext al teu navegador"}

# Índex {style="contents" toc="false"}

:::toc

:::callout{type="colophon"}
**Guia de Postext** és el llibre de mostra que acompanya el Sandbox. És alhora un recorregut pel motor i una demostració del que fa: la coberta, l'índex que es numera sol, les portadelles de part, les obertures de capítol, les capçaleres, cada figura i cada taula que flota fins al seu lloc… tot ho maqueta Postext, al teu navegador, a partir del Markdown que pots obrir a l'editor.

Compost en Fraunces, Lora, Bricolage Grotesque, Geist i Geist Mono, servides per Google Fonts. Els diagrames són fitxers SVG senzills, que es dibuixen com a vectors al canvas, a la vista HTML i al PDF. Canvia el que vulguis —una paraula, un marge, un color de la paleta— i el llibre es torna a compondre.

Postext és de codi obert, amb llicència MIT. Text © 2026 Ignacio Ferro i les persones que contribueixen a Postext.
:::

:::part{number="I" title="Fonaments" palette="band=#2b4acb"}
1. Per què Postext
2. Com funciona el motor
:::

# Per què Postext {lead="La tipografia impresa va passar cinc segles aprenent a compondre una pàgina; els navegadors van aprendre a disposar una interfície. Postext porta el primer al segon: un motor que converteix Markdown en pàgines compostes amb criteri editorial." summary="La distància entre el web i la pàgina, i què la salva"}

Postext és un **motor de maquetació de codi obert** que porta al web l'ofici de la tipografia impresa professional. Rep **contingut semàntic** escrit en Markdown enriquit i un objecte de configuració, i calcula una maquetació completament resolta:index{term="configuració"} en què cada línia, cada títol, cada figura i cada taula té una posició precisa, mesurada en unitats tipogràfiques reals. Després la dibuixen tres renderitzadors —una previsualització viva en canvas, HTML posicionat i un PDF a punt per a impremta— que llegeixen la mateixa geometria, de manera que el que veus a la pantalla és exactament el que va a impremta, i les mateixes pàgines s'escriuen com a llibre electrònic EPUB 3.

Aquest llibre és la seva pròpia demostració. La coberta, l'índex que es numera sol, les portadelles en quatre colors, la banda que obre cada capítol, les capçaleres d'aquestes pàgines i cada figura que flota fins al seu lloc les ha maquetat Postext, al teu navegador, fa un moment. Res no s'ha col·locat a mà: el Markdown només diu què és cada cosa, i la configuració decideix com es veu. Amb una altra configuració, el mateix text sortiria com una novel·la de butxaca o com una revista.

:::callout{type="try"}
Obre el tauler **Text** i tria aquest capítol al selector de capítols de la seva capçalera. Canvia una paraula d'aquest paràgraf o esborra una frase: la pàgina es torna a compondre, les columnes es reequilibren i els folis dels capítols següents s'actualitzen.
:::

Si t'estimes més veure-ho abans de llegir-ho, :ref{id="postext-showreel"} ho recorre en dos minuts, i a la vista Folio es reprodueix sobre la mateixa pàgina. Segueix un capítol des del Markdown de l'editor fins al PDF que en surt al final.

## Com llegir aquest llibre

El llibre s'organitza en quatre parts. **Fonaments**, la part en què ets, explica el problema que resol Postext i com està construït el motor: què hi entra, què en surt i què passa entremig. **L'ofici** tracta de tipografia: com es compon una línia, com s'emmarca una pàgina, on van les figures, les taules i els requadres, com un conjunt de capítols es converteix en un llibre i com un mateix llibre viu en diverses llengües. **Més enllà del text corrent** compon pàgines que no són un flux de columnes: pàgines compostes, còmics, música i exercicis. **La pràctica** s'ocupa de les eines: el format del document, el Sandbox, les sortides i la impremta, la línia d'ordres i els agents, i el projecte que els envolta.

Cada capítol s'obre amb una breu introducció sobre la seva banda, i la majoria tanquen les seves seccions amb un requadre titulat _Prova-ho al Sandbox_: un petit experiment que pots fer sobre aquest mateix llibre, ara mateix, per veure la funció en acció. Cap de les seves propostes no pot espatllar res —**Restaurar l'original…**, al menú de la fila de la guia del tauler **Llibres**, la torna al seu estat original—, així que canvia el que vulguis. Els capítols es poden llegir en qualsevol ordre; quan un depèn d'un altre, ho diu.

## Maquetació d'aplicacions i maquetació editorial

El CSS modern és una eina extraordinària per construir interfícies. Flexbox, Grid, les consultes de contenidor i el posicionament per àncores donen un control fi sobre com es disposen els components en una finestra. Però CSS es va dissenyar per a la _maquetació d'aplicacions_, i la lectura extensa necessita _maquetació editorial_. Són problemes diferents:

- **La maquetació d'aplicacions** disposa components interactius —botons, formularis, targetes, navegació— dins d'una finestra que el lector recorre lliurement
- **La maquetació editorial** fa fluir text, figures, taules i requadres per una seqüència de pàgines i columnes fixes, segons regles depurades durant segles d'impremta

El contrast de :ref{id="feature-comparison"} resumeix on divergeixen tots dos enfocaments en els documents llargs.

La diferència no és de grau, sinó de naturalesa. Una interfície s'adapta a la finestra que la conté i el lector la recorre al seu ritme; una pàgina, en canvi, té una mida fixa, un principi i un final, i tot el que conté s'ha de resoldre dins d'aquests límits: què cap en aquesta columna i què passa a la següent, on va cada figura, com acaba cada línia i cada paràgraf. Aquestes decisions són les que defineixen la qualitat d'un llibre, i cap d'elles no es pot prendre mirant un sol element aïllat, per molta cura que s'hi posi.

CSS resol el primer cas de manera brillant. Per al segon, la plataforma no ha ofert mai les primitives que importen:

1. **Columnes equilibrades que coneixen el seu contingut.** La propietat _columns_ de CSS fa fluir el text, però no pot igualar columnes ajustant l'espai sobre els títols o la folgança d'un paràgraf; no coneix figures ni taules que hagin de flotar al capdamunt de la columna lliure següent, i no pot mantenir un títol amb el paràgraf que introdueix a través d'un salt de columna.
2. **Defectes de final de paràgraf i de columna.** Les _òrfenes_ i les _vídues_ existeixen en CSS, però el seu suport és desigual i no veuen la geometria de la pàgina sencera; i no hi ha cap regla per a la _línia curta_, la paraula que es queda sola a l'última línia d'un paràgraf.
3. **Tall de línies per paràgraf complet.** Els navegadors tallen les línies de manera voraç, una a una, i només poden repartir l'espai sobrant dins de cada línia, mentre que una justificació equilibrada necessita sospesar el paràgraf sencer alhora.
4. **Un ritme vertical compartit.** Llibres i revistes assenten cada línia en una retícula de línia de base comuna a totes les columnes de la pàgina, i CSS no té cap primitiva que ajusti les línies a una retícula entre columnes i pàgines.
5. **L'aparell d'un llibre.** Capçaleres que coneixen el capítol, folis en seqüències romanes o aràbigues, salts de capítol que respecten la paritat i un índex amb números de pàgina reals: res d'això no existeix en un document que es desplaça sense fi per la pantalla. Tampoc no hi ha notes que baixin al peu de la pàgina on es citen, ni figures que surin fins al primer espai lliure després de la seva menció.

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

Les regles que segueix Postext no es van inventar per a ell. Una línia còmoda té entre 45 i 75 caràcters, i per això els textos llargs es componen en columnes i no en línies tan amples com la pàgina. El text va justificat o en bandera, però en tots dos casos la seva textura ha de ser uniforme, sense els buits que es converteixen en rius quan s'apilen massa línies fluixes. Totes les línies d'una pàgina s'assenten en una retícula de línia de base comuna, de manera que es miren a través de l'espai entre columnes i es transparenten en registre a través del paper. Els títols continuen amb el text que anuncien, un paràgraf no deixa sola la seva primera ni la seva última línia a la vora d'una columna, i una figura apareix després de la frase que l'esmenta, mai abans. Els capítols de la segona part d'aquest llibre mostren com aplica Postext cadascuna d'aquestes regles.

Durant segles, aquestes regles es van aplicar a mà, per caixistes que llegien cada pàgina abans que entrés a màquina. L'autoedició en va convertir moltes en programari, però aquest programari va continuar sent un món a part, amb els seus propis fitxers i les seves pròpies eines. El que no va existir mai va ser un motor que les apliqués automàticament, a partir de text estructurat, dins de l'entorn on avui es llegeix la major part del que es llegeix. D'aquest buit tracta aquest llibre.

## Per a qui és Postext

Postext resulta útil allà on un text llarg i estructurat ha de semblar dissenyat i no simplement mostrat:

- **Editorials i equips editorials** que volen que el mateix original produeixi un PDF a punt per a impremta, una edició fidel en pantalla i un llibre electrònic, sense haver de mantenir diverses maquetacions sincronitzades
- **Plataformes de documentació i d'ensenyament** els llibres de text, manuals i cursos de les quals necessiten figures, taules, referències numerades i matemàtiques ben compostes a cada pàgina
- **Desenvolupadors** que construeixen experiències de lectura —informes, revistes, catàlegs, documents generats— i volen qualitat editorial d'una biblioteca en lloc d'una aplicació d'escriptori
- **Dissenyadors i tipògrafs** que volen descriure un disseny una sola vegada, com a regles, i veure'l aplicat amb coherència al llarg de centenars de pàgines

## El que Postext no és

Postext no substitueix CSS a les interfícies: és un motor especialitzat en contingut extens i estructurat. No és un editor WYSIWYG: tu escrius Markdown i descrius el disseny, i el motor compon les pàgines. No carrega les fonts per tu: el motor mesura amb les fonts que el navegador ja té, així que una pàgina ha de carregar els seus tipus abans de maquetar. I, de moment, el motor de maquetació només funciona al navegador, perquè les seves mesures provenen de les mètriques de font del canvas d'un navegador real; el renderitzador de PDF i el generador d'EPUB, en canvi, també funcionen a Node.

# Com funciona el motor {#engine lead="Hi entren Markdown i un objecte de configuració; en surt un arbre en què cada línia té una posició en unitats reals. Entremig, una canonada breu que mesura el text sense tocar el DOM i itera fins que la pàgina s'assenta." summary="Analitzar, mesurar, maquetar, convergir"}

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

Postext mesura amb _pretext_:index{term="pretext"}, una biblioteca de mesura de text sense DOM que fa servir les mètriques de font del canvas i pura aritmètica. El seu pas car, preparar un text per a una font donada, es desa a la memòria cau; compondre'l a una amplada concreta és gairebé gratuït. El mètode és entre 300 i 600 vegades més ràpid que mesurar mitjançant refluxos, com il·lustra :ref{id="measurement-speed"}, i a sobre el mòdul de mesura del motor hi afegeix trams enriquits de negreta, cursiva i matemàtiques, partició de mots, justificació i tall òptim de línies. Cada resultat es desa amb una clau que inclou el text, les fonts, l'amplada i totes les opcions que poden canviar una línia, de manera que escriure en un paràgraf torna a mesurar aquell paràgraf i cap altre.

La càrrega de les fonts és l'única part de la mesura que el motor deixa en mans de qui l'allotja. Mesurar amb una font que encara no ha arribat mesuraria en realitat la font de substitució, i totes les línies es mourien quan aparegués la definitiva. Per això la biblioteca espera que les fonts estiguin carregades abans de la primera compilació, i ofereix una manera de buidar les seves memòries cau de mesura quan una font arriba tard, perquè la compilació següent torni a mesurar amb les mètriques correctes. El Sandbox ho fa automàticament: carrega totes les famílies que anomena la configuració, des de Google Fonts o des del tauler Fonts, abans de maquetar una pàgina.

## Un tallador de línies en WebAssembly

La part del motor que fa més aritmètica és el tallador de línies, que sospesa totes les maneres de tallar un paràgraf. Està escrit en Rust i compilat a WebAssembly:index{term="WebAssembly"}, un mòdul d'uns trenta kilobytes dins del paquet, i tria exactament els mateixos talls que triaria la versió en TypeScript, de manera que un llibre surt igual amb l'una o amb l'altra. Així el tallador va de dues a tres vegades més de pressa, i un llibre sencer es maqueta un quinze per cent més ràpid. Allà on WebAssembly està bloquejat, respon el tallador en TypeScript, i a la pàgina no canvia res.

## Set passades i un bucle

La maquetació pròpiament dita es fa en set passades:

1. **Estructuració del contingut**: analitza el Markdown en una llista plana de blocs i resol els recursos pel seu identificador
2. **Mesura del text**: compon cada paràgraf en línies a l'amplada que ocuparà
3. **Col·locació en pàgines i columnes**: omple pàgines i columnes i reserva espai per a les capçaleres i els requadres de pàgina completa
4. **Col·locació de recursos**: fa flotar cada figura i taula citada fins al primer buit lliure després de la seva referència
5. **Refinament tipogràfic**: aplica les regles que mantenen els títols amb el seu text i les llistes amb la seva introducció
6. **Equilibrat de columnes**: iguala les columnes de cada pàgina
7. **Ritme vertical**: torna el text a la retícula de línia de base després de tot el que la trenca

Aquestes passades depenen les unes de les altres en cercle. Mantenir un títol amb el seu paràgraf pot empènyer tots dos a la columna següent; aquest moviment pot deixar una vídua; corregir la vídua torna una línia, cosa que pot tornar a separar el títol. Postext desfà el cercle amb el **bucle de convergència**:index{term="bucle de convergència"} de :ref{id="convergence-loop"}: les passades tres a set es repeteixen, marcant només el que ha canviat, fins que res no es mou. El bucle té un límit de cinc iteracions i els documents habituals s'assenten en una o dues. Una puntuació d'infraccions tipogràfiques acompanya cada iteració, així que, si mai s'arriba al límit, el motor es queda amb la millor maquetació que ha trobat, no amb l'última.

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

:index{term="VDT (arbre virtual del document)"}El que sobreviu al bucle és el **VDT**, l'arbre virtual del document: pàgines que contenen columnes, columnes que contenen blocs, blocs que contenen línies, cadascun amb la seva caixa en unitats reals, al costat d'una llista plana de tots els blocs per accedir-hi ràpidament. L'arbre és geometria pura —no sap res de canvas, HTML, PDF ni EPUB— i això és justament el que permet que tots els renderitzadors dibuixin sortides que coincideixen. Cada línia recorda a més el tram de Markdown d'on prové, i així un clic a la pàgina porta el cursor de l'editor a la paraula correcta.

Les pàgines registren també per a què serveixen. Una pàgina pot ser de cos, una obertura de capítol, una portadella de part o una pàgina en blanc inserida per assolir la paritat correcta, i aquest paper és el que permet a les capçaleres, els folis i els ornaments decidir on apareixen. Les etiquetes de pàgina —el foli imprès dins de la seva seqüència— es calculen una sola vegada, a l'arbre, de manera que el canvas, l'HTML i el PDF hi coincideixen sense fer cadascun el seu propi compte. Un prefaci numerat en romans i un cos que torna a començar per u no necessiten cap cas especial en cap renderitzador: cadascun imprimeix l'etiqueta que li dona l'arbre, sense tornar a comptar.

## Fora del fil principal

Una maquetació pot trigar més que una pulsació de tecla, així que el motor es pot executar en un Web Worker:index{term="Web Worker"}. El worker conserva la seva pròpia memòria cau de mesura entre compilacions i es cancel·la de manera cooperativa: quan es demana una compilació nova, l'anterior s'atura al seu punt de control següent i guanya l'última petició. El Sandbox maqueta així totes les seves vistes, i el renderitzador de PDF i el generador d'EPUB tenen cadascun un worker propi, de manera que la interfície continua responent mentre es compon un llibre sencer o se'n genera el fitxer.

:::callout{type="note" title="En codi"}
\`buildDocument(content, config)\` retorna el VDT. \`renderPage\` dibuixa una pàgina en un canvas, \`renderToHtml\` retorna HTML posicionat i \`renderToPdf\`, del paquet _postext-pdf_, retorna els bytes d'un PDF, d'un document o d'un llibre sencer passat com una llista de capítols. \`renderToEpub\`, de _postext-epub_, escriu els mateixos capítols com un fitxer EPUB 3. \`createLayoutWorker\`, de _postext/worker_, executa la compilació fora del fil principal.
:::

:::part{number="II" title="L'ofici" palette="band=#8f6408"}
3. Compondre la línia
4. La pàgina i les seves columnes
5. Figures, taules i flotants
6. Requadres, notes i marques
7. Llibres, parts i capçaleres
8. Un llibre, moltes llengües
:::
# Compondre la línia {lead="Un paràgraf es compon sencer, no línia a línia. Postext sospesa totes les maneres possibles de tallar-lo, posa preu a l'espaiat, als guionets i a les paraules soltes, i tria el conjunt de talls que costa menys." summary="Tall òptim de línies, partició de mots, espaiat i els defectes que evita"}

La qualitat d'una pàgina es decideix primer en els paràgrafs. Un navegador talla les línies de manera voraç: omple una línia amb totes les paraules que hi caben, passa a la següent i només pot repartir l'espai sobrant dins de cada línia. Postext implementa l'**algorisme de Knuth-Plass**, el tallador de línies òptim que fa servir TeX des del 1981. Avalua totes les maneres viables de tallar el paràgraf sencer i tria la que minimitza el cost total, de manera que l'espaiat es manté uniforme de la primera línia a l'última.

## Caixes, gomes i penalitzacions

:index{term="algorisme de Knuth-Plass"}L'algorisme veu un paràgraf com una seqüència de tres primitives, dibuixades a tota l'amplada a :ref{id="knuth-plass-model"}:

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

:index{term="partició de mots"}La partició de mots fa servir els mateixos **patrons de Liang** en què TeX confia des del 1983, servits per la biblioteca _Hypher_, en vuit llengües: anglès, castellà, francès, alemany, italià, portuguès, català i neerlandès. La llengua del document es fixa una vegada, a la capçalera de la configuració, i també etiqueta el PDF per als lectors de pantalla. Els patrons deixen almenys dues lletres abans del guionet i tres després, de manera que les paraules de menys de cinc lletres no es divideixen mai, i cada guionet és una penalització marcada de 50 que l'optimitzador pot acceptar o rebutjar.

La partició només actua en el text justificat, on es guanya el sou. Hi ha dues oportunitats de tall sempre disponibles, sigui quin sigui l'ajust: un guionet entre dues lletres és un tall legítim, i una paraula més ampla que tota la mesura es divideix per l'última síl·laba que hi cap o, si no hi ha més remei, per l'últim caràcter.

Els guionets opcionals escrits en el text es respecten com a punts de tall, al mateix preu que els del patró. El català segueix les normes de l'Institut d'Estudis Catalans: una paraula amb _l·l_ geminada, com _col·lecció_, es divideix entre les dues _l_, i el guionet ocupa el lloc del punt volat, _col-_ a final d'una línia i _lecció_ a principi de la següent. La llengua també pot canviar dins d'un llibre: tots els capítols comparteixen la llengua de la configuració, de manera que una edició en diverses llengües, com aquesta, es configura una vegada per llengua, i cada versió de la guia divideix les paraules segons les seves pròpies regles.

## Espaiat i línies en bandera

Dos ajustos limiten quant pot estirar-se o encongir-se un espai: \`maxWordSpacing\`, per defecte el doble de l'espai natural, i \`minWordSpacing\`, 0,6 vegades. Estirar més enllà del màxim es paga per sobre de qualsevol altre defecte, de manera que el tallador prefereix posar un guionet, moure una paraula o acceptar una línia curta abans que obrir un riu. Hi ha línies que no es poden omplir —un URL llarg, la cua indivisible d'un element de llista— i, en lloc d'obrir-les amb buits de tres vegades l'espai natural, el motor les compon en bandera amb l'espaiat natural. L'última línia d'un paràgraf va sempre en bandera, tret de quan desborda: llavors els seus espais es comprimeixen perquè hi càpiga, igual que fa TeX amb les gomes.

## Xinès i escriptures de l'Àsia oriental

:index{term="composició xinesa"}El xinès s'escriu sense espais entre paraules i no es parteix mai amb guionet: una línia pot acabar entre gairebé qualsevol parell de caràcters. Un paràgraf amb més caràcters xinesos, japonesos o coreans que espais entre paraules no passa per Knuth-Plass; el compon, línia a línia, el **compositor CJK**. El que aquest ha de respectar són les regles d'inici i final de línia: una coma, un punt o un signe de tancament no obren mai una línia, i un signe d'obertura no la tanca mai. El rigor depèn de la regió, que dona la llengua del document —\`zh-Hans\` segueix la norma de la Xina continental, GB/T 15834, i \`zh-Hant\` la pràctica de Taiwan i Hong Kong—, i \`cjk.lineBreak\` fixa el nivell a mà. Hi ha trams que no es parteixen mai: un guió llarg o uns punts suspensius de dos quadratins, un nombre amb la seva unitat. Una paraula llatina o una adreça web entre els caràcters passa sencera a la línia següent, tret que sigui més ampla que la línia; llavors la paraula es divideix i l'adreça es talla després d'una barra o davant d'un punt.

Cada signe de puntuació xinès ocupa un quadrat propi, meitat traç i meitat blanc, i quant d'aquest blanc conserva un llibre és qüestió d'estil de la casa, com mostra :ref{id="cjk-composition"}. A Taiwan cada signe ocupa un quadratí sencer. Hong Kong també compon els signes a quadratí sencer, però gairebé sempre ajunta dos signes seguits, i al parèntesi que obre o tanca una línia li treu la meitat exterior. L'estil Kaiming de la Xina continental, el predeterminat per a \`zh-Hans\`, compon les comes, els parèntesis, les cometes i els signes de títol en mig quadratí i deixa sencer el punt excepte a final de línia; on s'ajunten dos signes, desapareix també el blanc que hi ha entre ells. \`cjk.punctuationWidth\` tria l'estil; \`cjk.compressAdjacent\` i \`cjk.trimLineStart\` activen els dos ajustos, i amb \`cjk.hangingPunctuation\` una coma o un punt poden penjar més enllà del final de la línia. Els ajustos \`cjk\`, juntament amb la llengua del document i la direcció de l'escriptura, són al grup **Escriptura** del tauler **Disseny**.

Una línia xinesa justificada s'omple en un ordre fix: primer els espais entre paraules occidentals, després el quart de quadratí que el motor posa entre el text xinès i el llatí (\`cjk.latinSpacing\`; no es tecleja mai) i, finalment, cada buit entre dos caràcters, mai dins d'una paraula llatina ni d'un nombre. Quan un caràcter no pot obrir la línia següent, el compositor intenta primer ficar-lo a la línia traient blanc als signes que ja té, i només si no ho aconsegueix baixa amb ell a la línia següent el caràcter anterior. Una línia que necessitaria més de mig quadratí entre els caràcters es deixa curta, i el tauler **Revisió** l'assenyala com a línia CJK curta.

La resta d'un llibre xinès segueix els mateixos ajustos. Les plantilles de capítol, els folis, les llistes i els comptadors admeten els estils de numerals xinesos, entre els quals \`cjk-decimal\`, \`simp-chinese-informal\` i \`trad-chinese-informal\`, de manera que els capítols poden portar els seus ordinals xinesos; les figures i les taules prenen el nom en xinès i es numeren per capítol amb un guionet. \`cjk.grid\` fixa la caixa de text com un nombre de caràcters per línia i de línies per pàgina, la retícula sobre la qual es dissenyen els llibres xinesos. L'edició xinesa d'aquesta guia es compon en vertical i s'enquaderna per la dreta, com es van imprimir els llibres xinesos durant segles: anomena els capítols amb els ordinals xinesos, imprimeix els folis en numerals xinesos i numera les figures i les taules per capítol; la seva fila al tauler **Llibres** té un botó de llengua propi. Entre els llibres d'exemple, _Somni del pavelló vermell_ és una novel·la sencera composta en xinès, i la seva edició en caràcters tradicionals va en vertical sobre una retícula de 38 caràcters per 15 línies.

\`layout.writingMode: 'vertical-rl'\` compon un llibre en vertical. Les línies van de dalt a baix i se succeeixen de dreta a esquerra, dues columnes es converteixen en dos pisos apilats a la pàgina, les figures i les taules es mantenen dretes, les paraules llatines i els nombres llargs es tomben de costat, i cada signe pren el lloc o la forma que té en el text vertical: els parèntesis i les cometes adopten la forma vertical, i el punt passa a l'angle superior dret de la seva casella a la Xina continental i es queda centrat a Taiwan i Hong Kong. Un llibre així s'enquaderna per la dreta (\`page.binding\`): la primera pàgina queda sola a l'esquerra del llom, i el Sandbox mostra els plecs de dreta a esquerra. El canvas i el PDF componen les mateixes línies verticals; la vista HTML talla les seves pròpies línies a l'alçada de la seva pàgina, i posa dret o tomba cada caràcter igual que ells. Per defecte, un nombre de fins a dues xifres es posa dret en una sola casella, i \`cjk.uprightDigits\` pot pujar aquest límit a tres o quatre (\`:tcy[…]\` fa el mateix amb qualsevol tram curt).

Els llibres xinesos marquen a més el text de maneres que la tipografia llatina no coneix. L'èmfasi s'assenyala amb un punt al costat de cada caràcter i no amb cursiva, de manera que en un document xinès \`*…*\` posa punts d'èmfasi als caràcters xinesos que abasta, com \`:dots[…]\`; \`cjk.emphasis: 'italic'\` conserva la cursiva. \`:name[…]\` traça la línia recta dels noms propis, i \`:book[…]\` assenyala el títol d'una obra, i \`cjk.bookTitleMark\` tria com: amb els signes angulars dobles de la Xina continental o amb la línia ondulada de Taiwan i Hong Kong. \`:ruby[…]{rt="…"}\` compon una lectura, en pinyin sobre els caràcters o en zhuyin a la dreta de cadascun, i \`:warichu[…]\` compon una nota en dues files de mig cos dins de la línia, que continua a la línia o la pàgina següent quan no hi cap. Cap no canvia l'interlineat: el tauler **Revisió** avisa quan els punts, les línies o les lectures necessiten entre línies més espai del que deixa el paràgraf. En text vertical, els punts passen a la dreta de la columna, les línies a l'esquerra, i d'una nota es llegeix primer la fila de la dreta.

## L'àrab i el text de dreta a esquerra

:index{term="composició àrab"}L'àrab, el persa, l'urdú i l'hebreu s'escriuen de dreta a esquerra, i Postext els compon a partir del mateix Markdown i la mateixa configuració que qualsevol altra llengua. Ho decideix la llengua del document: amb \`locale: 'ar'\` les línies comencen a la dreta, la primera columna és la de la dreta, el llibre s'enquaderna per la vora dreta i els plecs es llegeixen de dreta a esquerra. El motor maqueta aquesta pàgina com una pàgina d'esquerra a dreta i després la gira sencera com en un mirall, pintant del dret cada paraula, cada imatge i cada fórmula, de manera que un disseny fet per a un llibre en anglès funciona sense canvis: un ajust que anomena un costat vol dir un costat del text, i \`start\` i \`end\` s'accepten com a noms explícits d'aquests costats. Les capçaleres i els folis es queden al lloc del full on els espera qui dissenya.

Dins d'una línia, els nombres, les paraules llatines i les cites continuen llegint-se d'esquerra a dreta. L'ordre d'aquests trams el fixa l'algorisme bidireccional d'Unicode, implementat sencer; el text es desa, es cerca i es copia en l'ordre en què es va escriure, i només se'n reordena el dibuix. Els parèntesis i les cometes baixes s'emmirallen en els trams de dreta a esquerra. Un bloc compost en el sentit contrari al del llibre porta \`{dir=ltr}\` o \`{dir=rtl}\`, i un tram de text \`:ltr[…]\` o \`:rtl[…]\`, un tram aïllat amb el qual el punt final ja no salta a l'altre extrem de la línia.

Les lletres àrabs s'enllacen, i cadascuna pren la forma que li demanen les veïnes, de manera que una paraula es mesura i es pinta com una sola cadena conformada, mai lletra a lletra; el PDF la conforma amb HarfBuzz i associa cada glif als seus caràcters, perquè el text copiat i els lectors de pantalla rebin les paraules que es van escriure. D'aquí surten tres regles: no hi ha partició de mots, ni espaiat entre lletres, ni tall dins d'una paraula, que desborda la línia i queda assenyalada en lloc de dividir-se. Les línies justificades s'estiren primer pels espais i després amb la **kashida**, l'allargament que un cal·lígraf traça entre dues lletres unides, posada només on ho permeten les regles del naskh i exclosa del text copiat. El tallador de línies compta aquest allargament com a estirament, i així tria els talls sabent on es pot eixamplar una línia. L'èmfasi es compon en negreta, perquè la lletra àrab no té cursiva, i el motor no inclina mai una lletra àrab.

Els signes vocàlics s'apilen damunt i davall de les lletres, dins de l'interlineat, que no creix mai pel seu compte: el tauler **Revisió** assenyala un paràgraf els signes del qual tocarien la línia de sobre, amb l'interlineat que necessitaria. Els números generats —folis i números de capítol, de figura i de nota— prenen les xifres de la regió, les aràbigues orientals a l'est del món àrab i les occidentals al Magrib, mentre que els números que escriu l'autor no es reescriuen mai; un títol pot escriure el seu número com un ordinal en lletres, i els preliminars poden comptar en l'ordre abjad dels manuscrits. Els poemes clàssics s'escriuen en \`:::verse\`, un vers per línia amb els dos hemistiquis separats per \`||\`: cada hemistiqui es porta a una mateixa amplada, primer amb kashides, perquè les rimes quedin alineades al llarg del poema. L'edició àrab d'aquesta guia es compon així, enquadernada per la dreta, i entre els llibres d'exemple _Les mil i una nits_ compon l'obra sencera en àrab, a la manera de la impremta de Bulaq.

## Èmfasi i trams

Un paràgraf poques vegades és un únic tram de text. La negreta, la cursiva i la negreta cursiva es componen amb els talls reals de la família —una cursiva veritable, no una rodona inclinada—, cadascun mesurat amb les seves pròpies mètriques, de manera que una paraula en negreta ocupa exactament el lloc que necessita. El color del text en negreta, del text en cursiva i de les referències es pot fixar per separat; en aquest llibre, les referències a figures i taules van en negreta i en el color de la part, perquè siguin fàcils de trobar a la pàgina i al PDF, on a més són enllaços.

Els superíndexs i els subíndexs es componen més petits i desplaçats de la línia de base sense alterar l'interlineat, i les mostres de color en línia s'assenten a la línia de base com una lletra més. Tots són atòmics: el tallador de línies pot tallar abans o després, però mai per dins, de manera que una fórmula o una mostra no acaben mai partides entre dues línies.

Dos trams més distingeixen paraules sense necessitar un tall propi de la família. \`:smallcaps[…]\` compon versaletes fetes a partir de les majúscules del tipus, iguals en totes les sortides, per a sigles i per als noms dels personatges d'una obra de teatre. \`:chip[…]\` posa una paraula dins d'una caixeta arrodonida que flueix amb la línia —tecles, etiquetes, el banc de paraules d'un exercici—, amb un estil que es tria pel nom; no es parteix mai per dins, i les seves paraules continuen sent text real a l'HTML i al PDF.

Els nombres també tenen estils.:index{term="estils de xifres"} Un tipus pot dibuixar les xifres alineades, tan altes com les majúscules, o elzevirianes, que pugen i baixen com les minúscules, i proporcionals o tabulars, totes de la mateixa amplada perquè les columnes de nombres quedin alineades. \`figureStyle\` tria entre elles per al cos, per a un estil de paràgraf, per a un nivell de títol, per a una taula o per a un peu: xifres elzevirianes al text corrent, on les alineades cridarien massa, i xifres alineades tabulars en una taula de resultats. Un tipus que no dibuixa l'estil demanat conserva les seves pròpies xifres.

## Òrfenes, vídues i línies curtes

:index{term="vídues i òrfenes"}Una **òrfena** és la primera línia d'un paràgraf que es queda sola al peu d'una columna; una **vídua**, l'última línia portada sola al capdamunt de la següent. Totes dues trenquen el ritme de la lectura, i :ref{id="orphan-widow"} les mostra a banda i banda d'un salt de columna. Un tercer defecte, la **línia curta**, és una última línia amb una sola paraula breu, encallada sota un paràgraf ple.

Postext posa preu a totes tres. Quan un paràgraf travessa una columna, el motor compara tots els talls possibles i a cadascun li carrega l'espai que deixa sense fer servir, l'òrfena i la vídua —1000 per defecte cadascuna, amb almenys dues línies a cada costat—. Les línies curtes es paguen dins del mateix tallador, com a mediania, sempre que l'última línia faci menys de vint caràcters d'espai. Quan no es pot evitar una línia curta tallant d'una altra manera, el motor pot compondre el paràgraf una línia més curt, estrenyent els espais dins del seu mínim i, si cal, l'espaiat entre lletres com a molt deu mil·lèsimes de quadratí. Els elements de llista segueixen les mateixes regles, amb interruptors propis.

## Llistes

Les llistes segueixen la mateixa disciplina que els paràgrafs, amb una tipografia pròpia. Les llistes amb pics trien el caràcter del pic, la mida, el pes i el color, i l'espai i el sagnat francès que mantenen alineat el text de cada element; les llistes numerades trien entre nombres aràbics, lletres minúscules o majúscules i nombres romans en minúscula o majúscula, amb un separador que pot tenir estil propi i nombres alineats a la dreta, perquè els elements 9 i 10 quedin alineats. La imbricació arriba a cinc nivells, cadascun amb el seu propi sagnat i les seves pròpies marques, i les llistes de tasques dibuixen una casella per a cada element, marcada o no. Els elements poden anar junts o espaiats, i el motor tracta el final d'una llista com una de les seves palanques en equilibrar les columnes, com es veurà al capítol següent.

:::callout{type="try"}
Al tauler **Disseny**, cerca _fluixes_ i activa **Ressaltar línies fluixes**, al grup **Avançat**. Després estreny les columnes o puja \`maxWordSpacing\` i observa quines línies ha d'obrir el motor i com les redistribueix l'optimitzador.
:::

## Matemàtiques

:index{term="matemàtiques"}Les fórmules són ciutadanes de ple dret. Les expressions en línia, com $e^{i\\pi}+1=0$, flueixen amb el text, compostes per MathJax com a traçats vectorials que es mantenen nítids a qualsevol ampliació. Quan una fórmula és més alta del que permet la línia, es redueix de manera uniforme perquè la retícula de base sobrevisqui. Les fórmules destacades ocupen línies pròpies, centrades a la columna, amb els seus propis marges, i el text que les segueix torna a la retícula:

$$
\\int_0^{\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

El canvas, la vista HTML i el PDF dibuixen els mateixos traçats, de manera que les fórmules coincideixen en les tres sortides i continuen sent vectors a la impremta.

Uns quants exemples més mostren la gamma de notació que fa servir el motor. El primer és una sèrie infinita, la suma dels inversos dels quadrats que Euler va resoldre el 1734. En una fórmula destacada, els límits del sumatori es col·loquen a sobre i a sota del símbol, com en un llibre d'anàlisi, i la fracció del resultat pren la mida completa en lloc de la versió reduïda que s'utilitza dins d'una línia.

$$
\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}
$$

Les matrius són una altra prova habitual, perquè exigeixen alinear files i columnes i ajustar l'alçada dels parèntesis a la del contingut. MathJax compon la matriu com una taula de cel·les centrades i estira els delimitadors fins a abastar-la; Postext rep el resultat com a traçats, mesura la caixa completa i reserva l'espai exacte abans de tornar el text a la retícula. El determinant d'una matriu de dos per dos es llegeix així.

$$
\\det \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} = ad - bc
$$

La distribució normal reuneix en una sola expressió gairebé tot el que complica la composició matemàtica: una arrel amb la seva barra, lletres gregues per a la mitjana i la desviació típica, i una fracció sencera dins d'un exponent, que s'ha de reduir dues vegades sense perdre llegibilitat.

$$
f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}}\\, e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}
$$

Les definicions per casos tanquen la sèrie. Una clau agrupa les branques de la definició, cadascuna amb la seva condició alineada a la dreta, i l'alçada de la clau creix amb el nombre de casos.

$$
|x| = \\begin{cases} x & \\text{si } x \\ge 0 \\\\ -x & \\text{si } x < 0 \\end{cases}
$$

Les fórmules en línia segueixen altres regles, perquè han de conviure amb les paraules que les envolten. Les arrels de $ax^2+bx+c=0$ són $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$, el producte d'Euler s'escriu $\\prod_p (1-p^{-s})^{-1} = \\zeta(s)$ i la transformada de Fourier $\\hat f(\\xi) = \\int f(x)\\,e^{-2\\pi i x \\xi}\\,dx$ també es queda a la seva línia. En els tres casos el motor mesura l'alçada de la fórmula i, si supera la que permet l'interlineat, la redueix només el necessari, de manera que les línies del voltant conserven la seva posició a la retícula i el paràgraf manté la textura.

# La pàgina i les seves columnes {#columns lead="Les pàgines són fixes, les columnes són finites i cada línia s'hauria d'assentar en un ritme compartit per tot el plec. Aquest capítol tracta del marc: la geometria de la pàgina, les estructures de columnes, la retícula de base i la manera d'acabar les columnes a la mateixa altura." summary="Geometria de pàgina, columnes, retícula de base i equilibri"}

Les columnes són l'expressió més visible del disseny editorial, i el lloc on es trenquen abans les solucions casolanes. Postext tracta la pàgina i les seves columnes com a objectes de primera classe, amb la seva pròpia geometria, el seu propi ritme i les seves pròpies regles per acabar bé.

## Geometria de la pàgina

Una pàgina comença per la mida. Postext ofereix com a predefinits els formats habituals de llibre i revista, recollits a :ref{id="preset-sizes"}, i qualsevol mida personalitzada en centímetres, mil·límetres, polzades o punts; aquesta guia es compon en el format de 21 × 28 cm. Els marges poden ser **simètrics**: el marge esquerre passa a ser l'interior, al costat del llom, i canvia de costat a cada verso. Per a la producció impresa, la pàgina pot portar sang i marques de tall, i un ajust de PPP controla la resolució de les mesures en píxels.

Els folis segueixen seqüències: aràbigues, romanes en minúscula o majúscula, alfabètiques en minúscula o majúscula, cadascuna amb el seu propi número inicial, de manera que un llibre pot numerar els preliminars i, ii, iii i començar el capítol u a l'1. El PDF registra les mateixes seqüències com a etiquetes de pàgina, i el visor mostra exactament el número imprès al peu.

## Mesura i interlineat

Les dues xifres que més decideixen com es llegeix una pàgina són la longitud de les línies i la distància entre elles. La configuració fixa el cos i l'interlineat en unitats reals —aquest llibre fa servir 9,4 punts sobre 13,6—, i l'amplada de columna es dedueix de la pàgina, els marges, l'estructura de columnes i l'espai entre columnes. Una línia de 45 a 75 caràcters és l'objectiu clàssic; molt més curta i l'ull salta massa sovint, molt més llarga i perd el camí de tornada a la línia següent. Dues columnes en una pàgina de 21 cm queden de sobres dins d'aquest interval, i aquesta és una de les raons per les quals el format és tan comú en revistes i llibres tècnics.

L'interlineat és a més la unitat de la retícula de base. Tota distància vertical que importa —l'espai sobre i sota un títol, al voltant d'una figura, entre els elements d'una llista— s'expressa millor com un nombre enter de línies de retícula, o es corregeix fins que ho sigui, perquè la pàgina mantingui un únic ritme de dalt a baix. Així, les línies de dues columnes veïnes queden sempre a la mateixa altura, també a banda i banda d'una figura.

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

:index{term="retícula de base"}Els llibres professionals alineen la primera línia de base de cada columna a un ritme vertical comú, i totes les línies següents cauen a la mateixa retícula, de manera que es miren a través de l'espai entre columnes. Postext ajusta el text a una retícula derivada de l'interlineat del cos, com il·lustra :ref{id="baseline-grid"}. Després dels elements que la trenquen —un títol més gran que el cos, una figura, una fórmula destacada— es deixa l'espai necessari per tornar la línia següent al seu lloc. La retícula es pot dibuixar superposada mentre treballes, allà on hi ha text.

## Acabar les columnes a la mateixa altura

Quan una pàgina acaba enmig del text, les columnes haurien d'acabar a la mateixa altura. És l'**equilibri de columnes**:index{term="equilibri de columnes"}, i és més difícil del que sembla: les línies van en passos enters de retícula, les figures no es poden partir, els títols han de continuar amb el seu text i els paràgrafs no poden deixar òrfenes. Postext iguala una columna curta amb tres palanques, fetes servir per ordre de preferència i dibuixades a :ref{id="column-balancing"}:

1. **Espai sobre els títols**, una línia de retícula sencera cada vegada, repartida per importància i mai al capdamunt d'una columna
2. **Una línia després del final d'una llista**
3. **Paràgrafs més solts**: un paràgraf compost una línia més llarg, la _looseness_ de TeX, acceptat només si cap de les seves línies no s'estira més enllà del límit d'espaiat; si ajuda, un toc d'espaiat entre lletres, com a molt deu mil·lèsimes de quadratí

Cada arranjament es verifica maquetant la pàgina de nou, fins a vuit vegades, i guanya el millor resultat. Un paràgraf compost amb una línia més conserva les paraules i només n'eixampla els espais, de manera que un paràgraf curt, amb pocs espais per eixamplar, poques vegades és l'escollit. Algunes columnes es deixen en pau a propòsit: l'última abans d'un salt de pàgina forçat o d'una obertura de capítol, l'última pàgina del document, una columna sense res a estirar. Dues regles afins igualen les columnes del final d'un capítol i les que queden sobre un requadre de pàgina completa que es mou o es parteix.

## Bandes i requadres de pàgina completa

Una pàgina no sempre és un únic joc de columnes de dalt a baix. Una figura, una taula o un requadre de pàgina completa la talla en **bandes**:index{term="bandes"}: el text que queda a sobre del requadre omple les seves columnes com una banda pròpia, el requadre travessa la pàgina i les columnes tornen a començar a sota. Cada banda s'equilibra pel seu compte, de manera que el lector baixa per la primera columna i puja al capdamunt de la segona abans de travessar el requadre, com en un diari. Quan una banda acabaria desigual, un **topall de banda** escurça les columnes al mateix nombre de línies, i el text que ja no hi cap continua fluint per sota.

Les columnes finals d'un capítol reben el mateix tracte. En lloc de deixar l'última pàgina amb una columna plena i una altra gairebé buida, un topall final reparteix entre elles les línies que queden, i les palanques d'equilibri fan la resta. L'última pàgina d'aquest capítol ho mostra: les dues columnes acaben a la mateixa altura. Els salts de columna explícits es respecten: \`:::columnbreak\` acaba una columna on vol l'autor, i l'equilibri deixa en pau el peu d'aquesta columna. Cap d'aquestes palanques no toca el text: només afegeixen espai o allarguen un paràgraf una línia.

:::callout{type="try"}
Al tauler **Disseny**, obre **Títols i índex** i desactiva **Equilibrar columnes**. Mira el peu de les columnes d'aquest capítol; després torna a activar-lo i observa quina palanca ha fet servir el motor a cada pàgina.
:::

## Regles que tries

Algunes decisions són qüestió d'estil de la casa més que d'encert o d'error, i la configuració les deixa en mans del llibre. S'ha de poder partir entre dues columnes una llista curta de tres elements? Pot flotar una figura fins a una obertura de capítol? Cadascuna d'aquestes **regles de composició** pren un de tres valors.:index{term="regles de composició"} :chip[allow]{style="state"} deixa que el motor ho faci, :chip[warn]{style="state"} ho deixa passar i afegeix una entrada al tauler Revisió, i :chip[avoid]{style="state"} fa que el motor canviï la pàgina perquè no passi mai: la llista sencera passa endavant amb la seva introducció, el flotant espera a la pàgina que segueix l'obertura. Posar una regla a _warn_ és la manera que té un editor de saber quantes vegades la incompliria un llibre abans de decidir. Totes dues regles comencen en _allow_, de manera que una configuració que no les esmenta compon les pàgines com sempre, i una llista curta vol dir fins a tres elements si la configuració no en fixa un altre nombre.
# Figures, taules i flotants {lead="Una referència és una promesa, no una posició. Esmenta una figura i Postext li busca lloc: el primer espai lliure després de la menció, numerada per ordre de lectura, amb el seu peu, i mai abans de les paraules que la criden." summary="On van a parar els recursos, com es numeren, taules que es parteixen"}

Tot allò que no és text que flueix —imatges, diagrames SVG, taules— és un **recurs**. Els recursos es declaren fora del text, cadascun amb el seu identificador, el seu tipus, el seu peu i les seves preferències de col·locació, i el Markdown es limita a esmentar-los.

## N'hi ha prou amb una menció

:index{term="flotants"}Escriure \`:ref{id="…"}\` en una frase fa dues coses: imprimeix l'etiqueta del recurs i, la primera vegada, l'_incorpora_, de manera que flota fins al primer espai lliure després de la referència. Els espais es proven en ordre, com mostra :ref{id="float-slots"}: el peu de la columna que conté la referència, després el cap i el peu de la columna lliure següent, després una banda a la pàgina següent. El text no s'interromp mai.

Unes quantes regles mantenen honrats els flotants:

- Un flotant no cau mai abans de la seva referència i no s'encongeix mai per cabre
- Els flotants d'una mateixa seqüència de numeració conserven el seu ordre, de manera que la figura 12 no apareix mai abans que l'11; una taula que espera lloc no reté les figures
- Els flotants no s'escapen mai del seu capítol: les obertures de capítol, les portadelles de part i el final del document són barreres
- Un flotant que deixaria menys de tres línies de text en una pàgina nova espera a la següent
- Les bandes de cap i de peu s'alineen amb la retícula de línia de base, i el peu d'un flotant inferior comparteix la línia de base de l'última línia de text

## Col·locació

Cada recurs pot indicar on prefereix anar, i cada tipus de recurs té un valor per defecte; els camps es recullen a :ref{id="placement-options"}. Un recurs també es pot inserir en un punt exacte, quan la seva posició és _here_. I una taula o una figura massa ampla per a la pàgina pot girar un quart de volta, en un sentit o en l'altre: llavors ocupa una pàgina pròpia, enganxada al llom i dimensionada segons l'alçada de la pàgina.

## Números i etiquetes

Els tipus de recurs defineixen les seves pròpies seqüències de numeració. Les figures i les taules vénen de sèrie i es tradueixen a la llengua del document; un tipus pot afegir un prefix, una etiqueta abreujada, una plantilla com \`{h1}.{n}\` per numerar per capítol —la figura 5.2 és la segona figura del capítol 5—, una regla de reinici i un format de comptador. Els números segueixen la **primera referència en l'ordre de lectura**: si insereixes una menció anterior, es mouen tots els números posteriors. Una referència pot imprimir només el número, l'etiqueta completa o l'abreujada, canviar-ne la caixa o imprimir un text propi.

La numeració es manté correcta en tot un llibre perquè forma part del que cada capítol hereta dels anteriors. Moure un capítol renumera tot el que ve després la vegada següent que es maqueta el llibre.

## Tipus propis

Una configuració pot declarar tants tipus de recurs com faci servir una publicació —mapes, làmines, requadres, gràfics, documents—, cadascun amb un nom en singular i en plural, una etiqueta abreujada per a les referències, un prefix per als seus peus i una seqüència de numeració pròpia. Cada tipus pot portar a més la seva col·locació per defecte i ajustar l'estil del peu.

## Taules

:index{term="taules"}Les taules porten el seu model a sobre: files de cel·les amb fusions de columnes i files, files de capçalera, alineació i amplades de columna relatives. Les cel·les admeten Markdown en línia, paràgrafs i llistes senzilles, un emplenament propi —els quatre colors de part d'aquest llibre són :swatch{color="#2b4acb"} blau, :swatch{color="#8f6408"} or, :swatch{color="#1f7a6d"} verd blavós i :swatch{color="#c0452f"} vermelló— i fins i tot una imatge. L'estil de les taules es defineix una vegada per a tot el document: tipografia del cos i de la capçalera, emplenament de la capçalera i filets en retícula, només horitzontals, només exteriors o cap.

Una taula més alta que la pàgina es parteix entre pàgines. Les seves files de capçalera es repeteixen a cada tram, el peu de cada continuació guanya el sufix _(cont.)_, un avís de _Continua_ tanca cada tram excepte l'últim, i cap tall no travessa una fusió de files.

## Figures al costat del text

En una maquetació de columna i mitja la columna lateral de la qual només porta flotants, els recursos poden viure al costat del text en lloc de dins seu. Una figura amb l'amplada _side_ s'apila a la columna lateral al costat del paràgraf que la cita; un requadre pot fer el mateix, i així els llibres de text poden mantenir definicions, conceptes clau i figures al marge al costat de les línies que expliquen. Una figura ampla pot portar a més el peu al costat, a la columna lateral.

## Text que envolta

:index{term="text que envolta"}Una imatge o un requadre més estret que la seva columna es pot quedar a un costat, amb el text corrent al seu costat a la mesura que queda i tornant a la mesura completa a sota, com en una revista. Un dibuix retallat pot anar més lluny: amb l'ajust de **contorn**, cada línia es compon tan curta com ample és el dibuix a la seva altura, de manera que el text en segueix la silueta i no la caixa. Els títols, les fórmules i les altres figures no es posen al costat d'un element envoltat; esperen a sota.

## Zones segures

Una imatge pot marcar la seva **zona segura**:index{term="zona segura"}, el rectangle que conté el que importa, i llavors el motor la pot retallar en qualsevol punt entre la imatge sencera i aquest rectangle, conservant-ne l'amplada. Fa servir aquesta llibertat per mantenir una imatge en una columna que, si no, deixaria curta, per encabir una imatge més alta que la pàgina i per equilibrar columnes: una imatge amb zona segura pot créixer línies senceres per omplir el peu d'una columna curta. La zona segura es dibuixa sobre la imatge al tauler Recursos, i les vinyetes dels còmics fan servir la mateixa marca per saber què no s'ha de tallar mai.

## Peus i crèdits

Un peu és el prefix del tipus, el número i el text del peu, que admet Markdown en línia i referències pròpies. Els peus van a sobre o a sota del seu recurs, opcionalment sobre una barra de color, amb la tipografia i la mida de l'estil de peu; l'etiqueta pot anar en negreta o en color, com en aquest llibre. Un recurs pot portar a més una nota: una línia més petita de crèdit o de font a sota seu.

## Figures vectorials

Els diagrames SVG es dibuixen com a vectors a tot arreu. El PDF converteix el subconjunt habitual d'SVG —formes, traçats, grups, traçats de retall, emplenaments i traços sòlids, opacitat i text— en operacions de dibuix natives, i rasteritza a 600 ppp el que en queda fora; una figura també pot portar un màster PDF propi, que s'incrusta tal com és. Per imprimir a una tinta, un interruptor torna a acolorir tots els diagrames com a tintes d'un sol color, segons la seva luminància, en els tres renderitzadors.

El text d'un SVG continua sent text. Al PDF es compon amb fonts reals i es pot seleccionar i cercar, i al Sandbox es pot editar al seu lloc: el tauler Recursos obre el codi del diagrama amb només el text editable, de manera que una etiqueta es pot corregir o traduir sense obrir un programa de dibuix. Els diagrames d'aquest llibre es generen per a cada llengua, i per això les seves etiquetes són en català en aquesta edició.

Tres figures compostes aquí ho demostren. La roseta de :ref{id="vector-rosette"} està feta de corbes de Bézier, traços finíssims i una línia de microtext de dos punts i mig d'alçada; el gràfic de :ref{id="vector-chart"} combina una àrea emplenada, una línia discontínua i etiquetes de text; i :ref{id="vector-clip"} fa servir un traçat de retall, un grup dibuixat amb transparència i una mateixa forma reutilitzada cinc vegades. Amplia el PDF i mira'n les vores: continuen tan nítides com el text que les envolta.

:::callout{type="try"}
Fes clic al peu de qualsevol figura del canvas: el tauler Recursos s'obre en aquell recurs, amb el camp del peu a punt. Canvia'n la col·locació d'_auto_ a _top_ i mira com es mou.
:::

## Vídeos

:index{term="vídeos"}Un vídeo és un recurs més. Es menciona, es numera a part (Vídeo 1.1 al costat de Figura 1.1) i flota fins al primer buit lliure, com una figura. Pot venir de YouTube o de Vimeo, d'un fitxer desat al llibre o d'una adreça web: un MP4 o un WebM en un servidor, o un flux HLS, la llista \`.m3u8\` amb què se serveix un vídeo llarg a trossos i en diverses qualitats.

En paper s'imprimeix la seva portada, un fotograma triat, amb una marca de reproducció i un codi QR que obre el vídeo; al PDF la portada també és un enllaç. La vista HTML i l'EPUB el reprodueixen amb el seu propi reproductor, llevat dels de YouTube i Vimeo i dels fluxos HLS, que un llibre electrònic només pot enllaçar. A la vista Folio, un clic a la portada el reprodueix a la mateixa pàgina, i el vídeo continua mentre es passa el full. Els vídeos d'aquest llibre, com :ref{id="postext-showreel"}, són fluxos HLS servits des d'una xarxa de distribució de continguts, cadascun en la llengua d'aquesta edició.

# Requadres, notes i marques {#boxes lead="Al voltant del text corrent, un llibre manté una segona capa: requadres que posen a part un incís, notes al peu de la columna, petites marques dins de la línia i un índex que recorda cada pàgina. Cadascun s'escriu al Markdown i el dibuixa la configuració." summary="Requadres, requadres niats i flotants, xips, notes a peu de pàgina i l'índex analític"}

El text corrent és només una part del que troba qui llegeix una pàgina. Postext tracta cadascuna d'aquestes coses com un contingut amb nom, escrit al lloc del text on li correspon, i en deixa l'aspecte a la configuració.

## Requadres

:index{term="requadres"}\`:::callout\` compon una caixa amb un títol opcional, en un dels estils que defineix la configuració. Aquest llibre en defineix cinc, des dels requadres _Prova-ho_ fins a l'incís al marge marcat amb un filet, que s'estrena en aquest capítol. Un estil decideix el fons, la vora, la franja i el radi de les cantonades de la caixa, una icona o marca opcional, la tipografia del seu títol, el seu cos i les seves llistes, i on va: en el flux, al cap o al peu d'una columna, a l'amplada de la pàgina, a la columna lateral d'una maquetació de columna i mitja o fix en una posició de la pàgina.

Un requadre llarg es pot partir entre els seus paràgrafs, o fins i tot entre les seves línies, deixant-ne almenys dues a cada costat; la continuació omet el títol. Dins d'un requadre, \`:::columns\` compon el contingut en columnes equilibrades, com el tauler de xifres de :ref{id="engine"}.

Els atributs d'un requadre poden substituir el seu estil per a una sola caixa: un \`title\`, un \`span\` de columna, de pàgina o lateral, una \`placement\` i una \`label\` impresa en una pestanya de la seva cantonada superior, com les etiquetes _Requadre 1-1_ d'un llibre de text.

## Requadres dins de requadres

:index{term="requadres!niats"}Un requadre en pot contenir un altre. El requadre interior s'obre dins de l'exterior i es tanca abans que ell, i cada \`:::\` sol tanca el requadre més interior que encara és obert. El requadre interior pren l'amplada del pare, menys el seu farciment, i conserva el seu propi estil, de manera que una nota tècnica pot portar un requadre _Prova-ho_ sense que cap dels dos perdi els colors.

:::callout{type="note" title="Dos requadres, un bloc"}
El requadre exterior és una nota tècnica. Es manté junt amb el que conté, així que el motor col·loca tots dos com un sol bloc: no deixa mai el requadre interior sol al capdamunt de la columna següent.

:::callout{type="try"}
Obre el tauler Text en aquest capítol i esborra la línia que tanca el requadre interior. Ara el requadre exterior acaba on acaba el capítol, i el tauler Revisió ho assenyala.
:::

El requadre exterior continua després de l'interior, amb el seu propi estil.
:::

## Requadres que floten

Alguns requadres no tenen cap motiu per interrompre la lectura allà on s'han escrit: una barra lateral, un perfil, un resum de xifres. Amb una \`placement\` _top_ o _bottom_, un requadre així flota com una figura fins al cap o al peu de la primera columna on hi càpiga, i el text que el segueix al Markdown omple la pàgina per sobre o per sota. El requadre de sota d'aquest paràgraf s'ha escrit aquí, enmig de la secció, i s'ha compost al peu d'una columna.

:::callout{type="aside" placement="bottom" title="On va a parar un requadre flotant"}
Al primer espai lliure en el punt on s'ha escrit o després, la mateixa regla que segueix una figura. Un requadre que s'ha de mantenir sencer cedeix davant dels requadres i les figures ja col·locats, mai a l'inrevés.
:::

## Marques i requadres dissenyats

Un estil pot dibuixar una **marca** fora del requadre, en una columna estreta pròpia al seu costat: una icona, un glif, una forma o una imatge dels recursos, amb un filet que recorre tota l'alçada del requadre. L'incís que ha flotat des de la secció anterior en fa servir una: un punt daurat sobre un filet del mateix color.

Quan una marca no n'hi ha prou, un estil pot dibuixar el requadre sencer amb un **disseny**, amb les mateixes peces de text, caixes, filets i imatges que dibuixen les obertures de capítol d'aquest llibre. El text del requadre passa a ser un element entre els altres, i els atributs escrits al requadre es poden imprimir al disseny: un número en una insígnia, un nivell en una pestanya, un nom en una franja al peu.

## Marques dins de la línia

:index{term="xips"}\`:chip[…]\` posa una paraula dins d'una caixeta arrodonida que flueix amb el text, per a tecles, estats i etiquetes: un ajust que pot valer :chip[allow]{style="state"}, :chip[warn]{style="state"} o :chip[avoid]{style="state"}, o una tecla com :chip[Esc]. Un xip té un estil, com un requadre, definit a la configuració.

Les mostres de color en són una segona mena. Escrita \`:swatch{color="#c0452f"}\`, una mostra posa dins de la línia un quadradet d'aquell color, :swatch{color="#c0452f"} com aquest.

## Notes a peu de pàgina

:index{term="notes a peu de pàgina"}Una nota es crida amb \`[^id]\` just després de la paraula o del signe de puntuació a què pertany,[^first-note] i s'escriu en qualsevol lloc del capítol com un paràgraf que comença amb \`[^id]:\`. Les notes es numeren en l'ordre en què es criden per primera vegada, començant per u a cada capítol; \`footnotes.numbering\` pot continuar la numeració al llarg del llibre o reiniciar-la a cada pàgina, com fan els llibres xinesos i els àrabs clàssics.

[^first-note]: Aquesta n'és una, escrita més avall al Markdown com un paràgraf propi.

Una nota es compon al peu de la columna que conté la línia que la crida, sota un filet curt, i la línia i la seva nota comparteixen sempre columna: quan la nota no hi cap, la línia passa amb ella a la columna següent.[^second-note] \`footnotes.placement: 'chapterEnd'\` aplega en canvi les notes d'un capítol després del seu últim bloc.

[^second-note]: El motor equilibra la columna comptant-hi les línies de la nota, de manera que una pàgina amb notes també acaba a la mateixa altura.

## Un índex analític al final

:index{term="índex analític"}Un índex analític s'escriu allà on el text tracta cada terme. \`:index[anèmia]\` imprimeix la paraula i la registra; \`:index{term="Cor!vàlvules"}\` no imprimeix res i registra la pàgina sota una subentrada. Un indicador \`main\` posa la pàgina en negreta, \`range="start"\` i \`range="end"\` delimiten una explicació que ocupa diverses pàgines, i \`see\` i \`seealso\` escriuen remissions. \`:::index\` imprimeix l'índex allà on és, normalment sota un títol l'estil del qual el compon a dues columnes.

El motor llegeix la pàgina de cada marca després de maquetar, de manera que els números segueixen el text: afegeix un paràgraf, mou un capítol o canvia la mida de pàgina, i l'índex imprimeix les pàgines noves. Les entrades s'ordenen segons l'ordre alfabètic de la llengua del document i s'agrupen sota la seva inicial, les pàgines consecutives s'uneixen en un interval i cada número és un enllaç al PDF.

# Llibres, parts i capçaleres {lead="Un llibre és més que els seus capítols: una coberta, un índex que es manté al dia, portadelles de part, obertures que anuncien cada capítol i capçaleres que saben on és el lector. Tot això és configuració." summary="Capítols, estils de títol, dissenys, parts, índex i folis"}

Aquesta guia és un llibre de vint-i-un capítols, i cada capítol és un document Markdown propi. Un projecte del Sandbox és sempre un llibre: la configuració, els recursos i les fonts es comparteixen, i els capítols se succeeixen, com mostra :ref{id="book-anatomy"}.

## Els capítols fan el llibre

Cada capítol es maqueta per separat, _continuant_ els anteriors: n'hereta el nombre de pàgines i la paritat, els comptadors de capítols i de figures, la part oberta i les capçaleres. Per això les figures d'aquest capítol es numeren a partir de la 7.1, i per això editar un capítol no obliga mai el motor a compondre de nou el llibre sencer.

## El que hereta un capítol

La continuació que rep un capítol és petita i precisa. Porta el nombre de pàgines i la paritat de la pàgina següent, perquè una obertura que ha de caure en pàgina parella sàpiga si necessita una pàgina en blanc al davant. Porta els comptadors de capítols, de recursos i d'etiquetes de pàgina. I porta l'esquema del llibre, perquè un índex al capítol dos pugui imprimir la pàgina on comença el capítol deu.

## Estils de títol

Un títol pot portar atributs, escrits entre claus al final de la seva línia. El més potent és l'**estil**: \`{style="cover"}\` aplica un estil de títol amb nom, que canvia la tipografia i el disseny del títol i, per a la secció que obre, pot canviar les capçaleres, els marges de pàgina, la disposició de columnes, la tipografia del cos i la paleta. Un estil també pot deixar sense numerar els seus títols, perquè un pròleg no desplaci la numeració dels capítols, i deixar-los fora de l'índex.

## Una ullada a la configuració d'aquest llibre

La coberta és el títol de primer nivell del primer capítol, amb l'estil _cover_. L'estil treu les capçaleres i dibuixa un disseny a pàgina completa: una caixa que omple la sang amb el color nit, la il·lustració de coberta, un avanttítol en versals daurades, el títol de les metadades en Fraunces a 88 punts, un filet daurat curt, el subtítol en Lora cursiva i una línia de crèdits al peu.

Les obertures de capítol són un disseny del primer nivell de títol. Una caixa omple la part superior de la sang amb el color de part; el número de capítol s'imprimeix en gran al costat de la vora exterior, l'avanttítol combina la paraula _Capítol_, el número i el títol de la part, i sota un filet blanc curt vénen el títol i la introducció del capítol, presa de l'atribut \`lead\` del títol. L'atribut \`summary\` del mateix títol és el que l'índex imprimeix sota cada entrada.

## Dissenys

:index{term="dissenys"}Les capçaleres, els peus de pàgina, les obertures de capítol i les portadelles es dibuixen amb **dissenys**: petites composicions lliures de textos, filets, caixes i imatges. Cada element s'ancora a la pàgina, a la sang, a la caixa de text o a un altre element, amb desplaçaments i mides en unitats reals, i el seu text pot portar **marcadors** com \`{pageNumber}\`, \`{chapterTitle}\`, \`{partTitle}\` o qualsevol atribut del títol, com el \`{attr.lead}\` que posa l'entradeta a la banda d'aquest capítol.

Les capçaleres són un disseny corrent, amb elements filtrats per paritat i per paper. A les pàgines parelles d'aquest llibre, el foli en el color de part i el títol del llibre van al costat de la vora exterior; a les senars, el títol del capítol i el foli. Només apareixen a les pàgines de cos; les obertures porten en lloc seu un foli al peu, i les portadelles de part no en porten cap. La pàgina en el color de part que queda enfront de cada portadella també és un element de disseny: una caixa que omple la sang, visible només a les pàgines parelles en blanc, que en aquest llibre són exactament les que queden enfront d'una part.

## Parts i paletes

:index{term="parts"}\`:::part\` obre una portadella de part: una pàgina pròpia, portada a la paritat que demana la configuració, dibuixada amb el disseny de part i seguida d'un cos, normalment la llista dels seus capítols.

En aquest llibre cada part s'obre com un plec: una pàgina parella en el color de part a l'esquerra i la portadella a la dreta. Les parts salten amb la paritat _sempre senar_, que col·loca un full en blanc davant de cada portadella, de manera que la portadella cau sempre en pàgina senar. El primer capítol de la part s'obre llavors al seu dors, en pàgina parella, com tots els capítols.

Una part també pot canviar el color del llibre. Els colors de la configuració es poden enllaçar a entrades amb nom de la **paleta**:index{term="paleta"}, i l'atribut \`palette\` d'una part substitueix entrades fins a la part següent. Aquest llibre defineix una entrada, el _color de part_, i cada part li dona un valor: blau per als fonaments, or per a l'ofici, verd blavós per a les pàgines més enllà del text corrent, vermelló per a la pràctica.

## Un índex que es manté al dia

:index{term="índex general"}\`:::toc\` imprimeix l'índex: una entrada per cada títol dels nivells indicats i una fila per cada part, amb números, títols, punts guia, folis i, si es vol, una línia presa d'un atribut del títol. Els folis són reals: el motor maqueta el llibre, llegeix on ha caigut cada títol i torna a compondre l'índex fins que els números s'assenten.

## Salts de pàgina i numeració

\`:::pagebreak\` comença una pàgina nova i pot demanar que sigui senar o parella, afegint una pàgina en blanc si cal. \`:::numbering\` canvia la seqüència de folis a partir de la pàgina següent; així, uns preliminars numerats en romans donen pas als aràbics al capítol u. I on un passatge demana una mica més d'aire a sobre, \`:::space\` deixa una línia en blanc, o \`:::space{lines=2}\` dues; les línies en blanc de més no hi afegeixen res.

# Un llibre, moltes llengües {#languages lead="Aquesta guia existeix en deu edicions, en quatre escriptures i dues direccions, i totes comparteixen un mateix disseny. Cada edició només conserva el que la seva llengua ha de dir d'una altra manera." summary="Edicions, configuració general, ajustos propis, escriptures i direccions"}

Un llibre traduït sol ser un segon llibre. Des que se'n desa una còpia, cada correcció del disseny s'ha de fer dues vegades, o deu, a mà. Postext, en canvi, manté juntes les edicions d'un llibre: un sol projecte amb un joc de capítols per a cada llengua, un disseny compartit i, per a cada llengua, una llista breu dels ajustos que fixa d'una altra manera.

## Edicions

:index{term="edicions"}Un llibre del Sandbox pot contenir diverses llengües. Cada **edició** té els seus capítols, el seu nom i la seva descripció i, on una figura ho necessita, les seves pròpies il·lustracions; els recursos, les fonts i el disseny són del llibre. El tauler Llibres mostra una etiqueta per a cada llengua que conté un llibre, i l'adreça de la pàgina anomena la que hi ha en pantalla, de manera que un enllaç obre l'edició des de la qual es va copiar. El canvas pot maquetar dues edicions l'una al costat de l'altra, i així qui tradueix comprova que el capítol en castellà encara cap a les pàgines que omple l'anglès.

Una edició nova comença com una còpia de la que hi ha en pantalla, encara sense traduir, des d'**Afegir una llengua…** al menú del llibre. Quan la llengua nova és l'àrab, el xinès o el japonès, la còpia pren pel camí els valors per defecte d'aquella llengua: la direcció, el mode d'escriptura, els tipus de lletra i les regles de la seva tipografia.

## Configuració general i ajustos propis

El disseny d'un llibre en diverses llengües es desa en dues capes. La **configuració general** és la que fan servir totes les edicions:index{term="configuració general"}; cada llengua té després uns **ajustos propis** que només anomenen els camps que fixa d'una altra manera, combinats camp a camp sobre els generals.

El tauler Disseny mostra les dues capes amb un interruptor a la capçalera, entre _Totes les llengües_ i només la llengua actual. Amb l'interruptor en una llengua, un camp que aquella llengua fixa per si mateixa porta una marca, i el tauler pot enviar un valor a la capa general o tornar-hi una edició. Una llista breu a la capçalera del tauler anomena cada ajust que la llengua fixa per si mateixa.

:::callout{type="note" title="Com es compon aquesta guia"}
Les set edicions en escriptura llatina ho comparteixen gairebé tot: dels ajustos que fan el disseny, cadascuna en fixa unes quantes dotzenes per si mateixa, i tots són paraules: els títols dels seus requadres, els noms dels seus colors, estils i figures, el títol de les seves capçaleres i la llengua de la seva partició de mots. Les edicions àrab, xinesa i japonesa conserven la mateixa pàgina, la mateixa paleta i les mateixes parts, i adapten els tipus, la direcció i el mode d'escriptura a les seves escriptures.
:::

Aquestes xifres es recullen a :ref{id="edition-layers"}. Són els ajustos propis més petits que pot tenir cada edició, calculats pel motor a partir de les mateixes edicions.

## El que canvia una llengua

La llengua del document és un ajust, \`locale\`, i arriba més lluny que la partició de mots. Tria els patrons de partició, de vuit llengües integrades; els noms dels tipus de figura i de taula integrats, _Figure_ en anglès, _Figura_ en català, _Abbildung_ en alemany; les paraules que imprimeix una taula partida o un requadre que continua; l'ordre d'un índex; i les xifres, que un llibre àrab pot compondre en numerals aràbics orientals. Un títol o un paràgraf poden canviar de llengua pel seu compte, i unes quantes paraules en una altra llengua es poden marcar dins de la línia, de manera que una cita en francès dins d'un capítol en català es parteix segons les regles del francès.

## Quatre escriptures, dues direccions

Les edicions llatines es componen d'esquerra a dreta, justificades i amb partició de mots. L'edició **àrab** es llegeix des de la dreta i s'enquaderna per la dreta: les seves línies es justifiquen allargant les lletres amb kashida allà on l'escriptura ho permet, i no només eixamplant els espais; els nombres i les paraules llatines conserven la seva pròpia direcció dins de la línia, i les figures es dibuixen en mirall allà on la seva disposició segueix l'ordre de lectura.

Les edicions **xinesa** i **japonesa** es componen en vertical, en columnes que van de dalt a baix i de dreta a esquerra, enquadernades per la dreta com l'àrab. Les seves línies segueixen les regles que cada llengua ha fixat per escrit: quins signes de puntuació poden obrir o tancar una línia, quant d'espai ocupa una coma, on es tomben les paraules llatines i on els nombres curts es mantenen drets a la columna. El japonès hi afegeix el **ruby**:index{term="ruby"}, petites lectures compostes al costat dels caràcters difícils, escrites al Markdown com \`:ruby[…]{rt="…"}\`.

## Traduir amb el motor a la vista

Com que les pàgines es componen mentre escrius, una traducció es pot jutjar a mesura que s'escriu. Una frase alemanya un terç més llarga que l'original anglès en mostra el cost de seguida, en una columna que passa una línia o en un títol que ja no cap a la seva banda. Cada edició d'aquesta guia es va compondre pàgina a pàgina amb el tauler Revisió obert i les columnes llegides a la recerca de forats i de finals curts.

:::callout{type="try"}
Obre el tauler Llibres i canvia aquesta guia d'una llengua a una altra amb els botons de la seva fila. Després obre el tauler Disseny, posa l'interruptor de la capçalera només en la llengua actual i llegeix la llista del que aquesta edició fixa per si mateixa.
:::

:::part{number="III" title="Més enllà del text corrent" palette="band=#1f7a6d"}
9. Pàgines compostes
10. Còmics i partitures
11. Exercicis i cursos
:::

# Pàgines compostes {#composed lead="No totes les pàgines són un riu de text. Un plec de llibre de text, l'obertura d'una revista o un full de consulta ràpida es construeixen amb marcs, cadascun amb la seva peça. Postext guarda els marcs en una plantilla i les paraules al Markdown." summary="Plantilles de pàgina, marcs, ranures, plecs i text que no hi cap"}

Els capítols anteriors componen text en columnes que corren de pàgina en pàgina, i el motor decideix on cau cada línia. Una gran família de llibres funciona a l'inrevés. En un llibre de text escolar, cada plec es dibuixa primer: una banda per al títol, una caixa per a la definició, una tira de fotografies, una columna d'exercicis, un mapa amb etiquetes. Les paraules s'escriuen perquè càpiguen als marcs, i quan no hi caben algú les escurça o mou un marc. Postext també compon aquestes pàgines, amb el nom de **pàgines compostes**, i hi manté la regla que segueix la resta del motor: el Markdown diu què és el contingut, la configuració diu on va.

## Plantilles i marcs

:index{term="pàgines compostes"}Una **plantilla de pàgina** forma part de la configuració:index{term="plantilles de pàgina"}, a \`pageTemplates\`. Anomena un conjunt de **marcs**: rectangles col·locats a la pàgina amb una àncora i un desplaçament o amb una cel·la d'una retícula, amb una amplada, una alçada i un estil de caixa pres dels estils de requadre del llibre. Un marc pot ser tan alt com el seu contingut, fix o arribar fins a la vora de la pàgina; els marcs es poden apilar o posar en fila com un **grup**, de manera que quan un creix els altres es mouen amb ell. Una plantilla també porta una **decoració**: filets, bandes, imatges i textos breus col·locats un cop els marcs són al seu lloc, de manera que una banda pot penjar d'una caixa i seguir-la.

Cap paraula no viu en una plantilla. Un marc té un nom, una mida i un aspecte; el títol que imprimeix, el text que conté i la imatge que emmarca vénen de la pàgina que el fa servir. Això és el que permet que les deu edicions d'aquesta guia comparteixin una sola plantilla per al full de consulta ràpida que tanca el llibre, abans de l'índex: cadascuna omple els mateixos marcs amb les seves paraules.

## Omplir els marcs des del Markdown

Una pàgina composta és un bloc tancat amb quatre signes de dos punts que anomena la seva plantilla. A dins, \`:::frame{slot="…"}\` envia el seu contingut al marc d'aquell nom, i un títol, un recurs o un requadre poden anomenar una ranura pròpia. El contingut que no anomena res va al marc que la plantilla marca com a marc de **flux**, i el primer títol va al marc que pren els títols del seu nivell. El full de consulta ràpida del final del llibre s'ha escrit així, i el seu Markdown es llegeix com el de qualsevol altre capítol.

:::callout{type="note" title="El bloc del full de consulta ràpida"}
\`::::page{template="sheet"}\` l'obre i \`::::\` el tanca. Entremig, un títol per al títol, un paràgraf per al marc de flux, sis blocs \`:::frame\` per a les targetes i un altre per a la llegenda del peu de la pàgina. Les posicions, les mides i els colors són a la plantilla, a Disseny › Pàgina i columnes › Plantilles de pàgina.
:::

## Com es compon una pàgina

Una pàgina composta ocupa una pàgina pròpia, o dues si és un plec, i el text que segueix el seu bloc comença a la següent. El motor col·loca els marcs per torns, omple cadascun amb la tipografia de la resta del llibre, els mateixos estils de paràgraf, títols, llistes i xips, i en dibuixa la caixa a la mida final. Els marcs es llegeixen en l'ordre en què el seu contingut apareix al Markdown, no en l'ordre en què es pinten, de manera que un lector de pantalla, el PDF etiquetat i l'EPUB fluid llegeixen el títol, després el text i després les caixes, com ho faria una persona.

## Quan les paraules no hi caben

El text escrit per a un marc no hi cap mai a la primera. Una plantilla diu què pot fer la pàgina, i el motor prova cada pas per ordre i s'atura en el primer que funciona. Un marc que segueix el seu contingut creix dins de l'espai que li deixa el grup; els marcs de sota baixen; els marcs marcats per cedir s'encongeixen; el text es pot compondre una mica més estret. Quan res d'això no n'hi ha prou, el text continua en un altre marc, encadenat com els marcs enllaçats d'un programa d'autoedició, o en una pàgina afegida després d'aquesta, sota una marca que diu on continua.

El que la pàgina no ha pogut resoldre s'assenyala al tauler Revisió amb les seves propostes: quin marc desborda, en quantes línies i què el faria cabre. Un **registre de reajustament** recull cada moviment que el motor ha fet a la pàgina, perquè qui dissenya vegi per què una caixa ha acabat més avall d'on la posava la plantilla. Al Sandbox, un clic a l'avís mostra el marc, i els camps del marc són a un clic de distància.

## Plecs i connectors

:index{term="plecs"}Una plantilla pot cobrir dues pàgines enfrontades com un sol full. Un **plec** s'obre en una pàgina parella, n'afegeix una en blanc al davant quan el text anterior acaba en pàgina parella, i deixa que els marcs i la decoració travessin el llom allà on la plantilla ho permet; un marge al llom manté tota la resta lluny del doblec. Les cronologies, els mapes i les obertures a doble pàgina es componen així, i cada pàgina del plec continua imprimint la seva capçalera i el seu foli.

Els marcs també es poden unir amb **connectors**: línies, colzes i corbes dibuixats entre dos marcs, que hi continuen enganxats per molt que les paraules els moguin, per a organigrames, arbres genealògics i mapes amb etiquetes. Les imatges d'un marc poden portar etiquetes ancorades a punts de la imatge, amb línies guia i punteres, de manera que un mapa de rius conserva els noms sobre els rius quan el mapa es redimensiona o es tradueix.

## Plantilles al Sandbox

Les plantilles s'editen al tauler Disseny, on cadascuna es dibuixa amb els seus marcs i es llista amb el nombre de pàgines que la fan servir. Amb la previsualització en mode **Disseny**, una pàgina composta mostra la retícula i els marges, un clic sobre un marc el selecciona, arrossegar-lo el mou i les nanses el redimensionen; la caixa es desa a la plantilla en mil·límetres. Quan altres pàgines fan servir la mateixa plantilla, el Sandbox pregunta si el canvi és per a totes o només per a aquesta pàgina, cosa que crea una plantilla nova basada en la primera.

El camí invers també hi és. Una pàgina maquetada a mà es pot desar com a plantilla, i un llibre que tenia les paraules dins dels estils antics les pot moure al Markdown, on els correspon, amb una sola ordre per a tot el llibre.

:::callout{type="try"}
Posa la previsualització en mode Disseny, ves al full de consulta ràpida, just abans de l'índex, i arrossega cap avall una de les targetes. El Sandbox pregunta si ha de canviar la plantilla o només aquesta pàgina; tria només aquesta pàgina i obre el tauler Text per veure que ara el bloc anomena una plantilla nova.
:::

# Còmics i partitures {#comics lead="Alguns llibres parlen amb imatges i d'altres amb notes. Un còmic és un conjunt de dibuixos i un guió; una partitura és música escrita com a text. En tots dos casos, Postext guarda les paraules al Markdown i s'encarrega ell mateix de la retolació i del gravat." summary="Vinyetes, bafarades, retolació, tires i notació musical"}

Els còmics i la música semblen el contrari d'allò per a què serveix un motor de text. Una pàgina de còmic es dibuixa, una partitura es grava, i cap de les dues no és una columna de línies justificades. Tot i això, totes dues estan fetes de text en el fons. Cada bafarada d'un còmic és una línia de diàleg que s'ha de traduir, retolar i encabir en un dibuix, i cada compàs d'una partitura és notació que un músic pot escriure en un editor de text. Postext les tracta així: els dibuixos i les regles són recursos i ajustos, el diàleg i la música són al capítol.

## Imatges sense paraules

:index{term="còmics"}Un còmic a Postext parteix de dibuixos sense cap retolació. Cada imatge pot marcar què no s'ha de retallar mai, la seva **zona segura**, i on són els personatges: un punt per a la boca de cada personatge que parla, una caixa per a cada cara, zones on les bafarades no haurien d'entrar. Aquestes marques es fan una vegada, al tauler Recursos, i les fan servir totes les edicions del còmic.

El guió és el Markdown del capítol. Un bloc \`:::page\` talla una pàgina en vinyetes amb una fórmula breu, \`30 [30 | 20 | *] / *\` per a un pis de tres vinyetes sobre una de gran, dona a cada vinyeta la seva imatge i llista sota cada vinyeta el que s'hi diu, una línia per bafarada: \`maya: Avi! Ja soc aquí!\`. Un cartutx, un pensament, un xiuxiueig, un crit o una onomatopeia són la mateixa línia amb una altra clau o un altre estil.

## Retolació

:index{term="retolació"}El motor retola cada bafarada a un sol cos, amb el tipus de retolació del llibre, com treballa un retolador. Talla les paraules en línies que fan una forma arrodonida, curtes a dalt i a baix, després dibuixa la bafarada al seu voltant amb el mateix aire a cada costat, la col·loca en ordre de lectura dins de la vinyeta, lluny de les cares i de les zones que marca la imatge, i n'adreça el rabet a la boca de qui parla. Dues línies seguides del mateix personatge s'uneixen en una sola bafarada de dos lòbuls. El text no s'encongeix mai per cabre: una bafarada que no hi cap canvia de forma, es mou o s'assenyala al tauler Revisió.

La tira de :ref{id="guide-strip"} s'ha retolat així. Els seus tres dibuixos no porten paraules; el diàleg són tres línies de Markdown d'aquest capítol, i cada edició d'aquesta guia el retola en la seva llengua.

:::strip{split="* | * | *" span=page placement=top caption="Una tira retolada pel motor. Els dibuixos són comuns a totes les edicions d'aquesta guia; les bafarades s'escriuen al Markdown de cada edició." type=figure id=guide-strip}
::panel{art=strip-proof}
editor: L'edició alemanya passa una línia a la pàgina 212.
::panel{art=strip-screen}
designer: Doncs estreny el paràgraf, no la pàgina.
::panel{art=strip-book}
sfx: FRRRT
:::

## Sentit de lectura i traducció

Un còmic occidental es llegeix d'esquerra a dreta; un manga i un còmic àrab, de dreta a esquerra. Postext pren la direcció de la llengua de l'edició: una edició àrab o japonesa disposa les vinyetes de cada pis des de la dreta, emmiralla les cantonades i les inclinacions i enquaderna el llibre per la dreta, mentre que les imatges es queden tal com es van dibuixar. Les bafarades japoneses es retolen en columnes verticals, amb la puntuació girada per a la columna.

Una traducció és el mateix Markdown amb altres paraules. Les imatges, els retalls i les marques es comparteixen; cada edició mesura el seu text i col·loca les seves bafarades. El castellà ocupa aproximadament una cinquena part més que l'anglès i el xinès molt menys, i les bafarades canvien de mida amb ells, sense que ningú les mogui a mà.

## Pàgines, plecs i tires

Un còmic pot omplir una pàgina, estendre's per dues pàgines enfrontades en una panoràmica o anar dins del text com una **tira**, de l'amplada d'una columna o de la pàgina, com la tira diària d'un diari. Una tira es comporta com una figura: es pot numerar i portar peu, es pot citar amb \`:ref\` i pot flotar al cap o al peu d'una pàgina. Les receptes de diaris del Receptari componen així les tires, entre articles.

## La música com a text

:index{term="notació musical"}Una partitura s'escriu al capítol com un bloc tancat de notació, igual que el codi en un llibre tècnic. Postext llegeix quatre formats: **ABC**, compacte i fàcil d'escriure, per a melodies i cançons; **MusicXML**, que exporten els programes de notació que fan servir els músics; **MEI**, per a edicions crítiques; i **Humdrum**, per a corals i anàlisi. El motor grava la música amb Verovio, la biblioteca de gravat de la Music Encoding Initiative, a l'amplada de la columna.

La melodia de sota s'ha escrit en cinc línies d'ABC al Markdown d'aquest capítol. El motor la grava i la compon com una fórmula destacada, a la retícula de base, i el text continua després.

\`\`\`abc {alt="Una melodia breu en sol major, en compàs de tres per quatre"}
X:1
M:3/4
L:1/8
K:G
D2 | G2 B2 d2 | c2 A2 F2 | G4 B2 | A4 D2 | G2 B2 d2 | e2 c2 A2 | G6 |]
\`\`\`

Una partitura llarga es talla en **sistemes**, les línies de música que segueix qui llegeix, i els sistemes continuen de columna en columna i de pàgina en pàgina com les línies d'un paràgraf, sense tallar mai un pentagrama. Un exemple musical que el text cita pot ser un recurs, numerat i amb peu com una figura. L'aspecte de la música és un ajust: la mida dels pentagrames, la font musical, els números de compàs i els marges al voltant d'una partitura, amb estils amb nom per als exemples més petits dins d'un requadre.

La música és opcional. El gravador pesa uns quants megabytes i només el carreguen els llibres que contenen notació, de manera que una novel·la no el paga mai. Les partitures es dibuixen com a vectors al canvas, a l'HTML i al PDF, s'etiqueten com a figures amb el seu text alternatiu al PDF accessible i passen a l'EPUB.

# Exercicis i cursos {#exercises lead="Un llibre de text demana a qui el llegeix que faci alguna cosa: triar, completar, relacionar, escriure. Postext llegeix les preguntes i les respostes del Markdown, imprimeix l'exercici per a l'alumne i deixa que les edicions en pantalla el corregeixin." summary="Tipus d'exercici, solucionaris, solucions, edicions en pantalla i SCORM"}

Els exercicis d'un llibre escolar són de les pàgines més feixugues de compondre a mà. Cada buit ha de ser prou llarg per escriure-hi i no ha de delatar la resposta per la llargada, les opcions d'una pregunta porten les etiquetes a l'estil de la col·lecció, el solucionari del final ha de coincidir amb les preguntes del principi, i l'edició del professor imprimeix les mateixes pàgines amb les respostes posades. Tot això es dedueix de dues coses: quina és la pregunta i quina és la resposta. Postext no demana res més.

## Un exercici al Markdown

:index{term="exercicis"}Un exercici és un bloc entre \`:::exercise\` i \`:::\`. Els primers paràgrafs són l'enunciat; el que segueix és la pregunta, escrita en un Markdown que un professor podria escriure sense manual. Una llista de tasques amb les opcions correctes marcades és una pregunta de resposta múltiple. Les paraules entre claudàtors dobles són buits, i les paraules de dins en són les respostes. Les parelles unides per una fletxa són un exercici de relacionar. El motor dedueix el tipus d'exercici del que hi troba, i un atribut \`type\` el diu quan el contingut no n'hi ha prou.

Els tres exercicis de sota tracten d'aquest llibre. S'han escrit al Markdown d'aquest capítol en unes quantes línies cadascun, i el motor els ha numerat, n'ha etiquetat les opcions, n'ha dibuixat els buits i n'ha compost les caixes.

:::exercise{level=1}
Quina d'aquestes coses decideix la configuració, i no el Markdown?

- [ ] Les paraules d'un títol
- [x] El color de la banda del capítol
- [ ] Quina figura esmenta un paràgraf
:::

:::exercise{bank level=2}
Completa les frases amb les paraules del requadre.

1. Una figura flota fins al primer espai lliure després de la seva [[menció]].
2. El motor talla un paràgraf [[sencer]], no línia a línia.
3. Una pàgina composta omple els marcs d'una [[plantilla]].

::bank[marge | columna]
:::

:::exercise{level=2}
Relaciona cada sortida amb el seu destí.

- PDF/X -> La impremta
- EPUB -> Un lector de llibres electrònics
- SCORM -> Un curs en una plataforma d'aprenentatge
:::

## Dotze tipus

Postext coneix dotze tipus d'exercici, prou per a la major part del que imprimeix un llibre de text: resposta múltiple i vertader o fals; buits, amb banc de paraules o sense, i opcions dins de la línia; relacionar, classificar en grups, ordenar elements o les paraules d'una frase; marcar paraules en un text; preguntes obertes amb línies o una zona pautada on escriure; sopes de lletres i mots encreuats, les graelles dels quals construeix el motor a partir de la llista de paraules; i operacions en columna, per a l'aritmètica. Els elements es barregen quan el tipus ho demana, sempre de la mateixa manera, perquè el PDF, la pantalla i el solucionari coincideixin.

Un nivell de dificultat s'imprimeix com a punts després del número, unes icones d'activitat poden marcar els exercicis que es fan en parella o en veu alta, i el primer element es pot imprimir resolt com a model. L'aspecte de cadascuna d'aquestes coses és un **estil d'exercici**: la insígnia del número, les etiquetes de les opcions, l'aspecte d'un buit, la pauta d'una zona d'escriptura, la caixa que envolta l'exercici, presa dels estils de requadre del llibre.

## Respostes i solucions

Cada exercici avaluable té un **solucionari** fet a partir de les seves respostes: l'opció correcta, els buits per ordre, les parelles. Un bloc \`:::solution\` dins d'un exercici hi afegeix una solució desenvolupada en qualsevol Markdown. On s'imprimeixen és un ajust de tot el llibre: enlloc, just després de cada exercici, cap per avall a sota com fan els llibres de passatemps, al final del capítol, en un punt del capítol que les demani o en un capítol de solucions al final del llibre. Aquesta guia reserva les respostes per a la pantalla.

L'**edició del professor** és el mateix llibre amb un ajust canviat: cada resposta impresa al seu lloc, en el color d'un bolígraf de corregir, els buits omplerts, les opcions encerclades, les línies de relacionar dibuixades.

## En pantalla

A la vista HTML i en un EPUB, els exercicis es poden respondre. Qui llegeix escriu als buits, marca opcions i traça les línies de relacionar, i després comprova les respostes, demana una pista, mira la solució o torna a començar. Les respostes correctes i les errònies es marquen amb un color i un signe i s'anuncien als lectors de pantalla, i les respostes es desen al navegador, de manera que qui llegeix les retroba a la visita següent.

:::callout{type="try"}
Obre la vista HTML en aquest capítol i respon els tres exercicis. Comprova'ls i després passa a la vista PDF: els mateixos exercicis, compostos per al llapis de l'alumne.
:::

## Cursos

:index{term="SCORM"}Un llibre amb exercicis es pot convertir en un curs. La vista **SCORM** del Sandbox empaqueta els capítols i les seccions que triïs en un paquet SCORM, el format que llegeixen les plataformes d'aprenentatge com Moodle. Cada part del llibre que segueix la plataforma informa d'una nota, a partir dels exercicis ben resolts; de si està completa, amb totes les pàgines vistes i tots els exercicis comprovats; i de si està aprovada, segons una nota mínima que fixa el llibre. Una prova pot limitar quantes vegades es comprova un exercici, quantes vegades es torna a començar i quan apareix la solució.

El paquet porta el llibre tal com el mostra la vista HTML, maquetat pel mateix motor, de manera que el curs s'assembla al llibre imprès que els alumnes tenen damunt la taula.

:::part{number="IV" title="La pràctica" palette="band=#c0452f"}
12. Escriure per a Postext
13. El Sandbox
14. Sortida: canvas, HTML, PDF i EPUB
15. Proves i impremta
16. El llibre en 3D
17. Eines al voltant del motor
18. Full de ruta i comunitat
:::

# Escriure per a Postext {lead="Tot aquest llibre s'ha escrit en Markdown corrent amb un grapat d'extensions. Es llegeixen bé en qualsevol editor de text i diuen què és el text, mai on va." summary="Markdown, directives, requadres i estils de paràgraf"}

Els documents de Postext són, abans de res, Markdown.:index{term="Markdown"} Qui sap Markdown pot escriure per a Postext des del primer dia; les extensions només apareixen on un llibre necessita alguna cosa per a la qual Markdown no va tenir mai paraules.

## Markdown corrent

Títols d'un a sis coixinets, paràgrafs, cites en bloc, llistes amb pics, numerades i de tasques —niades amb dos espais per nivell, fins a cinc nivells— i matemàtiques destacades entre dobles signes de dòlar. En línia, la negreta i la cursiva de sempre, més superíndexs entre accents circumflexos, com a 10^-8^, subíndexs entre titlles, com a H~2~O, matemàtiques en línia entre signes de dòlar i barres inverses per escriure caràcters literals.

Convé conèixer alguns detalls. Les línies consecutives d'un paràgraf s'uneixen, de manera que els salts de línia de l'original no arriben mai a la pàgina; un paràgraf nou necessita una línia en blanc. Les llistes toleren una sola línia en blanc entre elements, però dues línies en blanc les acaben. Les llistes ordenades conserven el número amb què comencen, de manera que una llista pot començar en 0 o en 5. I un títol pot forçar un salt de línia en el seu text amb dues barres inverses, cosa que només afecta els dissenys que imprimeixen el títol en gran —obertures i portadelles de part—, mentre que les capçaleres, l'índex i els marcadors del PDF el mantenen en una sola línia.

Una part de Markdown es deixa fora expressament, perquè un llibre té altres maneres de dir-ho: les imatges són recursos i no dibuixos en línia, les taules són recursos amb un model i no taules de barres, i l'HTML en brut no significa res en una pàgina impresa. Els enllaços funcionen a la vista HTML i al PDF, i el codi en línia entre accents greus es compon amb el tipus de codi del llibre, com la sintaxi que cita aquest llibre.

## Ressaltats, versaletes i tabulacions

Tres marques més canvien l'aspecte de les paraules sense sortir de la línia. \`:mark[…]\` posa una banda de color darrere d'una frase, :mark[tal com un llibre de text ressalta el que importa], i les paraules que queden a sota es continuen tallant, partint i justificant com les del voltant, de manera que marcar un llibre acabat no en mou cap pàgina. \`:smallcaps[…]\` compon les minúscules com a versaletes, com :smallcaps[Hamlet] al repartiment d'una obra de teatre o una sigla com :smallcaps[unesco], fetes amb les majúscules del mateix tipus de lletra i iguals a totes les sortides. I \`:tab\` envia la resta d'una línia a una tabulació que fixa la configuració: un preu al final de la mesura darrere d'una filera de punts, o la puntuació d'una pregunta d'examen al marge.

## Directives i contenidors

Tota la resta s'expressa amb un petit vocabulari de directives, recollit a :ref{id="document-format"}. Les directives d'una línia comencen amb tres dos punts i actuen al punt on apareixen. Els contenidors embolcallen blocs entre una línia d'obertura amb atributs i una línia de tancament amb tres dos punts; es poden niar, i un que no s'ha tancat es tanca al final del capítol, amb un avís.

Els valors dels atributs poden anar entre cometes dobles o simples, o sense cometes quan són una sola paraula, i una clau sense valor és un indicador. Una directiva que el motor no coneix no es descarta en silenci: s'imprimeix com un paràgraf, perquè res no desaparegui, i el tauler Revisió l'assenyala amb el seu capítol i la seva línia. El mateix passa amb un estil de requadre o un estil de paràgraf que la configuració no defineix. Els requadres, les notes a peu de pàgina i l'índex també s'escriuen amb directives; tenen un capítol propi, :ref{id="boxes"}.

## Esmentar recursos

Les referències mereixen una mirada més atenta, perquè amb elles s'escriu la major part de l'aparell d'un llibre. \`:ref{id="…"}\` imprimeix per defecte l'etiqueta abreujada i el número —_Fig. 5.1_ a l'edició catalana d'aquest llibre— i incorpora el recurs la primera vegada que apareix. Un atribut \`style\` imprimeix només el número o l'etiqueta completa, _Figura 5.1_; \`case\` passa l'etiqueta a minúscules, a majúscules o a majúscula inicial, perquè una referència a principi de frase es llegeixi bé; i \`text\` imprimeix qualsevol text sense deixar d'incorporar i enllaçar el recurs. Una referència a un identificador que no existeix imprimeix un signe d'interrogació i un avís, de manera que les referències trencades es troben abans que el llibre vagi a impremta.

\`::resource{id="…"}\`, en una línia pròpia, insereix un recurs en aquell punt exacte quan la seva col·locació diu _here_; altrament, compta simplement com una menció. Aquest llibre no el fa servir enlloc i deixa flotar totes les figures, que sol ser la millor elecció.

## Referències creuades i cites

:index{term="cites"}El mateix \`:ref\` anomena qualsevol lloc del llibre:index{term="referències creuades"} que porti un identificador: un títol escrit \`## Método {#metodo}\`, un requadre obert amb \`{#id}\` o una frase marcada \`[estas palabras]{#clave}\`. Imprimeix _secció 3.2_ o _capítol 4_, el títol amb \`style=title\` o la pàgina amb \`style=page\`, i la pàgina és la correcta perquè el motor torna a compondre el llibre fins que no canvia. Cadascuna d'aquestes referències és un enllaç al PDF, a l'HTML i en aquestes previsualitzacions.

Les obres es citen com ho fa Pandoc: entre claudàtors, \`[@garcia2020, pág. 33]\`, o dins de la frase, \`@garcia2020\`, amb les referències al front matter o en un bloc \`:::references\` de BibTeX. L'estil de cita és un ajust, no una propietat del text: APA, Chicago, MLA, IEEE, Vancouver, ISO 690, GB/T 7714 o un estil propi, que es tria a Disseny › Cites, on una previsualització mostra el resultat. La bibliografia va després de l'últim capítol, o allà on s'escrigui \`:::bibliography\`.

## Enllaços en paper

:index{term="enllaços"}Un enllaç al web s'escriu com en qualsevol Markdown, \`[paraules](https://…)\`, i continua sent un enllaç allà on el lector el pot seguir: aquestes previsualitzacions, l'HTML, el PDF i l'EPUB. En paper només se'n veurien les paraules. \`links.print\` decideix què afegeix la pàgina impresa: res, l'adreça entre parèntesis després de les paraules (\`'inline'\`) o una nota (\`'notes'\`) amb l'adreça, un codi QR que obre el mòbil, o totes dues coses. Les notes d'enllaç prenen la numeració i l'estil de les notes a peu de pàgina. Aquest llibre imprimeix l'adreça abreujada i el codi, com mostra la nota d'aquest enllaç al [repositori de Postext](https://github.com/drnachio/postext).

## Matemàtiques a l'original

Les matemàtiques s'escriuen en notació LaTeX. Les fórmules en línia van entre signes de dòlar senzills, enmig d'una frase; les fórmules destacades van entre dobles signes de dòlar, en una línia pròpia o com un bloc de diverses línies. Un signe de dòlar que s'hagi d'imprimir com a tal s'escapa amb una barra inversa. Una fórmula que no es tanca mai, o que MathJax no pot llegir, s'assenyala al tauler Revisió i se substitueix a la pàgina per un marcador vermell, perquè no es pugui colar al PDF sense que ningú se n'adoni.

## Codi

Un fragment de codi més llarg és un **llistat**, escrit entre dues línies de tres accents greus. Tot el que hi ha a dins es conserva tal com s'ha escrit, espais i línies en blanc inclosos, i res no s'hi llegeix com a Markdown. La paraula que segueix els accents d'obertura anomena el llenguatge, i el motor acoloreix les paraules clau, les cadenes, els números i els comentaris d'una dotzena de llenguatges; els atributs hi afegeixen un títol, números de línia i un fons tenyit darrere de les línies que importen:

\`\`\`js {title="chapter.js" lineNumbers highlight="4"}
import { buildDocument } from 'postext';
import { renderToPdf } from 'postext-pdf';

const doc = buildDocument(markdown, config);
const pdf = await renderToPdf(doc, { fontProvider });
\`\`\`

Una línia més ampla que la seva columna passa a la línia de sota amb una petita marca, o tot el llistat es compon una mica més petit, o la línia es talla a la vora, segons digui l'estil de codi, a Disseny › Tipografia › Codi. Un llistat llarg es parteix entre línies com un requadre, sense deixar mai menys de dues línies a cada costat, i un bloc de codi també pot ocupar l'amplada de la pàgina o flotar al cap o al peu d'una columna.

## Estils de paràgraf

\`:::paragraphs{style="…"}\` aplica un estil de paràgraf amb nom als paràgrafs que embolcalla: un epígraf, una dedicatòria, una bibliografia, un colofó. Un estil pot canviar el tipus de lletra, el cos, l'interlineat, el color, l'alineació —també centrada i a la dreta—, el sagnat i l'espaiat. La signatura que tanca l'últim capítol d'aquest llibre n'és un. Un estil també pot obrir el seu primer paràgraf amb una **caplletra**, una inicial que ocupa dues o tres línies, i l'atribut \`dropcap\` d'un títol l'activa o la desactiva per al paràgraf que el segueix.

## Escriure bé per al motor

Uns quants costums faciliten la feina del motor i milloren les pàgines. Introdueix cada llista amb una frase, perquè la llista no sigui mai el primer que hi ha sota un títol; el tauler Revisió pot assenyalar les que ho són. Mantén els títols en ordre, sense saltar-te nivells. Esmenta cada figura i cada taula al text, a prop d'on la vols: la menció decideix on pot anar el recurs i quin número rep. Deixa la col·locació a la configuració tret que un recurs necessiti de debò una posició pròpia. Marca els termes de l'índex allà on el text els tracta, no allà on només s'anomenen. I escriu un text alternatiu per a cada figura, perquè el PDF accessible l'ofereix als lectors que no poden veure la imatge.

## Metadades

Les metadades d'un llibre van en un bloc YAML al principi del seu primer capítol: títol, subtítol, autor i data de publicació, disponibles com a marcadors en tots els dissenys. La coberta d'aquest llibre n'imprimeix el títol i el subtítol. Qualsevol altra clau es desa per a l'aplicació que allotja el motor; les metadades dels capítols posteriors s'ignoren, amb un avís.
# El Sandbox {lead="El Sandbox és el motor amb un editor al voltant: la pàgina que estàs llegint, el Markdown del qual surt i cada ajust que li ha donat forma, l'un al costat de l'altre i en directe." summary="L'editor, els taulers, els projectes, els presets i compartir"}

Tot el que explica aquest llibre es pot provar ara mateix, sense escriure codi. El Sandbox no és una demo construïda sobre Postext: és el mateix motor, en una interfície pensada per a dos públics alhora, els qui desenvolupen i avaluen la biblioteca i els qui dissenyen i volen veure què fa cada opció.

## Un recorregut per la interfície

:index{term="Sandbox"}La interfície segueix la disposició d'un editor conegut, esbossada a :ref{id="sandbox-ui"}. Una **barra d'activitat** a l'esquerra canvia entre set taulers —Llibres, Capítols, Text, Recursos, Fonts, Disseny i Revisió, aquest últim amb el nombre d'assumptes pendents—. Una **barra lateral** redimensionable acull el tauler actiu; si fas clic a la icona activa, es plega. El **visor**, a la dreta, mostra la mateixa maquetació en sis pestanyes: Canvas, PDF, Folio, HTML, EPUB 3 i SCORM. La interfície està en anglès, castellà, català, francès, alemany, italià, portuguès del Brasil, xinès simplificat, japonès i àrab, i en àrab va de dreta a esquerra; l'ajust **Botons i camps grans** fa que cada control sigui més fàcil d'encertar amb el dit o amb una mà poc ferma.

La barra lateral i el visor comparteixen la finestra, i la frontera entre tots dos es pot arrossegar. Cada tauler i el visor recorden el seu estat entre visites: l'ampliació i el mode de vista del canvas, el mode de columnes de la vista HTML, els grups oberts al tauler Disseny. El tema i l'idioma de la interfície es canvien des del peu de la barra d'activitat, i l'idioma de la interfície és independent de la llengua del llibre.

## Editar un llibre

L'editor del tauler **Text** ressalta les metadades i les matemàtiques, i la seva barra d'eines insereix format, llistes, salts de pàgina i canvis de numeració. A la capçalera, un **selector de capítols** recorre els capítols del llibre i en mostra les pàgines; cada capítol conserva el seu propi historial de desfer i el seu cursor. L'editor i les pàgines se segueixen en els dos sentits: fer clic en una paraula de la pàgina hi porta el cursor al Markdown, i seleccionar text el ressalta a la pàgina. El tauler **Capítols** mostra el llibre obert d'una vegada, amb els capítols en ordre i les pàgines de cadascun.

La barra de sobre la previsualització canvia entre dues maneres de treballar. En mode **Contingut** s'edita el text, al tauler Text i a les pàgines; en mode **Disseny** s'editen els estils i les plantilles de pàgina, i un clic a la pàgina tria l'estil o el marc que ha dibuixat el que hi ha sota el punter. Un segon clic al mateix lloc puja un nivell, d'una paraula al seu paràgraf, al seu requadre i a la seva pàgina, i :chip[⌘ Z] desfà l'últim canvi de qualsevol de les dues menes, una paraula escrita o un ajust modificat, des d'un sol historial.

A més, l'editor vigila el llibre sencer. El seu menú de capítols llista cada capítol amb les pàgines que ocupa tan bon punt es coneixen, i passar a un altre capítol hi canvia les previsualitzacions. Els capítols es poden crear, reanomenar, reordenar, dividir pels seus títols de primer nivell o fusionar amb l'anterior, i el capítol sencer es pot exportar com a fitxer Markdown o substituir per un altre. Un llibre de cent vint capítols funciona com un de curt: el menú els llista sota les seves parts i, a partir de trenta, s'obre amb un camp de cerca que troba un capítol pel número o per una paraula del títol.

## Configuració

El tauler **Disseny** edita la configuració completa —més de cinc-cents camps— per grups: pàgina i columnes, escriptura, colors, tipografia, títols i índex, llistes, figures i taules, requadres, exercicis, còmic, capçaleres i peus, parts, exportació, Folio (el llibre en 3D) i el grup Avançat. Un cercador troba qualsevol opció pel nom, i el filtre **Canviats** mostra el que difereix dels valors per defecte. Cada camp i cada secció es poden restablir per separat, i la configuració es pot exportar i importar com a fitxer. En un llibre amb diverses llengües, un interruptor a la capçalera del tauler tria entre els ajustos que comparteixen totes les edicions i els de l'edició que hi ha en pantalla, com explica :ref{id="languages"}.

## Les sis vistes

La vista **canvas** és la previsualització de treball: amplia des d'un quart de la mida real fins a quatre vegades, ajusta la pàgina a l'amplada o a l'alçada del visor i mostra pàgines soltes o plecs, amb la primera pàgina sola com a pàgina senar, tal com s'obre un llibre imprès. La vista **PDF** genera un PDF real al navegador i el mostra al visor del mateix navegador, amb botons per generar-lo de nou, baixar-lo i imprimir-lo. La vista **Folio** mostra el llibre enquadernat i obert sobre una taula, en tres dimensions, amb fulls que es passen amb la mà; té un capítol propi, _El llibre en 3D_. La vista **HTML** mostra la mateixa maquetació com a HTML posicionat, aïllat de la resta de la pàgina, amb un control de la mida del text i dos modes de lectura: una columna que es desplaça o tantes columnes com càpiguen a la pantalla. La vista **EPUB 3** genera al navegador un llibre electrònic amb una de dues maquetacions: la **fixa** conserva les pàgines impreses línia a línia, amb text real que es pot seleccionar i cercar; la **fluida** deixa que el text s'adapti a la pantalla i a la mida de lletra de qui llegeix. Un petit lector dins de la pestanya mostra el fitxer que estàs a punt de baixar: les tecles de fletxa, lliscar el dit al mòbil o els botons en passen les pàgines, una llista porta a qualsevol capítol, i un llibre de maquetació fluida es pot llegir amb la lletra més gran o més petita. La vista **SCORM** converteix en un curs per a una plataforma d'aprenentatge com Moodle els capítols i les seccions que marquis en un arbre del llibre, amb pàgines fixes o amb text fluid; els exercicis envien les notes a la plataforma.

Les vistes canvas, HTML i Folio poden maquetar el capítol actual o el llibre complet; el PDF té la seva pròpia elecció, de manera que es pot corregir ràpidament un sol capítol mentre les previsualitzacions mostren el llibre; l'EPUB i el paquet SCORM sempre es maqueten a partir del llibre complet. Aquesta guia s'obre en el mode de llibre complet. Un llibre compost en vertical, com l'edició xinesa d'aquesta guia, es llegeix a la vista HTML només pàgina a pàgina, perquè en una única columna que es desplaça les seves línies quedarien ajagudes.

## Al mòbil

Per sota de l'amplada d'una tauleta, el Sandbox es reorganitza. La barra de taulers passa al peu de la pantalla, un tauler obert cobreix la previsualització en lloc de quedar-se al seu costat, i en tancar-lo la previsualització continua a la pàgina que mostrava. Les barres d'eines de les previsualitzacions es col·loquen al llarg de la vora inferior, on arriba el polze, i passen a una segona fila quan la pantalla és estreta. Un mòbil no pot mostrar un PDF dins d'una pàgina, així que la vista PDF ofereix obrir el fitxer; i com que un mòbil dona a una pestanya del navegador menys memòria de la que necessita un llibre en tres dimensions, allà no hi apareix la vista Folio.

## Recursos i fonts

El tauler **Recursos** llista els recursos del llibre per tipus. Les imatges i els fitxers SVG s'hi poden arrossegar, les taules s'editen en un editor de tipus full de càlcul amb cel·les combinades, emplenaments, imatges, amplades de columna i enganxament des d'un full de càlcul, i el text d'un diagrama SVG es pot editar al seu lloc. Si fas clic en un peu, una nota, una cel·la o el text d'un diagrama de la previsualització, s'obre al tauler. El tauler Fonts afegeix famílies pròpies, pes a pes, en els formats web i d'escriptori habituals; una família pròpia té prioritat sobre una font de Google amb el mateix nom.

Cada recurs té una vista de detall amb el seu identificador, el seu tipus, el seu peu, la seva nota i el seu text alternatiu, la seva col·locació —posició, amplada de columna, gir, amplada, alineació i un peu al costat— i una previsualització en directe. Esborrar un recurs avisa quan el text encara l'esmenta. El tauler Fonts, per la seva banda, comprova que cada família que anomena la configuració tingui els pesos i els estils que necessita, i avisa de les variants que falten o estan duplicades.

## Avisos

El tauler **Revisió** llista tot el que el motor ha detectat en compondre el llibre: fonts que no s'han carregat, línies massa espaiades, nivells de títol que se salten, contenidors sense tancar i directives desconegudes, estils que no existeixen, marcadors que no imprimeixen res, recursos que falten i requadres massa alts per a la seva columna. Cada avís indica el capítol i la línia, i amb un clic t'hi porta.

## Projectes, presets i compartir

La teva feina es desa al navegador mentre escrius. Els **projectes** són llibres desats localment, a **Els meus llibres** dins del tauler **Llibres**, cadascun amb el seu nom, la seva descripció i la seva imatge de coberta; es poden duplicar, exportar i importar. Els **presets** són llibres de només lectura des dels quals començar, a **Llibres d'exemple**: aquesta guia i una galeria d'edicions de mostra —una revista d'astronomia, un _Quixot_ il·lustrat, una revista de medi ambient, un catàleg d'exposició, dos manuals universitaris, _Somni del pavelló vermell_ en xinès, _Les mil i una nits_ en àrab, enquadernat per la dreta, i _El paradís perdut_ anotat, amb les làmines de Doré—, cadascuna amb un disseny propi. **Fer una còpia pròpia** en converteix un en un projecte teu.

Els presets segueixen el seu origen. Quan un paquet de preset canvia al servidor, el Sandbox ho detecta en qüestió de segons: un preset sense tocar es recarrega sol, i un que has editat mostra un avís que ofereix recarregar-lo, de manera que la feina en curs no se sobreescriu mai. Cada preset es pot obrir en qualsevol de les seves llengües quan en té més d'una, com aquesta guia, que es pot llegir en anglès, castellà, català, francès, alemany, italià, portuguès del Brasil, xinès simplificat, àrab i japonès.

Un llibre viatja com un únic fitxer **.postext**: els seus capítols, la seva configuració, els seus recursos i les seves fonts, a més de la paginació ja calculada, de manera que s'obre paginat. Les receptes del Receptari s'obren al Sandbox de la mateixa manera, com a llibres teus; una recepta que ja havies obert abans et pregunta si vols **Obrir la meva còpia**, amb els teus canvis, o **Substituir per la versió publicada**. I la barra d'adreces conté sempre un enllaç permanent al que estàs veient: el llibre, la llengua, el visor, el capítol i la pàgina. L'enllaç es pot desar com a marcador per tornar més tard al punt exacte on eres: el Sandbox carrega el llibre i va directament al capítol i a la pàgina que indica. Els marcadors del navegador fan així de punts de llibre.

:::callout{type="try"}
Ves fins a una pàgina que t'agradi i copia l'adreça del navegador: en obrir aquest enllaç veuràs el mateix llibre, al mateix visor, a la mateixa pàgina.
:::

## Incrustar el Sandbox

El Sandbox també és un paquet, _postext-sandbox_, un component de React que qualsevol aplicació web pot incrustar. Qui l'allotja decideix el Markdown i la configuració inicials, l'idioma i les etiquetes de la interfície, d'on surten els presets que ofereix i si mostra el selector de tema, el de llengua i l'enllaç a la portada. El Sandbox que fas servir és exactament aquest component, incrustat al lloc web de Postext.

A més, el component publica a la pàgina les seves eines per a agents: un assistent que treballi al navegador pot obrir un llibre, editar-ne el text, canviar la configuració i llegir-ne els avisos amb les mateixes ordres que fa servir qui escriu. Cada eina respon amb el que mostra la interfície: les pàgines a què arriba cada capítol i els avisos del tauler Revisió. Una aplicació que incrusta el Sandbox també pot desactivar aquestes eines, i el capítol sobre les eines al voltant del motor les explica amb més detall, juntament amb la línia d'ordres i l'skill que adapta llibres existents.

# Sortida: canvas, HTML, PDF i EPUB {#output lead="Un arbre, quatre sortides. El canvas previsualitza, l'HTML es llegeix en pantalla, el PDF va a impremta i l'EPUB va al dispositiu de qui llegeix, i totes surten de la mateixa maquetació." summary="Els renderitzadors, el PDF accessible, els llibres EPUB i l'ús de la biblioteca"}

Com que tots els renderitzadors llegeixen el mateix VDT, la promesa de _el que veus és el que obtens_ és literal: els salts de línia, els límits de pàgina i la posició de cada figura coincideixen al canvas, a l'HTML i al PDF, i un EPUB de maquetació fixa també els conserva. Un EPUB de maquetació fluida renuncia expressament a la pàgina i conserva tota la resta del que ha resolt la maquetació: els números, les notes, les referències i els folis impresos. L'skill d'agent que adapta llibres existents a Postext revisa la seva feina amb aquestes sortides, com mostra :ref{id="skill-tutorial"}.

## Canvas

El renderitzador de canvas dibuixa una pàgina en un canvas HTML, a qualsevol resolució. Al Sandbox és la previsualització en directe, amb ampliació, ajust a l'amplada o a l'alçada, pàgines soltes o plecs, i pàgines que es dibuixen a mesura que entren a la pantalla, de manera que els llibres llargs continuen responent.

## HTML

El renderitzador HTML retorna HTML amb posicionament absolut i CSS editorial: cada línia on la va posar la maquetació, amb la seva font, el seu cos i la seva línia de base exactes. Una variant indexada indica quines parts de la pàgina han canviat, perquè un visor només apedaci aquestes. Al Sandbox, la pestanya HTML aïlla la sortida en un Shadow DOM i hi afegeix un mode de lectura amb una sola columna que es desplaça o amb tantes columnes com càpiguen a la pantalla, amb un control de mida de lletra. Un conjunt d'ajustos només per a pantalla pot adaptar el disseny a la lectura en pantalla sense tocar les pàgines impreses.

El renderitzador rep una funció que converteix l'identificador de fitxer d'un recurs en una URL, perquè les imatges es puguin servir des de qualsevol lloc, i un color de fons per a la pàgina. La seva sortida és marcatge i CSS sense cap script, apta per a allotjament estàtic.

## PDF

:index{term="PDF"}El paquet _postext-pdf_ converteix el VDT en un PDF real, d'un document o d'un llibre sencer. No torna a mesurar mai: les mètriques del canvas són la referència i el PDF només les transporta, per això les línies es tallen exactament als mateixos llocs. Sobre les pàgines hi afegeix marcadors a partir dels títols i les parts, etiquetes de pàgina que coincideixen amb els folis impresos, referències clicables, figures SVG com a vectors i una elecció d'espai de color —RGB, CMYK o escala de grisos— per a la impremta.

Les fonts arriben al PDF a través d'un **proveïdor de fonts**, una funció que retorna els bytes d'una família en un pes i un estil donats. El proveïdor del Sandbox baixa cares estàtiques de Fontsource, un fitxer per pes, i les descomprimeix des de WOFF2; les fonts pròpies vénen del tauler Fonts. El renderitzat informa del seu progrés, s'executa en un worker propi quan se li demana i accepta un llibre sencer com una llista de documents de capítol, del qual produeix un únic PDF amb etiquetes de pàgina contínues, marcadors i enllaços que porten d'un capítol a qualsevol altre. També hi són les pàgines en blanc que demana la paritat dels capítols, de manera que el PDF es pot enviar a impremta sense retocar-ne la paginació.

## Accessible per defecte

:index{term="PDF!accessible (PDF/UA)"}Tot PDF surt **etiquetat** per defecte, segons la norma PDF/UA-1: un arbre d'estructura amb títols, paràgrafs, llistes, taules i figures en ordre de lectura, text alternatiu per a cada figura, la llengua del document i els elements decoratius marcats com a artefactes perquè els lectors de pantalla se'ls saltin.

L'etiquetatge segueix la maquetació i no l'original. Els paràgrafs partits entre columnes i pàgines s'etiqueten com un sol paràgraf, les llistes mantenen junts els seus elements, les taules conserven les cel·les de capçalera i les figures porten el seu text alternatiu —o el seu peu, o la seva etiqueta, quan no s'ha escrit text alternatiu—. El títol i la llengua del document viatgen a les metadades, les capçaleres i els ornaments de pàgina es marquen com a artefactes, i les referències entre el text i les figures que esmenta són enllaços reals.

## Color per a impremta

Els colors de la configuració s'escriuen com a valors hexadecimals, opcionalment enllaçats a la paleta, i això és el que dibuixa el PDF per defecte. Un PDF també es pot forçar a CMYK per a la impressió òfset o a escala de grisos per a treballs a una tinta, i un llibre preparat per a la impremta va més lluny: un perfil ICC, PDF/X, un negre que s'imprimeix amb una sola tinta i un preflight de cada pàgina. Tot això és el tema de :ref{id="press"}.

## Llibres sencers

El PDF d'un llibre no és una concatenació de fitxers solts. El renderitzador rep la maquetació de cada capítol i escriu un únic document: les etiquetes de pàgina continuen d'un capítol a l'altre, els marcadors formen un sol arbre amb les parts per sobre dels seus capítols, i l'estructura accessible del llibre sencer és un únic arbre en ordre de lectura. Com que cada capítol es va maquetar com a continuació dels anteriors, les pàgines del capítol set al PDF del llibre són exactament les pàgines del capítol set imprès per separat.

## Les fonts al PDF

Postext incrusta cada tipus que ha fet servir la maquetació —un fitxer estàtic per pes i estil—, de manera que una paraula en negreta es compon amb la negreta real i una cursiva amb la cursiva real, mai amb una imitació inclinada o engruixida. Els tipus TrueType es redueixen als glifs que el llibre fa servir de debò, cosa que manté els fitxers lleugers fins i tot amb quatre famílies; els tipus OpenType amb contorns PostScript s'incrusten sencers, perquè alguns visors no en saben llegir els subconjunts. Cada font incrustada porta un mapa dels glifs als caràcters, lligadures incloses, de manera que en copiar una frase del PDF s'obté la frase que es va escriure.

Una família disponible només en WOFF no s'admet al PDF, perquè aquest format no es pot incrustar amb garanties; WOFF2, TrueType i OpenType funcionen.

## EPUB 3

:index{term="EPUB"}El paquet _postext-epub_ escriu un llibre maquetat com un fitxer EPUB 3, el format de les botigues de llibres electrònics, de les biblioteques i de les aplicacions de lectura. Llegeix els mateixos documents de capítol que el PDF d'un llibre sencer, de manera que els números de pàgina, les notes, les cites, les referències creuades, l'índex i l'índex analític hi arriben resolts, i retorna el fitxer com a bytes, sense cap servidor. L'EPUB defineix dues maquetacions, posades l'una al costat de l'altra a :ref{id="epub-renditions"}, i el generador produeix qualsevol de les dues a partir de la mateixa maquetació del motor.

La **maquetació fixa** conserva la pàgina impresa. Cada pàgina es converteix en un document propi, a la mida de la pàgina, amb el text on el posa el PDF i en les fonts del llibre, de manera que les columnes, els flotants, les capçaleres, les obertures i cada salt de línia es mantenen. El text continua sent text: es pot seleccionar, cercar i llegir en veu alta, i els enllaços del llibre —referències creuades, notes, l'índex imprès i l'índex analític— funcionen d'una pàgina a l'altra. Les pàgines s'aparellen en plecs com en el llibre imprès, i un llibre enquadernat per la dreta, en àrab o en xinès vertical, es passa de dreta a esquerra. És la maquetació adequada per als llibres les pàgines dels quals es dissenyen com a pàgines, un llibre il·lustrat, un manual, un catàleg o una revista, llegits en una pantalla gran.

## Llibres de maquetació fluida

Un llibre de **maquetació fluida** renuncia a la pàgina i conserva el text. Cada capítol es converteix en un sol document que el sistema de lectura torna a compondre per a la seva pantalla, amb el tipus de lletra, la mida i els marges que tria qui llegeix. El generador reconstrueix cada paràgraf a partir de les línies que ha compost el motor, treu els guionets que hi han afegit els salts de línia i conserva els que formen part de la paraula, de manera que un paràgraf partit entre dues columnes o dues pàgines torna a ser un sol paràgraf. Les figures i les taules segueixen el text que les cita, amb els seus peus numerats i el seu text alternatiu; les taules continuen sent taules de veritat, amb files de capçalera i cel·les combinades; els requadres passen a ser blocs complementaris amb el seu títol, i les notes enllacen amb el final del capítol i tornen al text. Cada pàgina impresa deixa una marca allà on comença el seu text, de manera que es pot trobar la pàgina 112 de l'edició impresa, i l'índex analític apunta a aquestes marques.

L'aspecte surt de la configuració. Un full d'estil derivat d'ella dona als títols, els requadres, les taules, els peus i les llistes les seves mides i els seus colors, relatius al text del cos, de manera que la mida de lletra que tria qui llegeix s'aplica a tot. Els paràgrafs compostos amb un estil de paràgraf el conserven, perquè la maquetació registra quin estil ha compost cada bloc, i els nivells de l'índex analític es distingeixen de la mateixa manera; un capítol configurat d'una altra manera, o una part que canvia el color del llibre, hi afegeix un segon full amb només les regles que canvien.

Totes dues maquetacions porten la mateixa navegació: un índex fet a partir dels títols i les parts, una llista de les pàgines impreses i punts de referència per a la coberta, l'índex imprès i el començament del text. S'hi incrusta cada família que anomena el disseny, tret que estigui marcada com a no redistribuïble, i cada imatge hi entra una sola vegada. Totes dues porten les metadades d'EPUB Accessibility 1.1 i passen sense cap error ni avís l'EPUBCheck del W3C, el validador que les botigues de llibres electrònics apliquen als fitxers que reben; així passa amb aquesta guia i amb tots els llibres d'exemple. Al Sandbox, la pestanya **EPUB 3** genera el fitxer en un worker, de manera que la pàgina continua responent mentre s'escriu un llibre llarg.

## Fer servir la biblioteca

El motor es distribueix a npm com a _postext_, per a la maquetació i els renderitzadors de canvas i HTML, amb un paquet per a cada sortida més pesant: _postext-pdf_ per al PDF, _postext-epub_ per a l'EPUB 3 i _postext-folio_ per al llibre en 3D. Tots són mòduls ES amb llicència MIT i també es poden importar directament des d'una CDN.

El motor de maquetació s'executa al navegador, on pot mesurar amb les fonts que veu el lector; _postext-pdf_ i _postext-epub_ també s'executen al navegador, i a més a Node, de manera que un PDF o un EPUB es poden produir en un servidor a partir d'una maquetació calculada en un altre lloc. Un llibre sencer fa el mateix camí: \`openBundle\` llegeix un fitxer .postext, \`buildBundle\` en maqueta els capítols per ordre, i el resultat passa directament a \`renderToPdf\` o a \`renderToEpub\`. Els tipus de TypeScript hi són inclosos, i alguns empaquetadors necessiten un ajust d'una línia per al descompressor WOFF2 que fa servir el paquet de PDF.

:::callout{type="note" title="Quatre passos"}
1. Carrega les fonts que anomena la configuració, perquè el navegador les pugui mesurar
2. Compila el document amb \`buildDocument(content, config)\`
3. Dibuixa'n les pàgines amb \`renderPage\` o genera-les amb \`renderToHtml\`
4. Per a impremta, passa el mateix document a \`renderToPdf\` amb un proveïdor de fonts; per a llibres electrònics, passa els capítols a \`renderToEpub\`
:::

## Pàgines com a imatges

Una pàgina no necessita un navegador per convertir-se en imatge. El renderitzador de canvas dibuixa en qualsevol canvas que parli la interfície de dibuix del navegador, i a Node ho fa un canvas precompilat: es maqueta el llibre, es dibuixa la pàgina i es codifica com a JPEG o PNG. Així revisa la seva pròpia feina l'skill d'agent que adapta llibres existents a Postext. Després de cada canvi a la configuració o al text torna a maquetar el llibre, dibuixa només les pàgines en què treballa i les llegeix com a imatges, en un segon o dos. El PDF es genera al final, per a les comprovacions que només un PDF pot respondre: les fonts incrustades, les imatges a la seva resolució, l'estructura etiquetada.

:ref{id="skill-tutorial"} mostra l'skill de principi a fi, des del PDF de referència fins a la revisió de cada pàgina que compon.

# Proves i impremta {#press lead="Un impressor fa preguntes diferents de les d'un lector. Té cada imatge prou definició a la mida impresa, el negre del text fa servir una sola tinta, arriba la il·lustració més enllà del tall? Postext les respon abans que el fitxer surti del navegador." summary="Revisió, contrast, color ICC, PDF/X, el negre i el preflight"}

Un llibre s'acaba dues vegades. S'acaba per a qui el llegeix quan el text és correcte i les pàgines tenen l'aspecte que han de tenir; s'acaba per a la impremta quan el fitxer obeeix les regles de la màquina que l'imprimirà. Postext guarda totes dues llistes al mateix lloc, de manera que un problema es veu quan encara hi ha temps d'arreglar-lo al Markdown o a la configuració.

## El tauler Revisió

:index{term="tauler Revisió"}Tot el que detecta el motor es reuneix al tauler **Revisió**, ordenat com ho atendria un editor de producció: primer les fonts, després les figures i les taules, el text i el marcatge, el disseny, el contrast, la composició, el preflight i el navegador. Cada entrada indica el capítol i la línia, i un clic t'hi porta. Quines comprovacions s'executen és un ajust, a Disseny › Avançat › Avisos, perquè un llibre pugui silenciar un avís que accepta a consciència.

Algunes comprovacions tracten del text: una línia fluixa, un nivell de títol saltat, una directiva desconeguda, un requadre massa alt per a la seva columna. D'altres tracten del disseny i vénen de les **regles de composició**, descrites a :ref{id="columns"}, que una configuració posa a _allow_, _warn_ o _avoid_. Una regla en _warn_ deixa la pàgina en pau i afegeix una entrada; en _avoid_, el motor canvia la pàgina i no s'avisa de res.

## Contrast

:index{term="contrast"}La comprovació de contrast mesura cada parell de colors de text i de fons que fa servir el llibre, inclòs el text dels requadres, dels peus, de les capçaleres i dels dissenys, i assenyala els parells per sota del nivell demanat: AA o l'AAA, més estricte, de les pautes d'accessibilitat. Pot jutjar els colors tal com els mostra una pantalla, tal com s'imprimiran o de les dues maneres. Al tauler Disseny, cada camp de color mostra el seu contrast més baix al costat de la mostra, de manera que un canvi de paleta ensenya el seu cost abans de maquetar res.

Un text blanc calat sobre una banda fosca s'imprimeix com l'absència de quatre tintes posades l'una sobre l'altra, i els traços fins s'omplen quan el registre de la màquina es desvia un pèl. La comprovació assenyala el text calat massa petit o massa prim per a la impremta.

## Color que entén una impremta

Els colors d'una configuració s'escriuen per a la pantalla, i camí de la impremta s'han de convertir a les quatre tintes de la condició d'impressió: un paper, una màquina, una norma. Aquesta conversió és el que descriu un **perfil ICC**:index{term="perfils ICC"}, i Postext en porta quinze, des de FOGRA39 i FOGRA51 per al paper estucat a Europa fins a GRACoL i SWOP per a l'Amèrica del Nord, amb FOGRA39 per defecte.

La conversió la fa el mateix Postext, al navegador, amb una intenció de representació, relativa o perceptual, i compensació del punt negre. Les imatges també es poden convertir, de manera que una fotografia del PDF ja és en les tintes de la impremta, i un **límit de tinta** limita la cobertura total de les quatre tintes allà on el paper no s'assecaria. Els ajustos d'impressió no mouen mai una línia: la maquetació no els llegeix, i només actuen al PDF, a la previsualització d'impressió i al preflight.

## PDF/X

Les impremtes demanen **PDF/X**:index{term="PDF!PDF/X"} perquè elimina les conjectures. Un fitxer PDF/X diu per a quina condició d'impressió es va fer, incrusta totes les fonts, porta les caixes de tall i de sang i deixa fora tot el que una impremta no pot fer servir, com els enllaços. Postext escriu les dues versions que més demanen les impremtes. PDF/X-1a és la conservadora: només quatre tintes i gris, sense transparència. PDF/X-4 conserva la transparència i és l'elecció habitual avui. Totes dues es trien a Disseny › Exportació › Preparació per a impremta, o amb l'opció \`--pdfx\` de la línia d'ordres.

Un llibre per imprimir també necessita **sang**:index{term="sang"}: les imatges i les bandes que surten de la pàgina han de passar uns quants mil·límetres més enllà del tall, perquè una fulla desviada un pèl no deixi mai una vora blanca. Els ajustos de les línies de tall afegeixen la sang i dibuixen marques de tall a les cantonades.

## El negre

El text del cos s'ha d'imprimir només amb tinta negra, perquè el text compost amb quatre tintes es desdibuixa tan bon punt les planxes se separen. Els grisos i els negres es poden limitar a la tinta negra, i el negre sòlid es pot **sobreimprimir**, posat damunt del que hi ha a sota, perquè no aparegui mai un fil blanc al voltant d'una lletra negra sobre una banda de color. Les grans superfícies negres són el cas contrari: una sola tinta hi queda apagada, així que un **negre enriquit** hi afegeix:index{term="negre enriquit"} les altres tres tintes a sota, a partir d'una mida que el text no assoleix mai.

## Preflight

:index{term="preflight"}Abans que un fitxer vagi a impremta, la preimpressió hi fa un **preflight**: una lectura automàtica de cada pàgina contra les regles de la feina. Postext fa el seu sempre que un llibre està preparat per imprimir, amb una norma PDF/X, un PDF en CMYK o marques de tall, i llista les troballes al tauler Revisió. Assenyala les imatges per sota de 300 píxels per polzada a la mida impresa, i per sota de 150 com a crítiques; les imatges que encara són en RGB; els filets més prims d'un quart de punt; el text petit en diverses tintes; la tinta per sobre del límit; el text massa a prop del tall, i la il·lustració que s'atura just abans del tall, quan s'hauria de mantenir lluny d'ell o entrar a la sang.

El mateix preflight funciona fora del Sandbox. L'ordre \`check\` de la línia d'ordres acaba amb un codi d'error quan troba un problema crític.

:::callout{type="try"}
Obre Disseny › Exportació › Preparació per a impremta, tria PDF/X-4 i activa les marques de tall. El tauler Revisió guanya un grup Preflight; la vista PDF dibuixa ara la sang i les marques al voltant de cada pàgina.
:::

## Una prova en pantalla

La **previsualització d'impressió** mostra:index{term="previsualització d'impressió"} les pàgines tal com les imprimirà la màquina. Cada color se separa amb el perfil de la feina i es torna a dibuixar sobre el blanc del paper, negres enriquits inclosos; un llibre en escala de grisos es veu només amb tinta negra. Les guies i els contorns desapareixen. És un interruptor de la barra d'eines de la vista Canvas, compartit amb la vista Folio.

## El PDF accessible i l'imprès

El PDF per a la impremta i el PDF per als lectors poden ser el mateix fitxer. L'estructura etiquetada que fa accessible un PDF, descrita a :ref{id="output"}, conviu amb les regles de PDF/X sense conflicte; només desapareixen els enllaços, perquè una norma d'impressió no els admet.

# El llibre en 3D {lead="Una maquetació és un conjunt de pàgines, però un llibre és un objecte: un paper d'un cert gramatge i color, una enquadernació que obre d'una certa manera, un gruix que nota la mà. La vista Folio mostra les pàgines com aquest objecte abans d'imprimir res." summary="La vista Folio, els papers, les enquadernacions, les cobertes i la llum"}

Les proves en pantalla són planes. Un plec vist com dos rectangles no diu res de com serà el llibre obert sobre una taula: si el llom s'empassa el marge interior, si una làmina en paper brillant recull la llum, si tres-centes pàgines de paper ossi formen un bloc massa gruixut per a l'enquadernació. La vista **Folio** respon aquestes preguntes amb les pàgines que Postext ja ha compost. Mostra el llibre enquadernat, obert sobre una superfície, il·luminat, amb fulls que es corben i es passen amb la mà.

Res del que s'hi veu no és una segona maquetació. Les pàgines són les que pinta el canvas, dibuixades als píxels exactes de la pantalla, així que el text a Folio és tan nítid com a la vista Canvas i el mateix línia a línia. El que Folio afegeix és tot el que envolta les pàgines: el paper, l'enquadernació, les cobertes, la taula i la llum. Tot surt d'una part de la configuració, \`folio\`, que la maquetació no llegeix mai. Canviar el paper o l'enquadernació torna a dibuixar el llibre a l'instant i no mou ni una línia.

## Passar les pàgines

:index{term="Folio"}Una pàgina es passa com es passa una pàgina: s'agafa per la vora i s'arrossega a l'altre costat. Si la deixes anar passada la meitat, cau a l'altre costat; si la deixes anar abans, torna al seu lloc. Un clic en una pàgina també la passa, endavant a la pàgina dreta i enrere a l'esquerra, i el mateix fan les fletxes de la barra d'eines i, quan el llibre té el focus, les tecles de fletxa, Re Pàg i Av Pàg, Inici i Fi. El camp de pàgina de la barra d'eines admet un número de pàgina i porta el llibre a aquell plec.

Cada full es corba segons el seu paper. El paper bíblia, fi, s'enrotlla en una corba tancada i deixa veure el que hi ha imprès a l'altra cara; la cartolina gira en un arc ampli; el cartró, com en un llibre de cartró per a infants petits, gira com una planxa rígida sobre la seva frontissa. Les cobertes també giren com cartrons. Un salt de més de deu pàgines no les passa una a una: el bloc de pàgines intermedi s'aixeca com una sola peça, tan gruixuda com aquestes pàgines, i es posa a l'altre costat.

La vista també es mou. Arrossegar amb el botó dret del ratolí gira al voltant del llibre, fins a un angle rasant, per veure el llom, el tall davanter o el gruix del bloc, i es pot fer mentre els fulls encara giren. La vista es queda on la vas deixar fins que **Restablir la vista** la torna a l'angle que fixa la configuració. En una finestra estreta el llibre mostra una pàgina cada vegada, i continua passant el full per sobre del llom; quan el sistema demana moviment reduït, els plecs canvien sense el gir.

Quatre botons de la barra d'eines, o les tecles H, O, S i M, trien què fa el punter sobre el llibre: passar les pàgines a mà, orbitar la vista, que és el que necessita un trackpad o una tauleta en lloc de l'arrossegament amb el botó dret, seleccionar text o fer servir una lupa. La selecció funciona sobre les pàgines tal com es veuen, inclinades o girades, igual que a la vista canvas: un clic porta el cursor de l'editor a aquella paraula, un arrossegament selecciona, un doble clic agafa una paraula i un enllaç se segueix. També funciona a l'inrevés: el cursor i la selecció de l'editor es dibuixen sobre les pàgines, i portar el cursor a una pàgina que no és a la vista passa el llibre fins allà.

La **lupa** se sosté damunt del llibre allà on és el punter, o just per sobre del dit en una pantalla tàctil: un vidre rodó amb la vora negra que mostra la pàgina tal com la veu l'ull, il·luminada i corbada tal com reposa, i que amplia més al centre. La roda i les tecles de més i de menys canvien quant amplia, d'una vegada i mitja fins a deu, i Esc la retira. Amb ella es llegeix una nota a peu de pàgina o el microtext d'una figura sense sortir de la vista.

Els vídeos es reprodueixen a la pàgina. En el mode de passar pàgines, un clic a la portada d'un vídeo el posa en marxa allà mateix, i continua mentre el full gira. Un altre clic el posa en pausa, començar-ne un altre atura l'anterior, i el vídeo s'atura quan el llibre queda obert per un plec que ja no el mostra. Un vídeo configurat per reproduir-se sol comença la primera vegada que es mostra el seu plec. Els de YouTube i Vimeo no es poden dibuixar dins de la pàgina: un clic sobre ells passa el full.

:::callout{type="try"}
Obre la pestanya Folio amb aquesta guia, passa unes quantes pàgines arrossegant-ne les cantonades i després gira el llibre arrossegant amb el botó dret per veure'n el plec grapat. Restablir la vista el torna al seu lloc.
:::

## El paper

El paper es tria com ho demanaria un impressor: per **tipus**, la classe de paper, i per **gramatge**, el seu pes en grams per metre quadrat. Cada tipus porta els valors que li són habituals, recollits a :ref{id="paper-stocks"}, i qualsevol es pot canviar per separat: un paper de llibre ossi de 70 grams en lloc de 80, un òfset sense estucar en un to més càlid.

El gruix surt de dos números. La **mà** d'un paper, en centímetres cúbics per gram, diu quant espai ocupa un gram de paper; el gramatge per la mà dona el gruix d'un full en micres. El bloc d'un llibre és el seu nombre de fulls per aquest gruix, i per això les mateixes tres-centes pàgines fan un volum prim en paper estucat i un de gruixut en paper de llibre d'alta mà. Folio compta el llibre sencer, així que un capítol mostrat sol continua entre les pàgines anteriors i posteriors, amb el seu gruix real.

La superfície té tres ajustos. L'**acabat** diu si el paper és sense estucar, amb la seva fibra i sense brillantor, o estucat i calandrat fins a un acabat mat, semimat o brillant, que reflecteix l'habitació. La **textura** és el relleu: llisa, el gra fi de la vitel·la, la trama regular del paper uniforme, les línies del verjurat, un gofrat de tela o les marques irregulars del feltre; la seva intensitat es pot abaixar o apujar. El **to** és el color del paper abans d'imprimir, blanc, natural o ossi, i la **transparència** deixa veure tènuement el que hi ha imprès al revers del paper fi, i com més pesa el paper, menys se'n veu. Un diari no necessita res d'això: un llibre amb un format de diari, sàbana, berlinès o tabloide, reposa sobre la taula com paper de diari doblegat, tret que els seus ajustos triïn un altre paper i una altra enquadernació.

## Enquadernacions i cobertes

Hi ha cinc enquadernacions. El **cartonatge** porta tapes de cartró una mica més grans que les pàgines. La **rústica fresada** té el llom fresat i encolat, i obre menys. La **rústica cosida** conserva els seus quaderns cosits sota una coberta tova i obre amb més facilitat. L'**enquadernació plana** obre del tot, sense que les pàgines s'enfonsin cap al llom. El **grapat a cavall** forma un fullet de plecs doblegats i grapats pel plec, com una revista o un programa de mà, i no té llom pla. Un llibre gruixut obre com obre un llibre gruixut, amb el llom dret entre els dos blocs de pàgines. Un llibre enquadernat per la dreta, un d'àrab o un de xinès o japonès compost en vertical, reposa en mirall, amb el llom a la dreta, i els seus fulls i les tecles de fletxa giren en sentit contrari.

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

Folio dibuixa amb WebGL2, els gràfics tridimensionals del navegador, amb una textura per cada cara de cada pàgina pintada. Un mòbil dona a una pestanya del navegador menys memòria de la que necessita un llibre, així que el Sandbox ofereix la pestanya Folio en ordinadors i tauletes i l'omet als mòbils i als navegadors sense WebGL2.

:::callout{type="note" title="En codi"}
El visor és un paquet propi, _postext-folio_, construït sobre three.js. \`createFolioFromDocument(container, doc)\` mostra un document maquetat com un llibre; \`setDocument\` mostra la maquetació següent a la mateixa pàgina, \`setAppearance\` canvia el paper, l'enquadernació o la llum, i \`resetView\` torna la vista al seu lloc. \`createFolio\` fa el mateix amb qualsevol conjunt d'imatges de pàgina.
:::

El mateix paquet passa les pàgines de les receptes del Receptari, i pot anar a qualsevol pàgina web que vulgui presentar un llibre com un llibre: el catàleg d'una editorial, una prova enviada a un autor o una previsualització abans d'imprimir. La taula de llum del Receptari passa les pàgines d'una recepta amb el mateix paquet, en pla, sense la tercera dimensió. Com la resta de Postext, el paquet es publica a npm amb llicència MIT i es pot importar directament des d'una CDN; algunes receptes del Receptari el fan servir així, sense cap pas de compilació, dins de la mateixa pàgina de la recepta.

# Eines al voltant del motor {#tools lead="El Sandbox és una de les portes d'entrada a Postext. Una línia d'ordres compon llibres des d'un terminal, un format de fitxer els porta sencers, els documents de Word entren i surten, i els agents poden treballar al Sandbox o adaptar un llibre a partir del seu PDF." summary="La línia d'ordres, el fitxer .postext, Word, WebMCP i l'skill d'adaptació"}

El motor que és al centre d'aquest llibre és una biblioteca, i una biblioteca es pot cridar des de qualsevol lloc. El Sandbox és el lloc més visible on s'executa, però una editorial amb un catàleg per produir, un desenvolupador amb una cadena de compilació o un assistent a qui es demana que compongui un manuscrit necessiten cadascun una altra porta.

## La línia d'ordres

:index{term="línia d'ordres"}**postext** és un programa per al terminal que converteix un llibre en un PDF, un EPUB, HTML, imatges de pàgina o un document de Word, sense navegador. Es distribueix com un fitxer per sistema, per a macOS, Linux i Windows, que es baixa de les versions publicades del projecte, o a través d'npm com a _postext-cli_. Tot el que necessita viatja a dins: el motor, una biblioteca de dibuix, un conformador de text, els perfils ICC del capítol d'impremta i dues famílies de fonts. Les altres fonts es baixen una vegada de Google Fonts o d'una carpeta que indiquis i es desen en una memòria cau; les fonts instal·lades a l'ordinador no es fan servir mai, de manera que un llibre surt igual a qualsevol màquina.

El programa llegeix un fitxer \`.postext\`, una carpeta que conté un llibre o fitxers Markdown solts, presos com a capítols per l'ordre dels seus noms. Cada sortida té la seva ordre: \`pdf\`, \`epub\`, \`html\`, \`image\` i \`images\`, \`docx\`. Les opcions cobreixen el que el Sandbox ofereix als seus taulers: una norma PDF/X i un perfil, un EPUB fix o fluid, una sola pàgina o un interval de pàgines en la numeració que imprimeix el llibre, una resolució, una previsualització d'impressió. \`--set\` canvia qualsevol ajust per a una execució, \`--locale\` tria una edició i \`--chapters\` una part del llibre.

:::callout{type="note" title="D'un manuscrit a un PDF"}
1. \`postext pdf book.postext\` escriu tot el llibre com a PDF
2. \`postext images book.postext --pages 12-15 --dpi 200\` dibuixa quatre pàgines com a imatges
3. \`postext check book.postext --strict\` falla davant de qualsevol avís
4. \`postext build book/ --watch\` torna a compondre el llibre cada vegada que es desa un capítol
:::

Dues ordres serveixen per automatitzar. \`check\` maqueta el llibre i informa del que informaria el tauler Revisió, amb el preflight quan el llibre està preparat per imprimir, i acaba amb un codi d'error que un script pot comprovar. \`build --watch\` manté un llibre obert i el torna a compondre quan canvia un fitxer. En un portàtil corrent, una novel·la il·lustrada de 140 pàgines es compon i s'escriu com a PDF en uns deu segons.

## Un llibre en un fitxer

:index{term="format de fitxer (.postext)"}Un fitxer **.postext** és un llibre empaquetat per viatjar: un arxiu zip amb els capítols en Markdown, la configuració, els recursos, les fonts i un manifest que ho lliga tot. També pot portar la paginació ja calculada, de manera que un llibre s'obre maquetat i la primera pàgina apareix abans que el motor hagi compost una línia. El Sandbox baixa un llibre en aquest format des del tauler Llibres i n'obre un des del mateix lloc; la línia d'ordres el llegeix i l'escriu; els llibres d'exemple del lloc web se serveixen com a fitxers .postext.

Un fitxer pot contenir diverses llengües, cadascuna amb els seus capítols, els seus recursos i els seus ajustos, com explica :ref{id="languages"}. Els programes llegeixen i escriuen el format a través d'una petita interfície del motor, \`openBundle\`, \`createBundle\` i \`buildBundle\`, que maqueta tots els capítols d'un paquet com un sol llibre, amb els comptadors i els folis continuats. Un fitxer fet amb una versió de Postext s'obre amb la següent: el manifest registra la versió dels ajustos amb què es va escriure, i els fitxers antics es llegeixen tal com es volia que es llegissin.

## Documents de Word

:index{term="documents de Word"}La majoria dels manuscrits arriben com a fitxers de Word. El tauler Text importa un .docx al navegador, sense enviar-lo enlloc, i obre un diàleg abans de canviar res. Primer jutja el document: _estils ben aplicats_ quan l'autor ha fet servir estils de paràgraf, _estils aplicats en part_, o _sense estils_ quan cada títol s'ha posat en negreta a mà. Després mostra com es llegirà cada estil de Word, com a nivell de títol, estil de paràgraf, llista, cita o text corrent, i deixa canviar-ne qualsevol; les eleccions es poden desar com una plantilla i fer servir per al manuscrit següent del mateix autor o de la mateixa editorial.

Les imatges i les taules es converteixen en recursos, les notes a peu de pàgina en notes, els camps d'índex de Word en marques d'índex i les seves equacions en matemàtiques. La importació pot substituir el capítol actual, afegir capítols nous després d'aquest o substituir tot el llibre, tallat pels títols de primer nivell.

El camí també es fa a l'inrevés. **Exportar a Word** escriu un capítol o tot el llibre com un .docx per a un autor o un editor que treballa amb Word. El que Word no pot mostrar, una directiva o una referència a un recurs, es conserva en paràgrafs grisos d'un estil anomenat _Postext Markup_, i la plantilla viatja dins del fitxer, de manera que el document corregit torna a Postext sense perdre res.

## Agents al Sandbox

Un assistent que sap fer servir un navegador també pot fer servir el Sandbox, a través de **WebMCP**:index{term="WebMCP"}, una proposta de norma web perquè les pàgines ofereixin eines als agents. Mentre el Sandbox és obert n'ofereix més de cinquanta: llegir l'estat del llibre, editar un capítol, canviar un ajust, afegir un recurs, dibuixar una pàgina com a imatge, llegir els avisos, exportar un PDF, desfer. Un agent a qui es demana que estrenyi un capítol pot editar el text, mirar la pàgina que n'ha sortit i tornar-ho a provar, com ho faria una persona, i cada canvi que fa és a la pantalla i a l'historial de desfer.

Les eines que destrueixen feina, esborrar un capítol, un recurs o un llibre, es marquen com a eines amb conseqüències, de manera que el navegador ho pregunta a la persona abans d'executar-les. Una aplicació que incrusta el Sandbox pot desactivar les eines.

## Adaptar un llibre amb un agent

Portar un llibre existent a Postext és sobretot qüestió de llegir-ne el disseny: el format, els marges, les columnes, els cossos, la manera com s'obren els capítols i on se situen les figures. L'skill **postext-port**:index{term="skill postext-port"} ensenya un agent a fer-ho a partir del que tingui l'editorial: un PDF, un fitxer de Word o d'InDesign, un EPUB, LaTeX, HTML o pàgines escanejades. Fa inventari de l'original, mesura les pàgines, proposa una fitxa d'especificacions, escriu la configuració i els capítols, i després revisa la seva pròpia feina: dibuixa com a imatge cada pàgina que compon i la compara amb l'original, pàgina a pàgina, fins que coincideixen.

L'skill s'instal·la amb una sola ordre en qualsevol agent que llegeixi skills, i a Claude Code com a connector. Coneix les escriptures d'aquest llibre: llibres xinesos i japonesos compostos en vertical, llibres àrabs compostos des de la dreta, còmics retolats de nou en una altra llengua, llibres de text construïts amb pàgines compostes.

# Full de ruta i comunitat {lead="Postext és jove i obert. La cadena principal, el format del document i el sistema de configuració ja estan fets; el que vindrà després es decideix en públic." summary="On és el projecte i com participar-hi"}

Postext no aspira a ser una plataforma documental universal. Aspira a ser un motor de maquetació editorial molt bo per al web, i manté un abast estret perquè el nucli continuï esmolat. La seva ambició a llarg termini és esdevenir el motor de maquetació de referència per al contingut editorial al web: una eina que editorials, revistes, plataformes de llibres i equips de desenvolupament puguin adoptar i sobre la qual puguin construir.

## On és el projecte

La feina s'organitza en quatre fases, resumides a :ref{id="development-phases"}. No són fites estrictes: descriuen l'ordre en què les capacitats esdevenen prou estables per a producció.

Les dues primeres fases estan pràcticament acabades: el model de dades, l'analitzador i la capa de mesura, el format del document, el motor de columnes amb el seu equilibrat, els seus flotants i les seves taules, i la maquinària de llibre de capítols, parts, índex i capçaleres. La tercera fase n'ha lliurat el nucli —tall òptim de línies amb penalitzacions editorials, partició de mots en vuit llengües, matemàtiques, notes a peu de pàgina i notes de final de capítol, cites bibliogràfiques, un índex analític, el xinès i el japonès en horitzontal i en vertical, l'àrab de dreta a esquerra amb justificació per kashida, les pàgines compostes, els còmics, la música, els exercicis i el text que envolta les imatges— i té pendents les notes al marge. La quarta, la sortida, ha publicat el canvas, l'HTML, un PDF etiquetat i a punt per a impremta, llibres EPUB 3 i cursos SCORM, juntament amb el worker, el Sandbox i els seus presets, la vista Folio, que mostra una maquetació com un llibre imprès, i una línia d'ordres que compon llibres sense navegador.

El que falta importa tant com el que ja està fet. Les **notes al marge** tenen un lloc en el model de dades, però encara no es maqueten. El text encara no pot córrer a banda i banda d'una imatge, el coreà es compon amb les regles del xinès i no amb les seves, i la línia d'ordres conforma el text sense les formes pròpies de cada llengua que aplica un navegador, de manera que de tant en tant una línia es pot tallar en una paraula diferent de la del Sandbox. Són els problemes següents que val la pena resoldre, i aquells en què l'ajuda compta més.

## Com participar-hi

El projecte viu a GitHub, i totes les converses tenen lloc a la vista: **issues** per a errors, peticions i tasques concretes; **pull requests** per al codi, revisat en públic; **discussions** per a idees, qüestions de disseny i tot allò que encara no és prou concret per ser una issue. Les issues amb l'etiqueta _good first issue_ són la porta d'entrada més senzilla.

El camí habitual de la idea al codi és curt: una issue descriu el problema, una discussion fixa l'enfocament quan n'hi ha més d'un, una pull request l'implementa, i el canvi es fusiona a la branca de desenvolupament i es publica des d'allà. Obrir una issue abans d'una pull request gran estalvia temps a tothom, perquè l'enfocament es pot acordar abans d'escriure el codi.

## On compta l'ajuda

Totes les parts del projecte donen la benvinguda a qui hi vulgui contribuir. El **motor** té problemes profunds —tall de línies, equilibrat, numeració, col·locació de flotants— i d'altres de més accessibles en les proves i les mesures de rendiment. El **backend de PDF** té la incrustació de fonts, la gestió del color i l'accessibilitat. El **Sandbox** té els seus taulers, els seus editors i les seves traduccions, organitzats perquè cada text de la interfície s'afegeixi de la mateixa manera en tots els idiomes. **El disseny i la tipografia** necessiten persones que coneguin les tradicions editorials, sobretot les d'escriptures que el motor encara no atén bé. I la **documentació** i les seves traduccions, avui en anglès, castellà, català, francès, alemany, italià, portuguès del Brasil, xinès simplificat, japonès i àrab, estan obertes a qualsevol que sàpiga explicar alguna cosa amb claredat.

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

Altres coses, senzillament, encara no estan fetes. La col·laboració en temps real, compartir una sessió viva mitjançant un enllaç, és a la llista d'idees del Sandbox, i les notes al marge són tant una qüestió de disseny com una qüestió tècnica. Totes dues es discutiran en públic abans d'escriure una sola línia de codi.

## Llicència

:index{term="llicència"}Postext es publica amb la **llicència MIT**: el motor, el renderitzador de PDF, el generador d'EPUB, el visor Folio i el Sandbox es poden usar, modificar i incrustar tant en projectes oberts com tancats, amb finalitats comercials o no, sempre que l'avís de llicència acompanyi el codi. Els tipus de lletra d'aquest llibre són fonts obertes servides per Google Fonts, els diagrames formen part del codi del Sandbox i el text d'aquesta guia pertany al projecte i a qui hi contribueix.

## Valors

Tres valors guien el projecte, i hi són per fer-los servir, no per emmarcar-los: quan dues bones idees estiren en direccions diferents, són la manera de decidir.

_El disseny meditat abans que la pressa._ La tipografia acumula segles de saviesa, i el motor l'hauria d'honrar en lloc de reinventar-la malament. Una funcionalitat arriba quan fa el correcte en una pàgina real, no quan simplement funciona en una demostració; una regla presa de la impremta s'estudia en els llibres que la fan servir abans de convertir-se en una opció. Algunes funcionalitats triguen més així. Les que es publiquen no cal retirar-les després.

_La claredat abans que l'enginy._ El codi, la configuració i la documentació han de ser fàcils de llegir, canviar i explicar. Una opció que necessita un paràgraf d'advertiments indica que el disseny encara no està acabat; una funció que només entén qui la va escriure no sobreviurà a les seves vacances. La configuració fa servir unitats reals i noms planers, el format del document continua sent llegible en qualsevol editor, i cada decisió del motor es pot rastrejar fins a una regla que algú pot assenyalar.

_La col·laboració abans que el territori._ Les decisions es prenen en públic, en issues i discussions que qualsevol pot llegir i a les quals qualsevol es pot sumar, i cap part del codi pertany a una sola persona. Es reconeix cada contribució —codi, documentació, traduccions, informes d'errors, consell tipogràfic i els llibres d'exemple que mostren el que el motor pot fer—, perquè un motor de maquetació per a tothom només el poden construir moltes persones.

Si alguna cosa d'això et ressona, el repositori és el pas següent. Obre una issue, fes una pregunta a les discussions o canvia alguna cosa d'aquest llibre i mira què en fa el motor.

:::paragraphs{style="signature"}
postext.dev · github.com/drnachio/postext
:::

::::page{template="sheet"}
## Postext en una pàgina

Postext compon llibres a partir de dues entrades: Markdown que diu què és el text i una configuració que en diu l'aspecte. Canvia'n una i les pàgines es tornen a compondre, al navegador, en una fracció de segon.

:::frame{slot="card" label="Escriu"}
Markdown corrent i unes quantes directives: \`:::callout\` per a un requadre, \`:ref\` per a una figura, \`[^id]\` per a una nota, \`::::page\` per a una pàgina com aquesta. El text no diu mai on va res.
:::

:::frame{slot="card" label="Dissenya"}
Més de cinc-cents ajustos al tauler Disseny: la pàgina i les columnes, els tipus, els requadres, les obertures, les capçaleres i una paleta que cada part pot tornar a acolorir.
:::

:::frame{slot="card" label="Compon"}
Cada paràgraf tallat sencer, columnes que acaben alhora, figures al primer espai lliure després de la menció, un llibre maquetat de nou fins que els folis s'assenten.
:::

:::frame{slot="card" label="Revisa"}
El tauler Revisió llista el que ha vist el motor: una línia fluixa, una font que falta, un color massa pàl·lid, una imatge massa basta per a la impremta. Un clic porta a la línia.
:::

:::frame{slot="card" label="Publica"}
Una maquetació, cinc sortides: canvas, HTML per a pantalla, un PDF per a impremta o biblioteca, EPUB per a lectors electrònics i un paquet SCORM per a un curs.
:::

:::frame{slot="card" label="Comparteix"}
Un llibre viatja com un sol fitxer .postext amb capítols, disseny, imatges i fonts. La línia d'ordres el compon en un servidor; el Sandbox l'obre en qualsevol navegador.
:::

:::frame{slot="key" label="Tecles"}
Aquest full és una pàgina composta: una plantilla amb un títol, un marc de flux, una retícula de targetes i una caixa al peu, omplerta amb el Markdown de l'últim capítol. A l'editor, :chip[⌘ Z] desfà i :chip[⌘ F] cerca; :chip[Esc] tanca un diàleg.
:::
::::

# Índex analític {style="index" summary="Tots els termes que marca aquesta guia, amb les seves pàgines"}

:::index

# Contracoberta {style="back" toc="false" book="Postext" blurb="Postext compon Markdown com a llibres, revistes i manuals, al navegador: cada paràgraf tallat sencer, columnes que acaben alhora, figures que arriben després de les paraules que les criden, un PDF a punt per a impremta i un EPUB per als lectors de llibres electrònics. Cada pàgina d'aquesta guia l'ha composta el mateix Postext." licence="Codi obert · Llicència MIT"}
`;
