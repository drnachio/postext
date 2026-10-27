// The Catalan cut of each narrated video, block by block.
import type { TranscriptBlock, TranscriptVideo } from "../transcripts";

export const TRANSCRIPTS_CA: Record<TranscriptVideo, TranscriptBlock[]> = {
  showreel: [
    {
      time: "0:00",
      scene: "Sobre fons fosc, «MAGÚNCIA · 1455» damunt d’un filet daurat. Darrere del titular «Durant cinc segles, la impremta va aprendre a compondre la pàgina.», l’any avança de 1455 a 2026 en xifres perfilades molt grans, i al voltant cauen termes de l’ofici: Justificació, Kerning, Vídues, òrfenes, Columnes equilibrades, Interlineat, Retícula base, par·ti·ci·ó, Mesura, Flotants, Capçaleres, Rius. La càmera entra dins el punt final, que omple la pantalla de daurat.",
      narration: "Durant cinc segles, la impremta va aprendre a compondre la pàgina.",
    },
    {
      time: "0:05",
      scene: "Titular: «El web va aprendre a maquetar interfícies. Mai no va aprendre a compondre una pàgina.» Una finestra de navegador a example.com/longform/article mostra un article justificat a tres columnes, «Per què falla el web». Unes etiquetes vermelles hi assenyalen els defectes: RIUS de blanc, una ÒRFENA, una VÍDUA, una COL·LISIÓ d’una imatge amb el text i el DESEQUILIBRI de l’última columna. Al costat, una pastilla de codi diu «column-count: 3;», seguida de «…i poca cosa més.» i d’una llista ratllada: Rius de blanc, Òrfenes, Vídues, Col·lisions, Columnes desequilibrades. La finestra es distorsiona i s’esfondra.",
      narration: "El web va aprendre a maquetar interfícies. Mai pàgines. Per això el text llarg encara es trenca: rius, vídues, òrfenes, col·lisions.",
    },
    {
      time: "0:18",
      scene: "Després d’un esclat blanc i una escombrada de franges blava, daurada i vermella, el logotip de Postext puja al seu lloc amb el lema «El tipògraf programable per al web». A sota: CODI OBERT · LLICÈNCIA MIT · v1.15.0 · FUNCIONA AL TEU NAVEGADOR.",
      narration: "Això és Postext: el tipògraf programable per al web.",
    },
    {
      time: "0:24",
      scene: "Secció 01 de 07, «Entra el contingut»: «Markdown diu què és cada cosa.» Un fitxer Markdown, 03-per-que-postext.md, s’escriu sol: una directiva de part (número I, «Fonaments»), el títol «Per què Postext» amb entradeta, un paràgraf que cita la figura fig-flow amb :ref, una línia ::resource i un bloc :::callout amb la frase «Canvia una paraula: la pàgina es recompon.» Al costat, config.ts crida buildDocument amb maquetació a dues columnes, text justificat i partició de mots per a «ca», sota la frase «La configuració decideix com es veu. El text no conté ni una sola decisió de maquetació.»",
      narration: "Escrius Markdown semàntic, que diu què és cada cosa. La configuració decideix com es veu.",
    },
    {
      time: "0:32",
      scene: "Secció 02, «Pretext mesura»: «Mesurat sense tocar el DOM.» Un títol, un paràgraf i un requadre s’escanegen l’un rere l’altre i unes cotes en donen l’alçada en punts; un tauler de codi mostra prepare(text, '25px Lora') i layout(prepared, width, 38), que retorna una alçada i un nombre de línies. Dues barres fan una cursa amb 10.000 paràgrafs: «Reflow del navegador · DOM» gairebé no avança i «Pretext · canvas + aritmètica» s’omple de cop. Un comptador puja fins a 600× sobre «més ràpid que el DOM mesurant text, perquè un llibre sencer es recompongui mentre escrius» i «Impulsat per @chenglou/pretext».",
      narration: "Cada paràgraf es mesura sense tocar el DOM, fins a sis-centes vegades més ràpid, gràcies a Pretext, la biblioteca que ho ha fet possible.",
    },
    {
      time: "0:41",
      scene: "Secció 03, «Postext decideix»: «Cada línia col·locada abans de pintar un píxel.» Un anell de set segments s’il·lumina per torns, Estructura, Mesura, Col·locació, Flotants, Refinament, Equilibri i Ritme, cadascun amb una línia d’explicació. Al costat es munta una pàgina a dues columnes de la guia de Postext: els blocs etiquetats volen a les seves columnes, una figura llisca al seu lloc amb la nota «:ref{id=\"fig-flow\"} → peu de columna», cau la banda d’obertura, apareixen les línies, les columnes s’anivellen i baixa la retícula base. L’anell fa les iteracions 1 a 3 i mostra «Estable en 3 iteracions» amb una marca; un requadre dona la caixa i la línia de base d’una línia.",
      narration: "Després, Postext decideix. Set passades col·loquen cada línia, porten cada figura al seu lloc i equilibren les columnes, fins que res no es mou.",
    },
    {
      time: "0:53",
      scene: "Secció 04, «El document virtual»: «Canvia una paraula. Només es recompon el que canvia.», amb la nota «Com el virtual DOM de React, però per a pàgines: el VDT, un arbre de document virtual.» Set pàgines, de la p. 7 a la p. 13, en filera. Un cursor marca una edició a la p. 11, la resta d’aquella columna es torna daurada amb l’etiqueta BRUT i un tros passa a la p. 12, que rep una marca i ESTABLE; les pàgines anteriors diuen ES SALTA i les posteriors, INTACTA. Tres vinyetes expliquen la regla, i un tauler titulat renderToHtmlIndexed() marca com a APEDAÇAT els nodes de l’arbre que han canviat.",
      narration: "Tot viu en un document virtual, com el virtual DOM de React. Canvies una paraula, i només es recompon el que canvia.",
    },
    {
      time: "1:03",
      scene: "«Un document llarg? Només es pinta el que és a la pantalla.» Una columna de pàgines passa per un marc daurat retolat VIEWPORT, amb un marge de 200 píxels a dalt i a baix: les pàgines de dins es dibuixen senceres i les de fora són contorns discontinus. Un comptador gran indica quantes de les 51 pàgines estan pintades en cada moment (IntersectionObserver · +200 px), al costat de «Geometria: totes les pàgines. Píxels: només el que veus.»",
      narration: "I en un llibre llarg, només es pinten les pàgines que són a la pantalla.",
    },
    {
      time: "1:10",
      scene: "Secció 05, «Justificació Knuth–Plass»: «Totes les maneres de tallar el paràgraf. Alhora.» A l’esquerra, un paràgraf sobre el tall de línies compost de manera voraç, com ho fa el navegador, amb les línies més obertes en vermell. A sota, cada paraula és un punt sobre una recta: arcs vermells per als talls voraços, arcs blaus tènues que proven tots els talls possibles i un camí daurat amb la millor combinació. A la dreta, la versió Knuth–Plass, d’espaiat uniforme, amb la lletjor de cada línia, la fórmula «(1 + lletjor + penalització)²» i una suma de demèrits més baixa.",
      narration: "Un navegador talla les línies de manera voraç, una a una. Postext fa servir Knuth-Plass, l’algorisme de TeX: sospesa totes les maneres de tallar el paràgraf sencer i es queda la més uniforme.",
    },
    {
      time: "1:24",
      scene: "Secció 06, «Una maquetació, cinc sortides»: «El que veus és el que s’imprimeix.» Sota la línia de codi const vdt = buildDocument(content, config); una pàgina es divideix en cinc. Canvas (renderToCanvas(), mapes de bits exactes al píxel) porta una lupa sobre la graella de píxels. HTML (renderToHtml(), seleccionable i adaptable) emmarca cada bloc amb la seva etiqueta, <h1>, <p>, <figure>… A PDF (renderToPdf(), per a impremta · PDF/UA · CMYK) quatre planxes de color entren en registre i apareixen marques de tall i una tira de color. A EPUB 3 (renderToEpub(), llibre electrònic · fix o fluid) la pàgina és dins d’un lector: passa de «Maquetació fixa» a «Maquetació fluida», es fa més estreta i el text s’hi torna a repartir en línies. A Folio (postext-folio, un llibre en 3D que passa pàgines) la pàgina s’obre en una doble pàgina i un full gira sobre el llom.",
      narration: "Una maquetació, cinc sortides: canvas, HTML, PDF per a impremta, EPUB 3, fix o fluid, i un llibre en 3D. El que veus és el que s’imprimeix.",
    },
    {
      time: "1:38",
      scene: "Secció 07, «Per què un estàndard obert»: «LaTeX va marcar l’estàndard del paper. Avui l’edició viu també a cada pantalla.» Dues targetes. LaTeX, 1984, amb creus al costat de «Pensat per a la pàgina impresa», «Lligat a les fonts i els paquets d’una màquina», «Compilar, esperar, repetir» i «Sense maquetació editorial al web adaptable». Postext, 2026, amb marques al costat de «Web, PDF d’impremta i EPUB 3, una maquetació», «Un sol fitxer .postext ho porta tot», «Es recompon en directe mentre escrius» i «A qualsevol navegador · sense servidors · MIT». La targeta de Postext s’il·lumina.",
      narration: "LaTeX va marcar l’estàndard del paper. Però avui l’edició viu a totes les pantalles.",
    },
    {
      time: "1:45",
      scene: "Rètol «Un fitxer, el llibre sencer» i titular «Un estàndard obert per a l’edició, més enllà d’on arriba LaTeX.» Una icona de fitxer .postext s’obre en cinc peces: preset.json (configuració i disseny), chapters/*.md (un Markdown per capítol), fonts/*.woff2 (les tipografies mateixes), images/ · SVG (cada imatge, inclosa) i resources (taules, figures i peus). Peu: «Un ZIP corrent: obert, documentat i amb llicència MIT. Qualsevol eina el pot llegir i escriure.»",
      narration: "Postext és un estàndard obert: un únic fitxer portàtil, documentat i amb llicència MIT, que qualsevol eina pot llegir i escriure.",
    },
    {
      time: "1:57",
      scene: "«La mostra · composta pel motor real»: un mur de pàgines de l’edició catalana de la guia s’allunya en perspectiva mentre un comptador arriba a 51 pàgines. Text: «14 capítols, 3 parts i una portada, maquetats en prop de mig segon. Cada pàgina de la guia de Postext, calculada en un navegador per postext v1.15.0 per a aquesta peça. Res col·locat a mà.» Després apareixen quatre etiquetes: Llibres de text, Revistes, Edicions literàries, Catàlegs.",
      narration: "Per això és capaç de maquetar llibres de centenars de pàgines en dècimes de segon.",
    },
    {
      time: "2:04",
      scene: "Tancament: el logotip de Postext amb el lema «El tipògraf programable per al web», l’adreça postext.dev, una línia de terminal on s’escriu «$ pnpm add postext» i el peu «Codi obert · MIT · github.com/drnachio/postext».",
      narration: "Postext. Codi obert, a postext.dev.",
    },
  ],
  tutorial: [
    {
      time: "0:00",
      scene: "Capçalera: el logotip de Postext, el rètol «Tutorial · 5 passos» i el títol «Converteix la teva publicació a Postext amb un agent d’IA. Sense programar.»",
    },
    {
      time: "0:03",
      scene: "«La teva publicació ja existeix.» Tres pàgines compostes amb Postext, un llibre, un manual i una revista, cauen l’una rere l’altra amb les etiquetes InDesign (IDML), Word (DOCX) i PDF. S’apleguen a l’esquerra, una fletxa daurada discontínua passa per una insígnia «Agent d’IA» i apareix una icona de fitxer, el-meu-llibre.postext, sota «Un agent la converteix a Postext. Cinc passos. Unes quantes peticions ben escrites.»",
      narration: "Ja tens una publicació: un llibre, un manual, una revista. Viu a InDesign, a Word o en un PDF. En aquest tutorial, un agent d’intel·ligència artificial la convertirà a Postext per tu. Sense programar: cinc passos i unes quantes peticions ben escrites.",
    },
    {
      time: "0:23",
      scene: "«El pla»: cinc targetes numerades apareixen a mesura que la veu anomena cada pas: 01 Prepara la carpeta, 02 Reuneix els originals vectorials, 03 Afegeix una referència, 04 Demana-ho a l’agent, 05 Revisa-ho al sandbox.",
      narration: "El pla: preparar la carpeta, reunir els originals vectorials, afegir una referència, demanar-ho a l’agent i revisar el resultat.",
    },
    {
      time: "0:34",
      scene: "Pas 01, la carpeta: «Un projecte, una carpeta.» Una carpeta gran, el-meu-llibre/, sura entre deu fitxers solts, com MinionPro-Regular.otf, portada.jpg, fig-2-1.ai, capitol-01.docx, mapa.svg, llibre.idml i grafic.pdf. S’obre una finestra amb l’arbre de la carpeta i cada fitxer vola a la seva subcarpeta quan la veu l’anomena: referencia.pdf (com ha de quedar, pas 03), fonts/ (Minion Pro, Myriad…, .otf .ttf .woff2), imatges/ (fotografies, .jpg .png), il·lustracions/ (originals vectorials, .ai .svg .pdf) i textos/ (Word, InDesign IDML…).",
      narration: "Pas u: reuneix-ho tot en una sola carpeta a l’ordinador. Un projecte, una carpeta. A dins, dona a cada tipus de material la seva pròpia subcarpeta: les tipografies, les imatges, les il·lustracions i els textos.",
    },
    {
      time: "0:51",
      scene: "La fila fonts/ es ressalta i una targeta titulada «Tipografies» mostra una «Aa» gran, els estils Rodona, Cursiva i Negreta, els formats OTF, TTF i WOFF2 i la nota «Només es poden fer servir les que incloguis.» Després apareix «Com més endreçada, menys endevina.», mentre cada subcarpeta de l’arbre rep una marca.",
      narration: "No t’oblidis de les tipografies: són la veu del disseny, i l’agent només pot fer servir les que incloguis. Com més endreçada estigui la carpeta, menys haurà d’endevinar l’agent.",
    },
    {
      time: "1:04",
      scene: "Pas 02, originals vectorials: «Reuneix els originals.» Un diagrama, un gràfic i un mapa es dibuixen a traç, amb els punts d’ancoratge a la vista, i apareixen tres icones de fitxer: .ai Illustrator, .svg SVG i .pdf PDF.",
      narration: "Pas dos: si les teves il·lustracions són vectorials, com diagrames, gràfics o mapes, busca els fitxers originals: Illustrator, SVG o PDF.",
    },
    {
      time: "1:15",
      scene: "Dos taulers mostren la mateixa figura, un diagrama en què Manuscrit i Plantilla apunten a Pàgines, amb el peu «Fig. 2.1 Contingut i disseny es troben.» A l’esquerra, «Retallada del PDF: una foto del dibuix» es torna borrosa i pixelada quan s’amplia; a la dreta, «L’original: el dibuix mateix» es manté nítid. El tauler de l’esquerra s’apaga, els rètols de l’original es reescriuen en anglès (Manuscript, Template, Pages), unes marques de tall l’emmarquen i tres etiquetes diuen «Nítida a qualsevol mida», «Rètols com a text real» i «Original → impremta».",
      narration: "Una figura retallada del PDF final és poca cosa més que una foto del dibuix. L’original és el dibuix mateix. Amb l’original, l’agent recompon cada figura: nítida a qualsevol mida, amb els rètols com a text real, a punt per traduir. I a impremta, l’original hi va tal com és.",
    },
    {
      time: "1:36",
      scene: "Pas 03, la referència: «Mostra com ha de quedar.» A l’arbre de la carpeta es ressalta referencia.pdf amb l’etiqueta «A l’arrel». En surt una pàgina que es converteix en una pàgina de llibre gran, a dues columnes, marcada referencia.pdf.",
      narration: "El pas tres és essencial: a l’arrel de la carpeta, posa-hi un fitxer que mostri amb claredat com ha de quedar el producte final. L’ideal és un PDF.",
    },
    {
      time: "1:45",
      scene: "Sobre la pàgina apareixen les mesures: el contorn de les columnes, una separació de 9 mm, un marge de 20 mm, etiquetes per al títol (Fraunces 28 pt), el text (Lora 9,4/13,6 pt) i un requadre (fons, 1 filet), i les línies de base amb un interlineat de 13,6 pt. Un fitxer, fitxa-especificacions.md, es va omplint: pàgina 210 × 280 mm; marges 24 · 20 · 22 · 20 mm, simètrics; 2 columnes, separació 9 mm; retícula base 13,6 pt; text Lora 9,4 / 13,6 pt, justificat; títols Fraunces 28 pt · Geist; obertures amb banda de color, 101 mm; requadres amb fons i filet esquerre. Després la paraula «Endevinar» queda ratllada i «Mesurar.» s’encén en daurat.",
      narration: "L’agent llegeix el disseny en aquestes pàgines: mesura marges, columnes, tipografies i espais, i els anota com a regles de maquetació. Sense referència, hauria d’endevinar. Amb ella, mesura.",
    },
    {
      time: "2:00",
      scene: "Pas 04, l’agent: «Demana-ho amb les teves paraules.» S’obre una finestra titulada «Agent · ~/el-meu-llibre» al costat de les insígnies Claude Code, Codex i «o qualsevol altre agent». S’hi escriu un missatge signat TU: «Instal·la la skill de Postext: `npx skills add drnachio/postext --skill postext-port`», i l’agent respon «✓ Skill instal·lada: postext-port». Una targeta de la skill postext-port enumera «Un mètode provat», «Tot sobre Postext» i «Eines per revisar la seva feina».",
      narration: "Pas quatre: obre el teu agent, Claude Code, Codex o el que tinguis, en aquesta carpeta, i demana-li que instal·li la skill de Postext. Una skill és un paquet de coneixement expert. Aquesta ensenya l’agent a convertir una publicació a Postext, i li dona eines per revisar la seva pròpia feina.",
    },
    {
      time: "2:20",
      scene: "S’escriu la petició següent: «Fes servir la skill postext-port per convertir aquest llibre a Postext. El disseny és a referencia.pdf, les tipografies a fonts/ i les il·lustracions originals a il·lustracions/: fes-les servir en lloc de retallar les figures del PDF. Comença només pel capítol 1 i ensenya’m la fitxa d’especificacions abans de construir-lo.» Al costat, referencia.pdf, fonts/ i il·lustracions/ s’il·luminen a l’arbre de la carpeta a mesura que el missatge les anomena, i apareix una targeta amb «Cap. 1».",
      narration: "Després, demana-li el que vols amb les teves paraules. Digues-li on són la referència, les tipografies i els originals, i que comenci per un sol capítol.",
    },
    {
      time: "2:33",
      scene: "Una quadrícula de dotze pàgines atenuades; la primera s’emmarca en daurat. Una fletxa circular hi compta les voltes de polit fins que apareix una marca, i llavors s’il·luminen les altres onze. A sota: Capítol de mostra → Polir → Estendre.",
      narration: "Si el contingut és llarg, comença per un capítol de mostra. Poleix-lo fins que sigui perfecte, i només llavors estén-lo a la resta.",
    },
    {
      time: "2:42",
      scene: "L’agent pregunta «Còpia fidel o redisseny?», «Quines llengües?» i «Paper, pantalla o tots dos?». Una llista de tasques avança per Fer inventari, Mesurar el disseny, Extreure el text, Tipografies i imatges, Comparar pàgina a pàgina i Empaquetar el fitxer, i apareix el fitxer el-meu-llibre.postext. S’escriu una tercera petició: «El capítol 1 està aprovat. Converteix la resta de capítols amb el mateix disseny, compara cadascun amb referencia.pdf i empaqueta-ho tot en un únic fitxer .postext.» L’agent respon «✓ 12 capítols · 0 avisos · el-meu-llibre.postext».",
      narration: "L’agent et farà unes preguntes: còpia fidel o redisseny, quines llengües, paper o pantalla. Després mesura, extreu, munta i comprova, i et lliura un fitxer Postext. Quan la mostra estigui bé, estendre-la al llibre sencer és només una petició més.",
    },
    {
      time: "3:06",
      scene: "Pas 05, el sandbox: «Revisa’l pàgina a pàgina.» En una finestra de navegador s’escriu l’adreça postext.dev/ca/sandbox. El punter prem Llibres a la barra lateral, després Nou i després «Obrir un fitxer .postext…». El fitxer hi entra volant, «El meu llibre, 12 capítols · 184 pàgines» apareix a dalt de la llista i les primeres pàgines s’obren a la pestanya Canvas, al costat d’HTML, PDF, Folio i EPUB 3.",
      narration: "Pas cinc: obre el sandbox de Postext, a postext.dev. A Llibres, tria Nou i obre el teu fitxer.",
    },
    {
      time: "3:14",
      scene: "La pàgina de referència i la de Postext queden l’una al costat de l’altra, retolades Referència i Postext, i una línia daurada les recorre de dalt a baix. S’obre el tauler Revisió amb un comptador de 3 i la llista Vídua (p. 4), Línia oberta (p. 7) i La figura no hi cap (p. 9); uns requadres vermells marquen cada problema a la pàgina de Postext.",
      narration: "Revisa’l pàgina a pàgina al costat de la teva referència. El tauler Revisió t’assenyala els problemes: vídues, línies obertes, figures que no hi caben.",
    },
    {
      time: "3:26",
      scene: "Dues files de pàgines esquemàtiques, «Referència · PDF» i «Postext · fluid». A la fila fluida, una figura passa de la primera pàgina a dalt de la segona i una línia discontínua uneix les dues posicions. Text: «Les mateixes regles, no les mateixes pàgines. El contingut flueix: una figura o un salt de pàgina poden caure en un altre lloc.» Després, un signe igual uneix cada parella de pàgines sota «El que ha de coincidir»: Marges i retícula base, Tipografia, Estil de figures i requadres, Pàgines netes: sense vídues, columnes equilibrades. Un tauler vermell amb el signe ≠ diu «Decisions artesanes a mà», amb la nota «no són regles: no serveixen per a un contingut que canvia».",
      narration: "Tingues en compte una cosa: les pàgines no han de ser idèntiques a les del PDF. Postext ha entès les regles de maquetació i ara el teu contingut és fluid, així que una figura o un salt de pàgina poden caure en un altre lloc. El que ha de coincidir és la qualitat: els mateixos valors de producció. Quan maquetem a mà, prenem petites decisions artesanes que no són regles. I només amb regles es pot maquetar un contingut que canvia.",
    },
    {
      time: "3:54",
      scene: "Torna la finestra de l’agent amb una quarta petició: «Al sandbox, capítol 2, pàgina 7: el requadre “Recorda” es parteix en dues columnes i falta el titolet. Revisió marca 3 línies obertes. Corregeix-ho i torna a empaquetar el fitxer.» S’hi adjunta una captura, captura-cap2-p7.png. Després, un bucle entre Sandbox (revisar) i Agent (corregir) fa les voltes 1 a 3 mentre el nombre d’avisos baixa de 3 a 0, i acaba amb una marca i «Perfecte.»",
      narration: "Després explica a l’agent el que veus, amb la màxima precisió possible: el capítol, la pàgina i què falla. Una captura de pantalla ajuda. Obre la versió nova, torna a revisar i repeteix. Cada volta s’hi acosta més, fins que queda perfecte.",
    },
    {
      time: "4:14",
      scene: "«No només una versió Postext.» El fitxer el-meu-llibre.postext es parteix en dos per una línia daurada. A l’esquerra, Contingut (què diu): chapters/ca/02-la-cellula.md, amb el títol «La cèl·lula», una frase que cita la figura fig-celula i un requadre de tipus «recorda» que diu «La cèl·lula és la unitat mínima de vida.» A la dreta, Forma (com es veu): una plantilla deduïda del teu original, amb pàgina de 210 × 280 mm simètrica, 2 columnes amb una separació de 9 mm, text Lora 9,4/13,6 justificat, títols en Fraunces numerats, requadres «recorda» amb fons i filet, i figures a dalt de la columna.",
      narration: "I això és el millor: no només tens el teu contingut a Postext. Has separat el contingut de la forma. El text viu en capítols nets; el disseny, en una plantilla amb les regles de maquetació deduïdes del teu original.",
    },
    {
      time: "4:28",
      scene: "S’encenen les pastilles Corregir, Ampliar i Traduir sobre una filera de pàgines: es ressalta una línia i una lluïssor recorre les pàgines, n’entren dues més i les pàgines es giren i mostren la mateixa guia en anglès. S’escriu una petició: «Afegeix una edició en anglès: tradueix els capítols, els peus de figura i els rètols dels diagrames, i mantén el mateix disseny.» Peu: «Les mateixes regles. Contingut nou. Les pàgines es componen soles.» Després, «Un fitxer, tot el llibre.»: una icona .postext es ramifica cap a una pàgina amb marques de tall (PDF per a impremta), un lector de llibres electrònics amb el text recompost a la mida de la pantalla (Llibre EPUB), una finestra de navegador (Lector web) i una parella de pàgines (Cada pàgina, composta).",
      narration: "Així, quan el teu contingut canviï, quan el corregeixis, l’ampliïs o el tradueixis, no t’hauràs de preocupar pel format. Postext el torna a compondre amb les mateixes regles. Un sol fitxer per a tot el llibre: un PDF a punt per a impremta, un llibre electrònic EPUB, un lector per al web i pàgines que es componen soles.",
    },
    {
      time: "4:52",
      scene: "Tancament: el logotip de Postext, el lema «El tipògraf programable per al web», postext.dev, una pastilla amb «Els prompts d’aquest vídeo són a la descripció ↓» i el peu «Codi obert · MIT · github.com/drnachio/postext».",
      narration: "Postext. Codi obert, a postext.dev. Tens els prompts d’exemple a la descripció.",
    },
  ],
};
