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

Postext est un **moteur de mise en page open source** qui apporte au web le savoir-faire de la typographie imprimée professionnelle. Il reçoit un **contenu sémantique** écrit en Markdown enrichi et un objet de configuration, et calcule une mise en page entièrement résolue, dans laquelle chaque ligne, chaque titre, chaque figure et chaque tableau occupe une position précise, mesurée en véritables unités typographiques. Cette mise en page est ensuite dessinée par trois moteurs de rendu (un aperçu canvas en direct, du HTML positionné et un PDF prêt pour l’impression) qui lisent tous la même géométrie : ce que vous voyez à l’écran est exactement ce qui part chez l’imprimeur. Les mêmes pages s’écrivent aussi en livre numérique EPUB 3.

Ce livre est sa propre démonstration. Sa couverture, la table des matières qui se numérote d’elle-même, les pages de partie en trois couleurs, le bandeau qui ouvre chaque chapitre, les titres courants en haut de ces pages et chaque figure qui vient se mettre en place : tout a été mis en page par Postext, dans votre navigateur, il y a un instant. Rien n’a été placé à la main. Le Markdown dit seulement ce que sont les choses, et la configuration décide de leur apparence. Avec une autre configuration, le même texte deviendrait un livre de poche ou un magazine. Rien n’empêche d’essayer : chaque réglage de ce livre peut être changé dans le Sandbox, et **Restaurer l’original…**, dans le menu de la ligne du guide du panneau **Livres**, le remet tel qu’il était.

:::callout{type="try"}
Ouvrez le panneau **Texte** et choisissez ce chapitre dans le sélecteur de chapitres, en haut du panneau. Modifiez un mot de ce paragraphe ou supprimez une phrase : la page se recompose, les colonnes se rééquilibrent et les numéros de page des chapitres suivants suivent le mouvement.
:::

Pour commencer plutôt par une vidéo, :ref{id="postext-showreel"} fait le tour de la question en deux minutes ; dans la vue Folio, elle se lit sur la page même.

## Comment lire ce livre

Le livre est organisé en trois parties. **Fondements**, la partie où vous vous trouvez, expose le problème que résout Postext et la façon dont le moteur est construit : ce qui entre, ce qui sort et ce qui se passe entre les deux. **Le métier** traite de typographie : comment se compose une ligne, comment se cadre une page, où vont les figures et les tableaux, et comment une suite de chapitres devient un livre. **En pratique** passe aux outils : le format de document, le Sandbox, les quatre formats de sortie (canvas, HTML, PDF et EPUB) et le projet qui les entoure.

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

# Comment fonctionne le moteur {lead="Le Markdown et un objet de configuration entrent ; il en sort un arbre où chaque ligne a une position en unités réelles. Entre les deux, une courte chaîne de traitement mesure le texte sans toucher au DOM et itère jusqu’à ce que la page se stabilise." summary="Analyse, mesure, mise en page, convergence"}

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

Postext mesure avec _pretext_, une bibliothèque de mesure de texte sans DOM qui s’appuie sur les métriques de police du canvas et sur de l’arithmétique pure. Son étape coûteuse, la préparation d’un texte pour une police donnée, est mise en cache ; la mise en page à une largeur donnée ne coûte presque rien. Cette approche est de 300 à 600 fois plus rapide que la mesure par reflow, comme le montre bien :ref{id="measurement-speed"}, et le module de mesure du moteur y ajoute les segments enrichis de gras, d’italique et de mathématiques, la césure, la justification et la coupure optimale des lignes. Chaque résultat est mis en cache sous une clé qui comprend le texte, les polices, la largeur et toute option capable de modifier une ligne : taper dans un paragraphe remesure ce paragraphe et rien d’autre.

Le chargement des polices est la seule partie de la mesure que le moteur laisse à son hôte. Mesurer avec une police qui n’est pas encore arrivée reviendrait à mesurer la police de repli, et chaque ligne bougerait à l’apparition du vrai caractère. La bibliothèque attend donc que les polices soient chargées avant la première construction, et offre un moyen de vider ses caches de mesure quand une police arrive en retard, pour que la construction suivante mesure à nouveau avec les bonnes métriques. Le Sandbox le fait automatiquement : il charge chaque famille que nomme la configuration, depuis Google Fonts ou depuis le panneau **Polices**, avant de mettre une page en page.

## Sept passes et une boucle

La mise en page elle-même se fait en sept passes :

1. **La structuration du contenu** analyse le Markdown en une liste plate de blocs et résout les ressources par identifiant
2. **La mesure du texte** compose chaque paragraphe en lignes à la largeur qu’il occupera
3. **Le placement dans les pages et les colonnes** remplit les pages et les colonnes, en réservant la place des titres courants et des blocs sur toute la largeur de la page
4. **Le placement des ressources** fait flotter chaque figure et chaque tableau cités vers le premier emplacement libre après leur renvoi
5. **Le raffinement typographique** applique les règles qui gardent les titres avec leur texte et les listes avec leur introduction
6. **L’équilibrage des colonnes** met à niveau les colonnes de chaque page
7. **Le rythme vertical** ramène le texte sur la grille de ligne de base après tout ce qui la rompt

Ces passes dépendent les unes des autres en cercle. Garder un titre avec son paragraphe peut pousser les deux dans la colonne suivante ; ce déplacement peut laisser une veuve ; corriger la veuve fait remonter une ligne, ce qui peut à nouveau séparer le titre. Postext sort de ce cercle avec la **boucle de convergence** de :ref{id="convergence-loop"} : les passes trois à sept se répètent, en ne marquant que ce qui a changé, jusqu’à ce que plus rien ne bouge. La boucle est plafonnée à cinq itérations, et les documents courants se stabilisent en une ou deux. Un score des infractions typographiques est tenu à chaque itération : si le plafond est atteint, le moteur garde la meilleure mise en page trouvée, et non la dernière.

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

Ce qui sort de la boucle, c’est le **VDT**, l’arbre de document virtuel : des pages qui contiennent des colonnes, des colonnes qui contiennent des blocs, des blocs qui contiennent des lignes, chacun avec sa boîte en unités réelles, accompagnés d’une liste plate de tous les blocs pour un accès rapide. L’arbre n’est que géométrie (il ignore tout du canvas, du HTML, du PDF et de l’EPUB), et c’est précisément ce qui permet à chaque moteur de rendu de dessiner une sortie identique. Chaque ligne se souvient aussi du passage de Markdown d’où elle vient : c’est ainsi qu’un clic sur la page place le curseur de l’éditeur sur le bon mot.

Les pages enregistrent aussi leur fonction. Une page peut être une page courante, une ouverture de chapitre, une page de partie ou une page blanche insérée pour obtenir la bonne parité, et ce rôle permet aux titres courants, aux folios et aux décors de choisir où apparaître. Les étiquettes de page (le numéro imprimé dans sa séquence) sont calculées une seule fois, dans l’arbre, de sorte que le canvas, le HTML et le PDF s’accordent sans faire leur propre décompte. Une préface numérotée en chiffres romains et un corps qui repart à un ne demandent aucun cas particulier dans aucun moteur de rendu : chacun imprime l’étiquette que lui donne l’arbre.

## Hors du fil principal

Une mise en page peut durer plus longtemps qu’une frappe : le moteur peut donc s’exécuter dans un Web Worker. Le worker garde son propre cache de mesure d’une construction à l’autre et s’interrompt de façon coopérative : quand une nouvelle construction est demandée, la précédente s’arrête à son prochain point de contrôle et la dernière demande l’emporte. Le Sandbox met en page toutes ses vues de cette manière, et les générateurs PDF et EPUB ont leurs propres workers : l’interface reste réactive pendant qu’un livre entier se compose ou s’écrit. Le calcul est le même que sur le fil principal et donne les mêmes pages, au pixel près. Un livre de plusieurs centaines de pages se recompose ainsi sans bloquer la saisie.

:::callout{type="note" title="Dans le code"}
\`buildDocument(content, config)\` renvoie le VDT. \`renderPage\` dessine une page sur un canvas, \`renderToHtml\` renvoie du HTML positionné, et \`renderToPdf\`, du paquet _postext-pdf_, renvoie les octets d’un PDF, d’un seul document ou d’un livre entier passé sous forme de tableau de chapitres. \`renderToEpub\`, de _postext-epub_, écrit ces mêmes chapitres dans un fichier EPUB 3. \`createLayoutWorker\`, de _postext/worker_, exécute la construction hors du fil principal.
:::

:::part{number="II" title="Le métier" palette="band=#b7820f"}
3. Composer la ligne
4. La page et ses colonnes
5. Figures, tableaux et flottants
6. Livres, parties et titres courants
:::

# Composer la ligne {lead="Un paragraphe se compose d’un seul tenant, pas ligne par ligne. Postext pèse toutes les façons possibles de le couper, chiffre l’espacement, les césures et les mots isolés, et choisit l’ensemble de coupures qui coûte le moins." summary="Coupure optimale des lignes, césure, espacement et défauts évités"}

La qualité d’une page se décide d’abord dans ses paragraphes. Un navigateur coupe les lignes de façon gloutonne : il remplit une ligne d’autant de mots qu’elle peut en contenir, passe à la suivante, et ne peut répartir l’espace restant qu’à l’intérieur de chaque ligne. Postext met en œuvre l’**algorithme de Knuth-Plass**, l’algorithme de coupure optimale qui fait tourner TeX depuis 1981. Il évalue toutes les façons possibles de couper le paragraphe entier et choisit celle dont le coût total est le plus faible : l’espacement reste régulier de la première à la dernière ligne, et aucune ligne ne paie pour ses voisines.

## Boîtes, colle et pénalités

L’algorithme voit un paragraphe comme une suite de trois primitives, dessinées sur toute la largeur dans :ref{id="knuth-plass-model"} :

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

La césure utilise les mêmes **motifs de Liang** que TeX depuis 1983, fournis par la bibliothèque _Hypher_, dans huit langues : anglais, espagnol, français, allemand, italien, portugais, catalan et néerlandais. La langue du document se règle une seule fois, en tête de la configuration, et sert aussi à étiqueter le PDF pour les lecteurs d’écran. Les motifs laissent au moins deux lettres avant le trait d’union et trois après, si bien que les mots de moins de cinq lettres ne sont jamais coupés, et chaque césure est une pénalité marquée de 50 que l’optimiseur peut accepter ou refuser.

La césure ne s’applique qu’au texte justifié, là où elle est utile. Deux possibilités de coupure restent toujours disponibles, quel que soit le réglage : un trait d’union réel entre deux lettres est une coupure légitime, et un mot plus large que toute la justification est coupé à la dernière syllabe qui tient, ou au dernier caractère s’il le faut.

Les traits d’union conditionnels saisis dans le texte sont respectés comme points de coupure, au même prix que ceux des motifs. Le catalan suit les règles de l’Institut d’Estudis Catalans : un mot avec un _l·l_ géminé, comme _col·lecció_, se coupe entre les deux _l_, et le trait d’union prend la place du point médian, _col-_ en fin de ligne et _lecció_ au début de la suivante. La langue peut aussi changer au sein d’un livre : tous les chapitres partagent la langue de la configuration, si bien qu’une édition en plusieurs langues, comme celle-ci, se configure une fois par langue, et chaque version du guide se coupe selon ses propres règles.

## Espacement des mots et lignes en drapeau

Deux réglages bornent l’étirement et la contraction d’une espace : \`maxWordSpacing\`, par défaut deux fois l’espace naturelle, et \`minWordSpacing\`, 0,6 fois celle-ci. Un étirement au-delà du maximum est plus cher que tout autre défaut : l’algorithme préfère couper un mot, en déplacer un ou accepter une ligne creuse plutôt que d’ouvrir une lézarde. Certaines lignes ne peuvent pas du tout se remplir (une longue URL, la fin insécable d’un élément de liste) et, plutôt que de les ouvrir en trous trois fois plus larges que l’espace naturelle, le moteur les compose en drapeau, avec l’espacement naturel. La dernière ligne d’un paragraphe est toujours en drapeau, sauf quand elle déborde : ses espaces se contractent alors pour qu’elle tienne, exactement comme TeX compose la colle.

## Le chinois et les écritures d’Asie orientale

Le chinois s’écrit sans espaces entre les mots et n’est jamais coupé par une césure : une ligne peut finir entre presque n’importe quels caractères. Un paragraphe qui contient plus de caractères chinois, japonais ou coréens que d’espaces entre mots ne passe pas par Knuth-Plass ; le **compositeur CJK** le compose ligne après ligne. Ce qu’il doit respecter, ce sont les règles des fins de ligne : une virgule, un point ou une parenthèse fermante n’ouvrent jamais une ligne, et une parenthèse ouvrante n’en termine jamais une. Leur rigueur dépend de la région, que donne la langue du document (\`zh-Hans\` suit la norme de Chine continentale, GB/T 15834, et \`zh-Hant\` l’usage de Taïwan et de Hong Kong), et \`cjk.lineBreak\` règle ce niveau à la main. Certaines suites ne sont jamais séparées : un tiret ou des points de suspension sur deux cadratins, un nombre avec son unité. Un mot latin ou une adresse web placés parmi les caractères passent entiers à la ligne suivante, sauf s’ils sont plus larges que la ligne ; le mot est alors coupé, et l’adresse est coupée après une barre oblique ou avant un point.

Chaque signe de ponctuation chinois occupe un carré à lui, à moitié encré et à moitié blanc, et la part de blanc qu’un livre conserve relève du style maison, comme le montre :ref{id="cjk-composition"}. Taïwan garde chaque signe sur un carré entier. Hong Kong compose aussi ses signes sur un carré entier, mais resserre la plupart des paires de signes qui se rencontrent, et une parenthèse qui ouvre ou ferme une ligne perd sa moitié extérieure. Le style Kaiming de Chine continentale, celui par défaut pour \`zh-Hans\`, compose les virgules, les parenthèses et les guillemets sur un demi-carré et garde le point entier, sauf en fin de ligne ; là où deux signes se rencontrent, le blanc qui les sépare disparaît aussi. Le style se règle avec \`cjk.punctuationWidth\`, et les deux ajustements s’activent avec \`cjk.compressAdjacent\` et \`cjk.trimLineStart\` ; \`cjk.hangingPunctuation\` laisse une virgule ou un point déborder au-delà de la fin de la ligne. Les réglages \`cjk\`, avec la langue du document et le mode d’écriture, se trouvent dans le groupe **Système d’écriture** du panneau **Maquette**.

Une ligne chinoise justifiée se remplit dans un ordre fixe : d’abord les espaces entre les mots occidentaux, puis le quart de cadratin que le moteur place entre le texte chinois et le texte latin (\`cjk.latinSpacing\` ; on ne le saisit jamais), et enfin chaque intervalle entre deux caractères, jamais à l’intérieur d’un mot latin ou d’un nombre. Quand un caractère ne peut pas ouvrir la ligne suivante, le compositeur tente d’abord de le faire entrer dans la ligne en reprenant du blanc aux signes qui s’y trouvent déjà, et ce n’est qu’en cas d’échec qu’il fait descendre le caractère précédent à la ligne suivante. Une ligne qui demanderait plus d’un demi-cadratin entre ses caractères reste courte, et le panneau **Vérifications** la signale comme une ligne CJK composée courte.

Le reste d’un livre chinois suit les mêmes réglages. Les modèles de chapitre, les numéros de page, les listes et les compteurs acceptent les styles de numération chinois, parmi lesquels \`simp-chinese-informal\`, \`trad-chinese-informal\` et \`cjk-decimal\`, si bien que les chapitres peuvent porter leurs ordinaux chinois ; les figures et les tableaux prennent leurs noms chinois et sont numérotés par chapitre avec un trait d’union. \`cjk.grid\` définit le bloc de texte en nombre de caractères par ligne et de lignes par page, la grille sur laquelle se conçoivent les livres chinois. L’édition chinoise de ce guide est composée verticalement et reliée à droite, comme on a imprimé les livres chinois pendant des siècles : elle désigne ses chapitres par leurs ordinaux chinois, imprime ses folios en chiffres chinois et numérote ses figures et ses tableaux par chapitre ; sa ligne dans le panneau **Livres** a son propre bouton de langue. Parmi les livres d’exemple, _Le Rêve dans le pavillon rouge_ est un roman entier composé en chinois, et son édition en caractères traditionnels est composée verticalement sur une grille de 38 caractères sur 15 lignes.

\`layout.writingMode: 'vertical-rl'\` compose un livre verticalement. Les lignes vont de haut en bas et se suivent de droite à gauche, deux colonnes deviennent deux étages superposés sur la page, les figures et les tableaux restent droits, les mots latins et les nombres longs se couchent sur le côté, et chaque signe prend la place ou la forme qu’il a dans le texte vertical : les parenthèses et les guillemets prennent leur forme verticale, et le point se place en haut à droite de sa case en Chine continentale et reste centré à Taïwan et à Hong Kong. Un tel livre se relie à droite (\`page.binding\`) : sa première page est seule à gauche du dos, et le Sandbox montre ses doubles pages de droite à gauche. Le canvas et le PDF composent les mêmes lignes verticales ; la vue HTML coupe ses propres lignes à la hauteur de sa page, et redresse ou couche chaque caractère comme eux. Par défaut, \`cjk.uprightDigits\` redresse dans une seule case les nombres d’au plus deux chiffres, et la limite peut passer à trois ou quatre ; \`:tcy[…]\` fait de même pour n’importe quelle suite courte.

Les livres chinois marquent aussi le texte de façons dont la typographie latine n’a pas l’usage. L’emphase s’indique par un point à côté de chaque caractère, et non par l’italique : dans un document chinois, \`*…*\` place donc des points d’emphase sur les caractères chinois qu’il contient, comme le fait \`:dots[…]\` ; \`cjk.emphasis: 'italic'\` conserve l’italique. \`:name[…]\` trace le trait droit des noms propres, \`:book[…]\` marque le titre d’un livre, et \`cjk.bookTitleMark\` choisit comment : les doubles chevrons de Chine continentale ou la ligne ondulée de Taïwan et de Hong Kong. \`:ruby[…]{rt="…"}\` compose une lecture, en pinyin au-dessus des caractères ou en zhuyin à droite de chacun, et \`:warichu[…]\` compose une note sur deux rangs de demi-taille à l’intérieur de la ligne, reportée à la ligne ou à la page suivante quand elle ne tient pas. Aucun d’eux ne modifie l’interlignage : le panneau **Vérifications** signale quand les points, les traits ou les lectures demandent plus d’espace entre les lignes que le paragraphe n’en laisse. Dans le texte vertical, les points passent à droite de la colonne, les traits à sa gauche, et le rang droit d’une note se lit en premier.

## L’arabe et les écritures de droite à gauche

L’arabe, le persan, l’ourdou et l’hébreu s’écrivent de droite à gauche, et Postext les compose à partir du même Markdown et de la même configuration que n’importe quelle autre langue. C’est la langue du document qui en décide : avec \`locale: 'ar'\`, les lignes commencent à droite, la première colonne est celle de droite, le livre est relié sur son bord droit et ses doubles pages se lisent de droite à gauche. Le moteur met une telle page en page comme une page de gauche à droite, puis la retourne en miroir tout entière, en peignant chaque mot, chaque image et chaque formule dans le bon sens : une maquette conçue pour un livre anglais fonctionne sans modification. Un réglage qui nomme un côté désigne un côté du texte, et \`start\` et \`end\` sont acceptés comme noms simples pour ce côté. Les titres courants et les folios restent sur la feuille, là où un designer les attend.

À l’intérieur d’une ligne, les nombres, les mots latins et les citations se lisent toujours de gauche à droite. L’ordre de ces segments est fixé par l’algorithme bidirectionnel d’Unicode, mis en œuvre en entier ; le texte est stocké, recherché et copié dans l’ordre où il a été saisi, et seul l’affichage est réordonné. Les parenthèses et les guillemets sont inversés en miroir dans les segments de droite à gauche. Un bloc composé à contresens du livre prend \`{dir=ltr}\` ou \`{dir=rtl}\`, et un segment de texte \`:ltr[…]\` ou \`:rtl[…]\`, un isolat dont le point final ne s’égare plus au mauvais bout de la ligne.

Les lettres arabes se lient, et chacune prend la forme que demandent ses voisines : un mot est donc mesuré et peint comme une seule chaîne mise en forme, jamais lettre par lettre ; le PDF la met en forme avec HarfBuzz et rattache chaque glyphe à ses caractères, de sorte que le texte copié et les lecteurs d’écran reçoivent les mots tels qu’ils ont été saisis. Trois règles en découlent : pas de césure, pas d’interlettrage, et pas de coupure à l’intérieur d’un mot, qui déborde alors de la ligne et est signalé plutôt que coupé. Les lignes justifiées s’étirent d’abord à leurs espaces, puis par **kashida**, ces liaisons allongées qu’un calligraphe trace entre deux lettres liées, placées seulement là où les règles du naskh en admettent une et exclues du texte copié. L’algorithme de coupure compte cet allongement comme de l’étirement : il choisit ses coupures en sachant où une ligne peut s’élargir. L’emphase est composée en gras, puisque les caractères arabes n’ont pas d’italique, et le moteur n’incline jamais une lettre arabe.

Les signes vocaliques s’empilent au-dessus et au-dessous des lettres, dans l’interlignage, qui ne grandit jamais de lui-même : le panneau **Vérifications** signale un paragraphe dont les signes toucheraient la ligne du dessus, avec l’interlignage qu’il lui faudrait. Les nombres générés (folios, numéros de chapitre, de figure et de note) prennent les chiffres de la région, indo-arabes dans l’est du monde arabe et européens au Maghreb, tandis que les nombres saisis par l’auteur ne sont jamais réécrits ; un titre peut écrire son numéro en toutes lettres comme un ordinal, et les pages liminaires peuvent compter dans l’ordre abjad des manuscrits. Les poèmes classiques s’écrivent dans \`:::verse\`, un vers par ligne avec ses deux hémistiches séparés par \`||\` : chaque hémistiche est porté à une même largeur, d’abord par des kashidas, pour que les rimes s’alignent tout au long du poème. L’édition arabe de ce guide est composée ainsi, reliée à droite, et parmi les livres d’exemple, _Les Mille et Une Nuits_ composent l’œuvre entière en arabe, à la manière de l’imprimerie de Boulaq.

## Emphase et segments

Un paragraphe est rarement un seul segment de texte. Le gras, l’italique et le gras italique sont composés dans les vrais styles de la famille (une véritable italique, et non un romain penché), chacun mesuré avec ses propres métriques : un mot en gras prend exactement la place dont il a besoin. La couleur du texte en gras, du texte en italique et des renvois peut se régler séparément ; dans ce livre, les renvois aux figures et aux tableaux sont en gras dans la couleur de la partie, pour qu’on les repère facilement sur la page et dans le PDF, où ce sont aussi des liens.

Les exposants et les indices sont composés plus petits et décalés par rapport à la ligne de base sans perturber l’interlignage, et les pastilles de couleur dans le texte reposent sur la ligne de base comme une lettre. Tous ces éléments sont atomiques : l’algorithme de coupure peut couper avant ou après eux, jamais à l’intérieur, si bien qu’une formule ou une pastille ne se retrouve jamais à cheval sur deux lignes.

Deux autres segments distinguent des mots sans recourir à un style de caractère à eux. \`:smallcaps[…]\` compose des petites capitales tirées des capitales du caractère, de la même façon dans toutes les sorties, pour les sigles et les noms des personnages d’une pièce de théâtre. \`:chip[…]\` compose un mot dans une petite boîte arrondie qui suit la ligne (touches de clavier, étiquettes, banque de mots d’un exercice), mise en forme par un style nommé, jamais coupée à l’intérieur, et dont les mots restent du vrai texte dans le HTML et le PDF.

## Orphelines, veuves et lignes creuses

Une **orpheline** est la première ligne d’un paragraphe laissée seule au pied d’une colonne ; une **veuve** est sa dernière ligne reportée seule en tête de la suivante. L’une et l’autre cassent le rythme de lecture, et :ref{id="orphan-widow"} les montre toutes deux de part et d’autre d’un saut de colonne. Un troisième défaut, la **ligne creuse**, est une dernière ligne qui ne contient qu’un mot court, abandonné sous un paragraphe plein.

Postext chiffre les trois. Quand un paragraphe passe d’une colonne à l’autre, le moteur compare toutes les coupures possibles et impute à chacune l’espace qu’elle laisse inutilisé, une orpheline et une veuve : 1 000 par défaut chacune, avec au moins deux lignes de chaque côté. Les lignes creuses sont chiffrées dans l’algorithme de coupure lui-même, comme une laideur, chaque fois que la dernière ligne occupe moins que l’espace de vingt caractères. Quand une ligne creuse ne peut pas être évitée par une autre coupure, le moteur peut composer le paragraphe une ligne plus court, en resserrant les espaces entre les mots dans la limite de leur minimum et, si nécessaire, l’interlettrage d’au plus dix millièmes de cadratin. Les éléments de liste suivent les mêmes règles, avec leurs propres options.

## Listes

Les listes suivent la même discipline que les paragraphes, avec une typographie qui leur est propre. Les listes à puces choisissent leur caractère de puce, sa taille, sa graisse et sa couleur, ainsi que l’écart et le retrait suspendu qui gardent alignés les textes de tous les éléments ; les listes numérotées choisissent entre chiffres arabes, lettres minuscules ou majuscules et chiffres romains minuscules ou majuscules, avec un séparateur stylable séparément et des numéros alignés à droite, pour que les éléments 9 et 10 s’alignent. L’imbrication va jusqu’à cinq niveaux, chacun avec son retrait et ses marqueurs, et les listes de tâches dessinent une case à cocher pour chaque élément, cochée ou non. Les éléments peuvent être serrés ou espacés, et le moteur compte la fin d’une liste parmi ses leviers quand il équilibre les colonnes. Une liste qui s’arrête en bas d’une colonne peut ainsi gagner une ligne d’air avant le texte qui la suit, et rattraper la hauteur de la colonne voisine.

:::callout{type="try"}
Dans le panneau **Maquette**, cherchez _lâches_ et activez **Surligner les lignes lâches**, dans le groupe **Avancé**. Réduisez ensuite la largeur des colonnes ou augmentez \`maxWordSpacing\`, et observez quelles lignes le moteur doit ouvrir, et comment l’optimiseur les redistribue.
:::

## Mathématiques

Les formules sont des citoyennes à part entière. Les expressions dans le texte comme $e^{i\\pi}+1=0$ suivent la ligne, composées par MathJax sous forme de tracés vectoriels qui restent nets à tous les agrandissements. Quand une formule est plus haute que ne le permet la ligne, elle est réduite uniformément pour préserver la grille de ligne de base, et le lecteur garde le rythme du texte, si dense que soit la notation. Les formules centrées occupent leurs propres lignes, centrées sur la colonne, avec leurs propres marges, et le texte qui suit revient sur la grille :

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

# La page et ses colonnes {lead="Les pages sont fixes, les colonnes sont finies, et chaque ligne devrait reposer sur un rythme partagé par toute la double page. Ce chapitre parle du cadre : la géométrie de la page, les structures de colonnes, la grille de ligne de base et la manière de terminer les colonnes à niveau." summary="Géométrie de la page, colonnes, grille de ligne de base et équilibrage"}

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

Les livres professionnels alignent la première ligne de base de chaque colonne sur un rythme vertical commun, et chaque ligne suivante tombe sur la même grille : les lignes se font face de part et d’autre de la gouttière. Postext cale le texte sur une grille de ligne de base dérivée de l’interlignage du texte courant, comme l’illustre :ref{id="baseline-grid"}. Les éléments qui rompent la grille (un titre plus grand que le texte courant, une figure, une formule centrée) sont suivis de l’espace nécessaire pour y ramener la ligne suivante. La grille peut s’afficher en surimpression pendant que vous travaillez, partout où il y a du texte.

## Terminer les colonnes à niveau

Quand une page se termine au milieu du texte, ses colonnes devraient finir à la même hauteur. C’est l’**équilibrage des colonnes**, et c’est plus difficile qu’il n’y paraît : les lignes avancent par pas entiers de la grille, les figures ne se coupent pas, les titres doivent rester avec leur texte et les paragraphes ne doivent pas laisser d’orphelines derrière eux. Postext met une colonne courte à niveau avec trois leviers, utilisés par ordre de préférence et dessinés dans :ref{id="column-balancing"} :

1. **L’espace au-dessus des titres**, une ligne de grille entière à la fois, réparti selon l’importance et jamais en tête de colonne
2. **Une ligne après la fin d’une liste**
3. **Des paragraphes plus lâches** : un paragraphe composé une ligne plus long, la _looseness_ de TeX, accepté seulement si aucune de ses lignes ne s’étire au-delà de la limite d’espacement des mots ; si cela aide, une touche d’interlettrage, au plus dix millièmes de cadratin

Chaque correction est vérifiée en remettant la page en page, jusqu’à huit fois, et le meilleur résultat l’emporte. Certaines colonnes sont laissées telles quelles à dessein : la dernière colonne avant un saut de page forcé ou une ouverture de chapitre, la dernière page du document, une colonne qui n’a rien à étirer. Deux règles voisines mettent à niveau les colonnes de fin d’un chapitre, ainsi que les colonnes placées au-dessus d’un bloc sur toute la largeur de la page qui se déplace ou se scinde.

## Bandes et blocs sur toute la largeur

Une page n’est pas toujours un seul jeu de colonnes de haut en bas. Une figure, un tableau ou un encadré sur toute la largeur de la page la découpe en **bandes** : le texte placé au-dessus du bloc remplit ses colonnes comme une bande à part, le bloc traverse la page, et les colonnes reprennent en dessous. Chaque bande est équilibrée séparément : le lecteur descend la première colonne puis remonte en tête de la seconde avant de franchir le bloc, comme dans un journal. Quand une bande finirait de façon inégale, un **plafond de bande** ramène ses colonnes au même nombre de lignes, et le texte qui ne tient plus continue en dessous.

Les colonnes de fin d’un chapitre reçoivent le même traitement. Plutôt que de laisser la dernière page avec une colonne pleine et une autre presque vide, un plafond de fin répartit les lignes restantes entre elles, et les leviers d’équilibrage font le reste. Les sauts de colonne explicites sont respectés : \`:::columnbreak\` termine une colonne là où l’auteur le veut, et l’équilibrage ne touche pas au pied de cette colonne.

:::callout{type="try"}
Dans le panneau **Maquette**, ouvrez **Titres et table des matières** et désactivez **Équilibrer les colonnes**. Regardez le pied des colonnes de ce chapitre, puis réactivez l’option et voyez quel levier le moteur a utilisé sur chaque page.
:::

# Figures, tableaux et flottants {lead="Un renvoi est une promesse, pas une position. Citez une figure et Postext lui trouve une place : le premier emplacement libre après la mention, numérotée dans l’ordre de lecture, légendée, jamais avant les mots qui l’appellent." summary="Où vont les ressources, comment elles sont numérotées, les tableaux qui se scindent"}

Tout ce qui n’est pas du texte courant (images, schémas SVG, tableaux) est une **ressource**. Les ressources sont déclarées hors du texte, chacune avec un identifiant, un type, une légende et ses préférences de placement, et le Markdown se contente de les citer. Dans le Sandbox, elles se trouvent dans le panneau **Ressources**.

## Une seule mention suffit

Écrire \`:ref{id="…"}\` dans une phrase fait deux choses : cela imprime l’étiquette de la ressource et, la première fois, cela _incorpore_ la ressource, qui flotte alors vers le premier emplacement libre après le renvoi. Les emplacements sont essayés dans l’ordre, comme le montre :ref{id="float-slots"} : le pied de la colonne qui contient le renvoi, puis la tête et le pied de la colonne libre suivante, puis une bande sur la page suivante. Le texte n’est jamais interrompu.

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

La numérotation reste juste sur tout un livre parce qu’elle fait partie de ce que chaque chapitre hérite des chapitres précédents. Le sixième chapitre de ce guide commence ses figures à 6.1 parce que le compteur de chapitres le dit, et non parce que quelqu’un a saisi le numéro, et déplacer un chapitre renumérote tout ce qui le suit à la prochaine mise en page du livre.

## Des types à vous

Les figures et les tableaux ne sont que les deux types dont tout livre a besoin. Une configuration peut déclarer autant de types de ressource qu’une publication en utilise (cartes, planches, encadrés, graphiques, documents), chacun avec un nom au singulier et au pluriel, une étiquette courte pour les renvois, un préfixe pour ses légendes et une séquence de numérotation à lui. Un catalogue peut numéroter ses planches 1, 2, 3 sur tout le livre tandis que ses figures repartent à chaque chapitre ; un manuel peut numéroter ses encadrés 1-1, 1-2 dans le premier chapitre et 2-1 dans le deuxième. Chaque type peut aussi porter son placement par défaut et ajuster le style de légende : les planches peuvent occuper une page entière avec leur légende au-dessus, tandis que les figures flottent à la largeur de la colonne.

Un type sans préfixe ni légende est utile lui aussi : il transforme une image en ornement, en vignette ou en logo qui peut être intégré exactement là où il est cité, sans numéro et sans jamais entrer dans la liste des figures.

## Tableaux

Les tableaux portent leur modèle en ligne : des rangées de cellules avec fusions de colonnes et de rangées, rangées d’en-tête, alignement et largeurs de colonne relatives. Les cellules acceptent le Markdown en ligne, des paragraphes et des listes simples, un fond à elles (les trois couleurs de partie de ce livre sont le :swatch{color="#2b4acb"} bleu, le :swatch{color="#b7820f"} doré et le :swatch{color="#c0452f"} vermillon) et même une image. Les tableaux se mettent en forme une fois pour tout le document : typographie du corps et de l’en-tête, fond de l’en-tête, filets en grille, horizontaux seulement, extérieurs seulement ou aucun.

Les tableaux se modifient dans le panneau **Ressources**, avec un éditeur qui fonctionne comme un petit tableur : ajouter ou supprimer des rangées et des colonnes, fusionner et scinder des cellules, marquer les rangées et les colonnes d’en-tête, aligner les cellules, régler les fonds et les largeurs de colonne, déposer une image dans une cellule et coller un bloc de cellules copié depuis un tableur. Chaque modification peut être annulée, et le tableau sur la page suit au fil de la saisie.

Un tableau plus haut que la page se scinde sur plusieurs pages. Ses rangées d’en-tête se répètent sur chaque tronçon, la légende de chaque suite reçoit le suffixe _(suite)_, une mention _Suite page suivante_ ferme chaque tronçon sauf le dernier, et aucune coupure ne traverse jamais une fusion de rangées. Un tableau pivoté se scinde de la même façon, page après page.

## Des figures à côté du texte

Dans une mise en page à une colonne et demie dont la colonne latérale ne porte que des flottants, les ressources peuvent vivre à côté du texte plutôt qu’à l’intérieur. Une figure avec l’étendue _side_ s’empile dans la colonne latérale, à côté du paragraphe qui la cite ; un encadré peut faire de même, et les manuels peuvent ainsi garder les définitions, les notions clés et les figures marginales à côté des lignes qu’elles expliquent. Une figure large peut aussi garder sa légende à côté d’elle, dans la colonne latérale : c’est la disposition classique des manuels illustrés et des catalogues d’exposition. Les préréglages de démonstration comprennent un manuel de biochimie et une édition littéraire composés exactement de cette façon.

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

Une vidéo est une ressource de plus. Elle est citée, numérotée dans sa propre séquence (Vidéo 1.1 à côté de Figure 1.1) et flotte vers le premier emplacement libre comme une figure. Elle peut venir de YouTube ou de Vimeo, d’un fichier conservé dans le livre ou d’une adresse web : un fichier MP4 ou WebM, ou un flux HLS.

L’imprimé porte son affiche, une image choisie, avec un symbole de lecture et un code QR qui ouvre la vidéo ; dans le PDF, l’affiche est aussi un lien. La vue HTML et l’EPUB la lisent, sauf les vidéos YouTube, Vimeo et HLS, vers lesquelles un livre numérique ne peut que pointer par un lien. Dans la vue Folio, un clic sur l’affiche la lit sur la page, et elle continue pendant que le feuillet tourne. Les vidéos de ce livre, comme :ref{id="postext-showreel"}, sont des flux HLS.

# Livres, parties et titres courants {lead="Un livre est plus que ses chapitres : une couverture, une table des matières qui se tient à jour, des pages de partie, des ouvertures qui annoncent chaque chapitre et des titres courants qui savent où se trouve le lecteur. Tout cela relève de la configuration." summary="Chapitres, styles de titre, emplacements de design, parties, table des matières et numéros de page"}

Ce guide est un livre de treize chapitres, et chaque chapitre est un document Markdown à part entière. Un projet du Sandbox est toujours un livre : la configuration, les ressources et les polices sont partagées, et les chapitres se suivent, comme le montre :ref{id="book-anatomy"}.

## Des chapitres au livre

Chaque chapitre est mis en page séparément, _dans la continuité_ des chapitres précédents : il hérite de leur nombre de pages et de leur parité, de leurs compteurs de chapitres et de figures, de la partie ouverte et des titres courants. C’est pourquoi les figures de ce chapitre sont numérotées à partir de 6.1, et pourquoi modifier un chapitre n’oblige jamais le moteur à recomposer tout le livre. Les aperçus peuvent montrer le chapitre en cours ou le livre entier ; le PDF peut se construire pour l’un ou pour l’autre. Les chapitres peuvent être ajoutés, renommés, réordonnés, scindés à leurs titres de niveau 1 ou fusionnés avec le précédent.

## Ce qu’hérite un chapitre

La continuité que reçoit un chapitre est réduite et précise. Elle porte le nombre de pages et la parité de la page suivante, pour qu’une ouverture qui doit tomber sur un verso sache s’il lui faut une page blanche devant elle. Elle porte les compteurs : le numéro de chapitre, les numéros de chaque séquence de ressources, la séquence de numérotation des étiquettes de page. Elle porte la partie ouverte, avec son titre, son numéro et sa palette, pour qu’un chapitre placé au milieu d’une partie garde ses couleurs. Et elle porte le plan du livre, pour qu’une table des matières placée dans le deuxième chapitre puisse imprimer la page où commence le dixième.

Comme cette continuité est tout ce dont un chapitre a besoin du reste du livre, les chapitres peuvent être mis en page indépendamment, en arrière-plan, puis assemblés pour la vue du livre entier et pour le PDF. Le résultat est le même que si l’on mettait en page tout le livre d’un coup, page pour page : c’est une propriété que le moteur est construit pour garantir.

## Styles de titre

Un titre peut porter des attributs, écrits entre accolades à la fin de sa ligne. Le plus puissant est le **style** : \`{style="cover"}\` applique un style de titre nommé, qui change la typographie et le design du titre et peut changer, pour la section que le titre ouvre, les titres courants, les marges de la page, la disposition des colonnes, la typographie du texte courant et la palette. La couverture de ce livre est un style de titre avec ses propres marges, sans titres courants et avec un design pleine page ; la table des matières en est un autre. Un style peut aussi laisser ses titres sans numéro, pour qu’une préface ne décale pas les numéros des chapitres, et les tenir hors de la table des matières.

## Un regard sur la configuration de ce livre

Il vaut la peine de voir comment sont construites les pages que vous lisez. La couverture est le titre de niveau 1 du premier chapitre, avec le style _cover_. Ce style donne à la section des marges qui repoussent tout texte au pied de la page, supprime les titres courants et dessine un design pleine page : une boîte qui remplit le fond perdu de la couleur nuit, l’illustration de couverture comme élément image ancré en haut du fond perdu, un surtitre en capitales dorées largement interlettrées, le titre tiré de l’en-tête du document en Fraunces à 88 points, un court filet doré, le sous-titre en Lora italique et une ligne de crédits au pied. Le surtitre et les crédits viennent d’attributs du titre, écrits sur sa ligne dans le Markdown.

Les ouvertures de chapitre sont un design du premier niveau de titre. Une boîte remplit le haut du fond perdu de la couleur de la partie ; le numéro du chapitre est imprimé en grand au bord extérieur, le surtitre associe le mot _Chapitre_, le numéro et le titre de la partie, et sous un court filet blanc viennent le titre et l’introduction du chapitre, tirée de l’attribut \`lead\` du titre. L’attribut \`summary\` du même titre est ce que la table des matières imprime sous chaque entrée. Rien dans ces designs n’est propre à ce livre : n’importe quelle configuration peut composer les siens.

## Emplacements de design

Les titres courants, les pieds de page, les ouvertures de chapitre et les pages de partie sont dessinés par des **emplacements de design** : de petites compositions libres de texte, de filets, de boîtes et d’images. Chaque élément est ancré à la page, au fond perdu, à la zone de texte ou à un autre élément, avec des décalages et des tailles en unités réelles, et son texte peut contenir des **champs** comme \`{pageNumber}\`, \`{chapterTitle}\`, \`{partTitle}\` ou n’importe quel attribut du titre, comme le \`{attr.lead}\` qui compose l’introduction dans le bandeau de ce chapitre. Les éléments peuvent être limités aux pages impaires ou paires, et aux pages d’un rôle donné (courante, ouverture, partie ou blanche) : c’est ainsi que les titres courants de ce livre disparaissent sur les ouvertures de chapitre tandis qu’un folio apparaît à leur pied. Les éléments de texte peuvent passer à la ligne, se couper, se tronquer avec des points de suspension, dessiner une boîte derrière eux et s’ouvrir sur une lettrine.

Les titres courants sont un emplacement de design ordinaire, dont les éléments sont filtrés par parité et par rôle. Sur les versos de ce livre, le folio dans la couleur de la partie et le titre du livre se placent au bord extérieur ; sur les rectos, le titre du chapitre et le folio. Ils n’apparaissent que sur les pages courantes ; les ouvertures portent à la place un folio en pied, et les pages de partie ne portent rien. La page noire qui fait face à chaque page de partie est elle aussi un élément de design : une boîte qui remplit le fond perdu, affichée seulement sur les versos blancs, qui, dans un livre dont les chapitres s’ouvrent sur un verso et les parties sur un recto, sont exactement les pages qui font face à une partie.

## Parties et palettes

\`:::part\` ouvre une page de partie : une page à part, placée à la parité que demande la configuration, dessinée par le design de partie et suivie d’un corps, en général la liste de ses chapitres. Les parties se transmettent d’un chapitre à l’autre : les titres courants et les ouvertures des chapitres suivants peuvent nommer la partie à laquelle ils appartiennent, et elles figurent à la fois dans la table des matières et dans les signets du PDF.

Dans ce livre, chaque partie s’ouvre sur une double page : un verso noir à gauche, la page de partie à droite. Les parties commencent avec la parité _toujours impaire_, qui pose un feuillet blanc avant chaque page de partie et en ajoute un second quand le chapitre précédent se termine sur un verso : la page de partie tombe toujours sur un recto, précédée d’un verso blanc. Le premier chapitre de la partie s’ouvre alors au dos de la page de partie, sur un verso, comme tous les chapitres.

Une partie peut aussi changer les couleurs du livre. Les couleurs de la configuration peuvent être liées à des entrées nommées de la **palette**, et l’attribut \`palette\` d’une partie remplace ces entrées jusqu’à la partie suivante. Ce livre définit une entrée, la _couleur de partie_, et chaque partie la fixe : bleu pour les fondements, doré pour le métier, vermillon pour la pratique. Les bandeaux de chapitre, les numéros des titres, les folios courants et les légendes suivent tous.

## Une table des matières à jour

\`:::toc\` imprime la table des matières : une entrée pour chaque titre des niveaux retenus et une ligne pour chaque partie, avec numéros, titres, points de conduite, numéros de page et, en option, une ligne tirée d’un attribut du titre (dans ce livre, le résumé de chaque chapitre). Les numéros de page sont réels : le moteur met le livre en page, lit où chaque titre est tombé et recompose la table des matières jusqu’à ce que les numéros se stabilisent, ce qui demande au plus trois passes supplémentaires. Les entrées sont des liens dans le PDF.

## Sauts de page et numérotation

\`:::pagebreak\` commence une nouvelle page, et peut en demander une impaire ou paire, en ajoutant une page blanche si nécessaire. \`:::numbering\` change la séquence des numéros de page à partir de la page suivante : c’est ainsi que des pages liminaires numérotées en chiffres romains passent le relais à des numéros arabes au premier chapitre. Les ouvertures de chapitre peuvent demander leur propre parité, et les pages blanches sont reconnues comme telles : les titres courants les laissent vides. Enfin, quand un passage veut un peu plus d’air au-dessus de lui, \`:::space\` laisse une ligne blanche, ou \`:::space{lines=2}\` deux ; les lignes vides supplémentaires dans le Markdown n’ajoutent rien, comme dans tout Markdown.

:::part{number="III" title="En pratique" palette="band=#c0452f"}
7. Écrire pour Postext
8. Le Sandbox
9. Sortie : canvas, HTML, PDF et EPUB
10. Le livre en 3D
11. Feuille de route et communauté
:::

# Écrire pour Postext {lead="Tout ce livre a été écrit en Markdown ordinaire, avec une poignée d’extensions. Elles restent lisibles dans n’importe quel éditeur de texte et disent ce qu’est le texte, jamais où il va." summary="Markdown, directives, encadrés et styles de paragraphe"}

Les documents Postext sont d’abord du Markdown. Quiconque connaît Markdown peut écrire pour Postext dès le premier jour ; les extensions n’apparaissent que là où un livre a besoin de quelque chose que Markdown n’a jamais su nommer.

## Le Markdown ordinaire

Des titres d’un à six croisillons, des paragraphes, des citations en bloc, des listes à puces, numérotées et de tâches (imbriquées de deux espaces par niveau, jusqu’à cinq niveaux) et des formules hors texte entre doubles signes dollar. Dans la ligne, le gras et l’italique habituels, plus l’exposant entre accents circonflexes, comme dans 10^-8^, l’indice entre tildes, comme dans H~2~O, les mathématiques en ligne entre signes dollar et l’échappement par barre oblique inverse pour les caractères littéraux.

Quelques détails méritent d’être connus. Les lignes consécutives d’un paragraphe sont réunies, si bien que les retours à la ligne de la source n’arrivent jamais sur la page ; un nouveau paragraphe demande une ligne vide. Les listes tolèrent une ligne vide entre deux éléments, mais deux lignes vides les terminent. Les listes ordonnées gardent le numéro par lequel elles commencent : une liste peut donc partir de 0 ou de 5. Enfin, un titre peut forcer un saut de ligne dans son texte avec deux barres obliques inverses, ce qui ne concerne que les maquettes qui impriment le titre en grand (ouvertures et pages de partie), tandis que les titres courants, la table des matières et les signets du PDF le gardent sur une seule ligne.

Une partie de Markdown est volontairement laissée de côté, parce qu’un livre a d’autres façons de le dire : les images sont des ressources plutôt que des illustrations dans la ligne, les tableaux sont des ressources dotées d’un modèle plutôt que des tableaux à barres verticales, et le HTML brut n’a aucun sens sur une page imprimée. Les liens sont actifs dans la vue HTML et dans le PDF ; donner au code en ligne un style propre figure dans la feuille de route.

## Directives et conteneurs

Tout le reste s’exprime avec un petit vocabulaire de directives, recensées dans le :ref{id="document-format"}. Les directives d’une ligne commencent par trois deux-points et agissent à l’endroit où elles apparaissent. Les conteneurs enveloppent des blocs entre une ligne d’ouverture munie d’attributs et une ligne de fermeture de trois deux-points ; ils s’imbriquent, et un conteneur resté ouvert est fermé à la fin du chapitre, avec un avertissement.

Les valeurs d’attribut peuvent se mettre entre guillemets doubles ou simples, ou rester nues quand elles tiennent en un seul mot, et une clé seule vaut drapeau. Une directive que le moteur ne connaît pas n’est pas écartée en silence : elle est imprimée comme un paragraphe, si bien que rien ne disparaît, et le panneau Vérifications la signale avec son chapitre et sa ligne. Il en va de même d’un style d’encadré ou d’un style de paragraphe que la configuration ne définit pas.

## Mentionner les ressources

Les renvois méritent qu’on s’y arrête, car c’est avec eux que s’écrit l’essentiel de l’appareil d’un livre. \`:ref{id="…"}\` imprime par défaut le libellé abrégé et le numéro (_Fig. 5.1_ dans l’édition française de ce livre) et incorpore la ressource la première fois qu’elle apparaît. Un attribut \`style\` imprime le numéro seul ou le libellé complet, _Figure 5.1_ ; \`case\` met le libellé en minuscules, en majuscules ou avec une capitale initiale, pour qu’un renvoi placé en début de phrase se lise correctement ; et \`text\` imprime n’importe quelle formulation tout en incorporant la ressource et en y menant par un lien. Un renvoi vers un identifiant qui n’existe pas imprime un point d’interrogation et un avertissement : les renvois cassés sont ainsi repérés avant que le livre parte chez l’imprimeur.

\`::resource{id="…"}\`, seul sur sa ligne, insère une ressource à cet endroit précis quand son placement dit _ici_ ; sinon, il compte simplement comme une mention. Ce livre ne l’emploie nulle part et laisse flotter toutes ses figures, ce qui est en général le meilleur choix, puisque le moteur trouve alors à chacune une place près de sa mention.

## Renvois et citations

Le même \`:ref\` désigne tout endroit du livre qui porte un identifiant : un titre écrit \`## Méthode {#method}\`, un encadré ouvert avec \`{#id}\` ou une expression balisée \`[ces mots]{#key}\`. Il imprime _section 3.2_ ou _chapitre 4_, le titre avec \`style=title\` ou la page avec \`style=page\`, et la page est juste, parce que le moteur recompose le livre jusqu’à ce qu’il se stabilise. Chacun de ces renvois est un lien dans le PDF, dans le HTML et dans ces aperçus.

Les ouvrages se citent comme les écrit Pandoc, \`[@garcia2020, p. 33]\` ou \`@garcia2020\` dans la phrase, avec les références dans l’en-tête YAML ou dans un bloc \`:::references\` en BibTeX. Le style de citation est un réglage, pas une propriété du texte : APA, Chicago, MLA, IEEE, Vancouver, ISO 690, GB/T 7714 ou un style à vous, choisi dans Maquette › Citations, où un aperçu montre le résultat. La bibliographie suit le dernier chapitre, ou se place là où \`:::bibliography\` est écrit. La citation d’un ouvrage absent des références s’imprime telle qu’elle est écrite et figure parmi les avertissements.

## Notes de bas de page

Une note s’appelle avec \`[^id]\` juste après le mot ou la ponctuation auxquels elle se rattache, et s’écrit n’importe où dans le chapitre, sous la forme d’un paragraphe qui commence par \`[^id]:\`. Les notes sont numérotées dans l’ordre de leur premier appel, en repartant de un dans chaque chapitre ; \`footnotes.numbering\` peut les numéroter en continu sur tout le livre ou recommencer à chaque page, comme le font les livres chinois et arabes classiques, et les numéros peuvent s’imprimer en chiffres cerclés ou entre crochets. Une note se compose au pied de la colonne qui contient la ligne où elle est appelée, sous un court filet, et la ligne et sa note partagent toujours une colonne : quand la note ne tient pas, la ligne part avec elle. \`footnotes.placement: 'chapterEnd'\` réunit plutôt les notes d’un chapitre après son dernier bloc. Un appel sans note et une note que rien n’appelle sont tous deux signalés dans le panneau **Vérifications**. Ce guide n’a pas de notes ; parmi les livres d’exemple, _Le Paradis perdu_ en porte huit cents, appelées par des lettres qui recommencent à chaque page.

## Un index en fin d’ouvrage

L’index s’écrit là où le texte traite de chaque terme. \`:index[anémie]\` imprime le mot et l’enregistre ; \`:index{term="Cœur!valvules"}\` n’imprime rien et enregistre la page sous une sous-entrée. Un drapeau \`main\` met la page en gras, \`range="start"\` et \`range="end"\` délimitent un développement qui court sur plusieurs pages, et \`see\` et \`seealso\` écrivent des renvois. \`:::index\` imprime l’index là où il se trouve, d’ordinaire sous un titre dont le style le compose sur deux colonnes, et des index nommés, des personnes ou des lieux, vivent à côté de l’index principal.

Le moteur lit la page de chaque marque après la mise en page, si bien que les numéros suivent le texte : ajoutez un paragraphe, déplacez un chapitre ou changez le format, et l’index imprime les nouvelles pages. Les entrées sont triées dans l’ordre alphabétique de la langue du document et regroupées sous leurs lettres initiales, les pages consécutives se réunissent en une plage, et chaque numéro est un lien dans le PDF. Un index arabe ignore l’article _al-_ dans son tri, et un index chinois trie selon la lecture de chaque caractère.

## Encadrés

\`:::callout\` compose un encadré, avec un titre facultatif, dans l’un des styles que définit la configuration. Ce livre en définit quatre : les encadrés _Essayez-le_ qui vous envoient vers le Sandbox, les notes techniques, les citations en exergue composées en italique de titrage, et un panneau sombre sur toute la largeur de la page pour les chiffres clés. Un style décide du fond de l’encadré, de sa bordure, de son liseré et du rayon de ses coins, d’une icône ou d’un repère facultatifs, de la typographie de son titre, de son corps et de ses listes, et de sa place : dans le flux, en tête ou en pied de colonne, sur toute la largeur de la page, dans la colonne latérale d’une mise en page à une colonne et demie, ou fixé à une position de la page.

Un long encadré peut se couper entre ses paragraphes, voire entre ses lignes, en gardant au moins deux lignes de chaque côté ; la suite omet le titre. À l’intérieur d’un encadré, \`:::columns\` compose son contenu en colonnes équilibrées, comme le panneau de chiffres du chapitre 2.

Les attributs d’un encadré peuvent remplacer son style pour lui seul : un \`title\`, un \`placement\`, un \`span\` de colonne, de page ou de colonne latérale, et un \`label\` imprimé dans un onglet à son coin supérieur, comme les libellés _Encadré 1-1_ d’un manuel. Les styles peuvent aussi arrêter les flottants à leur bord, pour qu’une figure mentionnée dans un encadré ne s’échappe jamais au-delà, et décider si un encadré trop haut pour sa colonne doit se couper ou donner lieu à un avertissement.

:::callout{type="note" title="Pourquoi un vocabulaire aussi réduit"}
Chaque extension répond à une question qu’un livre pose et à laquelle Markdown ne sait pas répondre : où finit une page, comment les pages sont numérotées, ce qu’est une partie, quels paragraphes appartiennent à un encadré. Tout ce qui touche à leur apparence vit dans la configuration, si bien que le même texte peut être composé en livre de poche ou en magazine sans une seule retouche.
:::

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

L’interface reprend la disposition familière d’un éditeur, esquissée dans la :ref{id="sandbox-ui"}. Une **barre d’activité** à gauche bascule entre sept panneaux : Livres, Chapitres, Texte, Ressources, Polices, Maquette et Vérifications, ce dernier avec le nombre de problèmes en suspens. Une **barre latérale** redimensionnable accueille le panneau actif ; un clic sur l’icône active la replie. La **zone d’affichage**, à droite, montre la même mise en page dans six onglets : Canvas, PDF, Folio, HTML, EPUB 3 et SCORM. L’interface parle anglais, espagnol, catalan, français, allemand, italien, portugais du Brésil, chinois simplifié, japonais et arabe, et se lit de droite à gauche en arabe ; un réglage de grands boutons et de grands champs rend chaque commande plus facile à atteindre au doigt ou d’une main peu sûre.

La barre latérale et la zone d’affichage se partagent la fenêtre, et la limite entre elles se déplace en la faisant glisser. Chaque panneau et la zone d’affichage retrouvent leur état d’une visite à l’autre : le zoom et le mode d’affichage du canvas, le mode de colonnes de la vue HTML, les groupes ouverts dans le panneau Maquette. Le thème et la langue de l’interface se changent au pied de la barre d’activité, et la langue de l’interface est indépendante de celle du livre.

## Modifier un livre

L’éditeur du panneau **Texte** met en évidence l’en-tête YAML et les mathématiques, et sa barre d’outils insère la mise en forme, les listes, les sauts de page et les changements de numérotation. En tête, un **sélecteur de chapitres** passe d’un chapitre du livre à l’autre en indiquant leurs plages de pages ; chaque chapitre garde son propre historique d’annulation et la position de son curseur. L’éditeur et les pages restent synchronisés dans les deux sens : un clic sur un mot de la page place le curseur sur ce mot dans le Markdown, et sélectionner du texte le met en évidence sur la page. Le panneau **Chapitres** montre le livre ouvert dans son ensemble, ses chapitres dans l’ordre avec leurs plages de pages.

L’éditeur garde aussi un œil sur le livre. Son menu de chapitres liste chaque chapitre avec les pages qu’il occupe dès qu’elles sont connues, et passer à un autre chapitre y fait basculer les aperçus. Les chapitres peuvent être créés, renommés, réordonnés, coupés à leurs titres de premier niveau ou fusionnés avec le précédent, et un chapitre entier peut être exporté en fichier Markdown ou remplacé par un tel fichier.

## Configuration

Le panneau **Maquette** édite toute la configuration (plus de cinq cents champs) par groupes : page et colonnes, système d’écriture, couleurs, typographie, titres et table des matières, listes, figures et tableaux, encadrés, exercices, bande dessinée, en-têtes et pieds de page, parties, export, Folio (le livre en 3D) et réglages avancés. Un champ de recherche trouve n’importe quelle option par son nom, et le filtre **Modifiés** montre ce qui diffère des valeurs par défaut. Chaque champ et chaque section se réinitialisent séparément, et la configuration peut être exportée et importée sous forme de fichier.

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

# Sortie : canvas, HTML, PDF et EPUB {lead="Un arbre, quatre sorties. Le canvas sert d’aperçu, le HTML se lit à l’écran, le PDF part chez l’imprimeur et l’EPUB rejoint l’appareil du lecteur, et toutes s’écrivent à partir de la même mise en page." summary="Les moteurs de rendu, le PDF accessible, les livres EPUB et l’emploi de la bibliothèque"}

Comme tous les moteurs de rendu lisent le même VDT, la promesse _ce que vous voyez est ce que vous obtenez_ est à prendre au pied de la lettre : coupures de ligne, limites de page et position de chaque figure concordent entre le canvas, le HTML et le PDF, et un EPUB à mise en page fixe les conserve aussi. Un EPUB recomposable renonce exprès à la page et garde tout le reste de ce que la mise en page a résolu : les numéros, les notes, les renvois et les numéros des pages imprimées. Le skill d’agent qui fait entrer des livres existants dans Postext vérifie son travail avec ces sorties, comme le montre la :ref{id="skill-tutorial"}.

## Canvas

Le moteur de rendu canvas dessine une page sur un canvas HTML, à n’importe quelle résolution. Dans le Sandbox, c’est l’aperçu en direct, avec le zoom, l’ajustement à la largeur ou à la hauteur, les pages seules ou les doubles pages, et des pages dessinées à la demande à mesure qu’elles entrent dans le champ, si bien que les longs livres restent réactifs.

Les images des ressources s’enregistrent une seule fois auprès du moteur de rendu, par identifiant de fichier, et servent ensuite sur chaque page. Les pages peuvent se dessiner sur n’importe quel canvas, à n’importe quelle échelle, ce qui rend le même moteur de rendu utile pour les vignettes, les aperçus avant impression et l’export d’images : les exemples en direct de la documentation dessinent une page et la transforment en PNG.

## HTML

Le moteur de rendu HTML renvoie du HTML en positionnement absolu, avec un CSS éditorial : chaque ligne là où la mise en page l’a placée, dans sa police, son corps et sa ligne de base exacts. Une variante indexée indique à l’hôte quelles parties de la page ont changé, pour qu’une visionneuse ne mette à jour que celles-là. Dans le Sandbox, l’onglet HTML isole la sortie dans un Shadow DOM et ajoute un mode lecture, avec une seule colonne défilante ou autant de colonnes que l’écran peut en contenir, et une commande d’échelle du texte. Un jeu de surcharges réservées à l’écran peut ajuster la maquette pour la lecture à l’écran sans toucher aux pages imprimées.

Le moteur de rendu prend une fonction qui transforme l’identifiant de fichier d’une ressource en URL, pour que les images puissent être servies de n’importe où, et une couleur de fond pour la page. Sa sortie se compose de simple balisage et de CSS, sans script, ce qui la rend adaptée à l’hébergement statique, aux aperçus dans un e-mail ou au stockage côté serveur une fois la mise en page calculée dans un navigateur.

## PDF

Le paquet _postext-pdf_ transforme le VDT en un vrai PDF, pour un document ou pour un livre entier. Il ne mesure jamais à nouveau : les métriques du canvas font foi et le PDF ne fait que les transporter, ce qui explique que les lignes se coupent exactement aux mêmes endroits. Il incorpore de vraies polices, une fonte statique par graisse, si bien que le gras est du vrai gras et l’italique du vrai italique, et le texte reste sélectionnable. Par-dessus les pages, il ajoute des signets tirés des titres et des parties, des étiquettes de page conformes aux numéros imprimés, des renvois cliquables, des figures SVG vectorielles et un choix d’espace colorimétrique (RVB, CMJN ou niveaux de gris) pour l’impression.

Les polices arrivent dans le PDF par un **fournisseur de polices**, une fonction qui renvoie les octets d’une famille dans une graisse et un style donnés. Le fournisseur du Sandbox récupère des fontes statiques sur Fontsource, un fichier par graisse, et les décompresse depuis le WOFF2 ; les polices personnalisées viennent du panneau Polices. Les octets des ressources sont transmis de la même façon, par identifiant de fichier. Le rendu indique sa progression, s’exécute dans un worker dédié si on le lui demande, et accepte un livre entier sous forme de liste de documents de chapitres, pour produire un seul PDF aux étiquettes de page, aux signets et aux liens continus.

## Accessible par défaut

Chaque PDF est **balisé** par défaut, selon la norme PDF/UA-1 : un arbre de structure des titres, paragraphes, listes, tableaux et figures dans l’ordre de lecture, un texte alternatif pour chaque figure, la langue du document, et des éléments décoratifs marqués comme artefacts pour que les lecteurs d’écran les ignorent. L’accessibilité n’est pas une option d’export à ne pas oublier ; c’est la façon même dont le fichier est fabriqué.

Le balisage suit la mise en page plutôt que la source. Les paragraphes coupés entre colonnes et entre pages sont balisés comme un seul paragraphe, les listes gardent leurs éléments ensemble, les tableaux leurs cellules d’en-tête, et les figures portent leur texte alternatif (ou leur légende, ou leur libellé, quand aucun texte alternatif n’a été écrit). Le titre et la langue du document voyagent dans ses métadonnées, les titres courants et les décors de page sont marqués comme artefacts, et les renvois entre le texte et les figures qu’il mentionne sont de vrais liens.

## La couleur pour l’impression

Les couleurs de la configuration s’écrivent en valeurs hexadécimales, éventuellement liées à la palette, et c’est ce que le PDF dessine par défaut. Pour la production imprimée, le PDF peut être forcé dans un espace colorimétrique : CMJN pour l’offset ou niveaux de gris pour un travail en une couleur. Avec les diagrammes à encre unique, un livre peut passer d’une édition en couleurs pour l’écran à une édition imprimée en une couleur en changeant deux réglages, sans toucher au texte ni aux figures.

## Livres entiers

Le PDF d’un livre n’est pas une concaténation de fichiers séparés. Le moteur de rendu reçoit la mise en page de chaque chapitre et écrit un seul document : les étiquettes de page se suivent d’un chapitre à l’autre, les signets forment un seul arbre, les parties au-dessus de leurs chapitres, et la structure accessible du livre entier forme un seul arbre dans l’ordre de lecture. Comme chaque chapitre a été composé dans la continuité des précédents, les pages du chapitre sept dans le PDF du livre sont exactement celles du chapitre sept imprimé seul.

Le Sandbox propose les deux : la vue PDF peut basculer entre le chapitre courant, pour des épreuves rapides, et le livre entier, pour le fichier définitif. Construire le livre entier prend plus de temps : le travail se fait donc dans le worker PDF, qui indique sa progression page par page.

## Les polices dans le PDF

Un PDF ne vaut que par les polices qu’il contient. Postext incorpore chaque fonte employée par la mise en page (un fichier statique par graisse et par style), si bien qu’un mot en gras est composé dans le vrai gras et un italique dans le vrai italique, jamais dans une imitation penchée ou épaissie. Les fontes TrueType sont réduites aux glyphes que le livre emploie réellement, ce qui garde des fichiers légers même avec quatre familles ; les fontes OpenType à contours PostScript sont incorporées entières, parce que certaines visionneuses ne savent pas lire leurs sous-ensembles. Chaque police incorporée porte une table de correspondance des glyphes vers les caractères, ligatures comprises : copier une phrase du PDF rend la phrase qui a été écrite, et une recherche dans le document trouve chaque mot.

Les familles viennent de là où le Sandbox les a trouvées. Les Google Fonts sont récupérées fonte par fonte sur Fontsource et décompressées à la volée ; les familles téléversées dans le panneau Polices sont incorporées à partir des fichiers que vous avez fournis. Une famille disponible seulement en WOFF n’est pas acceptée par le PDF, parce que ce format ne peut pas être incorporé de façon fiable ; les fichiers WOFF2, TrueType et OpenType fonctionnent tous.

## EPUB 3

Le paquet _postext-epub_ écrit un livre mis en page sous forme de fichier EPUB 3, le format des librairies numériques, des bibliothèques et des applications de lecture. Il lit les mêmes documents de chapitres que le PDF d’un livre entier, si bien que les numéros de page, les notes, les citations, les renvois, la table des matières et l’index arrivent résolus, et il renvoie le fichier sous forme d’octets, dans le navigateur ou dans Node, sans serveur. EPUB définit deux restitutions, présentées côte à côte dans la :ref{id="epub-renditions"}, et le générateur produit l’une ou l’autre à partir de la même mise en page.

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

# Le livre en 3D {lead="Une mise en page est un ensemble de pages, mais un livre est un objet : un papier d’un certain grammage et d’une certaine teinte, une reliure qui s’ouvre d’une certaine façon, une épaisseur que la main sent. La vue Folio montre les pages sous la forme de cet objet, avant toute impression." summary="La vue Folio, les papiers, les reliures, les couvertures et la lumière"}

Les épreuves à l’écran sont plates. Une double page vue comme deux rectangles ne dit rien de la façon dont le livre se tiendra, ouvert sur un bureau : si le pli de la reliure avale la marge intérieure, si une planche sur papier brillant accroche la lumière, si trois cents pages de papier crème font un bloc trop épais pour la reliure. La vue **Folio** répond à ces questions avec les pages que Postext a déjà composées. Elle montre le livre relié, ouvert sur une surface, éclairé, avec des feuillets qui se courbent et tournent sous la main.

Rien n’y est une seconde mise en page. Les pages sont celles que peint le canvas, dessinées aux pixels exacts de l’écran, si bien que le texte dans Folio est aussi net que dans la vue Canvas et identique ligne pour ligne. Ce que Folio ajoute, c’est tout ce qui entoure les pages : le papier, la reliure, les couvertures, le bureau et la lumière. Tout cela vient d’une seule partie de la configuration, \`folio\`, que la mise en page ne lit jamais. Changer de papier ou de reliure redessine aussitôt le livre et ne déplace jamais une ligne.

## Tourner les pages

Une page se tourne comme on tourne une page : prenez-la par le bord et faites-la passer de l’autre côté. Lâchée au-delà du milieu, elle se pose de l’autre côté ; lâchée avant, elle retombe. Un clic sur une page la tourne aussi, vers l’avant sur la page de droite et vers l’arrière sur celle de gauche, tout comme les flèches de la barre d’outils et les touches fléchées, Page précédente et Page suivante, Début et Fin quand le livre a le focus. Le champ de page de la barre d’outils prend un numéro de page et ouvre le livre à cette double page.

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

# Feuille de route et communauté {lead="Postext est jeune et ouvert. La chaîne de traitement principale, le format de document et le système de configuration sont livrés ; la suite se décide en public." summary="Où en est le projet et comment y prendre part"}

Postext ne cherche pas à être une plateforme documentaire universelle. Il vise à être un très bon moteur de mise en page éditoriale pour le web, et garde un périmètre étroit pour que son noyau reste affûté. Son ambition à long terme est de devenir le moteur de mise en page de référence pour les contenus éditoriaux sur le web : un outil que les éditeurs, les magazines, les plateformes de livres et les équipes de développement puissent adopter et sur lequel ils puissent bâtir.

## Où en est le projet

Le travail s’organise en quatre phases, résumées dans le :ref{id="development-phases"}. Ce ne sont pas des jalons stricts ; elles décrivent l’ordre dans lequel les capacités deviennent assez stables pour la production.

Les deux premières phases sont pour l’essentiel achevées : le modèle de données, l’analyseur et la couche de mesure, le format de document, le moteur de colonnes avec son équilibrage, ses flottants et ses tableaux, et la mécanique du livre, faite de chapitres, de parties, de table des matières et de titres courants. La troisième phase a livré l’essentiel (coupure optimale des lignes avec pénalités éditoriales, césure en huit langues, mathématiques, notes de bas de page et notes de fin de chapitre, citations, index, chinois et japonais composés horizontalement et verticalement, arabe composé de droite à gauche avec justification par kashida) et laisse encore ouvertes les notes marginales. La quatrième, celle des sorties, a livré le canvas, le HTML, un PDF balisé et des livres EPUB 3, ainsi que le worker, le Sandbox et ses préréglages, et la vue Folio qui montre une mise en page sous la forme d’un livre imprimé.

Ce qui manque encore compte autant que ce qui est livré. Les **notes marginales** ont leur place dans le modèle de données mais ne sont pas encore mises en page. Le code en ligne n’a pas de style propre, le texte ne contourne pas encore les obstacles, le coréen est composé avec les règles du chinois plutôt qu’avec les siennes, et la mise en page ne se fait que dans le navigateur. Ce sont les prochains problèmes à résoudre, et ceux où l’aide compte le plus.

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

D’autres choses ne sont simplement pas encore faites. La mise en page sur un serveur, sans navigateur, viendra plus tard : le moteur mesure aujourd’hui avec les métriques d’un vrai navigateur, et une version serveur aurait besoin des mêmes métriques pour produire les mêmes pages. La collaboration en temps réel, c’est-à-dire le partage d’une session en direct par un lien, figure dans la liste d’idées du Sandbox. Les deux seront discutées en public avant que la moindre ligne de code soit écrite.

## Licence

Postext est publié sous **licence MIT** : le moteur, les générateurs PDF et EPUB, la visionneuse Folio et le Sandbox peuvent être utilisés, modifiés et intégrés dans des projets ouverts comme fermés, commerciaux ou non, à condition que la mention de licence accompagne le code. Les caractères de ce livre sont des polices libres servies par Google Fonts, les diagrammes font partie des sources du Sandbox, et le texte de ce guide appartient au projet et à ses contributeurs.

## Valeurs

Trois valeurs guident le projet, et elles sont faites pour servir, pas pour être encadrées : quand deux bonnes idées tirent dans des directions opposées, ce sont elles qui tranchent.

_La réflexion avant la vitesse._ La typographie porte des siècles de savoir accumulé, et le moteur doit l’honorer plutôt que de le réinventer mal. Une fonctionnalité arrive quand elle fait ce qu’il faut sur une vraie page, pas quand elle marche simplement dans une démo ; une règle empruntée à l’imprimé est étudiée dans les livres qui l’appliquent avant de devenir une option. Certaines fonctionnalités prennent ainsi plus de temps. Celles qui sortent n’ont pas besoin d’être retirées.

_La clarté avant l’astuce._ Le code, la configuration et la documentation doivent être faciles à lire, à modifier et à expliquer. Une option qui exige un paragraphe de mises en garde signale une conception pas encore aboutie ; une fonction que seul son auteur peut suivre ne survivra pas aux vacances de son auteur. La configuration garde des unités réelles et des noms simples, le format de document reste lisible dans n’importe quel éditeur, et les décisions du moteur peuvent toujours être rattachées à une règle que quelqu’un peut désigner.

_La collaboration avant le territoire._ Les décisions se prennent en public, dans des issues et des discussions que chacun peut lire et rejoindre, et aucune partie du code n’appartient à une seule personne. Chaque contribution est reconnue (code, documentation, traductions, rapports de bogues, conseils typographiques et livres d’exemple qui montrent ce que peut faire le moteur), parce qu’un moteur de mise en page pour tous ne peut être construit que par beaucoup de monde.

Si quelque chose ici vous parle, le dépôt est la prochaine étape. Ouvrez une issue, posez une question dans les discussions, ou changez quelque chose dans ce livre et regardez ce qu’en fait le moteur.

:::paragraphs{style="signature"}
postext.dev · github.com/drnachio/postext
:::

# Quatrième de couverture {style="back" toc="false" book="Postext" blurb="Postext compose du Markdown en livres, en magazines et en manuels, dans le navigateur : chaque paragraphe coupé en lignes comme un tout, des colonnes qui finissent à la même hauteur, des figures placées après les mots qui les appellent, un PDF prêt pour l’impression et un EPUB pour les liseuses. Chaque page de ce guide a été composée par Postext lui-même." licence="Open source · licence MIT"}
`;
