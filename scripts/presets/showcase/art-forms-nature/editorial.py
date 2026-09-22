"""Editorial content of the `art-forms-nature` showcase preset: book strings,
the twelve plates with their captions, detail crops and fact files, the
parts they are grouped in, and the credits — in Spanish and English.

Captions, fact files and part titles are original wording written for the
preset (CC BY 4.0); the essays are cut from Wikipedia (CC BY-SA 4.0) by
build.py and credited chapter by chapter.
"""
from __future__ import annotations

BOOK = {
    "es": {
        "title": "Formas artísticas de la naturaleza",
        "subtitle": "Doce láminas de Ernst Haeckel comentadas",
        "author": "Ernst Haeckel",
        "edition": "Kunstformen der Natur · Leipzig y Viena, 1899–1904",
        "intro": "Haeckel y sus formas artísticas",
        "contents": "Índice",
        "credits": "Créditos y fuentes",
        "chapter_label": "Lámina {attr.plate}",
        "part_label": "Parte {numberRoman}",
        "figure": ("Figura", "Figuras", "figura"),
        "table": ("Tabla", "Tablas", "tabla"),
        "detail": "Detalle",
        "ficha": "Ficha",
        "source_line": "Texto adaptado del artículo «{title}» de Wikipedia en español (revisión del {date}), publicado bajo CC BY-SA 4.0.",
        "plates_table_caption": "Las doce láminas de esta selección, por reino. :swatch{color=\"kingdom-protista\"} protistas y algas · :swatch{color=\"kingdom-animalia\"} animales · :swatch{color=\"kingdom-plantae\"} plantas.",
        "table_head": ["Lámina", "Grupo", "Nombre común", "Reino"],
        "kingdoms": {"protista": "Protistas", "animalia": "Animales", "plantae": "Plantas"},
    },
    "en": {
        "title": "Art Forms in Nature",
        "subtitle": "Twelve plates by Ernst Haeckel, with commentary",
        "author": "Ernst Haeckel",
        "edition": "Kunstformen der Natur · Leipzig and Vienna, 1899–1904",
        "intro": "Haeckel and his art forms",
        "contents": "Contents",
        "credits": "Credits and sources",
        "chapter_label": "Plate {attr.plate}",
        "part_label": "Part {numberRoman}",
        "figure": ("Figure", "Figures", "figure"),
        "table": ("Table", "Tables", "table"),
        "detail": "Detail",
        "ficha": "Fact file",
        "source_line": "Text adapted from the Wikipedia article “{title}” (revision of {date}), published under CC BY-SA 4.0.",
        "plates_table_caption": "The twelve plates in this selection, by kingdom. :swatch{color=\"kingdom-protista\"} protists and algae · :swatch{color=\"kingdom-animalia\"} animals · :swatch{color=\"kingdom-plantae\"} plants.",
        "table_head": ["Plate", "Group", "Common name", "Kingdom"],
        "kingdoms": {"protista": "Protists", "animalia": "Animals", "plantae": "Plants"},
    },
}

PLATE_NOTE = {
    "es": "Ernst Haeckel, *Kunstformen der Natur*, lámina {n} (litografía de Adolf Giltsch). Dominio público; reproducción de Wikimedia Commons.",
    "en": "Ernst Haeckel, *Kunstformen der Natur*, plate {n} (lithograph by Adolf Giltsch). Public domain; reproduction from Wikimedia Commons.",
}

# Parts, in order, with the band colour sampled from their plates.
PARTS = [
    {"id": "micro", "number": "I", "band": "#3b4a5a", "title": {"es": "Formas microscópicas", "en": "Microscopic forms"}},
    {"id": "sea", "number": "II", "band": "#2b6f78", "title": {"es": "Habitantes del mar", "en": "Dwellers of the sea"}},
    {"id": "plants", "number": "III", "band": "#5f7d3a", "title": {"es": "El reino vegetal", "en": "The plant kingdom"}},
    {"id": "wings", "number": "IV", "band": "#b0702c", "title": {"es": "Patas, alas y colores", "en": "Legs, wings and colours"}},
]

# The plates, in book order. `wiki` names the extract keys of fetch.py's
# WIKI lists; `detail` is a crop box (left, top, right, bottom) as fractions
# of the processed plate.
PLATES = [
    {
        "n": 41, "part": "micro", "kingdom": "protista", "latin": "Acanthophracta", "german": "Wunderstrahlinge",
        "wiki": {"es": "Radiolaria", "en": "Radiolaria"}, "budget": 700,
        "title": {"es": "Radiolarios", "en": "Radiolarians"},
        "common": {"es": "radiolarios", "en": "radiolarians"},
        "caption": {
            "es": "Acanthophracta (*Wunderstrahlinge*, «radiantes maravillosos»): esqueletos silíceos de radiolarios, los protistas que Haeckel estudió durante toda su vida y que le dieron su primer gran éxito científico.",
            "en": "Acanthophracta (*Wunderstrahlinge*, “wondrous ray-creatures”): the siliceous skeletons of radiolarians, the protists Haeckel studied all his life and that brought him his first scientific success.",
        },
        "detail": (0.30, 0.34, 0.70, 0.66),
        "detail_caption": {"es": "Cápsula central y espinas radiales de un acantario, con la simetría de veinte radios que fascinaba a Haeckel.", "en": "Central capsule and radial spines of an acantharian, with the twenty-ray symmetry that fascinated Haeckel."},
        "ficha": {
            "es": [("Reino", "Protistas (Rhizaria)"), ("Grupo", "Radiolaria"), ("Tamaño", "0,1–0,2 mm"), ("Hábitat", "Plancton oceánico"), ("Esqueleto", "Sílice o sulfato de estroncio")],
            "en": [("Kingdom", "Protists (Rhizaria)"), ("Group", "Radiolaria"), ("Size", "0.1–0.2 mm"), ("Habitat", "Ocean plankton"), ("Skeleton", "Silica or strontium sulphate")],
        },
    },
    {
        "n": 84, "part": "micro", "kingdom": "protista", "latin": "Diatomea", "german": "Schachtellinge",
        "wiki": {"es": "Bacillariophyta", "en": "Diatom"}, "budget": 700,
        "title": {"es": "Diatomeas", "en": "Diatoms"},
        "common": {"es": "diatomeas", "en": "diatoms"},
        "caption": {
            "es": "Diatomea (*Schachtellinge*, «cajitas»): frústulos de diatomeas, algas unicelulares encerradas en dos valvas de sílice que encajan como una caja y su tapa.",
            "en": "Diatomea (*Schachtellinge*, “little boxes”): the frustules of diatoms, single-celled algae enclosed in two silica valves that fit like a box and its lid.",
        },
        "detail": (0.30, 0.36, 0.70, 0.64),
        "detail_caption": {"es": "Una diatomea céntrica vista de frente: la ornamentación radial de la valva es distinta en cada especie.", "en": "A centric diatom seen face on: the radial ornament of the valve differs in every species."},
        "ficha": {
            "es": [("Reino", "Chromista"), ("Grupo", "Bacillariophyta"), ("Especies", "Unas 20 000 vivas"), ("Hábitat", "Aguas marinas y dulces, suelos"), ("Aportación", "20–50 % del oxígeno del planeta")],
            "en": [("Kingdom", "Chromista"), ("Group", "Bacillariophyta"), ("Species", "About 20,000 living"), ("Habitat", "Sea, fresh water, soils"), ("Contribution", "20–50 % of the planet’s oxygen")],
        },
    },
    {
        "n": 8, "part": "sea", "kingdom": "animalia", "latin": "Discomedusae", "german": "Scheibenquallen",
        "wiki": {"es": "Scyphozoa", "en": "Scyphozoa"}, "budget": 600,
        "title": {"es": "Medusas", "en": "Jellyfish"},
        "common": {"es": "medusas", "en": "jellyfish"},
        "caption": {
            "es": "Discomedusae (*Scheibenquallen*, «medusas de disco»): en el centro, *Desmonema annasethe*, la medusa que Haeckel bautizó en memoria de su primera esposa, Anna Sethe.",
            "en": "Discomedusae (*Scheibenquallen*, “disc jellyfish”): at the centre, *Desmonema annasethe*, the jellyfish Haeckel named in memory of his first wife, Anna Sethe.",
        },
        "detail": (0.20, 0.32, 0.80, 0.74),
        "detail_caption": {"es": "Los tentáculos de *Desmonema annasethe* caen como una cabellera: Haeckel los comparó con el pelo de Anna.", "en": "The tentacles of *Desmonema annasethe* fall like hair: Haeckel compared them with Anna’s."},
        "ficha": {
            "es": [("Reino", "Animales"), ("Filo", "Cnidaria · clase Scyphozoa"), ("Especies", "Unas 200"), ("Tamaño", "2–40 cm; hasta 2 m"), ("Hábitat", "Todos los mares")],
            "en": [("Kingdom", "Animals"), ("Phylum", "Cnidaria · class Scyphozoa"), ("Species", "About 200"), ("Size", "2–40 cm; up to 2 m"), ("Habitat", "Every sea")],
        },
    },
    {
        "n": 17, "part": "sea", "kingdom": "animalia", "latin": "Siphonophorae", "german": "Staatsquallen",
        "wiki": {"es": "Siphonophorae", "en": "Siphonophorae"}, "budget": 650,
        "title": {"es": "Sifonóforos", "en": "Siphonophores"},
        "common": {"es": "sifonóforos", "en": "siphonophores"},
        "caption": {
            "es": "Siphonophorae (*Staatsquallen*, «medusas-estado»): colonias flotantes cuyos individuos se reparten el trabajo de nadar, cazar, digerir y reproducirse.",
            "en": "Siphonophorae (*Staatsquallen*, “state jellyfish”): floating colonies whose individuals share the work of swimming, hunting, digesting and reproducing.",
        },
        "detail": (0.28, 0.06, 0.72, 0.50),
        "detail_caption": {"es": "Campanas natatorias apiladas bajo el flotador: cada una es un individuo especializado en impulsar la colonia.", "en": "Swimming bells stacked under the float: each one is an individual specialised in propelling the colony."},
        "ficha": {
            "es": [("Reino", "Animales"), ("Filo", "Cnidaria · clase Hydrozoa"), ("Especies", "Unas 195"), ("Tamaño", "Hasta 45 m de longitud"), ("Hábitat", "Océano abierto")],
            "en": [("Kingdom", "Animals"), ("Phylum", "Cnidaria · class Hydrozoa"), ("Species", "About 195"), ("Size", "Up to 45 m long"), ("Habitat", "Open ocean")],
        },
    },
    {
        "n": 49, "part": "sea", "kingdom": "animalia", "latin": "Actiniae", "german": "Seeanemonen",
        "wiki": {"es": "Actiniaria", "en": "Sea anemone"}, "budget": 650,
        "title": {"es": "Anémonas de mar", "en": "Sea anemones"},
        "common": {"es": "anémonas de mar", "en": "sea anemones"},
        "caption": {
            "es": "Actiniae (*Seeanemonen*): un jardín de anémonas, pólipos solitarios que parecen flores y son depredadores armados de células urticantes.",
            "en": "Actiniae (*Seeanemonen*): a garden of sea anemones, solitary polyps that look like flowers and are predators armed with stinging cells.",
        },
        "detail": (0.08, 0.08, 0.55, 0.50),
        "detail_caption": {"es": "Corona de tentáculos alrededor de la boca: la única abertura del cuerpo de la anémona.", "en": "Crown of tentacles around the mouth: the anemone’s only body opening."},
        "ficha": {
            "es": [("Reino", "Animales"), ("Filo", "Cnidaria · clase Anthozoa"), ("Especies", "Unas 1200"), ("Tamaño", "1,25 cm–2 m"), ("Hábitat", "Fondos marinos, desde la costa al abismo")],
            "en": [("Kingdom", "Animals"), ("Phylum", "Cnidaria · class Anthozoa"), ("Species", "About 1,200"), ("Size", "1.25 cm–2 m"), ("Habitat", "Sea floors, from the shore to the abyss")],
        },
    },
    {
        "n": 53, "part": "sea", "kingdom": "animalia", "latin": "Prosobranchia", "german": "Vorderkiemen-Schnecken",
        "wiki": {"es": "Gastropoda", "en": "Gastropoda"}, "budget": 650,
        "title": {"es": "Caracoles marinos", "en": "Sea snails"},
        "common": {"es": "caracoles marinos", "en": "sea snails"},
        "caption": {
            "es": "Prosobranchia (*Vorderkiemen-Schnecken*, «caracoles de branquias delanteras»): conchas de gasterópodos marinos, con la espiral y las espinas que los hacen inconfundibles.",
            "en": "Prosobranchia (*Vorderkiemen-Schnecken*, “front-gilled snails”): shells of marine gastropods, with the spiral and the spines that make them unmistakable.",
        },
        "detail": (0.28, 0.30, 0.80, 0.70),
        "detail_caption": {"es": "Un múrex con sus espinas: la concha crece por el borde de la abertura, vuelta a vuelta.", "en": "A murex with its spines: the shell grows at the lip of the aperture, whorl by whorl."},
        "ficha": {
            "es": [("Reino", "Animales"), ("Filo", "Mollusca · clase Gastropoda"), ("Especies", "65 000–80 000 vivas"), ("Hábitat", "Mar, agua dulce y tierra firme"), ("Rasgo", "Torsión del cuerpo en la larva")],
            "en": [("Kingdom", "Animals"), ("Phylum", "Mollusca · class Gastropoda"), ("Species", "65,000–80,000 living"), ("Habitat", "Sea, fresh water and land"), ("Trait", "Torsion of the body in the larva")],
        },
    },
    {
        "n": 44, "part": "sea", "kingdom": "animalia", "latin": "Ammonitida", "german": "Ammonshörner",
        "wiki": {"es": "Ammonoidea", "en": "Ammonoidea"}, "budget": 650,
        "title": {"es": "Amonites", "en": "Ammonites"},
        "common": {"es": "amonites", "en": "ammonites"},
        "caption": {
            "es": "Ammonitida (*Ammonshörner*, «cuernos de Amón»): conchas fósiles de cefalópodos extinguidos, dibujadas como si acabaran de salir del mar.",
            "en": "Ammonitida (*Ammonshörner*, “horns of Ammon”): fossil shells of extinct cephalopods, drawn as if they had just come out of the sea.",
        },
        "detail": (0.02, 0.44, 0.52, 0.86),
        "detail_caption": {"es": "Las líneas de sutura, donde los tabiques internos tocan la concha, distinguen a cada género de amonites.", "en": "The suture lines, where the inner walls meet the shell, tell each genus of ammonite apart."},
        "ficha": {
            "es": [("Reino", "Animales"), ("Filo", "Mollusca · clase Cephalopoda"), ("Estado", "Extintos"), ("Época", "Devónico–Cretácico, 410–66 millones de años"), ("Uso", "Fósiles guía para datar rocas")],
            "en": [("Kingdom", "Animals"), ("Phylum", "Mollusca · class Cephalopoda"), ("Status", "Extinct"), ("Age", "Devonian–Cretaceous, 410–66 million years"), ("Use", "Index fossils for dating rock")],
        },
    },
    {
        "n": 62, "part": "plants", "kingdom": "plantae", "latin": "Nepenthaceae", "german": "Kannenpflanzen",
        "wiki": {"es": "Nepenthes", "en": "Nepenthes"}, "budget": 650,
        "title": {"es": "Plantas jarro", "en": "Pitcher plants"},
        "common": {"es": "plantas jarro", "en": "pitcher plants"},
        "caption": {
            "es": "Nepenthaceae (*Kannenpflanzen*, «plantas de jarra»): las hojas de *Nepenthes* terminan en jarras llenas de líquido digestivo donde caen los insectos.",
            "en": "Nepenthaceae (*Kannenpflanzen*, “jug plants”): the leaves of *Nepenthes* end in pitchers full of digestive fluid into which insects fall.",
        },
        "detail": (0.12, 0.10, 0.62, 0.52),
        "detail_caption": {"es": "La jarra con su tapa: el borde resbaladizo y el néctar atraen a la presa hacia el interior.", "en": "The pitcher with its lid: the slippery rim and the nectar lure the prey inside."},
        "ficha": {
            "es": [("Reino", "Plantas"), ("Familia", "Nepenthaceae, un solo género"), ("Especies", "Unas 170"), ("Hábitat", "Trópicos del Viejo Mundo"), ("Porte", "Lianas carnívoras")],
            "en": [("Kingdom", "Plants"), ("Family", "Nepenthaceae, a single genus"), ("Species", "About 170"), ("Habitat", "Old World tropics"), ("Habit", "Carnivorous lianas")],
        },
    },
    {
        "n": 74, "part": "plants", "kingdom": "plantae", "latin": "Orchidae", "german": "Orchideen",
        "wiki": {"es": "Orchidaceae", "en": "Orchidaceae"}, "budget": 650,
        "title": {"es": "Orquídeas", "en": "Orchids"},
        "common": {"es": "orquídeas", "en": "orchids"},
        "caption": {
            "es": "Orchidae (*Orchideen*): flores de orquídeas de varios géneros, con el labelo transformado en plataforma de aterrizaje para los polinizadores.",
            "en": "Orchidae (*Orchideen*): orchid flowers of several genera, their lip turned into a landing platform for pollinators.",
        },
        "detail": (0.24, 0.28, 0.76, 0.70),
        "detail_caption": {"es": "El labelo, el pétalo modificado que da a cada orquídea su forma, guía al insecto hacia el polen.", "en": "The lip, the modified petal that gives each orchid its shape, guides the insect towards the pollen."},
        "ficha": {
            "es": [("Reino", "Plantas"), ("Familia", "Orchidaceae"), ("Especies", "Unas 25 000"), ("Hábitat", "Todos los continentes salvo la Antártida"), ("Rasgo", "Muchas son epífitas")],
            "en": [("Kingdom", "Plants"), ("Family", "Orchidaceae"), ("Species", "About 25,000"), ("Habitat", "Every continent but Antarctica"), ("Trait", "Many are epiphytes")],
        },
    },
    {
        "n": 66, "part": "wings", "kingdom": "animalia", "latin": "Arachnida", "german": "Spinnentiere",
        "wiki": {"es": "Arachnida", "en": "Arachnid"}, "budget": 650,
        "title": {"es": "Arácnidos", "en": "Arachnids"},
        "common": {"es": "arácnidos", "en": "arachnids"},
        "caption": {
            "es": "Arachnida (*Spinnentiere*): arañas de todos los continentes vistas desde arriba, con los dibujos del abdomen que Haeckel trató como ornamentos.",
            "en": "Arachnida (*Spinnentiere*): spiders from every continent seen from above, with the abdominal patterns Haeckel treated as ornaments.",
        },
        "detail": (0.28, 0.40, 0.72, 0.72),
        "detail_caption": {"es": "Cuatro pares de patas y ni una antena: el cuerpo del arácnido se divide en cefalotórax y abdomen.", "en": "Four pairs of legs and no antennae: the arachnid’s body is divided into cephalothorax and abdomen."},
        "ficha": {
            "es": [("Reino", "Animales"), ("Filo", "Arthropoda · clase Arachnida"), ("Especies", "Más de 100 000"), ("Hábitat", "Casi todos terrestres"), ("Rasgo", "Ocho patas, sin antenas ni alas")],
            "en": [("Kingdom", "Animals"), ("Phylum", "Arthropoda · class Arachnida"), ("Species", "More than 100,000"), ("Habitat", "Almost all terrestrial"), ("Trait", "Eight legs, no antennae, no wings")],
        },
    },
    {
        "n": 67, "part": "wings", "kingdom": "animalia", "latin": "Chiroptera", "german": "Fledertiere",
        "wiki": {"es": "Chiroptera", "en": "Bat"}, "budget": 650,
        "title": {"es": "Murciélagos", "en": "Bats"},
        "common": {"es": "murciélagos", "en": "bats"},
        "caption": {
            "es": "Chiroptera (*Fledertiere*): cabezas de murciélagos con sus hojas nasales y orejas, los órganos con que emiten y reciben la ecolocalización.",
            "en": "Chiroptera (*Fledertiere*): bat heads with their nose-leaves and ears, the organs with which they send and receive echolocation.",
        },
        "detail": (0.10, 0.04, 0.90, 0.40),
        "detail_caption": {"es": "El ala es una mano: cuatro dedos larguísimos tensan la membrana de vuelo.", "en": "The wing is a hand: four very long fingers stretch the flight membrane."},
        "ficha": {
            "es": [("Reino", "Animales"), ("Clase", "Mammalia · orden Chiroptera"), ("Especies", "Unas 1400"), ("Hábitat", "Todos los continentes salvo la Antártida"), ("Rasgo", "Los únicos mamíferos que vuelan")],
            "en": [("Kingdom", "Animals"), ("Class", "Mammalia · order Chiroptera"), ("Species", "About 1,400"), ("Habitat", "Every continent but Antarctica"), ("Trait", "The only mammals that fly")],
        },
    },
    {
        "n": 99, "part": "wings", "kingdom": "animalia", "latin": "Trochilidae", "german": "Kolibris",
        "wiki": {"es": "Trochilidae", "en": "Hummingbird"}, "budget": 650,
        "title": {"es": "Colibríes", "en": "Hummingbirds"},
        "common": {"es": "colibríes", "en": "hummingbirds"},
        "caption": {
            "es": "Trochilidae (*Kolibris*): colibríes americanos en pleno vuelo, la única lámina del libro con un paisaje de fondo.",
            "en": "Trochilidae (*Kolibris*): American hummingbirds in flight, the only plate in the book with a landscape behind them.",
        },
        "detail": (0.04, 0.04, 0.56, 0.50),
        "detail_caption": {"es": "El plumaje iridiscente cambia de color con la luz: no es pigmento sino la estructura de la pluma.", "en": "The iridescent plumage changes colour with the light: it is structure, not pigment."},
        "ficha": {
            "es": [("Reino", "Animales"), ("Clase", "Aves · familia Trochilidae"), ("Especies", "Unas 366"), ("Hábitat", "Solo en América"), ("Tamaño", "2–20 g")],
            "en": [("Kingdom", "Animals"), ("Class", "Aves · family Trochilidae"), ("Species", "About 366"), ("Habitat", "The Americas only"), ("Size", "2–20 g")],
        },
    },
]

INTRO_BUDGET = {"haeckel": 700, "book": 450}

COVER_BLURB = {
    "es": "Edición de muestra compuesta con Postext. Las láminas proceden de los escaneos de dominio público de la Biblioteca del Congreso de Estados Unidos y de Wikimedia Commons; los textos se han adaptado de Wikipedia y se publican bajo CC BY-SA 4.0.",
    "en": "A sample edition set with Postext. The plates come from the public-domain scans of the Library of Congress and Wikimedia Commons; the texts are adapted from Wikipedia and published under CC BY-SA 4.0.",
}

CREDITS = {
    "es": [
        "**Láminas.** Ernst Haeckel, *Kunstformen der Natur* (Leipzig y Viena, Bibliographisches Institut, 1899–1904), litografías de Adolf Giltsch. Escaneos en dominio público de la Library of Congress (colección Rare Book and Special Collections), de la Biodiversity Heritage Library y de Wikimedia Commons.",
        "**Textos.** Los ensayos de cada lámina y la introducción se han adaptado de los artículos de Wikipedia que se citan al pie de cada capítulo, publicados bajo la licencia Creative Commons Atribución-CompartirIgual 4.0. Las fichas, los pies de lámina y los títulos de las partes se escribieron para esta edición.",
        "**Tipografía.** Fraunces, de Undercase Type (Phaedra Charles y Flavia Zimbardi); Newsreader, de Production Type; Archivo, de Omnibus-Type. Las tres familias se distribuyen bajo la SIL Open Font License 1.1.",
        "**Composición.** Página de 210 × 280 mm, columna principal y columna exterior para fichas y pies laterales; portadillas de parte con paleta propia, índice dinámico, folios y titulillos generados por Postext.",
    ],
    "en": [
        "**Plates.** Ernst Haeckel, *Kunstformen der Natur* (Leipzig and Vienna, Bibliographisches Institut, 1899–1904), lithographs by Adolf Giltsch. Public-domain scans from the Library of Congress (Rare Book and Special Collections Division), the Biodiversity Heritage Library and Wikimedia Commons.",
        "**Texts.** The essay of each plate and the introduction are adapted from the Wikipedia articles cited at the foot of each chapter, published under the Creative Commons Attribution-ShareAlike 4.0 licence. The fact files, plate captions and part titles were written for this edition.",
        "**Type.** Fraunces by Undercase Type (Phaedra Charles and Flavia Zimbardi); Newsreader by Production Type; Archivo by Omnibus-Type. All three families are distributed under the SIL Open Font License 1.1.",
        "**Setting.** A 210 × 280 mm page with a main column and an outer column for fact files and side captions; part openers with their own palette, a live contents page, folios and running heads generated by Postext.",
    ],
}
