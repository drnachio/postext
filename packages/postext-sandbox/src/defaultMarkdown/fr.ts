export const DEFAULT_MARKDOWN_FR = `---
title: "Postext"
subtitle: "Un compositeur programmable pour le web"
author: "Ignacio Ferro"
publishDate: "2026-10-04"
---

# Postext {style="cover" toc="false" kicker="Moteur de mise en page open source · Le guide" publisher="postext.dev · Licence MIT · Chaque page de ce livre a été composée par Postext dans votre navigateur"}

:::pagebreak

:::paragraphs{style="colophon"}
**Le guide de Postext** est le livre d’exemple fourni avec le Sandbox. C’est à la fois une visite du moteur et une démonstration de ce qu’il sait faire. La couverture, la table des matières qui se numérote d’elle-même, les pages de partie, les ouvertures de chapitre, les titres courants, chaque figure et chaque tableau flottant : tout est mis en page par Postext, dans votre navigateur, à partir du Markdown que vous pouvez ouvrir dans l’éditeur.

Composé en Fraunces, Lora, Bricolage Grotesque, Geist et Geist Mono, servis par Google Fonts. Les schémas sont de simples fichiers SVG, tracés en vectoriel dans le canvas, la vue HTML et le PDF. Changez quoi que ce soit (un mot, une marge, une couleur de la palette) et le livre se recompose.

Postext est un logiciel libre, distribué sous licence MIT. Texte © 2026 Ignacio Ferro et les contributeurs de Postext.
:::

# Table des matières {style="contents" toc="false"}

:::toc

:::part{number="I" title="Fondements" palette="band=#2b4acb"}
1. Pourquoi Postext
2. Comment fonctionne le moteur
:::

# Pourquoi Postext {lead="La typographie imprimée a mis cinq siècles à apprendre à composer une page ; les navigateurs ont appris à disposer une interface. Postext apporte la première aux seconds : un moteur de mise en page qui transforme le Markdown en pages composées selon les règles de l’édition." summary="L’écart entre le web et la page, et ce qui le comble"}

Postext est un **moteur de mise en page open source** qui apporte au web le savoir-faire de la typographie imprimée professionnelle. Il reçoit un **contenu sémantique** écrit en Markdown enrichi et un objet de configuration, et calcule une mise en page entièrement résolue:index{term="configuration"}, dans laquelle chaque ligne, chaque titre, chaque figure et chaque tableau occupe une position précise, mesurée en véritables unités typographiques. Cette mise en page est ensuite dessinée par trois moteurs de rendu (un aperçu canvas en direct, du HTML positionné et un PDF prêt pour l’impression) qui lisent tous la même géométrie : ce que vous voyez à l’écran est exactement ce qui part chez l’imprimeur. Les mêmes pages s’écrivent aussi en livre numérique EPUB 3.

Ce livre est sa propre démonstration. Sa couverture, la table des matières qui se numérote d’elle-même, les pages de partie en quatre couleurs, le bandeau qui ouvre chaque chapitre, les titres courants en haut de ces pages et chaque figure qui vient se mettre en place : tout a été mis en page par Postext, dans votre navigateur, il y a un instant. Rien n’a été placé à la main. Le Markdown dit seulement ce que sont les choses, et la configuration décide de leur apparence. Avec une autre configuration, le même texte deviendrait un livre de poche ou un magazine. Rien n’empêche d’essayer : chaque réglage de ce livre peut être changé dans le Sandbox, et **Restaurer l’original…**, dans le menu de la ligne du guide du panneau **Livres**, le remet tel qu’il était.

:::callout{type="try"}
Ouvrez le panneau **Texte** et choisissez ce chapitre dans le sélecteur de chapitres, en haut du panneau. Modifiez un mot de ce paragraphe ou supprimez une phrase : la page se recompose, les colonnes se rééquilibrent et les numéros de page des chapitres suivants suivent le mouvement.
:::

Pour commencer plutôt par une vidéo, :ref{id="postext-showreel"} fait le tour de la question en deux minutes ; dans la vue Folio, elle se lit sur la page même.

## Comment lire ce livre

Le livre est organisé en quatre parties. **Fondements**, la partie où vous vous trouvez, expose le problème que résout Postext et la façon dont le moteur est construit : ce qui entre, ce qui sort et ce qui se passe entre les deux. **Le métier** traite de typographie : comment se compose une ligne, comment se cadre une page, où vont les figures, les tableaux et les encadrés, comment une suite de chapitres devient un livre et comment un même livre vit en plusieurs langues. **Au-delà du texte courant** compose des pages qui ne sont pas un flux de colonnes : pages composées, bande dessinée, musique et exercices. **En pratique** passe aux outils : le format de document, le Sandbox, les sorties et l’impression, la ligne de commande et les agents, et le projet qui les entoure.

Chaque chapitre s’ouvre sur une courte introduction placée dans son bandeau, et la plupart terminent leurs sections par un encadré intitulé _Essayez-le dans le Sandbox_ : une petite expérience que vous pouvez mener sur ce livre même, tout de suite, pour voir la fonctionnalité à l’œuvre. Vous ne risquez rien à les suivre (**Restaurer l’original…**, dans le menu de la ligne du guide du panneau **Livres**, le rétablit tel qu’il a été livré) : modifiez donc librement. Les chapitres se lisent dans n’importe quel ordre ; quand l’un dépend d’un autre, il le signale.

## Mise en page d’application et mise en page éditoriale

Le CSS moderne est un outil remarquable pour construire des interfaces. Flexbox, Grid, les container queries et le positionnement par ancre donnent aux développeurs un contrôle fin sur la disposition des composants dans une fenêtre. Mais le CSS a été conçu pour la _mise en page d’application_, alors que la lecture longue demande une _mise en page éditoriale_. Ce sont deux problèmes différents :

- La **mise en page d’application** dispose des composants interactifs (boutons, formulaires, cartes, navigation) dans une fenêtre que le lecteur fait défiler librement
- La **mise en page éditoriale** fait couler le texte, les figures, les tableaux et les encadrés à travers une suite de pages et de colonnes fixes, selon des règles affinées par des siècles d’imprimerie

La comparaison de :ref{id="feature-comparison"} résume les points où les deux approches divergent pour les documents longs. (Il suffit de le citer : le tableau vient se placer tout seul dans le premier emplacement libre après ce paragraphe, et vous ne le placez jamais deux fois.)

La différence est de nature, pas de degré. Une interface s’adapte à la fenêtre qui la contient, et le lecteur s’y déplace à sa guise ; une page, au contraire, a une taille fixe, un début et une fin, et tout ce qu’elle contient doit se résoudre dans ces limites : ce qui tient dans cette colonne et ce qui passe à la suivante, où va chaque figure, comment finit chaque ligne et chaque paragraphe. Ces décisions font la qualité d’un livre, et aucune ne peut se prendre en regardant un élément isolé, si soigné que soit le style de chacun.

Le CSS traite brillamment le premier cas. Pour le second, la plateforme n’a jamais offert les primitives qui comptent :

1. **Des colonnes équilibrées qui connaissent leur contenu.** La propriété CSS _columns_ fait couler le texte, mais elle ne sait pas mettre les colonnes à niveau en ajustant l’espace au-dessus des titres ou l’espacement d’un paragraphe ; elle ignore tout d’une figure ou d’un tableau qui doit flotter en tête de la colonne libre suivante, et elle ne peut pas garder un titre avec le paragraphe qu’il introduit de part et d’autre d’un saut de colonne.
2. **Les défauts de fin de paragraphe et de fin de colonne.** Les _orphelines_ et les _veuves_ existent en CSS, mais leur prise en charge par les navigateurs est inégale et elles ne voient pas la géométrie de la page entière ; et aucune règle ne traite la _ligne creuse_, ce mot court laissé seul sur la dernière ligne d’un paragraphe.
3. **La coupure des lignes sur tout le paragraphe.** Les navigateurs coupent les lignes de façon gloutonne, une à une, et ne peuvent répartir l’espace restant qu’à l’intérieur de chaque ligne, alors qu’une justification équilibrée exige de peser tout le paragraphe d’un coup.
4. **Un rythme vertical partagé.** Les livres et les magazines posent chaque ligne sur une grille de ligne de base commune à toutes les colonnes d’une page, et le CSS n’a aucune primitive qui aligne les lignes sur une grille à travers les colonnes et les pages.
5. **L’appareil du livre.** Des titres courants qui savent dans quel chapitre ils se trouvent, des numéros de page en séquences romaines ou arabes, des sauts de chapitre attentifs à la parité et une table des matières avec de vrais numéros de page : rien de tout cela n’existe dans un document qui défile.

:::callout{type="quote" placement="top"}
_La typographie éditoriale est un problème de satisfaction de contraintes. On n’a jamais donné au navigateur le langage pour énoncer ces contraintes._
:::

Le CSS décrit en détail l’_apparence_ de n’importe quelle zone de texte prise isolément. Ce qui lui manque, c’est l’_optimisation globale_ : la capacité de peser un paragraphe entier, une colonne entière et une page entière avant de s’engager sur aucun d’eux. Un navigateur arrête chaque boîte dès qu’il la rencontre et ne revient jamais déplacer une ligne une fois la boîte suivante mise en page ; un compositeur revient en arrière sans cesse, parce qu’une décision prise au pied d’une page peut défaire une décision prise en haut.

## Ce qui manque aux outils existants

D’autres outils traitent une partie du problème. Les traitements de texte paginent. Adobe InDesign offre un contrôle éditorial complet. LaTeX reste la référence pour la composition universitaire et mathématique. Mais aucun d’eux n’a été conçu pour le web, et leurs présupposés les rendent difficiles à intégrer dans un flux de développement moderne :

- On ne peut pas les embarquer comme composant d’une application web
- Leur sortie est statique et conserve rarement la structure sémantique dont dépendent les outils d’accessibilité
- Leurs formats sources sont propriétaires, binaires ou difficiles à générer par programme
- Ils vivent en dehors de la chaîne d’outils front-end qu’une équipe web utilise déjà

Postext adopte une autre position, résumée dans :ref{id="tools-comparison"}. C’est une **bibliothèque JavaScript** qui s’exécute dans le navigateur, lit du Markdown, applique les règles de la typographie professionnelle et renvoie une mise en page que vous pouvez rendre en canvas, en HTML ou en PDF, ou écrire en livre numérique EPUB. Elle est faite pour être embarquée, configurée et étendue par des développeurs qui veulent des pages dignes d’une publication sans quitter leurs outils, et configurée par des designers qui n’ont jamais besoin de toucher au code.

## Un métier qui a de la mémoire

Les règles que suit Postext n’ont pas été inventées pour lui. Une ligne confortable compte entre 45 et 75 caractères, et c’est pourquoi les textes longs se composent en colonnes plutôt qu’en lignes aussi larges que la page. Le texte est justifié ou en drapeau, mais dans les deux cas son gris doit être régulier, sans les trous qui forment des lézardes quand trop de lignes lâches s’empilent. Chaque ligne d’une page repose sur une grille de ligne de base commune, de sorte que les lignes se font face de part et d’autre de la gouttière et se superposent exactement par transparence à travers le papier. Les titres restent avec le texte qu’ils annoncent, un paragraphe ne laisse pas sa première ou sa dernière ligne seule au bord d’une colonne, et une figure apparaît après la phrase qui la cite, jamais avant.

Pendant des siècles, ces règles ont été appliquées à la main, par des compositeurs qui relisaient chaque page avant qu’elle parte sous presse. La PAO en a fait passer beaucoup dans des logiciels, mais ces logiciels sont restés un monde à part, avec leurs propres fichiers et leurs propres outils. Ce qui n’a jamais existé, c’est un moteur qui les applique automatiquement, à partir de texte structuré, dans l’environnement où se fait aujourd’hui l’essentiel de la lecture. C’est ce manque qui est le sujet de ce livre.

## À qui s’adresse Postext

Postext est utile partout où un texte long et structuré doit avoir l’air conçu, et pas seulement affiché :

- **Les éditeurs et les équipes éditoriales** qui veulent tirer d’une même source un PDF prêt pour l’impression, une édition fidèle à l’écran et un livre numérique, sans maintenir plusieurs mises en page synchronisées
- **Les plateformes de documentation et d’enseignement** dont les manuels, les guides et les cours ont besoin de figures, de tableaux, de renvois numérotés et de mathématiques correctement composés sur chaque page
- **Les développeurs** qui construisent des expériences de lecture (rapports, magazines, catalogues, documents générés) et veulent la qualité éditoriale d’une bibliothèque plutôt que celle d’une application de bureau
- **Les designers et les typographes** qui veulent décrire une maquette une seule fois, sous forme de règles, et la voir appliquée de façon cohérente sur des centaines de pages

Ce qu’ils ont en commun, c’est de préférer décrire le résultat plutôt que le placer à la main, et d’avoir besoin d’un résultat aussi bon que celui qu’aurait produit un compositeur attentif.

## Ce que Postext n’est pas

Postext ne remplace pas le CSS pour les interfaces ; c’est un moteur spécialisé dans le contenu long et structuré. Ce n’est pas un éditeur WYSIWYG : vous écrivez du Markdown et décrivez la maquette, et le moteur compose les pages. Il ne gère pas les points de rupture responsives : choisir une configuration selon la taille d’écran revient à l’application hôte. Il ne charge pas les polices à votre place : le moteur mesure avec les polices dont le navigateur dispose déjà, si bien qu’une page doit charger ses caractères avant la mise en page. Enfin, le moteur de mise en page ne fonctionne pour l’instant que dans le navigateur, parce que ses mesures viennent des métriques de police du canvas d’un vrai navigateur ; les générateurs PDF et EPUB, eux, fonctionnent aussi sous Node.

La même modestie vaut pour le contenu. Postext ne cherche pas à comprendre le texte qu’il compose ; il applique des règles à la structure qu’on lui donne. En échange, il ne contredit jamais l’auteur : rien n’est déplacé, renommé ni réécrit, et chaque décision du moteur est visible dans la mise en page et se rattache à une règle de la configuration.

# Comment fonctionne le moteur {#engine lead="Le Markdown et un objet de configuration entrent ; il en sort un arbre où chaque ligne a une position en unités réelles. Entre les deux, une courte chaîne de traitement mesure le texte sans toucher au DOM et itère jusqu’à ce que la page se stabilise." summary="Analyse, mesure, mise en page, convergence"}

Le moyen le plus rapide de comprendre ce que Postext sait faire est de suivre un document à travers lui. Le moteur est une chaîne de traitement, esquissée dans :ref{id="layout-pipeline"}, dont chaque étape affine une même représentation du document en mémoire. Aucune étape ne se cache derrière un format opaque et aucune ne touche au disque. La chaîne est aussi pure : avec le même contenu et la même configuration, elle produit toujours la même mise en page, les mêmes pages ligne pour ligne.

## Contenu et configuration

Deux choses entrent dans la chaîne, et toutes deux sont faites pour être lues et modifiées par des humains :

1. **Le contenu**, en Markdown enrichi
   - Titres, paragraphes, listes, emphase, citations en bloc et mathématiques
   - Des directives pour les sauts de page, la numérotation des pages, les parties, les encadrés et la table des matières
   - Des renvois aux ressources (figures, schémas SVG et tableaux) déclarées par identifiant hors du texte
   - Un en-tête YAML facultatif avec le titre, le sous-titre, l’auteur et la date
2. **La configuration**, qui décrit la maquette
   - Format de page, marges, fond perdu et numérotation des pages
   - Structure des colonnes, gouttière et filets de colonne
   - Texte courant, titres, listes, légendes, tableaux et mathématiques
   - Styles de titre, styles de paragraphe, styles d’encadré, parties et table des matières
   - Titres courants, palette de couleurs nommées et options de sortie PDF

Les tenir séparés est un choix délibéré. Le même Markdown peut devenir un livre de poche, un magazine sur deux colonnes ou un manuel avec une colonne latérale, simplement en changeant la configuration. C’est pour cette raison que le moteur refuse d’inscrire des décisions visuelles dans le contenu.

## Analyse

L’analyseur lit le Markdown enrichi et produit une liste plate de blocs : titres, paragraphes, citations en bloc, éléments de liste, formules centrées et directives qui façonnent le livre. Il ne décide rien de la mise en page. Son travail est de structurer l’entrée avec soin : il réunit les lignes d’un paragraphe, suit l’imbrication des listes, sépare le titre d’un intitulé de ses attributs, résout chaque \`:ref\` par rapport aux ressources déclarées hors du texte et note, pour chaque bloc, la portion exacte de la source d’où il vient.

La mise en forme dans la ligne est analysée en même temps. Le gras, l’italique et leur combinaison, les exposants et les indices, les mathématiques dans le texte, les pastilles de couleur et les renvois deviennent des segments typés à l’intérieur du paragraphe, pour que l’étape de mesure puisse donner à chacun sa police et sa couleur. L’en-tête placé en tête du document est lu comme des métadonnées (le titre, le sous-titre, l’auteur et la date) et mis à la disposition de chaque emplacement de design.

## Mesurer sans le DOM

Avant de placer quoi que ce soit, le moteur doit savoir combien de place il faut à chaque élément, et c’est là que tout le projet commence. Mesurer du texte dans un navigateur suppose d’ordinaire de l’afficher dans la page puis de relire sa taille, un reflow qui peut bloquer le fil principal pendant des centaines de millisecondes sur un long document.

Postext mesure avec _pretext_:index{term="pretext"}, une bibliothèque de mesure de texte sans DOM qui s’appuie sur les métriques de police du canvas et sur de l’arithmétique pure. Son étape coûteuse, la préparation d’un texte pour une police donnée, est mise en cache ; la mise en page à une largeur donnée ne coûte presque rien. Cette approche est de 300 à 600 fois plus rapide que la mesure par reflow, comme le montre bien :ref{id="measurement-speed"}, et le module de mesure du moteur y ajoute les segments enrichis de gras, d’italique et de mathématiques, la césure, la justification et la coupure optimale des lignes. Chaque résultat est mis en cache sous une clé qui comprend le texte, les polices, la largeur et toute option capable de modifier une ligne : taper dans un paragraphe remesure ce paragraphe et rien d’autre.

Le chargement des polices est la seule partie de la mesure que le moteur laisse à son hôte. Mesurer avec une police qui n’est pas encore arrivée reviendrait à mesurer la police de repli, et chaque ligne bougerait à l’apparition du vrai caractère. La bibliothèque attend donc que les polices soient chargées avant la première construction, et offre un moyen de vider ses caches de mesure quand une police arrive en retard, pour que la construction suivante mesure à nouveau avec les bonnes métriques. Le Sandbox le fait automatiquement : il charge chaque famille que nomme la configuration, depuis Google Fonts ou depuis le panneau **Polices**, avant de mettre une page en page.

## Une coupure des lignes en WebAssembly

La partie du moteur qui fait le plus de calcul est l’algorithme de coupure des lignes, qui pèse toutes les façons de couper un paragraphe. Il est écrit en Rust et compilé en WebAssembly:index{term="WebAssembly"}, un module d’une trentaine de kilo-octets à l’intérieur du paquet, et il choisit exactement les coupures que choisirait la version TypeScript : un livre se compose de la même façon avec l’une ou l’autre. La coupure va ainsi deux à trois fois plus vite, et un livre entier se met en page environ quinze pour cent plus vite. Là où WebAssembly est bloqué, la version TypeScript prend le relais, et rien ne change sur la page.

## Sept passes et une boucle

La mise en page elle-même se fait en sept passes :

1. **La structuration du contenu** analyse le Markdown en une liste plate de blocs et résout les ressources par identifiant
2. **La mesure du texte** compose chaque paragraphe en lignes à la largeur qu’il occupera
3. **Le placement dans les pages et les colonnes** remplit les pages et les colonnes, en réservant la place des titres courants et des blocs sur toute la largeur de la page
4. **Le placement des ressources** fait flotter chaque figure et chaque tableau cités vers le premier emplacement libre après leur renvoi
5. **Le raffinement typographique** applique les règles qui gardent les titres avec leur texte et les listes avec leur introduction
6. **L’équilibrage des colonnes** met à niveau les colonnes de chaque page
7. **Le rythme vertical** ramène le texte sur la grille de ligne de base après tout ce qui la rompt

Ces passes dépendent les unes des autres en cercle. Garder un titre avec son paragraphe peut pousser les deux dans la colonne suivante ; ce déplacement peut laisser une veuve ; corriger la veuve fait remonter une ligne, ce qui peut à nouveau séparer le titre. Postext sort de ce cercle avec la **boucle de convergence**:index{term="boucle de convergence"} de :ref{id="convergence-loop"} : les passes trois à sept se répètent, en ne marquant que ce qui a changé, jusqu’à ce que plus rien ne bouge. La boucle est plafonnée à cinq itérations, et les documents courants se stabilisent en une ou deux. Un score des infractions typographiques est tenu à chaque itération : si le plafond est atteint, le moteur garde la meilleure mise en page trouvée, et non la dernière.

Les règles appliquées dans ces passes sont volontairement peu nombreuses et strictes. Un titre reste toujours avec les premières lignes de ce qui le suit. Un paragraphe qui se termine par un deux-points reste avec la liste qu’il introduit. Une figure et sa légende ne sont jamais séparées. Un bloc sur toute la largeur de la page divise la page en bandes, et les colonnes de chaque bande sont équilibrées séparément : le texte placé au-dessus d’un grand tableau se lit en descendant les deux colonnes avant de passer dessous. Quand deux de ces règles ne peuvent pas être satisfaites ensemble, celle qui abîme le moins la page l’emporte, et le choix se fait toujours de la même façon.

## Une frappe, pas à pas

Il est utile de voir ce qui se passe quand vous tapez une seule lettre dans un paragraphe de ce livre. L’éditeur enregistre la modification et le Markdown du chapitre est analysé à nouveau, ce qui coûte peu. Chaque bloc, sauf celui que vous avez touché, retrouve sa mesure dans le cache ; le paragraphe modifié est recomposé à la largeur de sa colonne, en gagnant ou en perdant peut-être une ligne. La mise en page du chapitre est reconstruite à partir de ces mesures, hors du fil principal, et la boucle tourne jusqu’à ce que la page se stabilise (en général une seule fois) avant que l’aperçu dessine le résultat.

Comme chaque chapitre est mis en page séparément, dans la continuité des précédents, le reste du livre n’est pas touché, sauf si le nombre de pages du chapitre change. Dans ce cas, les chapitres suivants sont repaginés en arrière-plan et la table des matières reprend leurs nouveaux numéros de page.

:::callout{type="figures" title="Le moteur en chiffres" placement="top"}
:::columns{count=3 breaks="3,5"}
**300–600×** plus rapide pour mesurer le texte qu’un reflow du DOM. Pretext mesure avec les métriques de police du canvas et de la simple arithmétique, et c’est ce qui permet de recomposer un chapitre entier entre deux frappes.

**7 passes** transforment le Markdown en pages positionnées : structuration, mesure, placement dans les pages et les colonnes, placement des ressources, raffinement typographique, équilibrage des colonnes et rythme vertical.

**5 itérations** au plus dans la boucle de convergence, et en général une ou deux. Si le plafond devait être atteint, le moteur garderait la meilleure mise en page trouvée en chemin, et non la dernière.

**8 langues** coupées avec les motifs de Liang qu’utilise TeX depuis 1983 : anglais, espagnol, français, allemand, italien, portugais, catalan et néerlandais.

**4 sorties** (canvas, HTML, PDF et EPUB 3) proviennent d’une seule et même mise en page : la page que vous relisez à l’écran est celle qui part chez l’imprimeur.

**0 reflow** de la page pendant la mise en page. Tout est calculé en mémoire, dans un worker si l’hôte le demande, et la même entrée donne toujours les mêmes pages.
:::
:::

L’équilibrage converge par segments, d’une ouverture de chapitre ou d’un saut de page explicite au suivant. Il en résulte une garantie qui compte pour les livres : un chapitre mis en page seul et le même chapitre au sein du livre entier sont identiques, page pour page.

## L’arbre de document virtuel

:index{term="VDT (arbre de document virtuel)"}Ce qui sort de la boucle, c’est le **VDT**, l’arbre de document virtuel : des pages qui contiennent des colonnes, des colonnes qui contiennent des blocs, des blocs qui contiennent des lignes, chacun avec sa boîte en unités réelles, accompagnés d’une liste plate de tous les blocs pour un accès rapide. L’arbre n’est que géométrie (il ignore tout du canvas, du HTML, du PDF et de l’EPUB), et c’est précisément ce qui permet à chaque moteur de rendu de dessiner une sortie identique. Chaque ligne se souvient aussi du passage de Markdown d’où elle vient : c’est ainsi qu’un clic sur la page place le curseur de l’éditeur sur le bon mot.

Les pages enregistrent aussi leur fonction. Une page peut être une page courante, une ouverture de chapitre, une page de partie ou une page blanche insérée pour obtenir la bonne parité, et ce rôle permet aux titres courants, aux folios et aux décors de choisir où apparaître. Les étiquettes de page (le numéro imprimé dans sa séquence) sont calculées une seule fois, dans l’arbre, de sorte que le canvas, le HTML et le PDF s’accordent sans faire leur propre décompte. Une préface numérotée en chiffres romains et un corps qui repart à un ne demandent aucun cas particulier dans aucun moteur de rendu : chacun imprime l’étiquette que lui donne l’arbre.

## Hors du fil principal

Une mise en page peut durer plus longtemps qu’une frappe : le moteur peut donc s’exécuter dans un Web Worker:index{term="Web Worker"}. Le worker garde son propre cache de mesure d’une construction à l’autre et s’interrompt de façon coopérative : quand une nouvelle construction est demandée, la précédente s’arrête à son prochain point de contrôle et la dernière demande l’emporte. Le Sandbox met en page toutes ses vues de cette manière, et les générateurs PDF et EPUB ont leurs propres workers : l’interface reste réactive pendant qu’un livre entier se compose ou s’écrit. Le calcul est le même que sur le fil principal et donne les mêmes pages, au pixel près. Un livre de plusieurs centaines de pages se recompose ainsi sans bloquer la saisie.

:::callout{type="note" title="Dans le code"}
\`buildDocument(content, config)\` renvoie le VDT. \`renderPage\` dessine une page sur un canvas, \`renderToHtml\` renvoie du HTML positionné, et \`renderToPdf\`, du paquet _postext-pdf_, renvoie les octets d’un PDF, d’un seul document ou d’un livre entier passé sous forme de tableau de chapitres. \`renderToEpub\`, de _postext-epub_, écrit ces mêmes chapitres dans un fichier EPUB 3. \`createLayoutWorker\`, de _postext/worker_, exécute la construction hors du fil principal.
:::

:::part{number="II" title="Le métier" palette="band=#8f6408"}
3. Composer la ligne
4. La page et ses colonnes
5. Figures, tableaux et flottants
6. Encadrés, notes et marques
7. Livres, parties et titres courants
8. Un livre, plusieurs langues
:::

# Composer la ligne {lead="Un paragraphe se compose d’un seul tenant, pas ligne par ligne. Postext pèse toutes les façons possibles de le couper, chiffre l’espacement, les césures et les mots isolés, et choisit l’ensemble de coupures qui coûte le moins." summary="Coupure optimale des lignes, césure, espacement et défauts évités"}

La qualité d’une page se décide d’abord dans ses paragraphes. Un navigateur coupe les lignes de façon gloutonne : il remplit une ligne d’autant de mots qu’elle peut en contenir, passe à la suivante, et ne peut répartir l’espace restant qu’à l’intérieur de chaque ligne. Postext met en œuvre l’**algorithme de Knuth-Plass**, l’algorithme de coupure optimale qui fait tourner TeX depuis 1981. Il évalue toutes les façons possibles de couper le paragraphe entier et choisit celle dont le coût total est le plus faible : l’espacement reste régulier de la première à la dernière ligne, et aucune ligne ne paie pour ses voisines.

## Boîtes, colle et pénalités

:index{term="Knuth-Plass (coupure des lignes)"}L’algorithme voit un paragraphe comme une suite de trois primitives, dessinées sur toute la largeur dans :ref{id="knuth-plass-model"} :

- Les **boîtes** sont des mots ou des morceaux de mots, de largeur fixe
- La **colle** est l’espace entre les mots, avec une largeur naturelle et une capacité à s’étirer ou à se contracter
- Les **pénalités** sont des points de coupure possibles assortis d’un coût ; une pénalité _marquée_ signale un point de césure et dessine un trait d’union quand elle est utilisée

Pour chaque ligne candidate, le moteur calcule un rapport d’ajustement $r$, qui indique de combien la colle doit s’étirer ou se contracter pour remplir la justification, et une laideur qui croît avec son cube, $b = 100\\,|r|^3$. Les lignes sont réparties en quatre classes (serrée, normale, lâche et très lâche) et chaque coupure se voit imputer ses démérites :

$$
d = (1 + b + p)^2
$$

où $p$ est la pénalité de la coupure. Deux lignes consécutives terminées par une césure coûtent 3 000 de plus, et un saut de plus d’une classe entre deux lignes voisines coûte 100 : l’optimiseur préfère les paragraphes dont le gris change en douceur. S’il n’existe aucun ensemble de coupures acceptable, le moteur se replie sur la coupure gloutonne plutôt que d’échouer.

## Pourquoi tout le paragraphe compte

Prenons un paragraphe dont la première ligne se termine juste après un mot long. Une coupure gloutonne accepte cette fin de ligne, puisqu’elle tient, et passe à la suite. La deuxième ligne commence alors par une série de mots courts, ne parvient pas tout à fait à se remplir et doit être étirée ; la troisième hérite du problème et se termine par une césure ; la dernière ne contient plus qu’un seul mot. Aucun de ces défauts n’est visible depuis la première ligne, la seule que l’algorithme glouton a regardée.

La coupure optimale voit toute la chaîne. Elle peut décider de terminer la première ligne un mot plus tôt, un peu plus lâche qu’elle ne pourrait l’être, parce que ce choix laisse la deuxième ligne se remplir naturellement, supprime la césure de la troisième et fait descendre un second mot sur la dernière. Le paragraphe dans son ensemble est meilleur, même si sa première ligne, prise seule, ne l’est pas. C’est l’essence de l’algorithme de Knuth-Plass, et la raison pour laquelle il produit ce gris régulier que les lecteurs associent aux livres bien composés.

## Césure

:index{term="césure"}La césure utilise les mêmes **motifs de Liang** que TeX depuis 1983, fournis par la bibliothèque _Hypher_, dans huit langues : anglais, espagnol, français, allemand, italien, portugais, catalan et néerlandais. La langue du document se règle une seule fois, en tête de la configuration, et sert aussi à étiqueter le PDF pour les lecteurs d’écran. Les motifs laissent au moins deux lettres avant le trait d’union et trois après, si bien que les mots de moins de cinq lettres ne sont jamais coupés, et chaque césure est une pénalité marquée de 50 que l’optimiseur peut accepter ou refuser.

La césure ne s’applique qu’au texte justifié, là où elle est utile. Deux possibilités de coupure restent toujours disponibles, quel que soit le réglage : un trait d’union réel entre deux lettres est une coupure légitime, et un mot plus large que toute la justification est coupé à la dernière syllabe qui tient, ou au dernier caractère s’il le faut.

Les traits d’union conditionnels saisis dans le texte sont respectés comme points de coupure, au même prix que ceux des motifs. Le catalan suit les règles de l’Institut d’Estudis Catalans : un mot avec un _l·l_ géminé, comme _col·lecció_, se coupe entre les deux _l_, et le trait d’union prend la place du point médian, _col-_ en fin de ligne et _lecció_ au début de la suivante. La langue peut aussi changer au sein d’un livre : tous les chapitres partagent la langue de la configuration, si bien qu’une édition en plusieurs langues, comme celle-ci, se configure une fois par langue, et chaque version du guide se coupe selon ses propres règles.

## Espacement des mots et lignes en drapeau

Deux réglages bornent l’étirement et la contraction d’une espace : \`maxWordSpacing\`, par défaut deux fois l’espace naturelle, et \`minWordSpacing\`, 0,6 fois celle-ci. Un étirement au-delà du maximum est plus cher que tout autre défaut : l’algorithme préfère couper un mot, en déplacer un ou accepter une ligne creuse plutôt que d’ouvrir une lézarde. Certaines lignes ne peuvent pas du tout se remplir (une longue URL, la fin insécable d’un élément de liste) et, plutôt que de les ouvrir en trous trois fois plus larges que l’espace naturelle, le moteur les compose en drapeau, avec l’espacement naturel. La dernière ligne d’un paragraphe est toujours en drapeau, sauf quand elle déborde : ses espaces se contractent alors pour qu’elle tienne, exactement comme TeX compose la colle.

## Le chinois et les écritures d’Asie orientale

:index{term="composition chinoise"}Le chinois s’écrit sans espaces entre les mots et n’est jamais coupé par une césure : une ligne peut finir entre presque n’importe quels caractères. Un paragraphe qui contient plus de caractères chinois, japonais ou coréens que d’espaces entre mots ne passe pas par Knuth-Plass ; le **compositeur CJK** le compose ligne après ligne. Ce qu’il doit respecter, ce sont les règles des fins de ligne : une virgule, un point ou une parenthèse fermante n’ouvrent jamais une ligne, et une parenthèse ouvrante n’en termine jamais une. Leur rigueur dépend de la région, que donne la langue du document (\`zh-Hans\` suit la norme de Chine continentale, GB/T 15834, et \`zh-Hant\` l’usage de Taïwan et de Hong Kong), et \`cjk.lineBreak\` règle ce niveau à la main. Certaines suites ne sont jamais séparées : un tiret ou des points de suspension sur deux cadratins, un nombre avec son unité. Un mot latin ou une adresse web placés parmi les caractères passent entiers à la ligne suivante, sauf s’ils sont plus larges que la ligne ; le mot est alors coupé, et l’adresse est coupée après une barre oblique ou avant un point.

Chaque signe de ponctuation chinois occupe un carré à lui, à moitié encré et à moitié blanc, et la part de blanc qu’un livre conserve relève du style maison, comme le montre :ref{id="cjk-composition"}. Taïwan garde chaque signe sur un carré entier. Hong Kong compose aussi ses signes sur un carré entier, mais resserre la plupart des paires de signes qui se rencontrent, et une parenthèse qui ouvre ou ferme une ligne perd sa moitié extérieure. Le style Kaiming de Chine continentale, celui par défaut pour \`zh-Hans\`, compose les virgules, les parenthèses et les guillemets sur un demi-carré et garde le point entier, sauf en fin de ligne ; là où deux signes se rencontrent, le blanc qui les sépare disparaît aussi. Le style se règle avec \`cjk.punctuationWidth\`, et les deux ajustements s’activent avec \`cjk.compressAdjacent\` et \`cjk.trimLineStart\` ; \`cjk.hangingPunctuation\` laisse une virgule ou un point déborder au-delà de la fin de la ligne. Les réglages \`cjk\`, avec la langue du document et le mode d’écriture, se trouvent dans le groupe **Système d’écriture** du panneau **Maquette**.

Une ligne chinoise justifiée se remplit dans un ordre fixe : d’abord les espaces entre les mots occidentaux, puis le quart de cadratin que le moteur place entre le texte chinois et le texte latin (\`cjk.latinSpacing\` ; on ne le saisit jamais), et enfin chaque intervalle entre deux caractères, jamais à l’intérieur d’un mot latin ou d’un nombre. Quand un caractère ne peut pas ouvrir la ligne suivante, le compositeur tente d’abord de le faire entrer dans la ligne en reprenant du blanc aux signes qui s’y trouvent déjà, et ce n’est qu’en cas d’échec qu’il fait descendre le caractère précédent à la ligne suivante. Une ligne qui demanderait plus d’un demi-cadratin entre ses caractères reste courte, et le panneau **Vérifications** la signale comme une ligne CJK composée courte.

Le reste d’un livre chinois suit les mêmes réglages. Les modèles de chapitre, les numéros de page, les listes et les compteurs acceptent les styles de numération chinois, parmi lesquels \`simp-chinese-informal\`, \`trad-chinese-informal\` et \`cjk-decimal\`, si bien que les chapitres peuvent porter leurs ordinaux chinois ; les figures et les tableaux prennent leurs noms chinois et sont numérotés par chapitre avec un trait d’union. \`cjk.grid\` définit le bloc de texte en nombre de caractères par ligne et de lignes par page, la grille sur laquelle se conçoivent les livres chinois. L’édition chinoise de ce guide est composée verticalement et reliée à droite, comme on a imprimé les livres chinois pendant des siècles : elle désigne ses chapitres par leurs ordinaux chinois, imprime ses folios en chiffres chinois et numérote ses figures et ses tableaux par chapitre ; sa ligne dans le panneau **Livres** a son propre bouton de langue. Parmi les livres d’exemple, _Le Rêve dans le pavillon rouge_ est un roman entier composé en chinois, et son édition en caractères traditionnels est composée verticalement sur une grille de 38 caractères sur 15 lignes.

\`layout.writingMode: 'vertical-rl'\` compose un livre verticalement. Les lignes vont de haut en bas et se suivent de droite à gauche, deux colonnes deviennent deux étages superposés sur la page, les figures et les tableaux restent droits, les mots latins et les nombres longs se couchent sur le côté, et chaque signe prend la place ou la forme qu’il a dans le texte vertical : les parenthèses et les guillemets prennent leur forme verticale, et le point se place en haut à droite de sa case en Chine continentale et reste centré à Taïwan et à Hong Kong. Un tel livre se relie à droite (\`page.binding\`) : sa première page est seule à gauche du dos, et le Sandbox montre ses doubles pages de droite à gauche. Le canvas et le PDF composent les mêmes lignes verticales ; la vue HTML coupe ses propres lignes à la hauteur de sa page, et redresse ou couche chaque caractère comme eux. Par défaut, \`cjk.uprightDigits\` redresse dans une seule case les nombres d’au plus deux chiffres, et la limite peut passer à trois ou quatre ; \`:tcy[…]\` fait de même pour n’importe quelle suite courte.

Les livres chinois marquent aussi le texte de façons dont la typographie latine n’a pas l’usage. L’emphase s’indique par un point à côté de chaque caractère, et non par l’italique : dans un document chinois, \`*…*\` place donc des points d’emphase sur les caractères chinois qu’il contient, comme le fait \`:dots[…]\` ; \`cjk.emphasis: 'italic'\` conserve l’italique. \`:name[…]\` trace le trait droit des noms propres, \`:book[…]\` marque le titre d’un livre, et \`cjk.bookTitleMark\` choisit comment : les doubles chevrons de Chine continentale ou la ligne ondulée de Taïwan et de Hong Kong. \`:ruby[…]{rt="…"}\` compose une lecture, en pinyin au-dessus des caractères ou en zhuyin à droite de chacun, et \`:warichu[…]\` compose une note sur deux rangs de demi-taille à l’intérieur de la ligne, reportée à la ligne ou à la page suivante quand elle ne tient pas. Aucun d’eux ne modifie l’interlignage : le panneau **Vérifications** signale quand les points, les traits ou les lectures demandent plus d’espace entre les lignes que le paragraphe n’en laisse. Dans le texte vertical, les points passent à droite de la colonne, les traits à sa gauche, et le rang droit d’une note se lit en premier.

## L’arabe et les écritures de droite à gauche

:index{term="composition arabe"}L’arabe, le persan, l’ourdou et l’hébreu s’écrivent de droite à gauche, et Postext les compose à partir du même Markdown et de la même configuration que n’importe quelle autre langue. C’est la langue du document qui en décide : avec \`locale: 'ar'\`, les lignes commencent à droite, la première colonne est celle de droite, le livre est relié sur son bord droit et ses doubles pages se lisent de droite à gauche. Le moteur met une telle page en page comme une page de gauche à droite, puis la retourne en miroir tout entière, en peignant chaque mot, chaque image et chaque formule dans le bon sens : une maquette conçue pour un livre anglais fonctionne sans modification. Un réglage qui nomme un côté désigne un côté du texte, et \`start\` et \`end\` sont acceptés comme noms simples pour ce côté. Les titres courants et les folios restent sur la feuille, là où un designer les attend.

À l’intérieur d’une ligne, les nombres, les mots latins et les citations se lisent toujours de gauche à droite. L’ordre de ces segments est fixé par l’algorithme bidirectionnel d’Unicode, mis en œuvre en entier ; le texte est stocké, recherché et copié dans l’ordre où il a été saisi, et seul l’affichage est réordonné. Les parenthèses et les guillemets sont inversés en miroir dans les segments de droite à gauche. Un bloc composé à contresens du livre prend \`{dir=ltr}\` ou \`{dir=rtl}\`, et un segment de texte \`:ltr[…]\` ou \`:rtl[…]\`, un isolat dont le point final ne s’égare plus au mauvais bout de la ligne.

Les lettres arabes se lient, et chacune prend la forme que demandent ses voisines : un mot est donc mesuré et peint comme une seule chaîne mise en forme, jamais lettre par lettre ; le PDF la met en forme avec HarfBuzz et rattache chaque glyphe à ses caractères, de sorte que le texte copié et les lecteurs d’écran reçoivent les mots tels qu’ils ont été saisis. Trois règles en découlent : pas de césure, pas d’interlettrage, et pas de coupure à l’intérieur d’un mot, qui déborde alors de la ligne et est signalé plutôt que coupé. Les lignes justifiées s’étirent d’abord à leurs espaces, puis par **kashida**, ces liaisons allongées qu’un calligraphe trace entre deux lettres liées, placées seulement là où les règles du naskh en admettent une et exclues du texte copié. L’algorithme de coupure compte cet allongement comme de l’étirement : il choisit ses coupures en sachant où une ligne peut s’élargir. L’emphase est composée en gras, puisque les caractères arabes n’ont pas d’italique, et le moteur n’incline jamais une lettre arabe.

Les signes vocaliques s’empilent au-dessus et au-dessous des lettres, dans l’interlignage, qui ne grandit jamais de lui-même : le panneau **Vérifications** signale un paragraphe dont les signes toucheraient la ligne du dessus, avec l’interlignage qu’il lui faudrait. Les nombres générés (folios, numéros de chapitre, de figure et de note) prennent les chiffres de la région, indo-arabes dans l’est du monde arabe et européens au Maghreb, tandis que les nombres saisis par l’auteur ne sont jamais réécrits ; un titre peut écrire son numéro en toutes lettres comme un ordinal, et les pages liminaires peuvent compter dans l’ordre abjad des manuscrits. Les poèmes classiques s’écrivent dans \`:::verse\`, un vers par ligne avec ses deux hémistiches séparés par \`||\` : chaque hémistiche est porté à une même largeur, d’abord par des kashidas, pour que les rimes s’alignent tout au long du poème. L’édition arabe de ce guide est composée ainsi, reliée à droite, et parmi les livres d’exemple, _Les Mille et Une Nuits_ composent l’œuvre entière en arabe, à la manière de l’imprimerie de Boulaq.

## Emphase et segments

Un paragraphe est rarement un seul segment de texte. Le gras, l’italique et le gras italique sont composés dans les vrais styles de la famille (une véritable italique, et non un romain penché), chacun mesuré avec ses propres métriques : un mot en gras prend exactement la place dont il a besoin. La couleur du texte en gras, du texte en italique et des renvois peut se régler séparément ; dans ce livre, les renvois aux figures et aux tableaux sont en gras dans la couleur de la partie, pour qu’on les repère facilement sur la page et dans le PDF, où ce sont aussi des liens.

Les exposants et les indices sont composés plus petits et décalés par rapport à la ligne de base sans perturber l’interlignage, et les pastilles de couleur dans le texte reposent sur la ligne de base comme une lettre. Tous ces éléments sont atomiques : l’algorithme de coupure peut couper avant ou après eux, jamais à l’intérieur, si bien qu’une formule ou une pastille ne se retrouve jamais à cheval sur deux lignes.

Deux autres segments distinguent des mots sans recourir à un style de caractère à eux. \`:smallcaps[…]\` compose des petites capitales tirées des capitales du caractère, de la même façon dans toutes les sorties, pour les sigles et les noms des personnages d’une pièce de théâtre. \`:chip[…]\` compose un mot dans une petite boîte arrondie qui suit la ligne (touches de clavier, étiquettes, banque de mots d’un exercice), mise en forme par un style nommé, jamais coupée à l’intérieur, et dont les mots restent du vrai texte dans le HTML et le PDF.

Les chiffres ont aussi leurs styles.:index{term="chiffres (styles de)"} Un caractère peut dessiner ses chiffres alignés, aussi hauts que les capitales, ou elzéviriens, qui montent et descendent comme des minuscules, et proportionnels ou tabulaires, tous de même chasse pour que les colonnes de nombres s’alignent. \`figureStyle\` choisit entre eux pour le texte courant, un style de paragraphe, un niveau de titre, un tableau ou une légende : des chiffres elzéviriens dans le texte, où des chiffres alignés crieraient, et des chiffres alignés tabulaires dans un tableau de résultats. Un caractère qui ne dessine pas le style demandé garde ses propres chiffres.

## Orphelines, veuves et lignes creuses

:index{term="veuves et orphelines"}Une **orpheline** est la première ligne d’un paragraphe laissée seule au pied d’une colonne ; une **veuve** est sa dernière ligne reportée seule en tête de la suivante. L’une et l’autre cassent le rythme de lecture, et :ref{id="orphan-widow"} les montre toutes deux de part et d’autre d’un saut de colonne. Un troisième défaut, la **ligne creuse**, est une dernière ligne qui ne contient qu’un mot court, abandonné sous un paragraphe plein.

Postext chiffre les trois. Quand un paragraphe passe d’une colonne à l’autre, le moteur compare toutes les coupures possibles et impute à chacune l’espace qu’elle laisse inutilisé, une orpheline et une veuve : 1 000 par défaut chacune, avec au moins deux lignes de chaque côté. Les lignes creuses sont chiffrées dans l’algorithme de coupure lui-même, comme une laideur, chaque fois que la dernière ligne occupe moins que l’espace de vingt caractères. Quand une ligne creuse ne peut pas être évitée par une autre coupure, le moteur peut composer le paragraphe une ligne plus court, en resserrant les espaces entre les mots dans la limite de leur minimum et, si nécessaire, l’interlettrage d’au plus dix millièmes de cadratin. Les éléments de liste suivent les mêmes règles, avec leurs propres options.

## Listes

Les listes suivent la même discipline que les paragraphes, avec une typographie qui leur est propre. Les listes à puces choisissent leur caractère de puce, sa taille, sa graisse et sa couleur, ainsi que l’écart et le retrait suspendu qui gardent alignés les textes de tous les éléments ; les listes numérotées choisissent entre chiffres arabes, lettres minuscules ou majuscules et chiffres romains minuscules ou majuscules, avec un séparateur stylable séparément et des numéros alignés à droite, pour que les éléments 9 et 10 s’alignent. L’imbrication va jusqu’à cinq niveaux, chacun avec son retrait et ses marqueurs, et les listes de tâches dessinent une case à cocher pour chaque élément, cochée ou non. Les éléments peuvent être serrés ou espacés, et le moteur compte la fin d’une liste parmi ses leviers quand il équilibre les colonnes. Une liste qui s’arrête en bas d’une colonne peut ainsi gagner une ligne d’air avant le texte qui la suit, et rattraper la hauteur de la colonne voisine.

:::callout{type="try"}
Dans le panneau **Maquette**, cherchez _lâches_ et activez **Surligner les lignes lâches**, dans le groupe **Avancé**. Réduisez ensuite la largeur des colonnes ou augmentez \`maxWordSpacing\`, et observez quelles lignes le moteur doit ouvrir, et comment l’optimiseur les redistribue.
:::

## Mathématiques

:index{term="mathématiques"}Les formules sont des citoyennes à part entière. Les expressions dans le texte comme $e^{i\\pi}+1=0$ suivent la ligne, composées par MathJax sous forme de tracés vectoriels qui restent nets à tous les agrandissements. Quand une formule est plus haute que ne le permet la ligne, elle est réduite uniformément pour préserver la grille de ligne de base, et le lecteur garde le rythme du texte, si dense que soit la notation. Les formules centrées occupent leurs propres lignes, centrées sur la colonne, avec leurs propres marges, et le texte qui suit revient sur la grille :

$$
\\int_0^{\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

Les mêmes tracés sont dessinés par le canvas, la vue HTML et le PDF : les formules sont identiques dans les trois sorties et restent vectorielles à l’impression.

Quelques exemples de plus montrent l’étendue de la notation que gère le moteur, et ce qu’il fait de chacune pour que la formule puisse cohabiter avec le texte. Le premier est une série infinie, la somme des inverses des carrés qu’Euler a résolue en 1734. Dans une formule centrée, les bornes de la somme se placent au-dessus et au-dessous du symbole, comme dans un manuel d’analyse, et la fraction du résultat prend sa pleine taille au lieu de la forme réduite utilisée dans une ligne.

$$
\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}
$$

Les matrices sont un autre test courant, parce qu’elles exigent des lignes et des colonnes alignées et des délimiteurs qui grandissent à la hauteur de leur contenu. MathJax compose la matrice comme un tableau de cellules centrées et étire les délimiteurs pour l’envelopper ; Postext reçoit le résultat sous forme de tracés, mesure sa boîte entière et réserve exactement cette place avant de ramener le texte sur la grille. Le déterminant d’une matrice deux par deux se lit ainsi.

$$
\\det \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} = ad - bc
$$

La loi normale réunit en une seule expression presque tout ce qui rend la composition mathématique difficile : une racine avec sa barre, des lettres grecques et une fraction entière dans un exposant, qui doit rapetisser deux fois sans devenir illisible. C’est la formule de n’importe quel manuel de statistique, et elle est composée ici selon les règles que TeX appliquerait.

$$
f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}}\\, e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}
$$

Les définitions par cas ferment la série. Une accolade regroupe les branches de la définition, chacune avec sa condition alignée à droite, et l’accolade grandit avec le nombre de cas. C’est un procédé fréquent dans les textes de mathématiques et d’informatique, et un bon exemple de formule qui ne tiendrait pas dans une ligne de texte.

$$
|x| = \\begin{cases} x & \\text{if } x \\ge 0 \\\\ -x & \\text{if } x < 0 \\end{cases}
$$

Dans le texte courant, les formules obéissent à d’autres règles, puisqu’elles vivent au milieu des mots qui les entourent. Les racines de $ax^2+bx+c=0$ valent $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$ ; le produit d’Euler, lui, s’écrit $\\prod_p (1-p^{-s})^{-1} = \\zeta(s)$, et la transformée de Fourier $\\hat f(\\xi) = \\int f(x)\\,e^{-2\\pi i x \\xi}\\,dx$ reste elle aussi sur sa ligne. Dans les trois cas, le moteur mesure la hauteur de la formule et, quand elle dépasse ce que permet l’interlignage, ne la réduit que juste assez : les lignes voisines gardent leur place sur la grille et le paragraphe garde son gris. Aucune formule ne rompt le rythme de la page.

# La page et ses colonnes {#columns lead="Les pages sont fixes, les colonnes sont finies, et chaque ligne devrait reposer sur un rythme partagé par toute la double page. Ce chapitre parle du cadre : la géométrie de la page, les structures de colonnes, la grille de ligne de base et la manière de terminer les colonnes à niveau." summary="Géométrie de la page, colonnes, grille de ligne de base et équilibrage"}

Les colonnes sont l’expression la plus visible de la mise en page éditoriale, et l’endroit où les solutions bricolées cèdent en premier. Postext traite la page et ses colonnes comme des objets à part entière, avec leur propre géométrie, leur propre rythme et leurs propres règles pour bien finir.

## Géométrie de la page

Une page commence par son format. Postext propose comme préréglages les formats usuels du livre et du magazine, listés dans :ref{id="preset-sizes"}, et n’importe quel format personnalisé en centimètres, en millimètres, en pouces ou en points ; ce guide est composé au format 21 × 28 cm. Les marges peuvent être **en miroir** : la marge gauche devient alors la marge intérieure, côté dos, et change de côté sur chaque verso. Pour la fabrication, la page peut porter un fond perdu et des traits de coupe, et un réglage de résolution en DPI détermine la définition des mesures en pixels.

Les numéros de page suivent des séquences : chiffres arabes, romains minuscules ou majuscules, lettres minuscules ou majuscules, chacune avec son numéro de départ, si bien qu’un livre peut numéroter ses pages liminaires i, ii, iii et commencer le premier chapitre à 1. Le PDF enregistre les mêmes séquences comme étiquettes de page : le champ de page d’une visionneuse affiche exactement ce qui est imprimé en pied de page.

## Justification et interlignage

Les deux valeurs qui décident le plus de la lecture d’une page sont la longueur de ses lignes et la distance entre elles. La configuration fixe le corps et l’interlignage du texte courant en unités réelles (ce livre utilise 9,4 points sur 13,6) et la largeur de colonne découle de la page, des marges, de la structure des colonnes et de la gouttière. Une ligne de 45 à 75 caractères est la cible classique ; beaucoup plus courte, l’œil saute trop souvent, beaucoup plus longue, il peine à retrouver la ligne suivante. Deux colonnes sur une page de 21 cm tombent confortablement dans cette fourchette, et c’est l’une des raisons pour lesquelles ce format est si courant pour les magazines et les livres techniques.

L’interlignage est aussi l’unité de la grille de ligne de base. Toute distance verticale qui compte (l’espace au-dessus et au-dessous d’un titre, autour d’une figure, entre les éléments d’une liste) s’exprime au mieux en un nombre entier de lignes de la grille, ou y est ramenée, pour que la page garde un seul rythme de haut en bas.

## Structures de colonnes

Trois structures couvrent la plupart des publications, esquissées en vignettes de page dans :ref{id="column-layouts"} :

1. **Une colonne** pour les romans, les essais et la lecture suivie
2. **Deux colonnes** pour les magazines, les rapports et les livres comme celui-ci
3. **Une colonne et demie**, une colonne principale à côté d’une colonne latérale plus étroite
   - La colonne latérale peut porter du texte qui continue depuis la colonne principale
   - Ou être un **canal de flottants** qui ne contient que des figures, des tableaux, des légendes et des encadrés, comme dans les manuels dotés d’une colonne extérieure de notes et de schémas

La gouttière entre les colonnes est réglable, et un filet de colonne facultatif peut y être tracé, avec sa propre épaisseur et sa propre couleur. Les éléments sur toute la largeur de la page (une figure, un tableau, un encadré) traversent les colonnes : le texte placé au-dessus se répartit à niveau entre les colonnes, et les colonnes reprennent en dessous.

## Titres

Les titres se configurent niveau par niveau, jusqu’à six niveaux : caractère, corps, interlignage, graisse, italique, capitales, couleur, alignement et espace au-dessus et au-dessous de chacun. Un niveau peut être numéroté à l’aide d’un modèle : \`{1}.{2}\` imprime 4.3 pour la troisième section du chapitre 4, et des formats comme \`{1:I}\` ou \`{1:a}\` font passer un niveau aux chiffres romains ou aux lettres. Un niveau peut aussi commencer sur une nouvelle page, avec la parité demandée, et s’étendre sur toute la largeur de la page au lieu d’une seule colonne : c’est ce qui fait d’un titre de niveau 1 une ouverture de chapitre.

Les titres restent avec ce qui les suit : un titre de section n’attend jamais seul au pied d’une colonne. Ils sont aussi calés sur la grille de ligne de base : un titre plus grand que le texte courant prend la place dont il a besoin, et le texte qui le suit revient sur la grille, si bien que les colonnes de part et d’autre de la gouttière continuent de se faire face ligne pour ligne.

## La grille de ligne de base

:index{term="grille de ligne de base"}Les livres professionnels alignent la première ligne de base de chaque colonne sur un rythme vertical commun, et chaque ligne suivante tombe sur la même grille : les lignes se font face de part et d’autre de la gouttière. Postext cale le texte sur une grille de ligne de base dérivée de l’interlignage du texte courant, comme l’illustre :ref{id="baseline-grid"}. Les éléments qui rompent la grille (un titre plus grand que le texte courant, une figure, une formule centrée) sont suivis de l’espace nécessaire pour y ramener la ligne suivante. La grille peut s’afficher en surimpression pendant que vous travaillez, partout où il y a du texte.

## Terminer les colonnes à niveau

Quand une page se termine au milieu du texte, ses colonnes devraient finir à la même hauteur. C’est l’**équilibrage des colonnes**:index{term="équilibrage des colonnes"}, et c’est plus difficile qu’il n’y paraît : les lignes avancent par pas entiers de la grille, les figures ne se coupent pas, les titres doivent rester avec leur texte et les paragraphes ne doivent pas laisser d’orphelines derrière eux. Postext met une colonne courte à niveau avec trois leviers, utilisés par ordre de préférence et dessinés dans :ref{id="column-balancing"} :

1. **L’espace au-dessus des titres**, une ligne de grille entière à la fois, réparti selon l’importance et jamais en tête de colonne
2. **Une ligne après la fin d’une liste**
3. **Des paragraphes plus lâches** : un paragraphe composé une ligne plus long, la _looseness_ de TeX, accepté seulement si aucune de ses lignes ne s’étire au-delà de la limite d’espacement des mots ; si cela aide, une touche d’interlettrage, au plus dix millièmes de cadratin

Chaque correction est vérifiée en remettant la page en page, jusqu’à huit fois, et le meilleur résultat l’emporte. Certaines colonnes sont laissées telles quelles à dessein : la dernière colonne avant un saut de page forcé ou une ouverture de chapitre, la dernière page du document, une colonne qui n’a rien à étirer. Deux règles voisines mettent à niveau les colonnes de fin d’un chapitre, ainsi que les colonnes placées au-dessus d’un bloc sur toute la largeur de la page qui se déplace ou se scinde.

## Bandes et blocs sur toute la largeur

Une page n’est pas toujours un seul jeu de colonnes de haut en bas. Une figure, un tableau ou un encadré sur toute la largeur de la page la découpe en **bandes**:index{term="bandes"} : le texte placé au-dessus du bloc remplit ses colonnes comme une bande à part, le bloc traverse la page, et les colonnes reprennent en dessous. Chaque bande est équilibrée séparément : le lecteur descend la première colonne puis remonte en tête de la seconde avant de franchir le bloc, comme dans un journal. Quand une bande finirait de façon inégale, un **plafond de bande** ramène ses colonnes au même nombre de lignes, et le texte qui ne tient plus continue en dessous.

Les colonnes de fin d’un chapitre reçoivent le même traitement. Plutôt que de laisser la dernière page avec une colonne pleine et une autre presque vide, un plafond de fin répartit les lignes restantes entre elles, et les leviers d’équilibrage font le reste. Les sauts de colonne explicites sont respectés : \`:::columnbreak\` termine une colonne là où l’auteur le veut, et l’équilibrage ne touche pas au pied de cette colonne.

:::callout{type="try"}
Dans le panneau **Maquette**, ouvrez **Titres et table des matières** et désactivez **Équilibrer les colonnes**. Regardez le pied des colonnes de ce chapitre, puis réactivez l’option et voyez quel levier le moteur a utilisé sur chaque page.
:::

## Des règles à choisir

Certaines décisions relèvent du style maison plutôt que du juste et du faux, et la configuration les laisse au livre. Une courte liste de trois éléments a-t-elle le droit de se couper entre deux colonnes ? Une figure peut-elle flotter sur une ouverture de chapitre ? Chacune de ces **règles de composition** prend l’une de trois valeurs.:index{term="règles de composition"} :chip[allow]{style="state"} laisse le moteur le faire, :chip[warn]{style="state"} le laisse faire et ajoute une entrée au panneau Vérifications, et :chip[avoid]{style="state"} oblige le moteur à modifier la page pour que cela n’arrive jamais : la liste entière part avec son introduction, le flottant attend la page qui suit l’ouverture. Régler une règle sur warn permet à un éditeur de savoir combien de fois un livre l’enfreindrait avant de trancher.

# Figures, tableaux et flottants {lead="Un renvoi est une promesse, pas une position. Citez une figure et Postext lui trouve une place : le premier emplacement libre après la mention, numérotée dans l’ordre de lecture, légendée, jamais avant les mots qui l’appellent." summary="Où vont les ressources, comment elles sont numérotées, les tableaux qui se scindent"}

Tout ce qui n’est pas du texte courant (images, schémas SVG, tableaux) est une **ressource**. Les ressources sont déclarées hors du texte, chacune avec un identifiant, un type, une légende et ses préférences de placement, et le Markdown se contente de les citer. Dans le Sandbox, elles se trouvent dans le panneau **Ressources**.

## Une seule mention suffit

:index{term="flottants"}Écrire \`:ref{id="…"}\` dans une phrase fait deux choses : cela imprime l’étiquette de la ressource et, la première fois, cela _incorpore_ la ressource, qui flotte alors vers le premier emplacement libre après le renvoi. Les emplacements sont essayés dans l’ordre, comme le montre :ref{id="float-slots"} : le pied de la colonne qui contient le renvoi, puis la tête et le pied de la colonne libre suivante, puis une bande sur la page suivante. Le texte n’est jamais interrompu.

Quelques règles gardent les flottants dans le droit chemin :

- Un flottant ne se place jamais avant son renvoi et n’est jamais réduit pour tenir
- Les flottants d’une même séquence de numérotation gardent leur ordre : la figure 12 n’apparaît jamais avant la figure 11 ; un tableau qui attend de la place ne retient pas les figures
- Les flottants ne sortent jamais de leur chapitre : les ouvertures de chapitre, les pages de partie et la fin du document sont des barrières
- Un flottant qui laisserait moins de trois lignes de texte sur une nouvelle page attend la suivante
- Les bandes de tête et de pied sont alignées sur la grille de ligne de base, et la légende d’un flottant en pied partage la ligne de base de la dernière ligne de texte

## Placement

Chaque ressource peut indiquer où elle préfère aller, et chaque type de ressource a une valeur par défaut ; les champs sont réunis dans :ref{id="placement-options"}. Une ressource peut aussi être intégrée dans le texte à un point précis, quand sa position est _ici_. Et un tableau ou une figure trop larges pour la page peuvent pivoter d’un quart de tour : ils occupent alors une page à eux, placés contre le dos.

## Numéros et étiquettes

Les types de ressource définissent leurs propres séquences de numérotation. Les figures et les tableaux sont intégrés et traduits dans la langue du document ; un type peut ajouter un préfixe, une étiquette courte, un modèle comme \`{h1}.{n}\` pour une numérotation relative au chapitre (la figure 5.2 est la deuxième figure du chapitre 5), une règle de remise à zéro et un format de compteur. Les numéros suivent le **premier renvoi dans l’ordre de lecture** : insérez une mention plus tôt, et tous les numéros qui suivent changent. Un renvoi peut imprimer le numéro seul, l’étiquette complète ou l’étiquette courte, changer de casse, ou imprimer un texte à lui.

La numérotation reste juste sur tout un livre parce qu’elle fait partie de ce que chaque chapitre hérite des chapitres précédents. Le septième chapitre de ce guide commence ses figures à 7.1 parce que le compteur de chapitres le dit, et non parce que quelqu’un a saisi le numéro, et déplacer un chapitre renumérote tout ce qui le suit à la prochaine mise en page du livre.

## Des types à vous

Les figures et les tableaux ne sont que les deux types dont tout livre a besoin. Une configuration peut déclarer autant de types de ressource qu’une publication en utilise (cartes, planches, encadrés, graphiques, documents), chacun avec un nom au singulier et au pluriel, une étiquette courte pour les renvois, un préfixe pour ses légendes et une séquence de numérotation à lui. Un catalogue peut numéroter ses planches 1, 2, 3 sur tout le livre tandis que ses figures repartent à chaque chapitre ; un manuel peut numéroter ses encadrés 1-1, 1-2 dans le premier chapitre et 2-1 dans le deuxième. Chaque type peut aussi porter son placement par défaut et ajuster le style de légende : les planches peuvent occuper une page entière avec leur légende au-dessus, tandis que les figures flottent à la largeur de la colonne.

Un type sans préfixe ni légende est utile lui aussi : il transforme une image en ornement, en vignette ou en logo qui peut être intégré exactement là où il est cité, sans numéro et sans jamais entrer dans la liste des figures.

## Tableaux

:index{term="tableaux"}Les tableaux portent leur modèle en ligne : des rangées de cellules avec fusions de colonnes et de rangées, rangées d’en-tête, alignement et largeurs de colonne relatives. Les cellules acceptent le Markdown en ligne, des paragraphes et des listes simples, un fond à elles (les quatre couleurs de partie de ce livre sont le :swatch{color="#2b4acb"} bleu, le :swatch{color="#8f6408"} doré, le :swatch{color="#1f7a6d"} vert canard et le :swatch{color="#c0452f"} vermillon) et même une image. Les tableaux se mettent en forme une fois pour tout le document : typographie du corps et de l’en-tête, fond de l’en-tête, filets en grille, horizontaux seulement, extérieurs seulement ou aucun.

Les tableaux se modifient dans le panneau **Ressources**, avec un éditeur qui fonctionne comme un petit tableur : ajouter ou supprimer des rangées et des colonnes, fusionner et scinder des cellules, marquer les rangées et les colonnes d’en-tête, aligner les cellules, régler les fonds et les largeurs de colonne, déposer une image dans une cellule et coller un bloc de cellules copié depuis un tableur. Chaque modification peut être annulée, et le tableau sur la page suit au fil de la saisie.

Un tableau plus haut que la page se scinde sur plusieurs pages. Ses rangées d’en-tête se répètent sur chaque tronçon, la légende de chaque suite reçoit le suffixe _(suite)_, une mention _Suite page suivante_ ferme chaque tronçon sauf le dernier, et aucune coupure ne traverse jamais une fusion de rangées. Un tableau pivoté se scinde de la même façon, page après page.

## Des figures à côté du texte

Dans une mise en page à une colonne et demie dont la colonne latérale ne porte que des flottants, les ressources peuvent vivre à côté du texte plutôt qu’à l’intérieur. Une figure avec l’étendue _side_ s’empile dans la colonne latérale, à côté du paragraphe qui la cite ; un encadré peut faire de même, et les manuels peuvent ainsi garder les définitions, les notions clés et les figures marginales à côté des lignes qu’elles expliquent. Une figure large peut aussi garder sa légende à côté d’elle, dans la colonne latérale : c’est la disposition classique des manuels illustrés et des catalogues d’exposition. Les préréglages de démonstration comprennent un manuel de biochimie et une édition littéraire composés exactement de cette façon.

## Le texte qui contourne

:index{term="habillage du texte"}Une image ou un encadré plus étroits que leur colonne peuvent se placer d’un côté de celle-ci : le texte court à côté, sur la justification qui reste, et retrouve toute la justification en dessous, comme dans un magazine. Les lignes restent sur la grille de ligne de base, et le paragraphe qui commence à côté de l’image et finit sous elle reste un seul paragraphe. Un dessin détouré peut aller plus loin : avec un habillage en **contour**, chaque ligne est composée aussi courte que le dessin est large à sa hauteur, si bien que le texte suit le tracé et non la boîte. Les titres, les formules et les autres figures ne courent pas à côté d’un élément habillé ; ils attendent en dessous.

## Zones de sécurité

Une photographie a rarement besoin de tout ce qu’elle montre. Une image peut marquer sa **zone de sécurité**:index{term="zone de sécurité"}, le rectangle qui contient l’essentiel, et le moteur peut alors la recadrer n’importe où entre l’image entière et ce rectangle, en gardant sa largeur. Il se sert de cette liberté pour garder une image dans une colonne qu’elle laisserait sinon trop courte, pour faire tenir une image plus haute que la page et pour équilibrer les colonnes : une image dotée d’une zone de sécurité peut grandir de lignes entières pour remplir le pied d’une colonne courte, sans laisser de trou visible. La zone de sécurité se trace sur l’image dans le panneau **Ressources**, et les cases de bande dessinée utilisent la même marque pour savoir ce qu’il ne faut jamais couper.

## Légendes et crédits

Une légende se compose du préfixe du type, du numéro et du texte de légende, qui accepte le Markdown en ligne et ses propres renvois. Les légendes se placent au-dessus ou au-dessous de leur ressource, éventuellement sur un bandeau de couleur, dans le caractère et le corps du style de légende ; l’étiquette peut être en gras ou en couleur, comme dans ce livre. Une ressource peut aussi porter une note : une ligne de crédit ou de source plus petite, composée en dessous.

## Pivotées d’un quart de tour

Certaines ressources sont plus larges que la page n’est haute : une frise chronologique, un grand tableau de résultats, une planche panoramique. Une telle ressource peut pivoter d’un quart de tour, dans le sens des aiguilles d’une montre ou dans le sens inverse. Elle occupe alors une page à elle, placée contre le dos, pour qu’il soit naturel de tourner le livre pour la lire, et elle est dimensionnée d’après la hauteur de la page plutôt que d’après sa largeur. Un tableau pivoté plus haut qu’une page pivotée (c’est-à-dire plus large que la hauteur de la page) se scinde sur autant de pages qu’il le faut, en répétant ses rangées d’en-tête, comme le ferait un tableau droit.

## Figures vectorielles

Les schémas SVG sont dessinés en vectoriel partout. Le PDF convertit le sous-ensemble courant du SVG (formes, tracés, groupes, tracés de détourage, aplats et contours, opacité et texte) en opérations de dessin natives, et pixellise tout ce qui va au-delà à 600 dpi ; une figure peut aussi apporter son propre original PDF, intégré tel quel. Pour l’impression en une couleur, une option recolore chaque schéma en teintes d’une seule encre, selon la luminance, dans les trois moteurs de rendu.

Trois figures composées ici le démontrent. La rosace de :ref{id="vector-rosette"} est faite de courbes de Bézier, de traits extrêmement fins et d’une ligne de microtexte de deux points et demi de haut ; le graphique de :ref{id="vector-chart"} combine une surface remplie, une ligne en tirets et des étiquettes en texte ; et :ref{id="vector-clip"} utilise un tracé de détourage, un groupe dessiné avec de la transparence et une forme réutilisée cinq fois. Ouvrez le PDF, agrandissez-les plusieurs fois et regardez leurs bords : ils restent aussi nets que le texte qui les entoure, parce qu’ils sont dessinés avec les mêmes opérateurs, et non collés comme des images. Essayez de sélectionner les étiquettes du graphique, ou de les rechercher : ce sont du texte.

Le texte d’un SVG reste du texte. Dans le PDF, il est composé avec de vraies polices et peut être sélectionné et recherché, et dans le Sandbox, il peut être modifié sur place : le panneau **Ressources** ouvre la source du schéma avec seulement son texte modifiable (le dessin lui-même reste verrouillé, sauf si vous le déverrouillez), si bien qu’une étiquette peut être corrigée ou traduite sans ouvrir de logiciel de dessin. Les schémas de ce livre sont générés pour chaque langue : c’est pourquoi leurs étiquettes sont en espagnol dans l’édition espagnole, en catalan dans l’édition catalane, en chinois dans l’édition chinoise, en arabe dans l’édition arabe et en français dans celle-ci. Un même schéma sert ensuite toutes les sorties, de l’écran au papier.

:::callout{type="try"}
Cliquez sur la légende de n’importe quelle figure dans le canvas : le panneau **Ressources** s’ouvre sur cette ressource, avec son champ de légende prêt. Changez son placement de _auto_ à _top_ et regardez-la se déplacer.
:::

## Vidéos

:index{term="vidéos"}Une vidéo est une ressource de plus. Elle est citée, numérotée dans sa propre séquence (Vidéo 1.1 à côté de Figure 1.1) et flotte vers le premier emplacement libre comme une figure. Elle peut venir de YouTube ou de Vimeo, d’un fichier conservé dans le livre ou d’une adresse web : un fichier MP4 ou WebM, ou un flux HLS.

L’imprimé porte son affiche, une image choisie, avec un symbole de lecture et un code QR qui ouvre la vidéo ; dans le PDF, l’affiche est aussi un lien. La vue HTML et l’EPUB la lisent, sauf les vidéos YouTube, Vimeo et HLS, vers lesquelles un livre numérique ne peut que pointer par un lien. Dans la vue Folio, un clic sur l’affiche la lit sur la page, et elle continue pendant que le feuillet tourne. Les vidéos de ce livre, comme :ref{id="postext-showreel"}, sont des flux HLS.

# Encadrés, notes et marques {#boxes lead="Autour du texte courant, un livre garde une seconde couche : des encadrés qui mettent un aparté à part, des notes au pied de la colonne, de petites marques dans la ligne et un index qui se souvient de chaque page. Chacun s’écrit dans le Markdown et se dessine par la configuration." summary="Encadrés, encadrés imbriqués et flottants, pastilles, notes de bas de page et index"}

Le texte courant n’est qu’une partie de ce que le lecteur rencontre sur une page. Les manuels encadrent les définitions et les exercices, les essais renvoient leurs sources au pied de la page, les modes d’emploi marquent les touches et les états au fil de la phrase, et les longs ouvrages se terminent par un index. Postext traite chacun d’eux comme un contenu qui porte un nom, écrit là où il se rattache au texte, et laisse son apparence à la configuration. Ce chapitre les emploie tous sur ses propres pages.

## Encadrés

:index{term="encadrés"}\`:::callout\` compose un encadré, avec un titre facultatif, dans l’un des styles que définit la configuration. Ce livre en définit cinq : les encadrés _Essayez-le_ qui vous envoient vers le Sandbox, les notes techniques, les citations en exergue composées en italique de titrage, le panneau sombre sur toute la largeur de la page pour les chiffres clés et, nouveau dans ce chapitre, un aparté de marge signalé par un filet. Un style décide du fond de l’encadré, de sa bordure, de son liseré et du rayon de ses coins, d’une icône ou d’un repère facultatifs, de la typographie de son titre, de son corps et de ses listes, et de sa place : dans le flux, en tête ou en pied de colonne, sur toute la largeur de la page, dans la colonne latérale d’une mise en page à une colonne et demie, ou fixé à une position de la page.

Un long encadré peut se couper entre ses paragraphes, voire entre ses lignes, en gardant au moins deux lignes de chaque côté ; la suite omet le titre. À l’intérieur d’un encadré, \`:::columns\` compose son contenu en colonnes équilibrées, comme le panneau de chiffres de :ref{id="engine"}.

Les attributs d’un encadré peuvent remplacer son style pour lui seul : un \`title\`, un \`placement\`, un \`span\` de colonne, de page ou de colonne latérale, et un \`label\` imprimé dans un onglet à son coin supérieur, comme les libellés _Encadré 1-1_ d’un manuel. Les styles peuvent aussi arrêter les flottants à leur bord, pour qu’une figure mentionnée dans un encadré ne s’échappe jamais au-delà, et décider si un encadré trop haut pour sa colonne doit se couper ou donner lieu à un avertissement.

## Des encadrés dans les encadrés

:index{term="encadrés!imbriqués"}Un encadré peut en contenir un autre. Un exemple corrigé dans une leçon, une mise en garde dans une procédure : l’encadré intérieur s’ouvre dans l’encadré extérieur et se ferme avant lui, chaque \`:::\` seul fermant l’encadré le plus intérieur encore ouvert. L’encadré intérieur prend la largeur de son parent, moins les marges intérieures de celui-ci, et garde son propre style : une note technique peut ainsi porter un encadré _Essayez-le_ sans que l’un ou l’autre perde ses couleurs.

:::callout{type="note" title="Deux encadrés, un seul bloc"}
L’encadré extérieur est une note technique. Il reste solidaire de ce qu’il contient, si bien que le moteur place les deux comme un seul bloc : il ne laisse jamais l’encadré intérieur seul en tête de la colonne suivante.

:::callout{type="try"}
Ouvrez le panneau **Texte** sur ce chapitre et supprimez la ligne qui ferme l’encadré intérieur. L’encadré extérieur finit alors là où finit le chapitre, et le panneau **Vérifications** le signale.
:::

L’encadré extérieur continue après l’encadré intérieur, dans son propre style.
:::

## Des encadrés qui flottent

Un encadré se place d’ordinaire là où il est écrit, entre les paragraphes qui l’entourent. Certains encadrés n’ont aucune raison d’interrompre la lecture : un encadré latéral, un portrait, un résumé de chiffres. Avec un \`placement\` _top_ ou _bottom_, un tel encadré flotte comme une figure vers la tête ou le pied de la première colonne qui a de la place pour lui, et le texte qui le suit dans le Markdown remplit la page au-dessus ou au-dessous. L’encadré qui suit ce paragraphe a été écrit ici, au milieu de la section, et composé au pied d’une colonne.

:::callout{type="aside" placement="bottom" title="Où se pose un encadré flottant"}
Dans le premier emplacement libre à partir de l’endroit où il est écrit, selon la règle que suit une figure. Un encadré qui doit rester entier cède la place aux encadrés et aux figures déjà placés, jamais l’inverse.
:::

Un encadré flottant garde toutes les autres règles de son style. Il peut être plus large qu’une colonne, porter un libellé, et il ne remonte jamais avant l’endroit où il a été écrit : le lecteur qui le rencontre a toujours lu le paragraphe qui y mène.

## Repères et encadrés dessinés

Un style peut dessiner un **repère** hors de l’encadré, dans une étroite colonne à lui, à côté : une icône, un glyphe, une forme ou une image des ressources, avec un filet qui descend sur toute la hauteur de l’encadré. L’aparté qui a flotté depuis la section précédente en porte un : un point doré au-dessus d’un filet de la même couleur.

Quand un repère ne suffit pas, un style peut dessiner tout l’encadré avec un **design**, fait des mêmes emplacements de texte, de boîtes, de filets et d’images qui dessinent les ouvertures de chapitre de ce livre. Le texte de l’encadré devient un élément parmi les autres, et les attributs écrits sur l’encadré peuvent s’imprimer dans le design : un numéro dans une pastille, un niveau dans un onglet, un nom dans un bandeau au pied. Le cahier d’écriture, parmi les recettes de la section Recettes, dessine ainsi ses lignes de tracé.

## Des marques dans la ligne

:index{term="pastilles"}Certains contenus sont plus petits qu’un encadré. \`:chip[…]\` compose un mot dans une petite boîte arrondie qui suit le texte, pour les touches, les états et les étiquettes : un réglage qui peut valoir :chip[allow]{style="state"}, :chip[warn]{style="state"} ou :chip[avoid]{style="state"}, ou une touche comme :chip[Esc]. Une pastille a un style, comme un encadré : son fond, sa bordure, son rayon, son caractère et sa couleur, et l’espace qui l’entoure, le tout tiré de la configuration. Les pastilles passent à la ligne avec le texte sans jamais se couper à l’intérieur, et le moteur compte leur largeur quand il choisit les coupures du paragraphe.

Les pastilles de couleur sont une seconde sorte de marque. Écrite \`:swatch{color="#c0452f"}\`, une pastille de couleur compose dans la ligne un petit carré de cette couleur, :swatch{color="#c0452f"} comme celui-ci : c’est ainsi qu’une charte graphique ou un tableau d’encres nomme une couleur et la montre d’un même geste.

## Notes de bas de page

:index{term="notes de bas de page"}Une note s’appelle avec \`[^id]\` juste après le mot ou la ponctuation auxquels elle se rattache,[^first-note] et s’écrit n’importe où dans le chapitre, sous la forme d’un paragraphe qui commence par \`[^id]:\`. Les notes sont numérotées dans l’ordre de leur premier appel, en repartant de un dans chaque chapitre ; \`footnotes.numbering\` peut les numéroter en continu sur tout le livre ou recommencer à chaque page, comme le font les livres chinois et arabes classiques, et les numéros peuvent s’imprimer en chiffres cerclés ou entre crochets.

[^first-note]: En voici une. Elle a été écrite quelques lignes plus bas dans le Markdown, comme un paragraphe à part, et composée au pied de la colonne qui contient la ligne où elle est appelée.

Une note se compose au pied de la colonne qui contient la ligne où elle est appelée, sous un court filet, et la ligne et sa note partagent toujours une colonne : quand la note ne tient pas, la ligne part avec elle.[^second-note] \`footnotes.placement: 'chapterEnd'\` réunit plutôt les notes d’un chapitre après son dernier bloc. Un appel sans note et une note que rien n’appelle sont tous deux signalés dans le panneau **Vérifications**. Parmi les livres d’exemple, _Le Paradis perdu_ en porte huit cents, appelées par des lettres qui recommencent à chaque page.

[^second-note]: Le moteur équilibre la colonne en comptant les lignes de la note : une page qui porte des notes finit elle aussi à niveau.

## Un index en fin d’ouvrage

:index{term="index"}L’index s’écrit là où le texte traite de chaque terme. \`:index[anémie]\` imprime le mot et l’enregistre ; \`:index{term="Cœur!valvules"}\` n’imprime rien et enregistre la page sous une sous-entrée. Un drapeau \`main\` met la page en gras, \`range="start"\` et \`range="end"\` délimitent un développement qui court sur plusieurs pages, et \`see\` et \`seealso\` écrivent des renvois. \`:::index\` imprime l’index là où il se trouve, d’ordinaire sous un titre dont le style le compose sur deux colonnes, et des index nommés, des personnes ou des lieux, vivent à côté de l’index principal.

Le moteur lit la page de chaque marque après la mise en page, si bien que les numéros suivent le texte : ajoutez un paragraphe, déplacez un chapitre ou changez le format, et l’index imprime les nouvelles pages. Les entrées sont triées dans l’ordre alphabétique de la langue du document et regroupées sous leurs lettres initiales, les pages consécutives se réunissent en une plage, et chaque numéro est un lien dans le PDF. Un index arabe ignore l’article _al-_ dans son tri, et un index chinois trie selon la lecture de chaque caractère. Ce livre en a un, à la fin, construit à partir de marques écrites dans chaque chapitre.

# Livres, parties et titres courants {lead="Un livre est plus que ses chapitres : une couverture, une table des matières qui se tient à jour, des pages de partie, des ouvertures qui annoncent chaque chapitre et des titres courants qui savent où se trouve le lecteur. Tout cela relève de la configuration." summary="Chapitres, styles de titre, emplacements de design, parties, table des matières et numéros de page"}

Ce guide est un livre de vingt et un chapitres, et chaque chapitre est un document Markdown à part entière. Un projet du Sandbox est toujours un livre : la configuration, les ressources et les polices sont partagées, et les chapitres se suivent, comme le montre :ref{id="book-anatomy"}.

## Des chapitres au livre

Chaque chapitre est mis en page séparément, _dans la continuité_ des chapitres précédents : il hérite de leur nombre de pages et de leur parité, de leurs compteurs de chapitres et de figures, de la partie ouverte et des titres courants. C’est pourquoi les figures de ce chapitre sont numérotées à partir de 7.1, et pourquoi modifier un chapitre n’oblige jamais le moteur à recomposer tout le livre. Les aperçus peuvent montrer le chapitre en cours ou le livre entier ; le PDF peut se construire pour l’un ou pour l’autre. Les chapitres peuvent être ajoutés, renommés, réordonnés, scindés à leurs titres de niveau 1 ou fusionnés avec le précédent.

## Ce qu’hérite un chapitre

La continuité que reçoit un chapitre est réduite et précise. Elle porte le nombre de pages et la parité de la page suivante, pour qu’une ouverture qui doit tomber sur un verso sache s’il lui faut une page blanche devant elle. Elle porte les compteurs : le numéro de chapitre, les numéros de chaque séquence de ressources, la séquence de numérotation des étiquettes de page. Elle porte la partie ouverte, avec son titre, son numéro et sa palette, pour qu’un chapitre placé au milieu d’une partie garde ses couleurs. Et elle porte le plan du livre, pour qu’une table des matières placée dans le deuxième chapitre puisse imprimer la page où commence le dixième.

Comme cette continuité est tout ce dont un chapitre a besoin du reste du livre, les chapitres peuvent être mis en page indépendamment, en arrière-plan, puis assemblés pour la vue du livre entier et pour le PDF. Le résultat est le même que si l’on mettait en page tout le livre d’un coup, page pour page : c’est une propriété que le moteur est construit pour garantir.

## Styles de titre

Un titre peut porter des attributs, écrits entre accolades à la fin de sa ligne. Le plus puissant est le **style** : \`{style="cover"}\` applique un style de titre nommé, qui change la typographie et le design du titre et peut changer, pour la section que le titre ouvre, les titres courants, les marges de la page, la disposition des colonnes, la typographie du texte courant et la palette. La couverture de ce livre est un style de titre avec ses propres marges, sans titres courants et avec un design pleine page ; la table des matières en est un autre. Un style peut aussi laisser ses titres sans numéro, pour qu’une préface ne décale pas les numéros des chapitres, et les tenir hors de la table des matières.

## Un regard sur la configuration de ce livre

Il vaut la peine de voir comment sont construites les pages que vous lisez. La couverture est le titre de niveau 1 du premier chapitre, avec le style _cover_. Ce style donne à la section des marges qui repoussent tout texte au pied de la page, supprime les titres courants et dessine un design pleine page : une boîte qui remplit le fond perdu de la couleur nuit, l’illustration de couverture comme élément image ancré en haut du fond perdu, un surtitre en capitales dorées largement interlettrées, le titre tiré de l’en-tête du document en Fraunces à 88 points, un court filet doré, le sous-titre en Lora italique et une ligne de crédits au pied. Le surtitre et les crédits viennent d’attributs du titre, écrits sur sa ligne dans le Markdown.

Les ouvertures de chapitre sont un design du premier niveau de titre. Une boîte remplit le haut du fond perdu de la couleur de la partie ; le numéro du chapitre est imprimé en grand au bord extérieur, le surtitre associe le mot _Chapitre_, le numéro et le titre de la partie, et sous un court filet blanc viennent le titre et l’introduction du chapitre, tirée de l’attribut \`lead\` du titre. L’attribut \`summary\` du même titre est ce que la table des matières imprime sous chaque entrée. Rien dans ces designs n’est propre à ce livre : n’importe quelle configuration peut composer les siens.

## Emplacements de design

:index{term="emplacements de design"}Les titres courants, les pieds de page, les ouvertures de chapitre et les pages de partie sont dessinés par des **emplacements de design** : de petites compositions libres de texte, de filets, de boîtes et d’images. Chaque élément est ancré à la page, au fond perdu, à la zone de texte ou à un autre élément, avec des décalages et des tailles en unités réelles, et son texte peut contenir des **champs** comme \`{pageNumber}\`, \`{chapterTitle}\`, \`{partTitle}\` ou n’importe quel attribut du titre, comme le \`{attr.lead}\` qui compose l’introduction dans le bandeau de ce chapitre. Les éléments peuvent être limités aux pages impaires ou paires, et aux pages d’un rôle donné (courante, ouverture, partie ou blanche) : c’est ainsi que les titres courants de ce livre disparaissent sur les ouvertures de chapitre tandis qu’un folio apparaît à leur pied. Les éléments de texte peuvent passer à la ligne, se couper, se tronquer avec des points de suspension, dessiner une boîte derrière eux et s’ouvrir sur une lettrine.

Les titres courants sont un emplacement de design ordinaire, dont les éléments sont filtrés par parité et par rôle. Sur les versos de ce livre, le folio dans la couleur de la partie et le titre du livre se placent au bord extérieur ; sur les rectos, le titre du chapitre et le folio. Ils n’apparaissent que sur les pages courantes ; les ouvertures portent à la place un folio en pied, et les pages de partie ne portent rien. La page noire qui fait face à chaque page de partie est elle aussi un élément de design : une boîte qui remplit le fond perdu, affichée seulement sur les versos blancs, qui, dans un livre dont les chapitres s’ouvrent sur un verso et les parties sur un recto, sont exactement les pages qui font face à une partie.

## Parties et palettes

:index{term="parties"}\`:::part\` ouvre une page de partie : une page à part, placée à la parité que demande la configuration, dessinée par le design de partie et suivie d’un corps, en général la liste de ses chapitres. Les parties se transmettent d’un chapitre à l’autre : les titres courants et les ouvertures des chapitres suivants peuvent nommer la partie à laquelle ils appartiennent, et elles figurent à la fois dans la table des matières et dans les signets du PDF.

Dans ce livre, chaque partie s’ouvre sur une double page : un verso noir à gauche, la page de partie à droite. Les parties commencent avec la parité _toujours impaire_, qui pose un feuillet blanc avant chaque page de partie et en ajoute un second quand le chapitre précédent se termine sur un verso : la page de partie tombe toujours sur un recto, précédée d’un verso blanc. Le premier chapitre de la partie s’ouvre alors au dos de la page de partie, sur un verso, comme tous les chapitres.

Une partie peut aussi changer les couleurs du livre. Les couleurs de la configuration peuvent être liées à des entrées nommées de la **palette**:index{term="palette"}, et l’attribut \`palette\` d’une partie remplace ces entrées jusqu’à la partie suivante. Ce livre définit une entrée, la _couleur de partie_, et chaque partie la fixe : bleu pour les fondements, doré pour le métier, vert canard pour les pages au-delà du texte courant, vermillon pour la pratique. Les bandeaux de chapitre, les numéros des titres, les folios courants et les légendes suivent tous.

## Une table des matières à jour

:index{term="table des matières"}\`:::toc\` imprime la table des matières : une entrée pour chaque titre des niveaux retenus et une ligne pour chaque partie, avec numéros, titres, points de conduite, numéros de page et, en option, une ligne tirée d’un attribut du titre (dans ce livre, le résumé de chaque chapitre). Les numéros de page sont réels : le moteur met le livre en page, lit où chaque titre est tombé et recompose la table des matières jusqu’à ce que les numéros se stabilisent, ce qui demande au plus trois passes supplémentaires. Les entrées sont des liens dans le PDF.

## Sauts de page et numérotation

\`:::pagebreak\` commence une nouvelle page, et peut en demander une impaire ou paire, en ajoutant une page blanche si nécessaire. \`:::numbering\` change la séquence des numéros de page à partir de la page suivante : c’est ainsi que des pages liminaires numérotées en chiffres romains passent le relais à des numéros arabes au premier chapitre. Les ouvertures de chapitre peuvent demander leur propre parité, et les pages blanches sont reconnues comme telles : les titres courants les laissent vides. Enfin, quand un passage veut un peu plus d’air au-dessus de lui, \`:::space\` laisse une ligne blanche, ou \`:::space{lines=2}\` deux ; les lignes vides supplémentaires dans le Markdown n’ajoutent rien, comme dans tout Markdown.


# Un livre, plusieurs langues {#languages lead="Ce guide existe en dix éditions, dans quatre écritures et deux sens de lecture, et elles partagent une même maquette. Chaque édition ne garde que ce que sa langue doit dire autrement." summary="Éditions, réglages généraux, réglages propres, écritures et sens de lecture"}

Un livre traduit est d’ordinaire un second livre. Son graphiste ouvre le premier, en enregistre une copie et commence à y changer des choses, et dès lors chaque correction de la maquette doit se faire deux fois, ou dix, à la main. Postext garde au contraire ensemble les éditions d’un livre : un seul projet, avec un jeu de chapitres pour chaque langue, une maquette commune et, pour chaque langue, une courte liste des réglages qu’elle fixe autrement.

## Éditions

:index{term="éditions"}Un livre du Sandbox peut contenir plusieurs langues. Chaque **édition** a ses propres chapitres, son propre nom et sa propre description et, là où une figure le demande, ses propres illustrations ; les ressources, les polices et la maquette appartiennent au livre. Le panneau **Livres** affiche une étiquette pour chaque langue que contient un livre, et l’adresse de la page nomme celle qui est à l’écran : un lien ouvre l’édition depuis laquelle il a été copié. Le canvas peut mettre deux éditions côte à côte, et c’est ainsi qu’un traducteur vérifie que le chapitre espagnol tient encore dans les pages que remplit le chapitre anglais.

Une nouvelle édition naît comme une copie de celle qui est à l’écran, encore à traduire, depuis **Ajouter une langue…** dans le menu du livre. Quand la nouvelle langue est l’arabe, le chinois ou le japonais, la copie prend au passage les valeurs par défaut de cette langue : le sens de lecture, le mode d’écriture, les caractères et les règles de sa typographie, trop éloignés de ceux d’un livre latin pour être laissés au hasard.

## Réglages généraux et réglages propres

La maquette d’un livre en plusieurs langues tient en deux couches. Les **réglages généraux** sont ceux qu’utilisent toutes les éditions:index{term="réglages généraux"} ; chaque langue a ensuite ses **réglages propres**, qui ne nomment que les champs qu’elle fixe autrement, fusionnés champ par champ par-dessus les réglages généraux. Une couleur, un corps ou une marge modifiés dans la couche générale atteignent toutes les éditions à la fois ; modifiés dans les réglages propres d’une langue, ils n’atteignent que cette édition.

Le panneau **Maquette** montre les deux couches avec un sélecteur en tête, entre _Toutes les langues_ et la seule langue en cours. Quand le sélecteur est sur une langue, un champ que cette langue fixe elle-même porte une marque, et le panneau peut envoyer une valeur vers la couche générale ou ramener une édition à celle-ci. Une courte liste en tête du panneau nomme chaque réglage que la langue fixe pour elle-même : un réglage propre ne se cache jamais dans un coin parmi cinq cents champs.

:::callout{type="note" title="Comment ce guide est réglé"}
Les sept éditions en écriture latine partagent presque tout : des réglages qui font la maquette, chacune n’en fixe que quelques dizaines pour elle-même, et ce sont tous des mots, les titres de ses encadrés, les noms de ses couleurs, de ses styles et de ses figures, le titre de ses titres courants et la langue de sa césure. Les éditions arabe, chinoise et japonaise gardent la même page, la même palette et les mêmes parties, et règlent leurs caractères, leur sens de lecture et leur mode d’écriture pour leurs écritures.
:::

Ces chiffres figurent dans :ref{id="edition-layers"}. Ce partage n’est pas un hasard de la rédaction du guide : ce sont les plus petits réglages propres que chaque édition puisse avoir, calculés par le moteur à partir des éditions elles-mêmes.

## Ce que change une langue

La langue du document est un réglage, \`locale\`, et sa portée va au-delà de la césure. Elle choisit les motifs de césure, dont huit langues sont intégrées ; les noms des types de figure et de tableau intégrés, _Figure_ en français, _Figura_ en espagnol, _Abbildung_ en allemand ; les mots qu’impriment un tableau scindé ou un encadré qui continue ; l’ordre d’un index ; et les chiffres, qu’un livre arabe peut composer en chiffres indo-arabes. Un titre ou un paragraphe peut changer de langue pour lui seul, et quelques mots d’une autre langue peuvent se marquer dans la ligne : une citation allemande dans un chapitre français se coupe alors selon les règles allemandes.

## Quatre écritures, deux sens de lecture

Les éditions de ce guide emploient toutes les sortes de composition que connaît le moteur. Les éditions latines se composent de gauche à droite, justifiées et coupées. L’édition **arabe** se lit à partir de la droite et se relie à droite : ses lignes se justifient en étirant les lettres par la kashida là où l’écriture le permet, et pas seulement en élargissant les espaces, les nombres et les mots latins gardent leur propre sens à l’intérieur de la ligne, et les figures sont dessinées en miroir là où leur disposition suit l’ordre de lecture.

Les éditions **chinoise** et **japonaise** se composent verticalement, en colonnes qui vont de haut en bas et de droite à gauche, reliées à droite comme l’édition arabe. Leurs lignes suivent les règles que chaque langue a fixées pour elle-même : quelle ponctuation peut ouvrir ou fermer une ligne, quelle place prend une virgule, où les mots latins se couchent sur le côté et où les nombres courts se tiennent droits dans la colonne. Le japonais ajoute le **ruby**:index{term="ruby"}, de petites lectures composées à côté des caractères difficiles, écrites dans le Markdown sous la forme \`:ruby[…]{rt="…"}\`, ou sous une forme plus courte entre accolades qui donne à chaque caractère sa propre lecture, avec une barre devant chaque lecture.

## Traduire sous les yeux du moteur

Comme les pages se composent au fil de la frappe, une traduction peut se juger à mesure qu’elle s’écrit. Une phrase allemande plus longue d’un tiers que sa source anglaise montre aussitôt ce qu’elle coûte, dans une colonne qui déborde d’une ligne ou un titre qui ne tient plus dans son bandeau. Les éditions de ce guide ont chacune été composées page par page, le panneau **Vérifications** ouvert et les colonnes relues pour y chercher les trous et les fins trop courtes, comme un compositeur les aurait composées à la main.

:::callout{type="try"}
Ouvrez le panneau **Livres** et faites passer ce guide d’une langue à l’autre avec les boutons de sa ligne. Ouvrez ensuite le panneau **Maquette**, mettez le sélecteur de son en-tête sur la seule langue en cours, et lisez la liste de ce que cette édition fixe pour elle-même.
:::

:::part{number="III" title="Au-delà du texte courant" palette="band=#1f7a6d"}
9. Pages composées
10. Bande dessinée et partitions
11. Exercices et cours
:::

# Pages composées {#composed lead="Toutes les pages ne sont pas un fleuve de texte. Une double page de manuel, une ouverture de magazine ou un aide-mémoire se construisent avec des blocs, chacun portant son propre morceau. Postext garde les blocs dans un gabarit et les mots dans le Markdown." summary="Gabarits de page, blocs, emplacements, doubles pages et texte qui ne tient pas"}

Les chapitres précédents composent du texte en colonnes qui courent de page en page, et le moteur décide où tombe chaque ligne. Toute une famille de livres fonctionne dans l’autre sens. Dans un manuel scolaire, chaque double page est dessinée d’abord : un bandeau pour le titre, un encadré pour la définition, une bande de photographies, une colonne d’exercices, une carte avec ses légendes. Les mots s’écrivent pour tenir dans les blocs, et quand ils n’y tiennent pas, quelqu’un les raccourcit ou déplace un bloc. Postext compose aussi ces pages, sous le nom de **pages composées**, et s’en tient à la règle que suit le reste du moteur : le Markdown dit ce qu’est le contenu, la configuration dit où il va.

## Gabarits et blocs

:index{term="pages composées"}Un **gabarit de page** fait partie de la configuration:index{term="gabarits de page"}, sous \`pageTemplates\`. Il nomme un ensemble de **blocs** : des rectangles placés sur la page par une ancre et un décalage ou par une case d’une grille, avec une largeur, une hauteur et un style d’encadré tiré des styles d’encadré du livre. Un bloc peut être aussi haut que son contenu, de hauteur fixe, ou descendre jusqu’au bord de la page ; les blocs peuvent s’empiler ou se ranger en ligne sous la forme d’un **groupe**, et quand l’un grandit, les autres bougent avec lui. Un gabarit porte aussi un **décor** : des filets, des bandeaux, des images et de courts textes placés une fois les blocs en place, si bien qu’un bandeau peut pendre d’un encadré et le suivre.

Aucun mot ne vit dans un gabarit. Un bloc a un nom, une taille et une apparence ; le titre qu’il imprime, le texte qu’il contient et l’image qu’il encadre viennent tous de la page qui l’utilise. C’est ce qui permet aux dix éditions de ce guide de partager un seul gabarit pour la page qui clôt ce chapitre : chacune remplit les mêmes blocs avec ses propres mots.

## Remplir les blocs depuis le Markdown

Une page composée est une clôture de quatre deux-points qui nomme son gabarit. À l’intérieur, \`:::frame{slot="…"}\` envoie son contenu au bloc de ce nom, et un titre, une ressource ou un encadré peuvent nommer un emplacement à eux. Le contenu qui ne nomme rien va au bloc marqué comme bloc de **flux** du gabarit, et le premier titre va au bloc qui reçoit les titres de son niveau. La dernière page de ce chapitre a été écrite ainsi, et son Markdown se lit comme celui de n’importe quel autre chapitre.

:::callout{type="note" title="La clôture de la dernière page"}
\`::::page{template="sheet"}\` l’ouvre et \`::::\` la ferme. Entre les deux, un titre pour l’intitulé, un paragraphe pour le bloc de flux, six blocs \`:::frame\` pour les cartes et un pour la légende au pied de la page. Les positions, les tailles et les couleurs sont dans le gabarit, sous Maquette › Page et colonnes › Gabarits de page.
:::

## Comment se compose une page

Une page composée prend une page à elle, ou deux pour une double page, et le texte qui suit sa clôture commence sur la page suivante. Le moteur place les blocs tour à tour, remplit chacun avec la typographie du reste du livre, les mêmes styles de paragraphe, titres, listes et pastilles, et dessine son encadré à sa taille finale. Les blocs se lisent dans l’ordre où leur contenu apparaît dans le Markdown, et non dans l’ordre où ils sont peints : un lecteur d’écran, le PDF balisé et l’EPUB recomposable lisent le titre, puis le texte, puis les encadrés, comme le ferait une personne.

## Quand les mots ne tiennent pas

Un texte écrit pour un bloc ne tient jamais du premier coup. Un gabarit dit ce que la page a le droit de faire, et le moteur essaie chaque étape dans l’ordre et s’arrête à la première qui marche. Un bloc qui suit son contenu grandit dans l’espace que lui laisse son groupe ; les blocs placés en dessous descendent ; les blocs marqués pour céder rétrécissent ; le texte peut se composer un peu plus serré. Quand rien de cela ne suffit, le texte continue dans un autre bloc, chaîné comme les blocs liés d’un logiciel de PAO, ou sur une page ajoutée après celle-ci, sous une mention qui dit où il continue.

Ce que la page n’a pas pu régler est signalé dans le panneau **Vérifications** avec ses propositions : quel bloc déborde, de combien de lignes, et ce qui le ferait tenir. Un **journal de recomposition** consigne chaque déplacement que le moteur a fait pour la page : un graphiste peut voir pourquoi un encadré a fini plus bas que le gabarit ne l’avait placé. Dans le Sandbox, un clic sur l’avertissement montre le bloc, et les champs du bloc sont à un clic de là.

## Doubles pages et connecteurs

:index{term="doubles pages"}Un gabarit peut couvrir deux pages en regard comme une seule feuille. Une **double page** s’ouvre sur un verso, ajoute une page blanche devant elle quand le texte qui précède finit sur un verso, et laisse les blocs et le décor traverser le dos là où le gabarit le permet ; une gouttière tient tout le reste à l’écart du pli. Les frises chronologiques, les cartes et les ouvertures sur double page se composent ainsi, et chaque page de la double page imprime toujours son propre titre courant et son propre folio.

Les blocs peuvent aussi se relier par des **connecteurs** : des lignes, des coudes et des courbes tracés entre deux blocs, qui restent attachés quelle que soit la façon dont les mots les déplacent, pour les organigrammes, les arbres généalogiques et les cartes légendées. Les images d’un bloc peuvent porter des légendes ancrées à des points de l’image, avec des traits de rappel et des flèches : une carte des fleuves garde ses noms sur les fleuves quand on la redimensionne ou qu’on la traduit.

## Les gabarits dans le Sandbox

Les gabarits se modifient dans le panneau **Maquette**, où chacun est dessiné avec ses blocs et listé avec le nombre de pages qui l’utilisent. Avec l’aperçu en mode **Maquette**, une page composée montre sa grille et ses marges, une pression sur un bloc le sélectionne, un glisser le déplace et ses poignées le redimensionnent ; le cadre est réécrit dans le gabarit en millimètres. Quand d’autres pages utilisent le même gabarit, le Sandbox demande si le changement vaut pour toutes ou pour cette page seulement, ce qui crée un nouveau gabarit fondé sur le premier.

Le chemin inverse existe aussi. Une page mise en page à la main peut s’enregistrer comme gabarit, et un livre dont les anciens styles contenaient les mots peut les faire passer dans le Markdown, là où ils ont leur place, avec une seule commande pour tout le livre.

:::callout{type="try"}
Passez l’aperçu en mode Maquette, allez à la dernière page de ce chapitre et faites glisser l’une des cartes vers le bas. Le Sandbox demande s’il faut modifier le gabarit ou cette page seulement ; choisissez cette page seulement et ouvrez le panneau **Texte** : la clôture nomme maintenant un nouveau gabarit.
:::

::::page{template="sheet"}
## Postext en une page

Postext compose des livres à partir de deux entrées : du Markdown qui dit ce qu’est le texte, et une configuration qui dit à quoi il ressemble. Changez l’un ou l’autre et les pages se recomposent, dans le navigateur, en une fraction de seconde.

:::frame{slot="card" label="Écrire"}
Du Markdown et quelques directives : \`:::callout\` pour un encadré, \`:ref\` pour une figure, \`[^id]\` pour une note, \`::::page\` pour une page comme celle-ci. Le texte ne dit jamais où va quoi.
:::

:::frame{slot="card" label="Concevoir"}
Plus de cinq cents réglages dans le panneau Maquette : la page et ses colonnes, les caractères, les encadrés, les ouvertures, les titres courants et une palette propre à chaque partie.
:::

:::frame{slot="card" label="Composer"}
Chaque paragraphe coupé d’un tenant, des colonnes à niveau, chaque figure au premier emplacement libre après sa mention, un livre recomposé jusqu’à ce que ses folios tiennent.
:::

:::frame{slot="card" label="Vérifier"}
Le panneau Vérifications liste ce qu’a vu le moteur : une ligne lâche, une police absente, une couleur trop pâle, une image trop grossière pour la presse. Un clic mène à la ligne.
:::

:::frame{slot="card" label="Publier"}
Une mise en page, cinq sorties : le canvas, du HTML pour l’écran, un PDF pour l’imprimeur ou l’archive, de l’EPUB pour les liseuses, un paquet SCORM pour un cours.
:::

:::frame{slot="card" label="Partager"}
Un livre voyage en un seul fichier .postext : chapitres, maquette, images et polices. La ligne de commande le compose sur un serveur ; le Sandbox l’ouvre partout.
:::

:::frame{slot="key" label="Touches"}
Cette feuille est une page composée : un gabarit avec un titre, un bloc de flux, une grille de cartes et un encadré en pied de page, rempli depuis le Markdown du chapitre. Dans l’éditeur, :chip[⌘ Z] annule et :chip[⌘ F] cherche ; :chip[Esc] ferme un dialogue.
:::
::::

# Bande dessinée et partitions {#comics lead="Certains livres parlent en images, d’autres en notes. Une bande dessinée est un ensemble de dessins et un scénario ; une partition est de la musique écrite comme du texte. Dans les deux cas, Postext garde les mots dans le Markdown et se charge lui-même du lettrage et de la gravure." summary="Cases, bulles, lettrage, strips et notation musicale"}

La bande dessinée et la musique semblent à l’opposé de ce pour quoi un moteur de texte est fait. Une planche se dessine, une partition se grave, et ni l’une ni l’autre n’est une colonne de lignes justifiées. Pourtant, les deux sont faites de texte au fond. Chaque bulle d’une bande dessinée est une réplique qu’il faut traduire, lettrer et faire tenir dans un dessin, et chaque mesure d’une partition est une notation qu’un musicien peut écrire dans un éditeur de texte. Postext les traite ainsi : les dessins et les règles sont des ressources et des réglages, les dialogues et la musique sont dans le chapitre.

## Des images sans mots

:index{term="bande dessinée"}Dans Postext, une bande dessinée part de dessins sans aucun lettrage. Chaque image peut marquer ce qu’il ne faut jamais recadrer, sa **zone de sécurité**, et l’endroit où se trouvent ses personnages : un point pour la bouche de chaque locuteur, un cadre pour chaque visage, des zones que les bulles doivent éviter. Ces marques se posent une fois, dans le panneau **Ressources**, et chaque édition de la bande dessinée s’en sert.

Le scénario est le Markdown du chapitre. Un bloc \`:::page\` découpe une planche en cases avec une courte formule, \`30 [30 | 20 | *] / *\` pour un strip de trois cases au-dessus d’une grande case, donne à chaque case son image et liste sous chaque case ce qui s’y dit, une ligne par bulle : \`maya: Papi ! Je suis là !\`. Un récitatif, une pensée, un murmure, un cri ou une onomatopée, c’est la même ligne avec une autre clé ou un autre style.

## Le lettrage

:index{term="lettrage"}Le moteur lettre chaque bulle au même corps, dans le caractère de lettrage du livre, comme travaille un lettreur. Il coupe les mots en lignes qui dessinent une forme arrondie, courte en haut et en bas, puis trace la bulle autour d’elles avec le même blanc de chaque côté, la place dans l’ordre de lecture à l’intérieur de la case, à l’écart des visages et des zones que marque l’image, et pointe son appendice vers la bouche du locuteur. Deux répliques de suite du même locuteur se réunissent en une seule bulle à deux lobes. Le texte n’est jamais réduit pour tenir : une bulle qui ne tient pas change de forme, se déplace ou est signalée dans le panneau **Vérifications**.

Le strip de :ref{id="guide-strip"} a été lettré ainsi. Ses trois dessins ne portent aucun mot ; le dialogue tient en trois lignes de Markdown dans ce chapitre, et chaque édition de ce guide le lettre dans sa propre langue.

:::strip{split="* | * | *" span=page placement=top caption="Un strip lettré par le moteur. Les dessins sont communs à toutes les éditions de ce guide ; les bulles s’écrivent dans le Markdown de chaque édition." type=figure id=guide-strip}
::panel{art=strip-proof}
editor: L’édition allemande déborde d’une ligne page 212.
::panel{art=strip-screen}
designer: Alors resserre le paragraphe, pas la page.
::panel{art=strip-book}
sfx: FLIP FLAP
:::

## Sens de lecture et traduction

Une bande dessinée occidentale se lit de gauche à droite, un manga et une bande dessinée arabe de droite à gauche. Postext prend le sens de lecture dans la langue de l’édition : une édition arabe ou japonaise dispose les cases de chaque strip à partir de la droite, inverse les angles et les obliques, et relie le livre à droite, tandis que les images restent telles qu’elles ont été dessinées. Les bulles japonaises sont lettrées en colonnes verticales, avec la ponctuation tournée pour la colonne.

Une traduction, c’est le même Markdown avec d’autres mots. Les images, les recadrages et les marques sont communs ; chaque édition mesure son propre texte et place ses propres bulles. L’espagnol est environ un cinquième plus long que l’anglais, le chinois bien plus court, et les bulles changent de taille avec lui, sans que personne les déplace à la main.

## Planches, doubles pages et strips

Une bande dessinée peut remplir une page, courir sur deux pages en regard pour un panorama, ou s’insérer dans le texte sous la forme d’un **strip**, de la largeur d’une colonne ou de la page, comme le strip quotidien d’un journal. Un strip se comporte comme une figure : il peut être numéroté et légendé, cité avec \`:ref\` et flotter vers la tête ou le pied d’une page. Les recettes de journal de la section Recettes composent ainsi leurs strips, entre les articles.

## La musique comme texte

:index{term="notation musicale"}Une partition s’écrit dans le chapitre comme un bloc délimité de notation, de la même façon qu’on écrit du code dans un livre technique. Postext lit quatre formats : **ABC**, compact et facile à taper, pour les mélodies et les chansons ; **MusicXML**, exporté par les logiciels de notation qu’utilisent les musiciens ; **MEI**, pour les éditions savantes ; et **Humdrum**, pour les chorals et l’analyse. Le moteur grave la musique avec Verovio, la bibliothèque de gravure de la Music Encoding Initiative, à la largeur de la colonne.

L’air ci-dessous s’écrit en cinq lignes d’ABC dans le Markdown de ce chapitre. Le moteur le grave et le compose comme une formule centrée, sur la grille de ligne de base, et le texte reprend après lui.

\`\`\`abc {alt="Une courte mélodie en sol majeur, à trois-quatre"}
X:1
M:3/4
L:1/8
K:G
D2 | G2 B2 d2 | c2 A2 F2 | G4 B2 | A4 D2 | G2 B2 d2 | e2 c2 A2 | G6 |]
\`\`\`

Une longue partition se découpe en **systèmes**, les lignes de musique que suit le lecteur, et les systèmes passent de colonne en colonne et de page en page comme les lignes d’un paragraphe, sans jamais couper une portée. Un exemple musical que cite le texte peut aussi être une ressource, numérotée et légendée comme une figure. L’apparence de la musique est un réglage : la taille des portées, la police musicale, les numéros de mesure et les marges autour d’une partition, avec des styles nommés pour les exemples plus petits placés dans un encadré.

La musique est facultative. Le graveur pèse plusieurs mégaoctets et n’est chargé que par les livres qui contiennent de la notation : un roman ne le paie jamais. Les partitions sont dessinées en vectoriel dans le canvas, le HTML et le PDF, balisées comme figures avec leur texte alternatif dans le PDF accessible, et transmises à l’EPUB.

# Exercices et cours {#exercises lead="Un manuel demande à son lecteur de faire quelque chose : choisir, compléter, relier, écrire. Postext lit les questions et leurs réponses dans le Markdown, imprime l’exercice pour l’élève et permet aux éditions à l’écran de le corriger." summary="Types d’exercice, corrigés, solutions, éditions à l’écran et SCORM"}

Les exercices d’un manuel scolaire comptent parmi les pages les plus fastidieuses à composer à la main. Chaque blanc doit être assez long pour qu’on y écrive sans trahir sa réponse par sa longueur, les options d’une question sont repérées dans le style de la collection, le corrigé en fin d’ouvrage doit correspondre aux questions du début, et le livre du professeur imprime les mêmes pages avec les réponses remplies. Tout cela découle de deux choses : ce qu’est la question, et ce qu’est sa réponse. Postext ne demande rien d’autre.

## Un exercice dans le Markdown

:index{term="exercices"}Un exercice est un bloc entre \`:::exercise\` et \`:::\`. Ses premiers paragraphes forment la consigne ; ce qui suit est la question, écrite dans un Markdown qu’un enseignant pourrait taper sans mode d’emploi. Une liste de tâches où les bonnes options sont cochées est une question à choix multiple. Les mots entre doubles crochets sont des blancs, et les mots qu’ils contiennent sont les réponses. Des paires reliées par une flèche forment un exercice d’appariement. Le moteur déduit le type d’exercice de ce qu’il trouve, et un attribut \`type\` le précise quand le contenu ne suffit pas.

Les trois exercices ci-dessous portent sur ce livre. Ils ont été écrits dans le Markdown de ce chapitre en quelques lignes chacun, et le moteur les a numérotés, a repéré leurs options, a tracé les blancs et composé les encadrés.

:::exercise{level=1}
Laquelle de ces choses la configuration décide-t-elle, plutôt que le Markdown ?

- [ ] Les mots d’un titre
- [x] La couleur du bandeau de chapitre
- [ ] La figure que mentionne un paragraphe
:::

:::exercise{bank level=2}
Complétez les phrases avec les mots de l’encadré.

1. Une figure flotte vers le premier emplacement libre après sa [[mention]].
2. Le moteur coupe un paragraphe comme un [[tout]], pas ligne par ligne.
3. Une page composée remplit les blocs d’un [[gabarit]].

::bank[marge | colonne]
:::

:::exercise{level=2}
Reliez chaque sortie à ce à quoi elle sert.

- PDF/X -> L’imprimeur
- EPUB -> Une liseuse
- SCORM -> Un cours sur une plateforme d’apprentissage
:::

## Douze types

Postext connaît douze types d’exercice, assez pour l’essentiel de ce qu’imprime un manuel : le choix multiple et le vrai ou faux ; les textes à trous, avec ou sans banque de mots, et les choix placés dans la ligne ; l’appariement, le classement en groupes, la remise en ordre d’éléments ou des mots d’une phrase ; le repérage de mots dans un texte ; les questions ouvertes, avec des lignes ou une zone réglée où écrire ; les mots mêlés et les mots croisés, dont le moteur construit les grilles à partir de la liste des mots ; et les opérations posées en colonnes, pour l’arithmétique. Les éléments sont mélangés là où le type le demande, toujours de la même façon, si bien que le PDF, l’écran et le corrigé concordent.

Un niveau de difficulté s’imprime sous forme de points après le numéro, des icônes d’activité peuvent signaler les exercices à faire à deux ou à voix haute, et le premier élément peut s’imprimer déjà répondu, comme modèle. L’apparence de chacun de ces éléments relève d’un **style d’exercice** : la pastille du numéro, les repères des options, l’aspect d’un blanc, la réglure d’une zone d’écriture, l’encadré autour de l’exercice, tirés des styles d’encadré du livre.

## Réponses et solutions

Chaque exercice noté a un **corrigé** construit à partir de ses réponses : la bonne option, les blancs dans l’ordre, les paires. Un bloc \`:::solution\` placé dans un exercice ajoute une solution rédigée, dans n’importe quel Markdown. L’endroit où ils s’impriment est un réglage du livre entier : nulle part, juste après chaque exercice, à l’envers sous l’exercice comme dans les livres de jeux, à la fin du chapitre, à un point du chapitre qui les appelle, ou dans un chapitre de réponses en fin d’ouvrage. Ce guide garde ses réponses pour l’écran.

Un **livre du professeur** est le même livre avec un seul réglage changé : chaque réponse imprimée à sa place, dans la couleur d’un stylo de correction, les blancs remplis, les options entourées, les lignes d’appariement tracées.

## À l’écran

Dans la vue HTML et dans un EPUB, on peut répondre aux exercices. Le lecteur tape dans les blancs, coche les options et trace les lignes d’appariement, puis vérifie ses réponses, demande un indice, affiche la solution ou recommence. Les bonnes et les mauvaises réponses sont marquées par une couleur et un signe et annoncées aux lecteurs d’écran, et les réponses sont gardées dans le navigateur : le lecteur les retrouve à sa visite suivante.

:::callout{type="try"}
Ouvrez la vue HTML sur ce chapitre et répondez aux trois exercices. Vérifiez-les, puis passez à la vue PDF : ce sont les mêmes exercices, composés pour le crayon de l’élève.
:::

## Cours

:index{term="SCORM"}Un livre qui contient des exercices peut devenir un cours. La vue **SCORM** du Sandbox réunit les chapitres et les sections que vous choisissez en un paquet SCORM, le format que lisent les plateformes d’apprentissage comme Moodle. Chaque partie du livre que suit la plateforme transmet un score, tiré des exercices bien répondus, indique si elle est terminée, chaque page vue et chaque exercice vérifié, et si elle est réussie, par rapport à une note que fixe le livre. Une évaluation peut limiter le nombre de vérifications d’un exercice, le nombre de fois qu’il recommence et le moment où sa solution apparaît.

Le paquet porte le livre tel que le montre la vue HTML, mis en page par le même moteur : le cours ressemble au livre imprimé que les élèves ont sur leur table.

:::part{number="IV" title="En pratique" palette="band=#c0452f"}
12. Écrire pour Postext
13. Le Sandbox
14. Sortie : canvas, HTML, PDF et EPUB
15. Épreuves et impression
16. Le livre en 3D
17. Des outils autour du moteur
18. Feuille de route et communauté
:::

# Écrire pour Postext {lead="Tout ce livre a été écrit en Markdown ordinaire, avec une poignée d’extensions. Elles restent lisibles dans n’importe quel éditeur de texte et disent ce qu’est le texte, jamais où il va." summary="Markdown, directives, encadrés et styles de paragraphe"}

Les documents Postext sont d’abord du Markdown.:index{term="Markdown"} Quiconque connaît Markdown peut écrire pour Postext dès le premier jour ; les extensions n’apparaissent que là où un livre a besoin de quelque chose que Markdown n’a jamais su nommer.

## Le Markdown ordinaire

Des titres d’un à six croisillons, des paragraphes, des citations en bloc, des listes à puces, numérotées et de tâches (imbriquées de deux espaces par niveau, jusqu’à cinq niveaux) et des formules hors texte entre doubles signes dollar. Dans la ligne, le gras et l’italique habituels, plus l’exposant entre accents circonflexes, comme dans 10^-8^, l’indice entre tildes, comme dans H~2~O, les mathématiques en ligne entre signes dollar et l’échappement par barre oblique inverse pour les caractères littéraux.

Quelques détails méritent d’être connus. Les lignes consécutives d’un paragraphe sont réunies, si bien que les retours à la ligne de la source n’arrivent jamais sur la page ; un nouveau paragraphe demande une ligne vide. Les listes tolèrent une ligne vide entre deux éléments, mais deux lignes vides les terminent. Les listes ordonnées gardent le numéro par lequel elles commencent : une liste peut donc partir de 0 ou de 5. Enfin, un titre peut forcer un saut de ligne dans son texte avec deux barres obliques inverses, ce qui ne concerne que les maquettes qui impriment le titre en grand (ouvertures et pages de partie), tandis que les titres courants, la table des matières et les signets du PDF le gardent sur une seule ligne.

Une partie de Markdown est volontairement laissée de côté, parce qu’un livre a d’autres façons de le dire : les images sont des ressources plutôt que des illustrations dans la ligne, les tableaux sont des ressources dotées d’un modèle plutôt que des tableaux à barres verticales, et le HTML brut n’a aucun sens sur une page imprimée. Les liens sont actifs dans la vue HTML et dans le PDF, et le code en ligne, entre accents graves, est composé dans le caractère à chasse fixe du livre, comme la syntaxe citée dans ce livre.

## Directives et conteneurs

Tout le reste s’exprime avec un petit vocabulaire de directives, recensées dans le :ref{id="document-format"}. Les directives d’une ligne commencent par trois deux-points et agissent à l’endroit où elles apparaissent. Les conteneurs enveloppent des blocs entre une ligne d’ouverture munie d’attributs et une ligne de fermeture de trois deux-points ; ils s’imbriquent, et un conteneur resté ouvert est fermé à la fin du chapitre, avec un avertissement.

Les valeurs d’attribut peuvent se mettre entre guillemets doubles ou simples, ou rester nues quand elles tiennent en un seul mot, et une clé seule vaut drapeau. Une directive que le moteur ne connaît pas n’est pas écartée en silence : elle est imprimée comme un paragraphe, si bien que rien ne disparaît, et le panneau Vérifications la signale avec son chapitre et sa ligne. Il en va de même d’un style d’encadré ou d’un style de paragraphe que la configuration ne définit pas. Les encadrés, les notes de bas de page et l’index s’écrivent eux aussi avec des directives ; ils ont leur propre chapitre, :ref{id="boxes"}.

## Mentionner les ressources

Les renvois méritent qu’on s’y arrête, car c’est avec eux que s’écrit l’essentiel de l’appareil d’un livre. \`:ref{id="…"}\` imprime par défaut le libellé abrégé et le numéro (_Fig. 5.1_ dans l’édition française de ce livre) et incorpore la ressource la première fois qu’elle apparaît. Un attribut \`style\` imprime le numéro seul ou le libellé complet, _Figure 5.1_ ; \`case\` met le libellé en minuscules, en majuscules ou avec une capitale initiale, pour qu’un renvoi placé en début de phrase se lise correctement ; et \`text\` imprime n’importe quelle formulation tout en incorporant la ressource et en y menant par un lien. Un renvoi vers un identifiant qui n’existe pas imprime un point d’interrogation et un avertissement : les renvois cassés sont ainsi repérés avant que le livre parte chez l’imprimeur.

\`::resource{id="…"}\`, seul sur sa ligne, insère une ressource à cet endroit précis quand son placement dit _ici_ ; sinon, il compte simplement comme une mention. Ce livre ne l’emploie nulle part et laisse flotter toutes ses figures, ce qui est en général le meilleur choix, puisque le moteur trouve alors à chacune une place près de sa mention.

## Renvois et citations

:index{term="citations"}Le même \`:ref\` désigne tout endroit du livre:index{term="renvois"} qui porte un identifiant : un titre écrit \`## Méthode {#method}\`, un encadré ouvert avec \`{#id}\` ou une expression balisée \`[ces mots]{#key}\`. Il imprime _section 3.2_ ou _chapitre 4_, le titre avec \`style=title\` ou la page avec \`style=page\`, et la page est juste, parce que le moteur recompose le livre jusqu’à ce qu’il se stabilise. Chacun de ces renvois est un lien dans le PDF, dans le HTML et dans ces aperçus.

Les ouvrages se citent comme les écrit Pandoc, \`[@garcia2020, p. 33]\` ou \`@garcia2020\` dans la phrase, avec les références dans l’en-tête YAML ou dans un bloc \`:::references\` en BibTeX. Le style de citation est un réglage, pas une propriété du texte : APA, Chicago, MLA, IEEE, Vancouver, ISO 690, GB/T 7714 ou un style à vous, choisi dans Maquette › Citations, où un aperçu montre le résultat. La bibliographie suit le dernier chapitre, ou se place là où \`:::bibliography\` est écrit. La citation d’un ouvrage absent des références s’imprime telle qu’elle est écrite et figure parmi les avertissements.

## Les mathématiques dans la source

Les mathématiques s’écrivent en notation LaTeX. Les formules en ligne se placent entre deux signes dollar simples, au milieu d’une phrase ; les formules hors texte, entre doubles signes dollar, sur une ligne à part ou en un bloc de plusieurs lignes. Un signe dollar qui doit s’imprimer comme tel s’échappe avec une barre oblique inverse. Une formule jamais fermée, ou que MathJax ne sait pas lire, est signalée dans le panneau Vérifications et remplacée sur la page par un repère rouge, si bien qu’elle ne peut pas passer inaperçue jusqu’au PDF.

## Styles de paragraphe

\`:::paragraphs{style="…"}\` applique un style de paragraphe nommé aux paragraphes qu’il enveloppe : une épigraphe, une dédicace, une bibliographie, un colophon. Un style peut changer le caractère, le corps, l’interlignage, la couleur, l’alignement (centré et aligné à droite compris), le retrait et les espacements. Le colophon au verso de la couverture de ce livre en est un.

## Bien écrire pour le moteur

Quelques habitudes facilitent le travail du moteur et améliorent les pages. Introduisez chaque liste par une phrase, pour qu’une liste ne soit jamais la première chose sous un titre ; le panneau **Vérifications** peut signaler celles qui le sont. Gardez les titres dans l’ordre, sans sauter de niveau. Mentionnez chaque figure et chaque tableau dans le texte, près de l’endroit où vous les voulez : la mention décide où la ressource peut aller et quel numéro elle reçoit. Laissez le placement à la configuration, sauf si une ressource a vraiment besoin d’une position à elle. Et écrivez un texte alternatif pour chaque figure, car le PDF accessible le donne aux lecteurs qui ne peuvent pas voir l’image.

## L’en-tête YAML

Les métadonnées d’un livre vivent dans un en-tête YAML placé en tête de son premier chapitre : titre, sous-titre, auteur et date de publication, que chaque emplacement de design peut reprendre sous forme de variables. La couverture de ce livre y prend son titre et son sous-titre. Toute autre clé est conservée pour l’application hôte ; un en-tête YAML placé dans un chapitre suivant est ignoré, avec un avertissement.

# Le Sandbox {lead="Le Sandbox, c’est le moteur entouré d’un éditeur : la page que vous lisez, le Markdown dont elle vient et chaque réglage qui l’a façonnée, côte à côte et en direct." summary="L’éditeur, les panneaux, les projets, les préréglages et le partage"}

Tout ce que décrit ce livre peut s’essayer tout de suite, sans écrire de code. Le Sandbox n’est pas une démonstration construite au-dessus de Postext ; c’est le moteur lui-même, dans une interface pensée pour deux publics à la fois : les développeurs qui évaluent la bibliothèque, et les graphistes qui veulent voir ce que fait chaque option.

## Visite de l’interface

:index{term="Sandbox"}L’interface reprend la disposition familière d’un éditeur, esquissée dans la :ref{id="sandbox-ui"}. Une **barre d’activité** à gauche bascule entre sept panneaux : Livres, Chapitres, Texte, Ressources, Polices, Maquette et Vérifications, ce dernier avec le nombre de problèmes en suspens. Une **barre latérale** redimensionnable accueille le panneau actif ; un clic sur l’icône active la replie. La **zone d’affichage**, à droite, montre la même mise en page dans six onglets : Canvas, PDF, Folio, HTML, EPUB 3 et SCORM. L’interface parle anglais, espagnol, catalan, français, allemand, italien, portugais du Brésil, chinois simplifié, japonais et arabe, et se lit de droite à gauche en arabe ; un réglage de grands boutons et de grands champs rend chaque commande plus facile à atteindre au doigt ou d’une main peu sûre.

La barre latérale et la zone d’affichage se partagent la fenêtre, et la limite entre elles se déplace en la faisant glisser. Chaque panneau et la zone d’affichage retrouvent leur état d’une visite à l’autre : le zoom et le mode d’affichage du canvas, le mode de colonnes de la vue HTML, les groupes ouverts dans le panneau Maquette. Le thème et la langue de l’interface se changent au pied de la barre d’activité, et la langue de l’interface est indépendante de celle du livre.

## Modifier un livre

L’éditeur du panneau **Texte** met en évidence l’en-tête YAML et les mathématiques, et sa barre d’outils insère la mise en forme, les listes, les sauts de page et les changements de numérotation. En tête, un **sélecteur de chapitres** passe d’un chapitre du livre à l’autre en indiquant leurs plages de pages ; chaque chapitre garde son propre historique d’annulation et la position de son curseur. L’éditeur et les pages restent synchronisés dans les deux sens : un clic sur un mot de la page place le curseur sur ce mot dans le Markdown, et sélectionner du texte le met en évidence sur la page. Le panneau **Chapitres** montre le livre ouvert dans son ensemble, ses chapitres dans l’ordre avec leurs plages de pages.

L’éditeur garde aussi un œil sur le livre. Son menu de chapitres liste chaque chapitre avec les pages qu’il occupe dès qu’elles sont connues, et passer à un autre chapitre y fait basculer les aperçus. Les chapitres peuvent être créés, renommés, réordonnés, coupés à leurs titres de premier niveau ou fusionnés avec le précédent, et un chapitre entier peut être exporté en fichier Markdown ou remplacé par un tel fichier.

## Configuration

Le panneau **Maquette** édite toute la configuration (plus de cinq cents champs) par groupes : page et colonnes, système d’écriture, couleurs, typographie, titres et table des matières, listes, figures et tableaux, encadrés, exercices, bande dessinée, en-têtes et pieds de page, parties, export, Folio (le livre en 3D) et réglages avancés. Un champ de recherche trouve n’importe quelle option par son nom, et le filtre **Modifiés** montre ce qui diffère des valeurs par défaut. Chaque champ et chaque section se réinitialisent séparément, et la configuration peut être exportée et importée sous forme de fichier. Dans un livre en plusieurs langues, un sélecteur en tête du panneau choisit entre les réglages que partagent toutes les éditions et ceux de l’édition à l’écran, comme l’explique :ref{id="languages"}.

## Les six vues

La vue **canvas** est l’aperçu de travail : elle zoome du quart de la taille réelle jusqu’à quatre fois, ajuste la page à la largeur ou à la hauteur de la zone d’affichage et montre des pages seules ou des doubles pages, la première page seule en recto, comme s’ouvre un livre imprimé. La vue **PDF** produit un vrai PDF dans le navigateur et l’affiche dans la visionneuse du navigateur lui-même, avec des boutons pour le régénérer, le télécharger et l’imprimer. La vue **Folio** montre le livre relié, ouvert sur un bureau, en trois dimensions, avec des feuillets qui tournent sous la main ; elle a son propre chapitre, _Le livre en 3D_. La vue **HTML** montre la même mise en page en HTML positionné, isolé du reste de la page, avec une commande pour la taille du texte et deux modes de lecture : une seule colonne qui défile, ou autant de colonnes que l’écran peut en contenir. La vue **EPUB 3** écrit le livre en livre numérique, dans le navigateur, selon l’une de deux mises en page : une **mise en page fixe** garde les pages imprimées ligne pour ligne, avec un vrai texte qu’on peut sélectionner et rechercher ; un livre **recomposable** laisse le texte s’adapter à l’écran et à la taille de caractère du lecteur. Une petite liseuse intégrée à l’onglet montre le fichier que vous allez télécharger : les touches fléchées, un balayage sur un téléphone ou les boutons en tournent les pages, une liste mène à n’importe quel chapitre, et un livre recomposable peut se lire en plus grand ou en plus petit. La vue **SCORM** réunit les chapitres et les sections que vous cochez dans un arbre du livre en un cours pour une plateforme d’apprentissage comme Moodle, en pages fixes ou en texte recomposable ; ses exercices envoient leurs scores à la plateforme.

Les vues canvas, HTML et Folio peuvent composer le chapitre courant ou le livre entier ; le PDF a son propre choix, pour qu’un seul chapitre puisse être relu rapidement pendant que les aperçus montrent le livre ; l’EPUB et le paquet SCORM sont toujours composés à partir du livre entier. Ce guide s’ouvre en mode livre entier. Un livre composé verticalement, comme l’édition chinoise de ce guide, se lit dans la vue HTML page par page uniquement, car une seule colonne défilante coucherait ses lignes sur le côté.

## Sur un téléphone

En dessous de la largeur d’une tablette, le Sandbox se réorganise. La barre des panneaux passe au pied de l’écran, un panneau ouvert recouvre l’aperçu au lieu de se placer à côté, et fermer le panneau retrouve l’aperçu à la page qu’il montrait. Les barres d’outils des aperçus s’ancrent le long du bord inférieur, à portée du pouce, et passent sur une seconde rangée quand l’écran est étroit. Un téléphone ne peut pas afficher un PDF à l’intérieur d’une page : la vue PDF propose donc d’ouvrir le fichier ; et comme un téléphone accorde à un onglet de navigateur moins de mémoire qu’il n’en faut à un livre en trois dimensions, la vue Folio n’y figure pas.

## Ressources et polices

Le panneau **Ressources** liste les ressources du livre par type. Les images et les fichiers SVG s’y ajoutent par glisser-déposer, les tableaux se modifient dans un éditeur proche d’un tableur, avec cellules fusionnées, fonds, images, largeurs de colonnes et collage depuis un tableur, et le texte d’un diagramme SVG se modifie sur place. Un clic sur une légende, une note, une cellule ou le texte d’un diagramme dans l’aperçu l’ouvre dans le panneau. Le panneau Polices ajoute vos propres familles, graisse par graisse, dans les formats habituels du web et des logiciels de bureau ; une famille personnalisée l’emporte sur une Google Font du même nom.

Chaque ressource a une vue détaillée avec son identifiant, son type, sa légende, sa note et son texte alternatif, son placement (position, étendue, rotation, largeur, alignement et légende latérale) et un aperçu en direct. Supprimer une ressource déclenche un avertissement quand le texte la mentionne encore. Le panneau Polices, de son côté, vérifie que chaque famille nommée par la configuration dispose des graisses et des styles dont elle a besoin, et signale les variantes manquantes ou en double.

## Avertissements

Le panneau **Vérifications** liste tout ce que le moteur a remarqué en composant le livre : polices qui n’ont pas pu se charger, lignes lâches, niveaux de titre sautés, conteneurs non fermés et directives inconnues, styles inconnus, variables qui n’impriment rien, ressources manquantes et encadrés trop hauts pour leur colonne. Chaque avertissement indique son chapitre et sa ligne, et un clic dessus y mène.

## Projets, préréglages et partage

Votre travail s’enregistre dans le navigateur au fil de la frappe. Les **projets** sont des livres stockés localement, listés sous **Mes livres** dans le panneau **Livres**, chacun avec son nom, sa description et son image de couverture ; on peut les dupliquer, les exporter et les importer. Les **préréglages** sont des livres en lecture seule d’où partir, listés sous **Livres d’exemple** : ce guide et une galerie d’éditions de démonstration (un magazine d’astronomie, un _Don Quichotte_ illustré, un magazine consacré à l’environnement, un catalogue d’exposition, deux manuels universitaires, _Le Rêve dans le pavillon rouge_ en chinois, _Les Mille et Une Nuits_ en arabe, reliées à droite, et un _Paradis perdu_ annoté avec les gravures de Doré), chacune composée avec une maquette qui lui est propre. **Faire ma propre copie** transforme l’un d’eux en projet à vous.

Les préréglages suivent leur source. Quand le paquet d’un préréglage change sur le serveur, le Sandbox s’en aperçoit en quelques secondes : un préréglage intact se recharge de lui-même, et celui que vous avez modifié affiche un bandeau qui propose de le recharger, si bien qu’un travail en cours n’est jamais écrasé. Les préréglages peuvent être masqués de la liste puis réaffichés, et chacun peut s’ouvrir dans n’importe laquelle de ses langues quand il en a plusieurs, comme ce guide, qui existe en anglais, espagnol, catalan, français, allemand, italien, portugais du Brésil, chinois simplifié, arabe et japonais.

Un livre voyage sous la forme d’un seul fichier **.postext** : ses chapitres, sa configuration, ses ressources et ses polices, plus la pagination déjà calculée, si bien qu’il s’ouvre paginé. Les recettes de la section Recettes s’ouvrent dans le Sandbox de la même façon, comme des livres à vous ; une recette déjà ouverte demande s’il faut ouvrir votre copie, avec vos modifications, ou la remplacer par la version publiée, qui a pu être corrigée depuis. Et la barre d’adresse contient toujours un lien permanent vers ce que vous regardez : le livre, la langue, la visionneuse, le chapitre et la page.

:::callout{type="try"}
Faites défiler jusqu’à une page qui vous plaît et copiez l’adresse dans le navigateur : ouvrir ce lien affiche le même livre, dans la même visionneuse, à la même page.
:::

## Intégrer le Sandbox

Le Sandbox est lui-même un paquet, _postext-sandbox_, un composant React que n’importe quelle application web peut intégrer. Son hôte décide du Markdown et de la configuration de départ, de la langue de l’interface et de chaque libellé, des sources de préréglages qu’il propose, ainsi que du sélecteur de thème, du sélecteur de langue et du lien vers l’accueil qu’il affiche. Le Sandbox que vous utilisez est exactement ce composant, intégré au site de Postext.

# Sortie : canvas, HTML, PDF et EPUB {#output lead="Un arbre, quatre sorties. Le canvas sert d’aperçu, le HTML se lit à l’écran, le PDF part chez l’imprimeur et l’EPUB rejoint l’appareil du lecteur, et toutes s’écrivent à partir de la même mise en page." summary="Les moteurs de rendu, le PDF accessible, les livres EPUB et l’emploi de la bibliothèque"}

Comme tous les moteurs de rendu lisent le même VDT, la promesse _ce que vous voyez est ce que vous obtenez_ est à prendre au pied de la lettre : coupures de ligne, limites de page et position de chaque figure concordent entre le canvas, le HTML et le PDF, et un EPUB à mise en page fixe les conserve aussi. Un EPUB recomposable renonce exprès à la page et garde tout le reste de ce que la mise en page a résolu : les numéros, les notes, les renvois et les numéros des pages imprimées. Le skill d’agent qui fait entrer des livres existants dans Postext vérifie son travail avec ces sorties, comme le montre la :ref{id="skill-tutorial"}.

## Canvas

Le moteur de rendu canvas dessine une page sur un canvas HTML, à n’importe quelle résolution. Dans le Sandbox, c’est l’aperçu en direct, avec le zoom, l’ajustement à la largeur ou à la hauteur, les pages seules ou les doubles pages, et des pages dessinées à la demande à mesure qu’elles entrent dans le champ, si bien que les longs livres restent réactifs.

Les images des ressources s’enregistrent une seule fois auprès du moteur de rendu, par identifiant de fichier, et servent ensuite sur chaque page. Les pages peuvent se dessiner sur n’importe quel canvas, à n’importe quelle échelle, ce qui rend le même moteur de rendu utile pour les vignettes, les aperçus avant impression et l’export d’images : les exemples en direct de la documentation dessinent une page et la transforment en PNG.

## HTML

Le moteur de rendu HTML renvoie du HTML en positionnement absolu, avec un CSS éditorial : chaque ligne là où la mise en page l’a placée, dans sa police, son corps et sa ligne de base exacts. Une variante indexée indique à l’hôte quelles parties de la page ont changé, pour qu’une visionneuse ne mette à jour que celles-là. Dans le Sandbox, l’onglet HTML isole la sortie dans un Shadow DOM et ajoute un mode lecture, avec une seule colonne défilante ou autant de colonnes que l’écran peut en contenir, et une commande d’échelle du texte. Un jeu de surcharges réservées à l’écran peut ajuster la maquette pour la lecture à l’écran sans toucher aux pages imprimées.

Le moteur de rendu prend une fonction qui transforme l’identifiant de fichier d’une ressource en URL, pour que les images puissent être servies de n’importe où, et une couleur de fond pour la page. Sa sortie se compose de simple balisage et de CSS, sans script, ce qui la rend adaptée à l’hébergement statique, aux aperçus dans un e-mail ou au stockage côté serveur une fois la mise en page calculée dans un navigateur.

## PDF

:index{term="PDF"}Le paquet _postext-pdf_ transforme le VDT en un vrai PDF, pour un document ou pour un livre entier. Il ne mesure jamais à nouveau : les métriques du canvas font foi et le PDF ne fait que les transporter, ce qui explique que les lignes se coupent exactement aux mêmes endroits. Il incorpore de vraies polices, une fonte statique par graisse, si bien que le gras est du vrai gras et l’italique du vrai italique, et le texte reste sélectionnable. Par-dessus les pages, il ajoute des signets tirés des titres et des parties, des étiquettes de page conformes aux numéros imprimés, des renvois cliquables, des figures SVG vectorielles et un choix d’espace colorimétrique (RVB, CMJN ou niveaux de gris) pour l’impression.

Les polices arrivent dans le PDF par un **fournisseur de polices**, une fonction qui renvoie les octets d’une famille dans une graisse et un style donnés. Le fournisseur du Sandbox récupère des fontes statiques sur Fontsource, un fichier par graisse, et les décompresse depuis le WOFF2 ; les polices personnalisées viennent du panneau Polices. Les octets des ressources sont transmis de la même façon, par identifiant de fichier. Le rendu indique sa progression, s’exécute dans un worker dédié si on le lui demande, et accepte un livre entier sous forme de liste de documents de chapitres, pour produire un seul PDF aux étiquettes de page, aux signets et aux liens continus.

## Accessible par défaut

:index{term="PDF!accessible (PDF/UA)"}Chaque PDF est **balisé** par défaut, selon la norme PDF/UA-1 : un arbre de structure des titres, paragraphes, listes, tableaux et figures dans l’ordre de lecture, un texte alternatif pour chaque figure, la langue du document, et des éléments décoratifs marqués comme artefacts pour que les lecteurs d’écran les ignorent. L’accessibilité n’est pas une option d’export à ne pas oublier ; c’est la façon même dont le fichier est fabriqué.

Le balisage suit la mise en page plutôt que la source. Les paragraphes coupés entre colonnes et entre pages sont balisés comme un seul paragraphe, les listes gardent leurs éléments ensemble, les tableaux leurs cellules d’en-tête, et les figures portent leur texte alternatif (ou leur légende, ou leur libellé, quand aucun texte alternatif n’a été écrit). Le titre et la langue du document voyagent dans ses métadonnées, les titres courants et les décors de page sont marqués comme artefacts, et les renvois entre le texte et les figures qu’il mentionne sont de vrais liens.

## La couleur pour l’impression

Les couleurs de la configuration s’écrivent en valeurs hexadécimales, éventuellement liées à la palette, et c’est ce que le PDF dessine par défaut. Un PDF peut aussi être forcé en CMJN pour l’offset ou en niveaux de gris pour un travail en une couleur, et un livre préparé pour l’impression va plus loin : un profil ICC, le PDF/X, un noir qui s’imprime avec une seule encre et un contrôle en amont de chaque page. Tout cela fait l’objet de :ref{id="press"}.

## Livres entiers

Le PDF d’un livre n’est pas une concaténation de fichiers séparés. Le moteur de rendu reçoit la mise en page de chaque chapitre et écrit un seul document : les étiquettes de page se suivent d’un chapitre à l’autre, les signets forment un seul arbre, les parties au-dessus de leurs chapitres, et la structure accessible du livre entier forme un seul arbre dans l’ordre de lecture. Comme chaque chapitre a été composé dans la continuité des précédents, les pages du chapitre sept dans le PDF du livre sont exactement celles du chapitre sept imprimé seul.

Le Sandbox propose les deux : la vue PDF peut basculer entre le chapitre courant, pour des épreuves rapides, et le livre entier, pour le fichier définitif. Construire le livre entier prend plus de temps : le travail se fait donc dans le worker PDF, qui indique sa progression page par page.

## Les polices dans le PDF

Un PDF ne vaut que par les polices qu’il contient. Postext incorpore chaque fonte employée par la mise en page (un fichier statique par graisse et par style), si bien qu’un mot en gras est composé dans le vrai gras et un italique dans le vrai italique, jamais dans une imitation penchée ou épaissie. Les fontes TrueType sont réduites aux glyphes que le livre emploie réellement, ce qui garde des fichiers légers même avec quatre familles ; les fontes OpenType à contours PostScript sont incorporées entières, parce que certaines visionneuses ne savent pas lire leurs sous-ensembles. Chaque police incorporée porte une table de correspondance des glyphes vers les caractères, ligatures comprises : copier une phrase du PDF rend la phrase qui a été écrite, et une recherche dans le document trouve chaque mot.

Les familles viennent de là où le Sandbox les a trouvées. Les Google Fonts sont récupérées fonte par fonte sur Fontsource et décompressées à la volée ; les familles téléversées dans le panneau Polices sont incorporées à partir des fichiers que vous avez fournis. Une famille disponible seulement en WOFF n’est pas acceptée par le PDF, parce que ce format ne peut pas être incorporé de façon fiable ; les fichiers WOFF2, TrueType et OpenType fonctionnent tous.

## EPUB 3

:index{term="EPUB"}Le paquet _postext-epub_ écrit un livre mis en page sous forme de fichier EPUB 3, le format des librairies numériques, des bibliothèques et des applications de lecture. Il lit les mêmes documents de chapitres que le PDF d’un livre entier, si bien que les numéros de page, les notes, les citations, les renvois, la table des matières et l’index arrivent résolus, et il renvoie le fichier sous forme d’octets, dans le navigateur ou dans Node, sans serveur. EPUB définit deux restitutions, présentées côte à côte dans la :ref{id="epub-renditions"}, et le générateur produit l’une ou l’autre à partir de la même mise en page.

Une **mise en page fixe** conserve la page imprimée. Chaque page devient un document à part, au format de la page, avec le texte là où le PDF le place et dans les polices du livre, si bien que les colonnes, les flottants, les titres courants, les ouvertures et chaque coupure de ligne sont préservés. Le texte reste du texte : on peut le sélectionner, le rechercher et le faire lire à voix haute, et les liens du livre fonctionnent d’une page à l’autre (renvois, notes, table des matières imprimée et index). Les doubles pages s’apparient comme à l’impression, et un livre relié à droite, en arabe ou en chinois vertical, se feuillette de droite à gauche. Elle convient aux livres dont les pages sont conçues comme des pages (un livre illustré, un manuel, un catalogue ou un magazine) et qui se lisent sur un grand écran ; sur un téléphone, la page est réduite et le lecteur zoome pour la lire.

## Les livres recomposables

Un livre **recomposable** renonce à la page et garde le texte. Chaque chapitre devient un document que le système de lecture recompose pour son écran, dans le caractère, le corps et les marges que choisit le lecteur. Le générateur ne revient pas au Markdown : il reconstruit chaque paragraphe à partir des lignes composées par le moteur, en retirant les traits d’union ajoutés par les coupures de ligne et en gardant ceux qui appartiennent au mot, si bien qu’un paragraphe coupé entre deux colonnes ou deux pages redevient un seul paragraphe. Les figures et les tableaux suivent le texte qui les cite, avec leurs légendes numérotées et leur texte alternatif ; les tableaux restent de vrais tableaux, avec lignes d’en-tête et cellules fusionnées ; les encadrés deviennent des éléments aside avec leurs titres ; et les notes renvoient à la fin du chapitre, d’où un lien ramène au texte. Chaque page imprimée laisse un repère là où commence son texte, pour qu’un lecteur puisse retrouver la page 112 de l’édition imprimée, et l’index pointe vers ces repères.

L’apparence vient de la configuration. Une feuille de style qui en dérive donne aux titres, encadrés, tableaux, légendes et listes leurs tailles et leurs couleurs, relatives au texte courant, pour que la taille choisie par le lecteur se répercute partout. Les paragraphes composés dans un style de paragraphe le conservent, parce que la mise en page note quel style a composé chaque bloc, et les niveaux de l’index se distinguent de la même manière ; un chapitre configuré autrement, ou une partie qui recolore le livre, ajoute une seconde feuille qui ne contient que les règles qui changent. Une citation en exergue répète des mots du texte : elle est donc affichée, mais cachée aux lecteurs d’écran et à la lecture à voix haute, et ses mots ne sont lus qu’une fois. Le chinois vertical garde ses lignes verticales, et un livre arabe se lit de droite à gauche.

Les deux restitutions portent la même navigation : une table des matières tirée des titres et des parties, une liste des numéros des pages imprimées, et des points de repère pour la couverture, la table des matières imprimée et le début du texte. Chaque famille nommée par la maquette est incorporée, sauf si elle est marquée comme non redistribuable, et chaque image n’y entre qu’une fois. Les deux portent les métadonnées d’EPUB Accessibility 1.1, et les deux passent EPUBCheck du W3C, le validateur que les librairies numériques appliquent aux fichiers qu’elles reçoivent, sans erreur ni avertissement, pour ce guide comme pour chaque livre d’exemple. Dans le Sandbox, l’onglet **EPUB 3** écrit le fichier dans un worker, si bien que la page reste réactive pendant l’écriture d’un long livre. Tout ce que le fichier ne peut pas transporter, comme une image sans fichier enregistré, figure parmi ses avertissements.

## Choisir une sortie

Les quatre sorties partagent la mise en page, mais servent des moments différents de la vie d’un livre. Le **canvas** est la vue de travail : rapide, fidèle, celle que le Sandbox garde ouverte pendant que vous écrivez et mettez en page. Le **HTML** sert à la lecture à l’écran et à la publication dans une application web : les mêmes pages en balisage positionné, ou le texte recomposé dans les modes de lecture de la visionneuse, isolé des styles de la page qui l’entoure. Le **PDF** est l’objet fini : le fichier qui part chez l’imprimeur, aux archives ou sur l’appareil d’un lecteur, balisé, doté de signets et où chaque mot se retrouve par une recherche. L’**EPUB** est destiné aux liseuses et aux librairies numériques : une mise en page fixe quand c’est la page qui compte, un livre recomposable quand c’est le texte.

Rien n’oblige à choisir entre elles. Un livre peut être écrit dans le Sandbox avec le canvas ouvert, relu dans la visionneuse HTML par quelqu’un qui lit sur son téléphone, envoyé à l’impression en PDF et à une librairie numérique en EPUB le même après-midi, à partir de la même source et de la même configuration, sans qu’aucune sortie ne s’écarte des autres.

## Utiliser la bibliothèque

Le moteur est distribué sur npm sous le nom _postext_, pour la mise en page et les moteurs de rendu canvas et HTML, avec un paquet pour chaque sortie plus lourde : _postext-pdf_ pour le PDF, _postext-epub_ pour l’EPUB 3 et _postext-folio_ pour le livre en 3D. Tous sont des modules ES sous licence MIT et peuvent aussi s’importer directement depuis un CDN. La documentation contient des exemples en direct qui rendent une page en image, en HTML et en PDF, prêts à être repris.

Le moteur de mise en page s’exécute dans le navigateur, où il peut mesurer avec les polices que voit le lecteur ; _postext-pdf_ et _postext-epub_ s’exécutent aussi dans le navigateur, mais également dans Node, si bien qu’un PDF ou un EPUB peut être produit sur un serveur à partir d’une mise en page calculée ailleurs. Un livre entier voyage de la même façon : \`openBundle\` lit un fichier .postext, \`buildBundle\` compose ses chapitres dans l’ordre, et le résultat va directement à \`renderToPdf\` ou à \`renderToEpub\`. Les paquets sont uniquement des modules ES, avec les types TypeScript inclus, et certains bundlers ont besoin d’un réglage d’une ligne pour le décodeur WOFF2 qu’utilise le paquet PDF. La documentation parcourt tout le chemin, de l’installation des paquets au premier PDF, et aucune de ses étapes n’a besoin du Sandbox.

:::callout{type="note" title="Quatre étapes"}
1. Charger les polices que nomme la configuration, pour que le navigateur puisse les mesurer
2. Construire le document avec \`buildDocument(content, config)\`
3. Dessiner ses pages avec \`renderPage\`, ou les rendre avec \`renderToHtml\`
4. Pour l’impression, passer le même document à \`renderToPdf\` avec un fournisseur de polices ; pour les livres numériques, passer les chapitres à \`renderToEpub\`
:::

Le moteur et son moteur de rendu PDF sont publiés ensemble, avec le même numéro de version, pour que les deux s’accordent toujours sur la forme de la mise en page qu’ils partagent. Le générateur EPUB et la visionneuse Folio ont leurs propres numéros de version et déclarent le moteur comme dépendance homologue (peer dependency), si bien qu’un projet les met à jour ensemble.

## Des pages en images, depuis un script

Une page n’a pas besoin d’un navigateur pour devenir une image. Le moteur de rendu canvas dessine sur n’importe quel canvas qui parle l’interface de dessin du navigateur, et dans Node, un canvas précompilé le fait : composez le livre, dessinez la page et encodez-la en JPEG ou en PNG. C’est ainsi que le skill d’agent qui porte des livres vers Postext examine son travail. Après chaque modification de la configuration ou du texte, il recompose le livre, dessine seulement les pages sur lesquelles il travaille et les lit comme des images, en une seconde ou deux, sans PDF à générer. Le PDF est construit à la fin, pour les vérifications auxquelles seul un PDF peut répondre : polices incorporées, images à leur résolution, structure balisée.

La :ref{id="skill-tutorial"} montre le skill du début à la fin : on lui fournit le PDF de référence, les polices et les illustrations originales, et il propose une fiche de spécifications, compose le premier chapitre et vérifie chaque page qu’il compose.

# Épreuves et impression {#press lead="Un imprimeur ne pose pas les questions d’un lecteur. Chaque image est-elle assez nette à sa taille imprimée, le noir du texte n’utilise-t-il qu’une encre, l’illustration dépasse-t-elle la coupe ? Postext y répond avant que le fichier quitte le navigateur." summary="Vérifications, contraste, couleur ICC, PDF/X, noir et contrôle en amont"}

Un livre s’achève deux fois. Il est achevé pour le lecteur quand le texte est juste et que les pages ont l’allure voulue ; il est achevé pour l’imprimerie quand le fichier obéit aux règles de la machine qui va l’imprimer. Le premier achèvement se juge à l’écran, le second dans un service de prépresse, liste de contrôle en main. Postext garde les deux listes au même endroit : un problème se voit tant qu’il est encore temps de le corriger dans le Markdown ou la configuration, et non lors d’un coup de téléphone de l’imprimeur.

## Le panneau Vérifications

:index{term="panneau Vérifications"}Tout ce que remarque le moteur se rassemble dans le panneau **Vérifications**, trié dans l’ordre où un responsable de fabrication le traiterait : les polices d’abord, puis les figures et les tableaux, le texte et le balisage, la maquette, le contraste, la composition, le contrôle en amont et le navigateur. Chaque entrée nomme son chapitre et sa ligne, et un clic y mène ; quand tout va bien, le panneau affiche _Rien à signaler_. Les vérifications qui s’exécutent relèvent d’un réglage, sous Maquette › Avancé › Avertissements : un livre peut ainsi faire taire un avertissement qu’il accepte à dessein.

Certaines vérifications portent sur le texte : une ligne lâche, un niveau de titre sauté, une directive inconnue, un encadré trop haut pour sa colonne. D’autres portent sur la maquette et viennent des **règles de composition**, décrites dans :ref{id="columns"}, qu’une configuration règle sur _allow_, _warn_ ou _avoid_. Une règle sur _warn_ laisse la page telle quelle et ajoute une entrée ; sur _avoid_, le moteur modifie la page et rien n’est signalé.

## Le contraste

:index{term="contraste"}La couleur, sur une page, est une affaire de lisibilité avant d’être une affaire de goût. La vérification du contraste mesure chaque paire de couleurs de texte et de fond qu’utilise le livre, y compris le texte des encadrés, des légendes, des titres courants et des emplacements de design, et signale les paires qui restent sous le niveau demandé : AA, ou le niveau AAA, plus strict, des règles d’accessibilité. Elle peut juger les couleurs telles que les montre un écran, telles qu’elles s’imprimeront, ou les deux. Dans le panneau **Maquette**, chaque champ de couleur affiche son contraste le plus faible à côté de l’échantillon : un changement de palette montre ce qu’il coûte avant toute mise en page.

L’impression ajoute un problème que l’écran ne connaît pas. Un texte blanc en réserve sur un bandeau sombre s’imprime comme l’absence de quatre encres superposées, et les traits fins se bouchent dès que le repérage de la presse dévie d’un cheveu. La vérification signale le texte en réserve trop petit ou trop maigre pour la presse, ce genre de défaut qui passe très bien sur un moniteur et se referme sur le papier.

## Une couleur que la presse comprend

Un écran mélange de la lumière ; une presse dépose de l’encre. Les couleurs d’une configuration s’écrivent pour l’écran, et sur le chemin de l’imprimerie elles doivent se convertir dans les quatre encres des conditions d’impression : un papier donné, une presse donnée, une norme donnée. C’est cette conversion que décrit un **profil ICC**:index{term="profils ICC"}, et Postext en embarque quinze, de FOGRA39 et FOGRA51 pour le papier couché en Europe à GRACoL et SWOP pour l’Amérique du Nord, FOGRA39 par défaut. Un éditeur qui a son propre profil peut téléverser le fichier et nommer ses conditions d’impression.

La conversion est faite par Postext lui-même, dans le navigateur, avec un mode de rendu, relatif ou perceptif, et la compensation du point noir. Les images peuvent aussi être converties, si bien qu’une photographie du PDF est déjà dans les encres de la presse, et une **limite d’encrage** plafonne la couverture totale des quatre encres là où le papier ne sécherait pas. Les réglages d’impression ne déplacent jamais une ligne : la mise en page les ignore, et ils n’agissent que dans le PDF, l’aperçu d’impression et le contrôle en amont.

## PDF/X

Les imprimeurs demandent du **PDF/X**:index{term="PDF!PDF/X"} parce qu’il supprime les approximations. Un fichier PDF/X dit pour quelles conditions d’impression il a été fait, incorpore toutes ses polices, porte ses zones de coupe et de fond perdu et laisse de côté tout ce qu’une presse ne peut pas utiliser, comme les liens. Postext écrit les deux versions que les imprimeurs demandent le plus. Le PDF/X-1a est la version prudente : quatre encres et du gris seulement, sans transparence. Le PDF/X-4 garde la transparence et c’est aujourd’hui le choix habituel. L’une ou l’autre se choisit sous Maquette › Export › Préparation pour l’impression, ou avec l’option \`--pdfx\` de la ligne de commande.

Un livre destiné à l’impression a aussi besoin de **fond perdu**:index{term="fond perdu"} : les images et les bandeaux qui sortent de la page doivent dépasser la coupe de quelques millimètres, pour qu’une lame décalée d’un cheveu ne laisse jamais de bord blanc. Les réglages des traits de coupe ajoutent le fond perdu et tracent des repères aux coins, dans la couleur de repérage qui s’imprime sur chaque plaque. Ce guide est composé avec fond perdu : sa couverture, ses bandeaux de chapitre et ses pages de partie dépassent tous la coupe.

## Le noir

Le noir est la couleur qui inquiète le plus un imprimeur. Le texte courant doit s’imprimer avec la seule encre noire, car un texte composé en quatre encres devient flou dès que les plaques se décalent. Les gris et les noirs peuvent être limités à l’encre noire seule, et le noir plein peut se mettre en **surimpression**, posé par-dessus ce qui se trouve dessous, pour qu’un mince filet blanc n’apparaisse jamais autour d’une lettre noire sur un bandeau de couleur. Les grandes surfaces noires sont le cas inverse : une seule encre paraît délavée, si bien qu’un **noir enrichi** ajoute:index{term="noir enrichi"} les trois autres encres dessous, au-delà d’une taille que le texte n’atteint jamais. Le texte ne passe jamais en noir enrichi.

## Le contrôle en amont

:index{term="contrôle en amont"}Avant qu’un fichier parte sous presse, le service de prépresse procède à un **contrôle en amont** : une lecture automatique de chaque page selon les règles du travail. Postext fait le sien chaque fois qu’un livre est préparé pour l’impression, avec une norme PDF/X, un PDF en CMJN ou des traits de coupe, et liste ses constats dans le panneau **Vérifications**, les critiques en premier. Il signale les images sous 300 pixels par pouce à leur taille imprimée, et sous 150 comme critiques ; les images encore en RVB ; les filets plus fins qu’un quart de point ; le petit texte en plusieurs encres ; l’encrage au-delà de la limite ; le texte trop proche de la coupe ; l’illustration qui s’arrête juste avant la coupe, alors qu’elle devrait soit s’en tenir à l’écart, soit déborder dans le fond perdu ; et, dans un PDF placé comme image, les polices non incorporées, la couleur RVB et la transparence.

Le même contrôle s’exécute en dehors du Sandbox. La commande \`check\` de la ligne de commande sort avec un code d’erreur quand elle trouve un problème critique : une chaîne de publication peut refuser d’envoyer un fichier qui reviendrait de chez l’imprimeur.

:::callout{type="try"}
Ouvrez Maquette › Export › Préparation pour l’impression, choisissez PDF/X-4 et activez les traits de coupe. Le panneau **Vérifications** gagne un groupe Contrôle en amont ; la vue PDF dessine désormais le fond perdu et les repères autour de chaque page.
:::

## Une épreuve à l’écran

L’**aperçu d’impression** montre:index{term="aperçu d’impression"} les pages telles que la presse les imprimera. Chaque couleur est séparée selon le profil du travail et redessinée sur le blanc du papier, noirs enrichis compris ; un livre en niveaux de gris s’affiche dans la seule encre noire. Les repères et les contours disparaissent, et rien n’est remis en page : l’aperçu ne fait que repeindre. C’est un interrupteur de la barre d’outils de la vue Canvas, partagé avec la vue Folio, où l’on peut aussi voir les pages sur le papier sur lequel le livre sera imprimé.

Aucun écran ne vaut une épreuve contractuelle, et un livre qui compte mérite toujours une épreuve imprimée sur le bon papier. Mais l’aperçu repère tôt les surprises courantes : un bleu saturé qui vire au violet en CMJN, un gris pâle qui disparaît, un bandeau qui semblait noir et s’imprime d’un brun boueux.

## Le PDF accessible et le PDF imprimé

Le PDF pour l’imprimeur et le PDF pour les lecteurs peuvent être le même fichier. La structure balisée qui rend un PDF accessible, décrite dans :ref{id="output"}, cohabite sans conflit avec les règles du PDF/X ; seuls les liens disparaissent, parce qu’une norme d’impression ne les autorise pas. Un éditeur qui veut les deux peut exporter le PDF deux fois à partir de la même mise en page, l’un pour l’imprimeur et l’autre pour la bibliothèque, et chaque ligne tombera au même endroit dans les deux.

# Le livre en 3D {lead="Une mise en page est un ensemble de pages, mais un livre est un objet : un papier d’un certain grammage et d’une certaine teinte, une reliure qui s’ouvre d’une certaine façon, une épaisseur que la main sent. La vue Folio montre les pages sous la forme de cet objet, avant toute impression." summary="La vue Folio, les papiers, les reliures, les couvertures et la lumière"}

Les épreuves à l’écran sont plates. Une double page vue comme deux rectangles ne dit rien de la façon dont le livre se tiendra, ouvert sur un bureau : si le pli de la reliure avale la marge intérieure, si une planche sur papier brillant accroche la lumière, si trois cents pages de papier crème font un bloc trop épais pour la reliure. La vue **Folio** répond à ces questions avec les pages que Postext a déjà composées. Elle montre le livre relié, ouvert sur une surface, éclairé, avec des feuillets qui se courbent et tournent sous la main.

Rien n’y est une seconde mise en page. Les pages sont celles que peint le canvas, dessinées aux pixels exacts de l’écran, si bien que le texte dans Folio est aussi net que dans la vue Canvas et identique ligne pour ligne. Ce que Folio ajoute, c’est tout ce qui entoure les pages : le papier, la reliure, les couvertures, le bureau et la lumière. Tout cela vient d’une seule partie de la configuration, \`folio\`, que la mise en page ne lit jamais. Changer de papier ou de reliure redessine aussitôt le livre et ne déplace jamais une ligne.

## Tourner les pages

:index{term="Folio"}Une page se tourne comme on tourne une page : prenez-la par le bord et faites-la passer de l’autre côté. Lâchée au-delà du milieu, elle se pose de l’autre côté ; lâchée avant, elle retombe. Un clic sur une page la tourne aussi, vers l’avant sur la page de droite et vers l’arrière sur celle de gauche, tout comme les flèches de la barre d’outils et les touches fléchées, Page précédente et Page suivante, Début et Fin quand le livre a le focus. Le champ de page de la barre d’outils prend un numéro de page et ouvre le livre à cette double page.

Chaque feuillet se courbe selon son papier. Un fin papier bible s’enroule en une courbe serrée et laisse transparaître l’impression du verso ; une carte tourne en un large arc ; le carton, comme dans un livre cartonné pour les tout-petits, tourne comme une plaque rigide sur sa charnière. Les couvertures tournent elles aussi comme des plats rigides. Un saut de plus de dix pages ne les tourne pas une à une : le bloc des pages intermédiaires se soulève d’un seul tenant, aussi épais que ces pages, et se pose de l’autre côté.

La vue elle-même peut bouger. Un glisser avec le bouton droit de la souris fait pivoter la vue autour du livre, jusqu’à un angle rasant, pour regarder le dos, la tranche avant ou l’épaisseur du bloc, et cela même pendant que des feuillets tournent encore. La vue reste là où on l’a laissée jusqu’à ce que **Réinitialiser la vue** la ramène à l’angle que donnent les réglages. Dans une fenêtre étroite, le livre montre une page à la fois, en tournant toujours son feuillet par-dessus le dos ; quand le système demande des animations réduites, les doubles pages changent sans le mouvement de la page.

Trois boutons de la barre d’outils choisissent ce que fait le pointeur sur le livre : tourner les pages à la main, faire pivoter la vue, ce qu’il faut sur un pavé tactile ou une tablette à la place d’un glisser au bouton droit, ou sélectionner du texte. La sélection fonctionne sur les pages telles qu’on les voit, inclinées ou pivotées, comme dans la vue Canvas : un clic place le curseur dans l’éditeur sur ce mot, un glisser sélectionne, un double clic prend un mot, et un lien se suit. Elle fonctionne aussi dans l’autre sens : le curseur et la sélection de l’éditeur sont dessinés sur les pages, et amener le curseur sur une page qui n’est pas affichée ouvre le livre à cette page.

Les vidéos se lisent sur la page. Quand le pointeur tourne les pages, un clic sur l’image d’aperçu d’une vidéo la lance sur place, et elle continue pendant que le feuillet tourne. Un autre clic la met en pause, en lancer une autre arrête la première, et une vidéo s’arrête quand le livre s’immobilise sur une double page qui ne la montre plus. Les vidéos YouTube et Vimeo ne peuvent pas être dessinées dans une page : un clic sur l’une d’elles tourne le feuillet.

:::callout{type="try"}
Ouvrez l’onglet Folio sur ce guide, tournez quelques pages en tirant leurs coins, puis faites pivoter le livre d’un glisser au bouton droit pour voir son pli agrafé. Réinitialiser la vue le remet en place.
:::

## Le papier

Le papier se choisit comme un imprimeur le commanderait : par **sorte**, le type de papier, et par **grammage**, son poids en grammes par mètre carré. Chaque sorte apporte les valeurs qui lui sont typiques, recensées dans le :ref{id="paper-stocks"}, et chacune d’elles peut se modifier séparément : un bouffant d’édition à 70 grammes au lieu de 80, un papier non couché d’une teinte plus chaude.

L’épaisseur découle de deux nombres. La **main** d’un papier, en centimètres cubes par gramme, dit quelle place prend un gramme de ce papier ; le grammage multiplié par la main donne l’**épaisseur** d’une feuille, en micromètres. Le bloc d’un livre, c’est son nombre de feuillets multiplié par cette épaisseur : voilà pourquoi les mêmes trois cents pages font un volume mince sur papier couché et un gros volume sur un bouffant de forte main. Folio compte le livre entier, si bien qu’un chapitre montré seul se tient toujours entre les pages qui le précèdent et celles qui le suivent, à leur épaisseur réelle.

La surface a trois réglages. La **finition** dit si le papier est non couché, avec ses fibres et sans reflet, ou couché et calandré en mat, demi-mat ou brillant, qui reflète la pièce. La **texture** est le relief : lisse, le grain fin du vélin, la trame régulière du vélin tissé, les lignes du vergé, un toilé gaufré ou les marques irrégulières du feutré ; son intensité peut se baisser ou s’augmenter. La **teinte** est la couleur du papier avant impression, blanc, naturel ou crème, et la **transparence** laisse apparaître faiblement l’impression du verso sur un papier fin, de moins en moins à mesure que le papier s’alourdit et devient plus opaque.

## Reliures et couvertures

Cinq reliures sont proposées. Une **couverture rigide** est emboîtée, avec des plats légèrement plus grands que les pages. Un **broché** est en dos carré collé, son dos fraisé et encollé, et s’ouvre moins à plat. Un **broché cousu** garde ses cahiers cousus sous une couverture souple et s’ouvre plus facilement. Une reliure **à plat** s’ouvre entièrement, sans que les pages plongent vers le dos. Une brochure en **piqûre à cheval** est faite de feuilles pliées et agrafées dans le pli, comme un magazine ou un programme, et n’a pas de dos plat. Un livre épais s’ouvre comme s’ouvre un livre épais, son dos dressé entre les deux blocs de pages.

Les couvertures viennent de l’une de deux sources. Par défaut, Folio dessine un **emboîtage** autour des pages, en toile, en carte ou en cuir, dans la couleur de couverture. Quand le document porte déjà ses couvertures, comme ce guide, elles peuvent être **les pages du document** : la première page devient la première de couverture et la dernière, quand elle tombe sur une page de gauche, la quatrième de couverture. Le livre repose alors fermé sur sa couverture jusqu’à ce que le lecteur l’ouvre, la couverture tourne comme un plat rigide, et tourner le dernier feuillet referme le livre.

Le dos peut porter une image. N’importe quelle image ou n’importe quel SVG du panneau Ressources peut y être imprimé, vu comme on voit un dos sur une étagère, tête en haut et première de couverture à droite ; l’image est mise à l’échelle pour couvrir le dos, et doit donc laisser un peu de marge sur ses bords. Une brochure en piqûre à cheval n’a pas de dos où imprimer. L’image voyage avec les ressources du livre dans son fichier .postext, et elle apparaît chaque fois que la vue pivote jusqu’au dos.

## Des planches sur un autre papier

Les livres changent souvent de papier le temps de quelques pages : un cahier de planches en couleur sur papier couché dans un roman imprimé sur bouffant d’édition, un intercalaire en carte, quelques feuillets de papier teinté. Dans Postext, c’est un conteneur dans le texte :

:::callout{type="note" title="Un cahier de planches"}
\`:::paper{type=coatedGloss grammage=130}\` ouvre la série et \`:::\` la ferme. Tout ce qui se trouve entre les deux est imprimé sur ce papier.
:::

Une sorte de papier couvre des feuilles entières : le contenu de la série commence donc sur une nouvelle page, et ce qui la suit aussi. Chaque page composée à l’intérieur de la série porte son papier dans la mise en page, et la vue Folio dessine ces feuillets avec la couleur, la surface, l’épaisseur et la rigidité de ce papier ; le canvas, le HTML et le PDF les composent comme n’importe quelle autre page. Les attributs omis suivent le papier du livre, et une série placée dans une autre ne remplace que ce qu’elle définit.

## Le bureau et la lumière

Le livre repose sur une **surface** : chêne, noyer, lin, feutre, cuir, marbre, couleur unie, ou rien du tout, ce qui laisse voir le fond de la page. Chaque surface est une texture photographiée, et une teinte peut recolorer n’importe laquelle d’entre elles. Cinq **lumières** plantent le décor : un studio, la lumière du jour, une lampe de lecture, un ciel couvert et la nuit. Chacune forme une paire : l’environnement que reflètent les papiers couchés et brillants quand un feuillet tourne, et une lumière principale qui projette les ombres du bloc et d’une page soulevée sur les pages en dessous. L’**exposition** éclaircit ou assombrit la scène, et les ombres peuvent être désactivées sur un ordinateur lent. L’**inclinaison** règle de combien la vue s’écarte de la verticale, jusqu’à soixante-dix degrés, et la **rotation** de combien elle tourne autour du livre ; Enregistrer comme vue par défaut mémorise les deux telles que vous les voyez.

Ce guide est monté en brochure en piqûre à cheval, sur papier couché brillant de 170 grammes, sur un tapis de feutre bleu, en lumière de studio. Ses couvertures sont ses propres première et dernière pages : il s’ouvre donc sur la couverture et se ferme quand le dernier feuillet tourne. Tout cela se trouve dans le groupe **Folio** du panneau Maquette, et rien dans ce groupe ne change une seule ligne des pages.

## Où Folio fonctionne

Folio dessine avec WebGL2, le graphisme en trois dimensions du navigateur, avec une texture pour chaque face de chaque page peinte. Ne peindre que les doubles pages autour de celle qui est ouverte ramène la mémoire d’un long livre à celle de quelques pages, mais un téléphone accorde encore à un onglet de navigateur moins de mémoire qu’il n’en faut à un livre : le Sandbox propose donc l’onglet Folio sur les ordinateurs et les tablettes, mais pas sur les téléphones, ni dans les navigateurs sans WebGL2. Sur un téléphone, les autres vues restent là : le canvas, le HTML et l’EPUB se lisent dans la page, et le PDF s’ouvre dans le lecteur du système. Le livre ne change pas pour autant : ce sont les mêmes pages, et ses réglages de papier et de reliure l’attendent pour le jour où on l’ouvre sur un ordinateur.

:::callout{type="note" title="Dans le code"}
La visionneuse est un paquet à part entière, _postext-folio_, construit sur three.js. \`createFolioFromDocument(container, doc)\` montre un document mis en page sous forme de livre ; \`setDocument\` montre la mise en page suivante sur la même page, \`setAppearance\` change le papier, la reliure ou la lumière, et \`resetView\` ramène la vue à sa position. \`createFolio\` fait de même à partir de n’importe quelles images de pages.
:::

Le même paquet tourne les pages des recettes de la section Recettes, et il peut prendre place dans n’importe quelle page web qui veut présenter un livre comme un livre : le catalogue d’un éditeur, une épreuve envoyée à un auteur, un aperçu avant que la commande parte chez l’imprimeur.

# Des outils autour du moteur {#tools lead="Le Sandbox est une des portes d’entrée de Postext. Une ligne de commande compose des livres depuis un terminal, un format de fichier les transporte entiers, les documents Word entrent et sortent, et des agents peuvent manier le Sandbox ou porter un livre à partir de son PDF." summary="La ligne de commande, le fichier .postext, Word, WebMCP et le skill de portage"}

Le moteur au centre de ce livre est une bibliothèque, et une bibliothèque peut s’appeler de partout. Le Sandbox est l’endroit le plus visible où il s’exécute, mais un éditeur qui a un catalogue à produire, un développeur qui a une chaîne de construction ou un assistant à qui l’on demande de composer un manuscrit ont chacun besoin d’une autre porte. Ce chapitre les passe en revue, du terminal aux agents.

## La ligne de commande

:index{term="ligne de commande"}**postext** est un programme pour le terminal qui transforme un livre en PDF, en EPUB, en HTML, en images de pages ou en document Word, sans navigateur. Il se présente sous la forme d’un fichier par système, pour macOS, Linux et Windows, téléchargé depuis les versions publiées du projet, ou par npm sous le nom _postext-cli_. Tout ce dont il a besoin voyage avec lui : le moteur, une bibliothèque de dessin, un moteur de mise en forme du texte, les profils ICC du chapitre sur l’impression et deux familles de polices. Les autres polices sont récupérées une fois sur Google Fonts ou dans un dossier que vous indiquez, puis gardées en cache ; les polices installées sur l’ordinateur ne servent jamais, si bien qu’un livre se compose de la même façon sur toutes les machines.

Le programme lit un fichier \`.postext\`, un dossier qui contient un livre, ou des fichiers Markdown isolés pris comme chapitres dans l’ordre de leurs noms. Chaque sortie a sa commande : \`pdf\`, \`epub\`, \`html\`, \`image\` et \`images\`, \`docx\`. Les options couvrent ce que le Sandbox propose dans ses panneaux : une norme PDF/X et un profil, un EPUB fixe ou recomposable, une seule page ou une plage de pages dans la numérotation qu’imprime le livre, une résolution, un aperçu d’impression. \`--set\` change n’importe quel réglage le temps d’une exécution, \`--locale\` choisit une édition et \`--chapters\` une partie du livre.

:::callout{type="note" title="Du manuscrit au PDF"}
1. \`postext pdf book.postext\` écrit le livre entier en PDF
2. \`postext images book.postext --pages 12-15 --dpi 200\` dessine quatre pages sous forme d’images
3. \`postext check book.postext --strict\` échoue au moindre avertissement
4. \`postext build book/ --watch\` recompose le livre chaque fois qu’un chapitre est enregistré
:::

Deux commandes servent l’automatisation. \`check\` met le livre en page et signale ce que signalerait le panneau **Vérifications**, avec le contrôle en amont quand le livre est préparé pour l’impression, et se termine par un code d’erreur qu’un script peut tester. \`build --watch\` garde un livre ouvert et le recompose quand un fichier change : un éditeur de texte et une visionneuse PDF côte à côte se comportent alors comme le Sandbox. Sur un portable ordinaire, un roman illustré de 140 pages se compose et s’écrit en PDF en une dizaine de secondes.

## Un livre en un seul fichier

:index{term="format de fichier (.postext)"}Un fichier **.postext** est un livre emballé pour le voyage : une archive zip qui contient les chapitres en Markdown, la configuration, les ressources, les polices et un manifeste qui les relie. Il peut aussi porter la pagination déjà calculée : un livre s’ouvre alors mis en page, et la première page apparaît avant que le moteur ait composé une ligne. Le Sandbox télécharge un livre dans ce format depuis le panneau **Livres** et en ouvre un depuis le même endroit ; la ligne de commande le lit et l’écrit ; les livres d’exemple du site sont servis sous forme de fichiers .postext.

Un fichier peut contenir plusieurs langues, chacune avec ses chapitres, ses ressources et ses réglages, comme le décrit :ref{id="languages"}. Les programmes lisent et écrivent le format par une petite interface du moteur, \`openBundle\`, \`createBundle\` et \`buildBundle\`, cette dernière mettant en page tous les chapitres d’un paquet comme un seul livre, compteurs et numéros de page continus. Un fichier produit par une version de Postext s’ouvre dans la suivante : le manifeste enregistre la version des réglages avec laquelle il a été écrit, et les fichiers plus anciens sont lus comme ils devaient l’être.

## Documents Word

:index{term="documents Word"}La plupart des manuscrits arrivent sous forme de fichiers Word. Le panneau **Texte** importe un .docx dans le navigateur, sans l’envoyer nulle part, et ouvre une boîte de dialogue avant de rien changer. Il commence par juger le document : _bien stylé_ quand l’auteur a utilisé des styles de paragraphe, _partiellement stylé_, ou _aucun style_ quand chaque titre a été mis en gras à la main. Il montre ensuite comment chaque style Word sera lu, comme niveau de titre, style de paragraphe, liste, citation ou texte simple, et vous laisse changer chacun d’eux ; ces choix peuvent s’enregistrer comme modèle et servir pour le manuscrit suivant du même auteur ou de la même maison. Un aperçu du Markdown obtenu se met à jour au fur et à mesure.

Les images et les tableaux deviennent des ressources, les notes de bas de page des notes, les champs d’index de Word des marques d’index et ses équations des mathématiques. L’import peut remplacer le chapitre en cours, ajouter de nouveaux chapitres après lui ou remplacer tout le livre, coupé à ses titres de premier niveau.

Le chemin va aussi dans l’autre sens. **Exporter vers Word** écrit un chapitre ou le livre entier en .docx pour un auteur ou un éditeur qui travaille dans Word. Ce que Word ne sait pas montrer, une directive ou un renvoi à une ressource, est gardé dans des paragraphes gris d’un style nommé _Postext Markup_, et le modèle voyage dans le fichier : le document corrigé revient dans Postext sans rien perdre.

## Des agents dans le Sandbox

Un assistant capable d’utiliser un navigateur peut aussi utiliser le Sandbox, grâce à **WebMCP**:index{term="WebMCP"}, une proposition de norme web pour les pages qui offrent des outils aux agents. Tant que le Sandbox est ouvert, il en offre plus de cinquante : lire l’état du livre, modifier un chapitre, changer un réglage, ajouter une ressource, rendre une page en image, lire les avertissements, exporter un PDF, annuler. Un agent à qui l’on demande de resserrer un chapitre peut modifier le texte, regarder la page obtenue et recommencer, comme le ferait une personne, et chacune de ses modifications est à l’écran et dans l’historique d’annulation.

Les outils qui détruisent du travail, supprimer un chapitre, une ressource ou un livre, sont marqués comme lourds de conséquences : le navigateur demande l’accord de la personne avant de les exécuter. Une application qui intègre le Sandbox peut désactiver les outils.

## Porter un livre avec un agent

Faire entrer un livre existant dans Postext revient surtout à lire sa maquette : le format, les marges, les colonnes, les corps, la manière dont s’ouvrent les chapitres et dont se placent les figures. Le skill **postext-port**:index{term="skill postext-port"} apprend à un agent à le faire à partir de ce dont dispose l’éditeur : un PDF, un fichier Word ou InDesign, un EPUB, du LaTeX, du HTML ou des pages numérisées. Il inventorie la source, mesure les pages, propose une fiche de spécifications, écrit la configuration et les chapitres, puis vérifie son propre travail : il dessine chaque page qu’il compose sous forme d’image et la compare à l’original, page par page, jusqu’à ce qu’elles concordent. Le résultat est un fichier .postext qui s’ouvre dans le Sandbox comme n’importe quel autre livre.

Le skill s’installe dans tout agent qui lit des skills, en une commande, et dans Claude Code comme plugin. Il connaît les écritures de ce livre : les livres chinois et japonais composés verticalement, les livres arabes composés à partir de la droite, les bandes dessinées relettrées dans une autre langue, les manuels construits sur des pages composées.

## L’intégration et la bibliothèque

Enfin, le Sandbox lui-même est un composant React qu’une application peut intégrer avec son propre Markdown, sa propre configuration, sa propre langue d’interface et ses propres livres d’exemple. En dessous, les bibliothèques décrites dans :ref{id="output"} mettent en page, dessinent et écrivent des livres sans aucune interface. Le Sandbox, la ligne de commande, le format de fichier et les agents sont tous construits avec ces mêmes paquets : c’est pourquoi une page a la même allure, quelle que soit la porte par laquelle elle est arrivée.

# Feuille de route et communauté {lead="Postext est jeune et ouvert. La chaîne de traitement principale, le format de document et le système de configuration sont livrés ; la suite se décide en public." summary="Où en est le projet et comment y prendre part"}

Postext ne cherche pas à être une plateforme documentaire universelle. Il vise à être un très bon moteur de mise en page éditoriale pour le web, et garde un périmètre étroit pour que son noyau reste affûté. Son ambition à long terme est de devenir le moteur de mise en page de référence pour les contenus éditoriaux sur le web : un outil que les éditeurs, les magazines, les plateformes de livres et les équipes de développement puissent adopter et sur lequel ils puissent bâtir.

## Où en est le projet

Le travail s’organise en quatre phases, résumées dans le :ref{id="development-phases"}. Ce ne sont pas des jalons stricts ; elles décrivent l’ordre dans lequel les capacités deviennent assez stables pour la production.

Les deux premières phases sont pour l’essentiel achevées : le modèle de données, l’analyseur et la couche de mesure, le format de document, le moteur de colonnes avec son équilibrage, ses flottants et ses tableaux, et la mécanique du livre, faite de chapitres, de parties, de table des matières et de titres courants. La troisième phase a livré l’essentiel (coupure optimale des lignes avec pénalités éditoriales, césure en huit langues, mathématiques, notes de bas de page et notes de fin de chapitre, citations, index, chinois et japonais composés horizontalement et verticalement, arabe composé de droite à gauche avec justification par kashida, pages composées, bande dessinée, musique, exercices et texte qui contourne les images) et laisse encore ouvertes les notes marginales. La quatrième, celle des sorties, a livré le canvas, le HTML, un PDF balisé prêt pour l’impression, des livres EPUB 3 et des cours SCORM, ainsi que le worker, le Sandbox et ses préréglages, la vue Folio qui montre une mise en page sous la forme d’un livre imprimé et une ligne de commande qui compose des livres sans navigateur.

Ce qui manque encore compte autant que ce qui est livré. Les **notes marginales** ont leur place dans le modèle de données mais ne sont pas encore mises en page. Le texte ne court pas encore des deux côtés d’une image, le coréen est composé avec les règles du chinois plutôt qu’avec les siennes, et la ligne de commande met le texte en forme sans les formes propres à chaque langue qu’applique un navigateur, si bien qu’une ligne peut de temps à autre se couper sur un autre mot que dans le Sandbox. Ce sont les prochains problèmes à résoudre, et ceux où l’aide compte le plus.

## S’impliquer

Le projet vit sur GitHub, et chaque échange s’y déroule au grand jour : les **issues** pour les bogues, les demandes et les tâches concrètes ; les **pull requests** pour le code, relues en public ; les **discussions** pour les idées, les questions de conception et tout ce qui n’est pas encore assez concret pour devenir une issue. Les issues étiquetées _good first issue_ sont la porte d’entrée la plus facile.

Le chemin habituel de l’idée au code est court : une issue décrit le problème, une discussion tranche l’approche quand il y en a plusieurs, une pull request la met en œuvre, et le changement est fusionné dans la branche de développement puis publié à partir de là. Ouvrir une issue avant une grosse pull request fait gagner du temps à tout le monde, parce que l’approche peut être convenue avant que le code soit écrit.

## Là où l’aide compte

Chaque partie du projet accueille les contributeurs. Le **moteur** pose des problèmes profonds (coupure des lignes, équilibrage, numérotation, placement des flottants) et d’autres plus abordables dans ses tests et ses bancs d’essai. Le **backend PDF** a l’incorporation des polices, la gestion de la couleur et l’accessibilité. Le **Sandbox** a ses panneaux, ses éditeurs et ses traductions, organisés pour que chaque chaîne de l’interface s’ajoute de la même façon dans toutes les langues. La **conception graphique et la typographie** ont besoin de personnes qui connaissent les traditions éditoriales, en particulier celles des écritures que le moteur ne sert pas encore bien. Et la **documentation** et ses traductions, actuellement en anglais, espagnol, catalan, français, allemand, italien, portugais du Brésil, chinois simplifié, japonais et arabe, sont ouvertes à quiconque sait expliquer clairement les choses.

La meilleure première étape est modeste : lire le guide de contribution du dépôt, vous présenter dans les discussions, choisir une issue étiquetée _good first issue_ ou traduire une page de la documentation.

La plupart des contributions ne demandent pas d’écrire du code :

- **Signaler des problèmes** avec un exemple minimal du document et de la configuration
- **Partager vos mises en page**, et en faire des préréglages dont d’autres pourront partir
- **Améliorer la documentation** avec des tutoriels, des exemples et des explications
- **Traduire** l’interface et la documentation dans de nouvelles langues
- **Apporter une expertise typographique**, en particulier pour les écritures et les traditions encore mal servies
- **Contribuer du code** au moteur, aux moteurs de rendu ou au Sandbox

## Ce qui restera en dehors

Il y a des choses que Postext ne deviendra pas, délibérément, et le dire fait partie de l’honnêteté du projet. Ce ne sera pas un traitement de texte : rien n’est prévu pour modifier la page directement, parce que la page est le résultat des règles, pas leur point de départ. Il ne gérera pas les points de rupture responsive de son hôte, parce que cette décision appartient à l’application. Il ne chargera pas les polices de lui-même, parce que le chargement des polices relève de la page qui l’intègre. Et il ne deviendra pas une plateforme documentaire généraliste, avec stockage, collaboration et circuits de publication, quand d’autres outils font bien ces choses-là et que Postext peut s’y intégrer.

D’autres choses ne sont simplement pas encore faites. La collaboration en temps réel, c’est-à-dire le partage d’une session en direct par un lien, figure dans la liste d’idées du Sandbox, et les notes marginales sont une question de conception autant qu’une question technique. Les deux seront discutées en public avant que la moindre ligne de code soit écrite.

## Licence

:index{term="licence"}Postext est publié sous **licence MIT** : le moteur, les générateurs PDF et EPUB, la visionneuse Folio et le Sandbox peuvent être utilisés, modifiés et intégrés dans des projets ouverts comme fermés, commerciaux ou non, à condition que la mention de licence accompagne le code. Les caractères de ce livre sont des polices libres servies par Google Fonts, les diagrammes font partie des sources du Sandbox, et le texte de ce guide appartient au projet et à ses contributeurs.

## Valeurs

Trois valeurs guident le projet, et elles sont faites pour servir, pas pour être encadrées : quand deux bonnes idées tirent dans des directions opposées, ce sont elles qui tranchent.

_La réflexion avant la vitesse._ La typographie porte des siècles de savoir accumulé, et le moteur doit l’honorer plutôt que de le réinventer mal. Une fonctionnalité arrive quand elle fait ce qu’il faut sur une vraie page, pas quand elle marche simplement dans une démo ; une règle empruntée à l’imprimé est étudiée dans les livres qui l’appliquent avant de devenir une option. Certaines fonctionnalités prennent ainsi plus de temps. Celles qui sortent n’ont pas besoin d’être retirées.

_La clarté avant l’astuce._ Le code, la configuration et la documentation doivent être faciles à lire, à modifier et à expliquer. Une option qui exige un paragraphe de mises en garde signale une conception pas encore aboutie ; une fonction que seul son auteur peut suivre ne survivra pas aux vacances de son auteur. La configuration garde des unités réelles et des noms simples, le format de document reste lisible dans n’importe quel éditeur, et les décisions du moteur peuvent toujours être rattachées à une règle que quelqu’un peut désigner.

_La collaboration avant le territoire._ Les décisions se prennent en public, dans des issues et des discussions que chacun peut lire et rejoindre, et aucune partie du code n’appartient à une seule personne. Chaque contribution est reconnue (code, documentation, traductions, rapports de bogues, conseils typographiques et livres d’exemple qui montrent ce que peut faire le moteur), parce qu’un moteur de mise en page pour tous ne peut être construit que par beaucoup de monde.

Si quelque chose ici vous parle, le dépôt est la prochaine étape. Ouvrez une issue, posez une question dans les discussions, ou changez quelque chose dans ce livre et regardez ce qu’en fait le moteur.

:::paragraphs{style="signature"}
postext.dev · github.com/drnachio/postext
:::

# Index {style="index" summary="Chaque terme que marque ce guide, avec ses pages"}

:::index

# Quatrième de couverture {style="back" toc="false" book="Postext" blurb="Postext compose du Markdown en livres, en magazines et en manuels, dans le navigateur : chaque paragraphe coupé en lignes comme un tout, des colonnes qui finissent à la même hauteur, des figures placées après les mots qui les appellent, un PDF prêt pour l’impression et un EPUB pour les liseuses. Chaque page de ce guide a été composée par Postext lui-même." licence="Open source · licence MIT"}
`;
