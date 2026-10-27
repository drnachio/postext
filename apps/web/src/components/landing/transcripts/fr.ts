// The French cut of each narrated video, block by block.
import type { TranscriptBlock, TranscriptVideo } from "../transcripts";

export const TRANSCRIPTS_FR: Record<TranscriptVideo, TranscriptBlock[]> = {
  showreel: [
    {
      time: "0:00",
      scene: "Une carte sombre affiche « MAYENCE · 1455 » au-dessus d’un fin filet doré. Derrière le titre « Pendant cinq siècles, l’imprimerie a appris à composer la page. », l’année défile de 1455 à 2026 en immenses chiffres détourés, et des termes d’imprimerie se posent tout autour : Justification, Crénage, Veuves, orphelines, Colonnes équilibrées, Interlignage, Grille de base, cé·sure, Longueur de ligne, Flottants, Titres courants, Lézardes. La caméra plonge dans le point final, qui inonde l’écran d’or.",
      narration: "Pendant cinq siècles, l’imprimerie a appris l’art de composer la page.",
    },
    {
      time: "0:07",
      scene: "Titre : « Le web a appris à agencer des interfaces. Il n’a jamais appris à composer une page. » Une fenêtre de navigateur ouverte sur example.com/longform/article contient un article justifié sur trois colonnes, « Pourquoi le web échoue » ; des étiquettes rouges signalent des lézardes de blanc, une orpheline, une veuve, une image qui tombe sur le texte et une dernière colonne déséquilibrée. À côté, une pastille de code affiche « column-count: 3; », puis « …et guère plus. » et une liste barrée des cinq mêmes défauts : Lézardes, Orphelines, Veuves, Collisions, Colonnes déséquilibrées. La fenêtre se brouille et s’effondre.",
      narration: "Le web a appris à mettre en page des interfaces. Jamais des pages. Alors le texte long se casse encore : lézardes, veuves, orphelines, collisions.",
    },
    {
      time: "0:20",
      scene: "Après un éclair blanc et un balayage de bandes bleues, dorées et rouges, le logo et le nom de Postext se mettent en place avec le slogan « Le compositeur programmable pour le web ». En dessous : OPEN SOURCE · LICENCE MIT · v1.33.8 · DANS VOTRE NAVIGATEUR.",
      narration: "Voici Postext : le compositeur programmable pour le web.",
    },
    {
      time: "0:26",
      scene: "Section 01 sur 07, « Le contenu entre » : « Le Markdown dit ce que sont les choses. » Un fichier Markdown, 03-pourquoi-postext.md, s’écrit tout seul : une directive de partie, le titre « Pourquoi Postext » avec un chapeau, un paragraphe qui renvoie à la figure fig-flow avec :ref, une ligne ::resource et un bloc :::callout. À côté, config.ts appelle buildDocument avec une mise en page sur deux colonnes, un texte courant justifié et la césure en « fr », sous la phrase « La configuration décide de l’allure. Le texte ne contient aucune décision de mise en page. »",
      narration: "Vous écrivez du Markdown sémantique, qui dit ce qu’est chaque chose. La configuration décide du rendu.",
    },
    {
      time: "0:35",
      scene: "Section 02, « Pretext mesure » : « Mesuré sans toucher au DOM. » Un titre, un paragraphe et un encadré sont scannés l’un après l’autre, et des lignes de cote donnent leur hauteur en points ; un panneau de code montre prepare(text, '25px Lora') et layout(prepared, width, 38), qui renvoient une hauteur et un nombre de lignes. Deux barres font la course sur 10 000 paragraphes : « Reflow du navigateur · DOM » bouge à peine, tandis que « Pretext · canvas + arithmétique » se remplit d’un coup, et un compteur grimpe jusqu’à 600× au-dessus de « plus rapide que le DOM à mesurer le texte, pour qu’un livre entier se recompose à la frappe. » et de « Propulsé par @chenglou/pretext ».",
      narration: "Chaque paragraphe est mesuré sans toucher au DOM, jusqu’à six cents fois plus vite, grâce à Pretext, la bibliothèque qui l’a permis.",
    },
    {
      time: "0:45",
      scene: "Section 03, « Postext décide » : « Chaque ligne placée avant de peindre un pixel. » Un anneau de sept segments s’allume tour à tour, Structure, Mesure, Placement, Flottants, Affinage, Équilibre et Rythme, chacun avec une description d’une ligne, tandis qu’une page sur deux colonnes du guide de Postext s’assemble à côté : des blocs étiquetés volent jusqu’à leurs colonnes, une figure glisse à sa place sous la note « :ref{id=\"fig-flow\"} → pied de colonne », le bandeau d’ouverture descend, les lignes apparaissent, les colonnes s’égalisent et une grille de ligne de base balaie la page de haut en bas. L’anneau boucle sur les itérations 1 à 3 et affiche « Stable en 3 itérations » avec une coche ; une bulle donne la boîte englobante et la ligne de base d’une ligne.",
      narration: "Puis Postext décide. Ses sept passes placent chaque ligne, logent chaque figure et équilibrent les colonnes, jusqu’à ce que rien ne bouge.",
    },
    {
      time: "0:58",
      scene: "Section 04, « Le document virtuel » : « Changez un mot. Seul ce qui change est recomposé. », avec la note « Comme le DOM virtuel de React, mais pour des pages : le VDT, un arbre de document virtuel. » Sept pages, de p. 7 à p. 13, se tiennent en rang ; un curseur marque une modification à la page 11, le reste de cette colonne passe à l’or avec la mention À REFAIRE et un filet de texte déborde sur la page 12, qui reçoit une coche et STABLE, tandis que les pages précédentes indiquent SAUTÉE et les suivantes INTACTE. Trois puces énoncent la règle, et un panneau intitulé renderToHtmlIndexed(), « ne met à jour que le DOM qui a changé », marque MIS À JOUR les nœuds modifiés de l’arbre du document.",
      narration: "Tout vit dans un document virtuel, comme le DOM virtuel de React. Vous changez un mot, et seul ce qui change est recomposé.",
    },
    {
      time: "1:07",
      scene: "« Un long document ? Seul ce qui est à l’écran est peint. » Une colonne de pages de livre défile dans un cadre doré marqué VIEWPORT, avec une marge de 200 pixels au-dessus et au-dessous : les pages à l’intérieur sont dessinées en entier, celles de l’extérieur ne sont que des contours en pointillés. Un grand compteur montre combien des 51 pages sont peintes à ce moment-là (« pages peintes en ce moment », IntersectionObserver · +200 px), à côté de « Géométrie : toutes les pages. Pixels : ce que vous voyez. »",
      narration: "Et dans un long livre, on ne peint jamais que les pages visibles à l’écran.",
    },
    {
      time: "1:14",
      scene: "Section 05, « Justification Knuth–Plass » : « Toutes les façons de couper le paragraphe. À la fois. » À gauche, sous « Glouton · le navigateur », un paragraphe sur la coupure des lignes est composé de façon gloutonne, comme le fait un navigateur, et ses lignes les plus lâches virent au rouge. En dessous, chaque mot devient un point sur une ligne : des arcs rouges marquent les coupures gloutonnes, de pâles arcs bleus essaient toutes les coupures possibles et un chemin doré retient le meilleur ensemble. À droite, la version « Knuth–Plass · Postext » est espacée régulièrement, avec les démérites de chaque ligne, la formule « (1 + laideur + pénalité)² » et une somme de démérites plus basse.",
      narration: "Un navigateur coupe les lignes de façon gloutonne, une à une. Postext utilise Knuth-Plass, l’algorithme de TeX : il pèse chaque façon de couper le paragraphe, et garde la plus régulière.",
    },
    {
      time: "1:31",
      scene: "Section 06, « Une mise en page, cinq sorties » : « Ce que vous voyez part à l’impression. » Sous la ligne de code const vdt = buildDocument(content, config); une page se divise en cinq. Canvas (renderToCanvas(), bitmaps exacts au pixel près) reçoit une loupe sur sa grille de pixels ; HTML (renderToHtml(), sélectionnable et adaptatif) voit chaque bloc détouré et étiqueté <h1>, <p>, <figure>, etc. ; PDF (renderToPdf(), pour l’impression, PDF/UA, CMJN) fait glisser quatre plaques de couleur jusqu’au repérage, puis apparaissent les traits de coupe et une gamme de contrôle. EPUB 3 (renderToEpub(), livre numérique, fixe ou recomposable) montre la page dans une liseuse étiquetée « Mise en page fixe » ; l’écran se rétrécit à la taille d’un téléphone, le texte se recompose et l’étiquette devient « Recomposable ». Folio (postext-folio, un livre en 3D, pages à tourner) ouvre la page en double page et tourne un feuillet par-dessus le dos.",
      narration: "Une mise en page, cinq sorties : canvas, HTML, PDF d’impression, EPUB 3, fixe ou recomposable, et un livre en 3D. Ce que vous voyez est ce qui sera imprimé.",
    },
    {
      time: "1:48",
      scene: "Section 07, « Pourquoi un standard ouvert » : « LaTeX a fixé la norme du papier. Aujourd’hui, l’édition vit aussi sur chaque écran. » Deux cartes : LaTeX, 1984, avec des croix face à « Pensé pour la page imprimée », « Lié aux polices et aux paquets d’une machine », « Compiler, attendre, recommencer » et « Sans mise en page éditoriale sur le web adaptatif » ; Postext, 2026, avec des coches face à « Web, PDF d’impression et EPUB 3 : une mise en page », « Un seul fichier .postext emporte tout », « Se recompose en direct pendant la frappe » et « Dans tout navigateur · sans serveur · MIT ». La carte Postext s’illumine.",
      narration: "LaTeX a fixé la norme du papier. Mais aujourd’hui, l’édition vit sur tous les écrans.",
    },
    {
      time: "1:56",
      scene: "Surtitre « Un fichier, le livre entier », titre « Un standard ouvert pour l’édition, au-delà de ce qu’atteint LaTeX. » Une icône de fichier .postext éclate en cinq parties : preset.json (configuration et maquette), chapters/*.md (un Markdown par chapitre), fonts/*.woff2 (les polices elles-mêmes), images/ · SVG (chaque image, incluse) et resources (tableaux, figures et légendes). Légende : « Un ZIP ordinaire : ouvert, documenté et sous licence MIT. N’importe quel outil peut le lire et l’écrire. »",
      narration: "Postext est un standard ouvert : un seul fichier portable, documenté et sous licence MIT, que n’importe quel outil peut lire et écrire.",
    },
    {
      time: "2:08",
      scene: "« La vitrine · composée par le vrai moteur » : un mur de pages de l’édition française du guide s’éloigne en perspective tandis qu’un compteur atteint 51 pages. Texte : « 11 chapitres, 3 parties et les couvertures, mis en page en environ une demi-seconde. Chaque page du guide de Postext, calculée dans un navigateur par postext v1.33.8 pour ce film. Rien de placé à la main. » Suivent les étiquettes Manuels, Magazines, Éditions littéraires, Catalogues.",
      narration: "C’est pourquoi il peut mettre en page des livres de plusieurs centaines de pages en quelques dixièmes de seconde.",
    },
    {
      time: "2:16",
      scene: "Carte de fin : le logo de Postext avec le slogan « Le compositeur programmable pour le web », l’adresse postext.dev, une ligne de terminal qui tape « $ pnpm add postext », et le pied « Open source · MIT · github.com/drnachio/postext ».",
      narration: "Postext. Open source, sur postext.dev.",
    },
  ],
  tutorial: [
    {
      time: "0:00",
      scene: "Carte de titre : le logo de Postext, le surtitre « Tutoriel · 5 étapes » et le titre « Convertissez votre publication en Postext avec un agent IA. Sans code. »",
    },
    {
      time: "0:03",
      scene: "« Votre publication existe déjà. » Trois publications arrivent l’une après l’autre avec leurs étiquettes : un livre, Madame Gervaisais, d’Edmond et Jules de Goncourt, marqué InDesign (IDML) ; un manuel, le mode d’emploi de la bouilloire électrique Verra W1, marqué Word (DOCX) ; et un magazine, le reportage « La route du sel » de Lena Varga, marqué PDF. Elles se rassemblent à gauche, une flèche dorée en pointillés traverse un badge « Agent IA » et une icône de fichier nommée mon-livre.postext apparaît, sous « Un agent la convertit en Postext. Cinq étapes. Quelques demandes bien écrites. »",
      narration: "Vous avez déjà une publication : un livre, un manuel, un magazine. Elle vit dans InDesign, dans Word ou dans un PDF. Dans ce tutoriel, un agent d’intelligence artificielle va la convertir en Postext pour vous. Sans programmer : cinq étapes et quelques demandes bien écrites.",
    },
    {
      time: "0:23",
      scene: "« Le plan » : cinq cartes numérotées apparaissent à mesure que chaque étape est nommée : 01 Préparez le dossier, 02 Réunissez les originaux vectoriels, 03 Ajoutez une référence, 04 Demandez à l’agent, 05 Vérifiez dans le Sandbox.",
      narration: "Le plan : préparer le dossier, réunir les originaux vectoriels, ajouter une référence, le demander à l’agent et vérifier le résultat.",
    },
    {
      time: "0:34",
      scene: "Étape 01, le dossier : « Un projet, un dossier. » Un grand dossier, mon-livre/, flotte parmi dix fichiers épars comme MinionPro-Regular.otf, couverture.jpg, fig-2-1.ai, chapitre-01.docx, carte.svg, livre.idml et graphique.pdf. Une fenêtre s’ouvre sur l’arborescence du dossier et chaque fichier s’envole vers son sous-dossier à mesure qu’il est nommé : reference.pdf (le rendu voulu → étape 03), polices/ (Minion Pro, Myriad…, .otf .ttf .woff2), images/ (photographies, .jpg .png), illustrations/ (originaux vectoriels, .ai .svg .pdf) et textes/ (Word, InDesign (IDML)…).",
      narration: "Première étape : réunissez tout dans un seul dossier sur votre ordinateur. Un projet, un dossier. À l’intérieur, donnez à chaque type de matériel son propre sous-dossier : les polices, les images, les illustrations et les textes.",
    },
    {
      time: "0:51",
      scene: "La ligne polices/ est mise en évidence et une carte intitulée « Polices » montre un grand « Aa », les styles Romain, Italique et Gras, les formats OTF, TTF et WOFF2, et la note « Seules celles que vous fournissez servent. » Puis « Plus c’est rangé, moins l’agent devine. », tandis que chaque sous-dossier de l’arborescence reçoit une coche.",
      narration: "N’oubliez pas les polices : elles sont la voix de la maquette, et l’agent ne peut utiliser que celles que vous fournissez. Plus le dossier est bien rangé, moins l’agent aura de choses à deviner.",
    },
    {
      time: "1:03",
      scene: "Étape 02, les originaux vectoriels : « Réunissez les originaux. » Un schéma, un graphique et une carte sont tracés au trait, leurs points d’ancrage visibles, et trois icônes de fichier apparaissent : .ai Illustrator, .svg SVG et .pdf PDF.",
      narration: "Deuxième étape : si vos illustrations sont vectorielles, comme des schémas, des graphiques ou des cartes, retrouvez les fichiers originaux : Illustrator, SVG ou PDF.",
    },
    {
      time: "1:15",
      scene: "Deux panneaux montrent la même figure, un schéma où Manuscrit et Modèle pointent tous deux vers Pages, avec la légende « Fig. 2.1 Contenu et maquette se rencontrent. » À gauche, « Découpée dans le PDF : une photo du dessin » devient floue et pixelisée à mesure que la vue zoome ; à droite, « L’original : le dessin lui-même » reste net. Le panneau de gauche s’efface, les étiquettes de l’original sont retapées en anglais (Manuscript, Template, Pages), des traits de coupe l’encadrent et trois coches indiquent « Nette à toute taille », « Étiquettes en texte réel » et « Original → imprimeur ».",
      narration: "Une figure découpée dans le PDF final n’est guère plus qu’une simple photo du dessin. L’original, c’est le dessin lui-même. Avec l’original, l’agent recompose chaque figure : nette à toutes les tailles, avec ses étiquettes en vrai texte, prêtes à traduire. Et à l’impression, l’original part tel quel.",
    },
    {
      time: "1:35",
      scene: "Étape 03, la référence : « Montrez le résultat attendu. » Dans l’arborescence, reference.pdf est mis en évidence et étiqueté « À la racine » ; une page s’en échappe et devient une grande page de livre sur deux colonnes marquée reference.pdf.",
      narration: "La troisième étape est essentielle : à la racine du dossier, placez un fichier qui montre clairement à quoi doit ressembler le produit final. L’idéal, c’est un PDF.",
    },
    {
      time: "1:45",
      scene: "Des mesures apparaissent sur la page : les contours des colonnes, une gouttière de 9 mm, une marge de 20 mm, des étiquettes pour le titre (Fraunces 28 pt), le texte (Lora 9,4/13,6 pt) et un encadré (fond, 1 filet), et des lignes de base avec un interlignage de 13,6 pt. Un fichier, cahier-des-charges.md, se remplit : page de 210 × 280 mm ; marges de 24 · 20 · 22 · 20 mm, symétriques ; 2 colonnes, gouttière de 9 mm ; grille de base de 13,6 pt ; texte en Lora 9,4/13,6 pt, justifié ; titres en Fraunces 28 pt · Geist ; ouvertures avec un bandeau de couleur de 101 mm ; encadrés avec un fond et un filet à gauche. Puis le mot « Deviner » est barré et « Mesurer. » s’allume en doré.",
      narration: "L’agent lit la maquette dans ces pages : il mesure les marges, les colonnes, les polices et les espacements, et les note sous forme de règles de mise en page. Sans référence, il devrait deviner. Avec elle, il mesure.",
    },
    {
      time: "2:00",
      scene: "Étape 04, l’agent : « Demandez-le avec vos mots. » Une fenêtre intitulée « Agent · ~/mon-livre » s’ouvre à côté des badges Claude Code, Codex et « ou tout autre agent ». Un message de VOUS s’écrit : « Installez le skill Postext : `npx skills add drnachio/postext --skill postext-port` », et l’agent répond « ✓ Skill installé : postext-port ». Une carte du skill postext-port énumère « Une méthode éprouvée », « Tout sur Postext » et « Des outils pour vérifier son travail ».",
      narration: "Quatrième étape : ouvrez votre agent, Claude Code, Codex ou celui que vous utilisez, dans ce dossier, et demandez-lui d’installer le skill Postext. Un skill est un paquet de savoir-faire expert. Celui-ci apprend à l’agent à convertir une publication en Postext, et lui donne des outils pour vérifier son propre travail.",
    },
    {
      time: "2:20",
      scene: "La demande suivante s’écrit : « Utilisez le skill postext-port pour convertir ce livre en Postext. La maquette est dans reference.pdf, les polices dans polices/ et les illustrations originales dans illustrations/ : utilisez-les au lieu de découper les figures du PDF. Commencez par le chapitre 1 seulement et montrez-moi le cahier des charges avant de le construire. » À côté, reference.pdf, polices/ et illustrations/ s’allument dans l’arborescence à mesure que la demande les nomme, et une carte « Chap. 1 » surgit.",
      narration: "Ensuite, demandez-lui ce que vous voulez, avec vos mots. Dites-lui où se trouvent la référence, les polices et les originaux, et de commencer par un seul chapitre.",
    },
    {
      time: "2:33",
      scene: "Une grille de douze pages de livre estompées ; la première est cernée d’or. Une flèche circulaire y compte les tours de finition jusqu’à l’apparition d’une coche, puis les onze autres s’allument. En dessous : Chapitre d’essai → Peaufiner → Étendre.",
      narration: "Si le contenu est long, commencez par un chapitre d’essai. Peaufinez-le jusqu’à ce qu’il soit parfait, et seulement ensuite, étendez-le au reste.",
    },
    {
      time: "2:42",
      scene: "L’agent demande « Copie fidèle ou refonte ? », « Quelles langues ? » et « Papier, écran ou les deux ? ». Une liste de contrôle déroule Faire l’inventaire, Mesurer la maquette, Extraire le texte, Polices et images, Comparer page à page et Empaqueter le fichier, et le fichier mon-livre.postext apparaît. Une troisième demande s’écrit : « Le chapitre 1 est validé. Convertissez les autres chapitres avec la même maquette, comparez chacun avec reference.pdf et empaquetez le tout dans un seul fichier .postext. » L’agent répond « ✓ 12 chapitres · 0 avertissement · mon-livre.postext ».",
      narration: "L’agent vous posera quelques questions : copie fidèle ou nouvelle maquette, quelles langues, papier ou écran. Puis il mesure, extrait, assemble et vérifie, et vous remet un fichier Postext. Une fois l’essai au point, il suffit d’une demande de plus pour l’étendre à tout le livre.",
    },
    {
      time: "3:04",
      scene: "Étape 05, le Sandbox : « Vérifiez-le page par page. » Une fenêtre de navigateur tape l’adresse postext.dev/fr/sandbox. Le pointeur clique sur Livres dans la barre latérale, puis sur Nouveau, puis sur « Ouvrir un fichier .postext… » ; le fichier arrive en volant, « Mon livre, 12 chapitres · 184 pages » apparaît en haut de la liste et ses premières pages s’ouvrent dans la vue Canvas ; les onglets de vue indiquent Canvas, HTML, PDF, Folio et EPUB 3.",
      narration: "Cinquième étape : ouvrez le Sandbox de Postext, sur postext.dev. Dans Livres, choisissez Nouveau et ouvrez votre fichier.",
    },
    {
      time: "3:14",
      scene: "La page de référence et la page Postext se tiennent côte à côte, étiquetées Référence et Postext, et une ligne dorée les parcourt de haut en bas. Le panneau Vérifications s’ouvre avec un badge à 3 et liste Veuve (p. 4), Ligne lâche (p. 7) et La figure ne tient pas (p. 9) ; des cadres rouges marquent chaque problème sur la page Postext.",
      narration: "Parcourez-le page par page, à côté de votre référence. Le panneau Vérifications vous signale les problèmes : veuves, lignes lâches, figures qui ne tiennent pas.",
    },
    {
      time: "3:26",
      scene: "Deux rangées de maquettes filaires de pages, « Référence · PDF » et « Postext · recomposé ». Dans la rangée recomposée, une figure passe de la première page au haut de la deuxième, et une ligne pointillée relie ses deux positions. Texte : « Les mêmes règles, pas les mêmes pages. Le contenu s’écoule : une figure ou un saut de page peut tomber ailleurs. » Puis un signe égal relie chaque paire de pages sous « Ce qui doit correspondre » : Marges et grille de base, Typographie, Style des figures et des encadrés, Pages propres : sans veuves, colonnes équilibrées. Un panneau rouge marqué ≠ indique « Décisions d’artisan, à la main » et « pas des règles : inutiles pour un contenu qui change ».",
      narration: "Gardez bien une chose en tête : les pages n’ont pas besoin d’être identiques à celles du PDF. Postext a compris les règles de mise en page, et votre contenu est maintenant fluide : une figure ou un saut de page peuvent donc tomber à un autre endroit. Ce qui doit correspondre, c’est la qualité : le même niveau de finition. Quand on met en page à la main, on prend de petites décisions d’artisan qui ne sont pas des règles. Et seules des règles permettent de mettre en page un contenu qui change.",
    },
    {
      time: "3:54",
      scene: "La fenêtre de l’agent revient avec une quatrième demande : « Dans le Sandbox, chapitre 2, page 7 : l’encadré “À retenir” est coupé sur deux colonnes et le titre courant manque. Vérifications signale 3 lignes lâches. Corrigez-le et empaquetez de nouveau le fichier. » Une capture d’écran est jointe, capture-chap2-p7.png. Puis une boucle entre Sandbox (vérifier) et Agent (corriger) parcourt les tours 1 à 3 tandis que le nombre d’avertissements tombe de 3 à 0, et se termine par une coche et « Parfait. »",
      narration: "Puis dites à l’agent ce que vous voyez, le plus précisément possible : le chapitre, la page et ce qui ne va pas. Une capture d’écran aide. Ouvrez la nouvelle version, revérifiez, et recommencez. Chaque tour vous rapproche, jusqu’à ce que ce soit parfait.",
    },
    {
      time: "4:13",
      scene: "« Pas seulement une version Postext. » Le fichier mon-livre.postext se scinde en deux le long d’une ligne dorée. À gauche, Contenu (ce qu’il dit) : chapters/fr/02-la-cellule.md, avec le titre « La cellule », une phrase qui renvoie à la figure fig-cellule et un encadré « retenir ». À droite, Forme (son apparence) : un « modèle · déduit de votre original », avec une page de 210 × 280 mm symétrique, 2 colonnes avec une gouttière de 9 mm, un texte en Lora 9,4/13,6 justifié, des titres en Fraunces numérotés, des encadrés « À retenir » avec fond et filet, et des figures en tête de colonne.",
      narration: "Et voici le meilleur : vous n’avez pas seulement votre contenu en Postext. Vous avez séparé le fond de la forme. Le texte vit dans des chapitres propres ; la maquette, dans un modèle avec les règles de mise en page déduites de votre original.",
    },
    {
      time: "4:28",
      scene: "Les pastilles Corriger, Enrichir et Traduire s’allument au-dessus d’une rangée de pages de livre : une ligne est surlignée et un reflet traverse les pages, deux pages de plus arrivent en glissant, et les pages se retournent sur l’édition anglaise. Une demande s’écrit : « Ajoutez une édition anglaise : traduisez les chapitres, les légendes des figures et les étiquettes des schémas, et gardez la même maquette. » Légende : « Mêmes règles. Nouveau contenu. Les pages se composent seules. » Puis « Un fichier, tout le livre. » : une icône .postext se ramifie vers une page avec des traits de coupe (PDF pour l’impression), une liseuse dont le texte se recompose à la taille de son écran (Livre EPUB), une fenêtre de navigateur (Lecteur web) et une paire de pages (Chaque page, composée).",
      narration: "Ainsi, quand votre contenu changera, quand vous le corrigerez, l’enrichirez ou le traduirez, vous n’aurez pas à vous soucier de la mise en forme. Postext le recompose avec les mêmes règles. Un seul fichier pour tout le livre : un PDF prêt pour l’imprimeur, un livre numérique EPUB, un lecteur pour le web et des pages qui se composent toutes seules.",
    },
    {
      time: "4:50",
      scene: "Carte de fin : le logo de Postext, le slogan « Le compositeur programmable pour le web », postext.dev, une pastille indiquant « Les prompts de cette vidéo sont dans la description ↓ » et le pied « Open source · MIT · github.com/drnachio/postext ».",
      narration: "Postext. Open source, sur postext.dev. Vous trouverez les exemples de prompts dans la description.",
    },
  ],
};
