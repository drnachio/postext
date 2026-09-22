"""Editorial content of the `don-quijote` showcase preset: the cover and
credits wording, the plate captions and the margin glosses, in Spanish and
English. Glosses and plates are anchored to a fragment of the paragraph they
belong to; build.py inserts them after that paragraph and fails loudly when
an anchor is not found, so the text can be re-sliced safely.

Everything here is original wording written for the preset (the glosses)
or quotes the Cervantes / Ormsby texts, both public domain.
"""
from __future__ import annotations

BOOK = {
    "es": {
        "title": "El ingenioso hidalgo don Quijote de la Mancha",
        "short": "Don Quijote de la Mancha",
        "author": "Miguel de Cervantes Saavedra",
        "edition": "Primera parte · Capítulos I a VIII",
        "illustrator": "Con las láminas de Gustave Doré",
        "part_title": "Primera parte",
        "part_subtitle": "del ingenioso hidalgo don Quijote de la Mancha",
        "prologue": "Prólogo",
        "contents": "Índice",
        "credits": "Créditos",
        "chapter_label": "Capítulo {number}",
        "part_label": "Parte {numberRoman}",
        "plate": ("Lámina", "Láminas", "lámina"),
    },
    "en": {
        "title": "The Ingenious Gentleman Don Quixote of La Mancha",
        "short": "Don Quixote of La Mancha",
        "author": "Miguel de Cervantes Saavedra",
        "edition": "Part One · Chapters I to VIII · Translated by John Ormsby",
        "illustrator": "With the plates of Gustave Doré",
        "part_title": "Part One",
        "part_subtitle": "of the ingenious gentleman Don Quixote of La Mancha",
        "prologue": "The Author’s Preface",
        "contents": "Contents",
        "credits": "Credits",
        "chapter_label": "Chapter {number}",
        "part_label": "Part {numberRoman}",
        "plate": ("Plate", "Plates", "plate"),
    },
}

# Credit line printed under every numbered plate.
PLATE_NOTE = {
    "es": "Gustave Doré, 1863; grabado por H. Pisan. Dominio público, Wikimedia Commons.",
    "en": "Gustave Doré, 1863; engraved by H. Pisan. Public domain, Wikimedia Commons.",
}

# Plates: slug → role and captions. Roles: "head" (ornament set inline at the
# chapter start), "tail" (ornament at the end), "page" (page-wide float),
# "side" (float in the outer column), "full" (page-wide plate, own page).
PLATES = {
    "prologo-head": {"role": "head"},
    "prologo-tail": {"role": "tail"},
    "c01-head": {"role": "head"},
    "c01-plate-library": {
        "role": "full",
        "anchor": {"es": "vendió muchas hanegas", "en": "sold many an acre"},
        "caption": {
            "es": "«Se le pasaban las noches leyendo de claro en claro, y los días de turbio en turbio.»",
            "en": "“A world of disorderly notions, picked out of his books, crowded into his imagination.”",
        },
    },
    "c01-tail": {
        "role": "side",
        "anchor": {"es": "Fue luego a ver su rocín", "en": "He next proceeded to inspect his hack"},
        "caption": {"es": "«Fue luego a ver su rocín.»", "en": "“He next proceeded to inspect his hack.”"},
    },
    "c02-head": {"role": "head"},
    "c02-inn": {
        "role": "page",
        "anchor": {"es": "dos mujeres mozas", "en": "two young women"},
        "caption": {
            "es": "«A la puerta de la venta estaban dos mujeres mozas.»",
            "en": "“At the door were standing two young women.”",
        },
    },
    "c02-wine": {
        "role": "side",
        "anchor": {"es": "horadara una caña", "en": "bored a reed"},
        "caption": {
            "es": "«Puesto el un cabo en la boca, por el otro le iban echando el vino.»",
            "en": "“Putting one end in his mouth, they poured the wine into him through the other.”",
        },
    },
    "c03-plate-vigil": {
        "role": "full",
        "anchor": {"es": "comenzó a pasear delante de la pila", "en": "in front of the trough"},
        "caption": {
            "es": "«Con gentil continente, se comenzó a pasear delante de la pila.»",
            "en": "“With a graceful bearing he began pacing to and fro before the trough.”",
        },
    },
    "c03-innkeeper": {
        "role": "page",
        "anchor": {"es": "en el espaldarazo", "en": "smart slap on the shoulder"},
        "caption": {
            "es": "«Diole con ella, después, un gentil espaldarazo, siempre murmurando entre dientes.»",
            "en": "“After it, with his own sword, a slap on the shoulder, all the while muttering between his teeth.”",
        },
    },
    "c03-knighted": {
        "role": "side",
        "anchor": {"es": "le ciñese la espada", "en": "gird on his sword"},
        "caption": {"es": "«Una de aquellas señoras le ciñó la espada.»", "en": "“One of the ladies girded on his sword.”"},
    },
    "c04-head": {"role": "head"},
    "c04-plate-andres": {
        "role": "full",
        "anchor": {"es": "a una encina", "en": "tied to an oak"},
        "caption": {
            "es": "«Descortés caballero, mal parece tomaros con quien defender no se puede.»",
            "en": "“Discourteous knight, it ill becomes you to assail one who cannot defend himself.”",
        },
    },
    "c04-plate-beaten": {
        "role": "full",
        "anchor": {"es": "tantos palos", "en": "belabour"},
        "caption": {
            "es": "«Llegándose a él, tomó la lanza y, después de haberla hecho pedazos, comenzó a dar tantos palos…»",
            "en": "“Coming up to him, he seized his lance, and having broken it in pieces, began to belabour him.”",
        },
    },
    "c04-fallen": {
        "role": "side",
        "anchor": {"es": "queriéndose levantar", "en": "to rise he was unable"},
        "caption": {
            "es": "«Tornó a probar si se podía levantar; pero no lo pudo conseguir.»",
            "en": "“He again tried to rise, but was unable.”",
        },
    },
    "c05-plate-neighbour": {
        "role": "full",
        "anchor": {"es": "Pedro Alonso", "en": "Pedro Alonso"},
        "caption": {
            "es": "«El labrador le puso sobre su jumento y recogió las armas.»",
            "en": "“The peasant set him on his ass and gathered up the arms.”",
        },
    },
    "c05-home": {
        "role": "page",
        "anchor": {"es": "dijo a este punto el ama", "en": "the housekeeper"},
        "caption": {
            "es": "«Abran vuestras mercedes al señor Valdovinos y al señor marqués de Mantua, que viene malferido.»",
            "en": "“Open, your worships, to Señor Baldwin and to Señor the Marquis of Mantua, who comes badly wounded.”",
        },
    },
    "c05-tail": {"role": "tail"},
    "c06-head": {"role": "head"},
    "c06-books": {
        "role": "side",
        "anchor": {"es": "al corral", "en": "the yard"},
        "caption": {"es": "«El ama los quemó aquella noche en el corral.»", "en": "“The housekeeper burned them that night in the yard.”"},
    },
    "c07-head": {"role": "head"},
    "c07-plate-sancho": {
        "role": "full",
        "anchor": {"es": "Sancho Panza", "en": "Sancho Panza"},
        "caption": {
            "es": "«Tanto le dijo, tanto le persuadió y prometió, que el pobre villano se determinó de salirse con él.»",
            "en": "“So much did he say, so much did he persuade and promise, that the poor clown made up his mind to go with him.”",
        },
    },
    "c07-tail": {"role": "tail"},
    "c08-head": {"role": "head"},
    "c08-plate-windmills": {
        "role": "full",
        "anchor": {"es": "molinos de viento", "en": "windmills"},
        "caption": {
            "es": "«Dio el viento un poco de aire en las grandes aspas, y arremetió a todo el galope de Rocinante.»",
            "en": "“A slight breeze sprang up, and the great sails began to move; at Rocinante’s fullest gallop he charged.”",
        },
    },
    "c08-plate-fallen": {
        "role": "full",
        "anchor": {"es": "no se podía menear", "en": "could not stir"},
        "caption": {
            "es": "«Acudió Sancho Panza a socorrerle, a todo el correr de su asno.»",
            "en": "“Sancho hastened to his assistance as fast as his ass could go.”",
        },
    },
    "c08-tail": {"role": "tail"},
    "x-enchantment": {"role": "cover"},
}

# Margin glosses: per section, a list of (anchor, lemma, text) per language.
# Each anchor is a fragment of the paragraph the note stands beside.
GLOSSES = {
    "prologo": {
        "es": [
            ("Desocupado lector", "Desocupado lector",
             "Cervantes se dirige a un lector ocioso, con tiempo para leer, y desde la primera línea rompe con la solemnidad de los prólogos de su tiempo."),
            ("un amigo mío, gracioso y bien entendido", "El amigo",
             "El amigo que irrumpe en el prólogo es una ficción: le sirve al autor para burlarse de la erudición postiza con que otros adornaban sus libros."),
            ("Non bene pro toto libertas venditur auro", "Non bene pro toto…",
             "«La libertad no se vende bien ni por todo el oro»: verso de las fábulas esópicas medievales, uno de los latines que el amigo aconseja «saber de memoria»."),
        ],
        "en": [
            ("Idle reader", "Idle reader",
             "Cervantes addresses a reader with time on his hands and, from the first line, breaks with the solemn prefaces of his day."),
            ("clever friend of mine", "The friend",
             "The friend who bursts into the preface is a fiction: he lets the author mock the borrowed learning other writers hung on their books."),
            ("Non bene pro toto libertas venditur auro", "Non bene pro toto…",
             "“Liberty is not well sold for all the gold there is”: a line from the medieval Aesopic fables, one of the Latin tags the friend advises learning by heart."),
        ],
    },
    "c01": {
        "es": [
            ("lanza en astillero", "Lanza en astillero",
             "La lanza guardada en su soporte de madera: señal del hidalgo que ya no va a la guerra. La «adarga» es un escudo ovalado de cuero."),
            ("Feliciano de Silva", "Feliciano de Silva",
             "Autor (1491-1554) de continuaciones del *Amadís*, cuya prosa enrevesada Cervantes parodia con «la razón de la sinrazón»."),
            ("Rocinante", "Rocinante",
             "Nombre compuesto de «rocín» y «antes»: el que antes fue rocín y ahora es el primero de los rocines del mundo."),
            ("Dulcinea del Toboso", "Dulcinea del Toboso",
             "Aldonza Lorenzo, labradora del Toboso, rebautizada con un nombre «músico y peregrino», como el de las damas de los libros de caballerías."),
        ],
        "en": [
            ("lance in the lance-rack", "Lance in the lance-rack",
             "The lance kept in its wooden rack: the mark of a gentleman who no longer rides to war. The “buckler” is a small oval leather shield."),
            ("Feliciano de Silva", "Feliciano de Silva",
             "Author (1491–1554) of sequels to *Amadis*, whose tangled prose Cervantes parodies with “the reason of the unreason”."),
            ("Rocinante", "Rocinante",
             "A name made of *rocín* (a hack) and *antes* (before): the horse that was a hack before and is now the first of all hacks in the world."),
            ("Dulcinea del Toboso", "Dulcinea del Toboso",
             "Aldonza Lorenzo, a farm girl of El Toboso, renamed with a name “musical and out of the common”, like the ladies of the books of chivalry."),
        ],
    },
    "c02": {
        "es": [
            ("Puerto Lápice", "Puerto Lápice",
             "Paso de la sierra en el camino de Toledo a Andalucía, por donde cruzaban mercaderes y arrieros: un buen lugar para aventuras."),
            ("truchuela", "Truchuela",
             "Bacalao seco y menudo, comida de viernes y de ventas pobres. Don Quijote lo toma por trucha pequeña."),
            ("Nunca fuera caballero de damas tan bien servido", "Nunca fuera caballero…",
             "Don Quijote acomoda a su llegada el comienzo del romance viejo de Lanzarote, que en el original dice «cuando de Bretaña vino»."),
        ],
        "en": [
            ("Puerto Lapice", "Puerto Lápice",
             "A pass through the hills on the road from Toledo to Andalusia, crossed by merchants and muleteers: a fine place for adventures."),
            ("troutlet", "Troutlet",
             "Small dried cod, the food of Fridays and poor inns. Don Quixote takes it for a little trout."),
            ("So served by hand of dame", "Never was a knight…",
             "Don Quixote fits his own arrival to the opening of the old ballad of Lancelot, which in the original reads “when from Brittany he came”."),
        ],
    },
    "c03": {
        "es": [
            ("velar las armas", "Velar las armas",
             "Vigilia nocturna que el aspirante a caballero pasaba junto a sus armas antes de recibir la orden: el rito que don Quijote celebra en el corral de una venta."),
            ("libro donde asentaba la paja y cebada", "El libro de la cebada",
             "El ventero oficia con el cuaderno de cuentas de la venta a modo de misal: la ceremonia caballeresca convertida en burla."),
            ("pescozada", "Pescozada y espaldarazo",
             "El golpe en el cuello y el toque de espada en los hombros con que se armaba caballero; la burla lo convierte en una paliza ritual."),
        ],
        "en": [
            ("watch his armour", "The vigil of the arms",
             "The night the aspirant spent watching over his arms before being dubbed: the rite Don Quixote keeps in an inn yard."),
            ("enter the straw and barley", "The barley book",
             "The landlord officiates with the inn’s account book for a missal: the chivalric ceremony turned into a joke."),
            ("sturdy blow on the neck", "Blow on the neck",
             "The stroke on the neck and the touch of the sword on the shoulders with which a knight was dubbed; here a ritual beating."),
        ],
    },
    "c04": {
        "es": [
            ("Andrés", "Andrés",
             "El mozo de Juan Haldudo, azotado por su amo. Reaparecerá en el capítulo XXXI para reprochar a don Quijote los males que le trajo su ayuda."),
            ("mercaderes toledanos", "Mercaderes toledanos",
             "Iban a Murcia a comprar seda: gente práctica que no ha oído hablar de Dulcinea y pide un retrato antes de confesar su hermosura."),
            ("Haldudo", "Juan Haldudo",
             "«El rico, el vecino del Quintanar»: labrador de Quintanar de la Orden, en Toledo; don Quijote le hace jurar por la orden de caballería que nunca recibió."),
        ],
        "en": [
            ("Andres", "Andrés",
             "Juan Haldudo’s lad, flogged by his master. He will return in Chapter XXXI to reproach Don Quixote for the harm his help brought him."),
            ("Toledo", "The Toledo traders",
             "Merchants on their way to Murcia to buy silk: practical men who have never heard of Dulcinea and ask for a portrait before confessing her beauty."),
            ("Haldudo", "Juan Haldudo",
             "“The Rich, of Quintanar”: a farmer of Quintanar de la Orden, in Toledo; Don Quixote makes him swear by an order of chivalry he never received."),
        ],
    },
    "c05": {
        "es": [
            ("Abindarráez", "Abindarráez",
             "Protagonista de *El Abencerraje*, novela morisca intercalada en *La Diana* de Montemayor; don Quijote cambia de romance a novela sin dejar de ser otro."),
            ("Pedro Alonso", "Pedro Alonso",
             "El labrador vecino que lo recoge: la primera de las muchas personas cuerdas que devuelven a don Quijote a su casa."),
            ("marqués de Mantua", "El marqués de Mantua",
             "Romance en que el marqués halla a su sobrino Valdovinos moribundo en el bosque; don Quijote lo recita tendido en el suelo, sin poderse mover."),
        ],
        "en": [
            ("Abindarraez", "Abindarráez",
             "The hero of *El Abencerraje*, a Moorish tale inserted in Montemayor’s *Diana*; Don Quixote moves from ballad to novel without ceasing to be someone else."),
            ("Pedro Alonso", "Pedro Alonso",
             "The neighbouring farmer who picks him up: the first of the many sane people who carry Don Quixote home."),
            ("Marquis of Mantua", "The Marquis of Mantua",
             "A ballad in which the marquis finds his nephew Baldwin dying in the forest; Don Quixote recites it stretched on the ground, unable to move."),
        ],
    },
    "c06": {
        "es": [
            ("Amadís de Gaula", "Amadís de Gaula",
             "El más célebre libro de caballerías castellano (1508), «el mejor de todos los libros que de este género se han compuesto»: el cura lo perdona."),
            ("Tirante el Blanco", "Tirante el Blanco",
             "Novela valenciana de Joanot Martorell (1490), alabada aquí por su realismo: «aquí comen los caballeros, y duermen y mueren en sus camas»."),
            ("La Galatea", "La Galatea",
             "La novela pastoril del propio Cervantes (1585): el cura declara que su autor «es más versado en desdichas que en versos» y guarda el libro."),
        ],
        "en": [
            ("Amadis of Gaul", "Amadis of Gaul",
             "The most famous Castilian book of chivalry (1508), “the best of all the books of this kind that have ever been written”: the curate spares it."),
            ("Tirante el Blanco", "Tirante el Blanco",
             "Joanot Martorell’s Valencian romance (1490), praised here for its realism: “here the knights eat and sleep, and die in their beds”."),
            ("Galatea", "The Galatea",
             "Cervantes’s own pastoral novel (1585): the curate declares its author “more versed in misfortunes than in verses” and keeps the book."),
        ],
    },
    "c07": {
        "es": [
            ("Frestón", "Frestón",
             "El sabio encantador a quien don Quijote atribuye la desaparición de su librería: la explicación mágica que salva la cordura de su mundo."),
            ("Sancho Panza", "Sancho Panza",
             "«Hombre de bien, si es que este título se puede dar al que es pobre, pero de muy poca sal en la mollera»: así entra en la historia el escudero."),
            ("ínsula", "Ínsula",
             "Isla, en la lengua de los libros de caballerías. La promesa de gobernarla es el sueño que Sancho arrastrará durante toda la novela."),
        ],
        "en": [
            ("Friston", "Frestón",
             "The enchanter to whom Don Quixote attributes the vanishing of his library: the magical explanation that keeps his world sane."),
            ("Sancho Panza", "Sancho Panza",
             "“An honest man, if indeed that title can be given to him who is poor, but with very little wit in his pate”: thus the squire enters the story."),
            ("island", "The island",
             "*Ínsula* in the language of the romances. The promise of governing one is the dream Sancho will carry through the whole novel."),
        ],
    },
    "c08": {
        "es": [
            ("Briareo", "Briareo",
             "Gigante de cien brazos de la mitología griega; don Quijote lo invoca contra las aspas de los molinos, que «vuelven» cuantas veces se quiera."),
            ("frailes de San Benito", "Los frailes de San Benito",
             "Dos benedictinos en sus mulas, con antojos de camino y quitasoles: para don Quijote, encantadores que llevan raptada a una princesa."),
            ("vizcaíno", "El vizcaíno",
             "Escudero de la señora del coche, que habla un castellano trabado; su batalla queda en suspenso al final del capítulo, con las espadas en alto."),
        ],
        "en": [
            ("Briareus", "Briareus",
             "The hundred-armed giant of Greek myth; Don Quixote invokes him against the sails of the windmills, which turn as many arms as one likes."),
            ("St. Benedict", "The Benedictine friars",
             "Two monks on their mules, with travelling spectacles and sunshades: for Don Quixote, enchanters carrying off a stolen princess."),
            ("Biscayan", "The Biscayan",
             "The squire of the lady in the coach, who speaks a broken Castilian; his battle is left suspended at the chapter’s end, swords raised."),
        ],
    },
}

COVER_BLURB = {
    "es": "Edición de muestra compuesta con Postext: las láminas de Gustave Doré (1863) acompañan el texto de la primera edición según Project Gutenberg, con glosas al margen escritas para esta edición.",
    "en": "A sample edition set with Postext: Gustave Doré’s plates (1863) accompany John Ormsby’s translation (1885) as published by Project Gutenberg, with margin glosses written for this edition.",
}

CREDITS = {
    "es": [
        "**Texto.** *El ingenioso hidalgo don Quijote de la Mancha*, de Miguel de Cervantes Saavedra (1605), según la edición electrónica de Project Gutenberg (libro n.º 2000). Obra en dominio público.",
        "**Láminas.** Grabados de Gustave Doré para *L’ingénieux hidalgo don Quichotte de la Manche* (París, Hachette, 1863), grabados en madera por Héliodore Pisan. Reproducciones tomadas de Wikimedia Commons, en dominio público.",
        "**Glosas.** Las notas al margen y los pies de lámina se escribieron para esta edición de muestra y se publican con la misma licencia que el preset (CC BY 4.0).",
        "**Tipografía.** Alegreya y Alegreya SC, de Juan Pablo del Peral (Huerta Tipográfica); Playfair Display, de Claus Eggers Sørensen. Las tres familias se distribuyen bajo la SIL Open Font License 1.1.",
        "**Composición.** Página de 155 × 235 mm, columna principal junto al lomo y columna exterior para viñetas y glosas; portadillas, índice dinámico, folios y titulillos generados por Postext.",
    ],
    "en": [
        "**Text.** *The Ingenious Gentleman Don Quixote of La Mancha*, by Miguel de Cervantes Saavedra (1605), in John Ormsby’s translation (1885), from the Project Gutenberg electronic edition (eBook no. 996). Public domain.",
        "**Plates.** Gustave Doré’s engravings for *L’ingénieux hidalgo don Quichotte de la Manche* (Paris, Hachette, 1863), cut on wood by Héliodore Pisan. Reproductions from Wikimedia Commons, public domain.",
        "**Glosses.** The margin notes and plate captions were written for this sample edition and are published under the preset’s licence (CC BY 4.0).",
        "**Type.** Alegreya and Alegreya SC by Juan Pablo del Peral (Huerta Tipográfica); Playfair Display by Claus Eggers Sørensen. All three families are distributed under the SIL Open Font License 1.1.",
        "**Setting.** A 155 × 235 mm page with the main column by the spine and an outer column for vignettes and glosses; part and chapter openers, a live table of contents, folios and running heads generated by Postext.",
    ],
}

PLATE_LIST_INTRO = {
    "es": "Láminas reproducidas, con su página en Wikimedia Commons:",
    "en": "Plates reproduced, with their Wikimedia Commons page:",
}
