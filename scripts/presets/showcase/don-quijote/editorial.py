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
        "edition": "Capítulos I a XIV · Partes primera y segunda",
        "illustrator": "Con las láminas de Gustave Doré",
        # The four parts of the 1605 book: number, title and first chapter.
        "parts": [("I", "Primera parte", 1), ("II", "Segunda parte", 9)],
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
        "edition": "Chapters I to XIV · Parts One and Two · Translated by John Ormsby",
        "illustrator": "With the plates of Gustave Doré",
        "parts": [("I", "Part One", 1), ("II", "Part Two", 9)],
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
# chapter start), "tail" (ornament at the end), "sidetail" (ornament floated
# into the outer column near the end), "page" (page-wide float),
# "side" (float in the outer column), "full" (page-wide plate, own page).
PLATES = {
    "prologo-head": {"role": "head"},
    "prologo-tail": {"role": "sidetail"},
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
    "c05-tail": {
        "role": "column",
        "anchor": {"es": "algo más noche", "en": "a little later"},
        "caption": {
            "es": "«El labrador aguardó a que fuese algo más noche, porque no viesen al molido hidalgo tan mal caballero.»",
            "en": "“The peasant waited until it was a little later that the belaboured gentleman might not be seen riding in such a miserable trim.”",
        },
    },
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
    "c07-tail": {
        "role": "column",
        "anchor": {"es": "salió volando por el tejado", "en": "flying through the roof"},
        "caption": {
            "es": "«A cabo de poca pieza salió volando por el tejado, y dejó la casa llena de humo.»",
            "en": "“After a little while he made off, flying through the roof, and left the house full of smoke.”",
        },
    },
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
    "c08-tail": {
        "role": "column",
        "anchor": {"es": "ayudándole a levantar", "en": "helping him to rise"},
        "caption": {
            "es": "«Ayudándole a levantar, tornó a subir sobre Rocinante, que medio despaldado estaba.»",
            "en": "“Helping him to rise, he got him up again on Rocinante, whose shoulder was half out.”",
        },
    },
    "c09-head": {"role": "head"},
    "c09-ladies": {
        "role": "side",
        "anchor": {"es": "las señoras del coche", "en": "the ladies in the coach"},
        "caption": {
            "es": "«Las señoras del coche le pidieron con mucho encarecimiento les hiciese tan gran merced de perdonar la vida a aquel su escudero.»",
            "en": "“The ladies in the coach implored him to grant them the great grace of sparing their squire’s life.”",
        },
    },
    "c10-head": {"role": "head"},
    "c10-night": {
        "role": "column",
        "anchor": {"es": "determinaron de pasarla allí", "en": "pass the night there"},
        "caption": {
            "es": "«Faltóles el sol junto a unas chozas de unos cabreros, y así, determinaron de pasarla allí.»",
            "en": "“Daylight failed them close by the huts of some goatherds, so they determined to pass the night there.”",
        },
    },
    "c11-head": {"role": "head"},
    "c11-plate-golden-age": {
        "role": "full",
        "anchor": {"es": "Dichosa edad y siglos dichosos", "en": "Happy the age, happy the time"},
        "caption": {
            "es": "«Dichosa edad y siglos dichosos aquéllos a quien los antiguos pusieron nombre de dorados.»",
            "en": "“Happy the age, happy the time, to which the ancients gave the name of golden.”",
        },
    },
    "c11-ear": {
        "role": "side",
        "anchor": {"es": "hojas de romero", "en": "leaves of rosemary"},
        "caption": {
            "es": "«Tomando algunas hojas de romero, las mascó y las mezcló con un poco de sal, y, aplicándoselas a la oreja, se la vendó muy bien.»",
            "en": "“Gathering some leaves of rosemary, he chewed them and mixed them with a little salt, and applying them to the ear he secured them firmly with a bandage.”",
        },
    },
    "c12-head": {"role": "head"},
    "c12-tail": {
        "role": "column",
        "anchor": {"es": "entre Rocinante y su jumento", "en": "between Rocinante and his ass"},
        "caption": {
            "es": "«Sancho Panza se acomodó entre Rocinante y su jumento, y durmió, no como enamorado desfavorecido, sino como hombre molido a coces.»",
            "en": "“Sancho Panza settled himself between Rocinante and his ass, and slept, not like a lover who had been discarded, but like a man who had been soundly kicked.”",
        },
    },
    "c13-head": {"role": "head"},
    "c13-tail": {
        "role": "column",
        "anchor": {"es": "donde él mandó que le enterrasen", "en": "he was to be buried here"},
        "caption": {
            "es": "«El pie de aquella montaña es el lugar donde él mandó que le enterrasen.»",
            "en": "“The foot of that mountain is the place where he ordered them to bury him.”",
        },
    },
    "c14-funeral": {
        "role": "page",
        "anchor": {"es": "Cerraron la sepultura", "en": "They closed the grave"},
        "caption": {
            "es": "«Cerraron la sepultura con una gruesa peña, en tanto que se acababa una losa.»",
            "en": "“They closed the grave with a heavy stone until a slab was ready.”",
        },
    },
    "c14-tail": {
        "role": "column",
        "anchor": {"es": "Yace aquí de un amador", "en": "Beneath the stone before your eyes"},
        "caption": {
            "es": "«Murió a manos del rigor de una esquiva hermosa ingrata, con quien su imperio dilata la tiranía de su amor.»",
            "en": "“In death a victim to disdain. Ungrateful, cruel, coy, and fair, was she that drove him to despair.”",
        },
    },
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
    "c09": {
        "es": [
            ("Alcaná de Toledo", "El Alcaná de Toledo",
             "Calle de mercaderes junto a la catedral, donde el «segundo autor» compra los cartapacios arábigos: la historia se presenta como una traducción hallada por azar."),
            ("Cide Hamete Benengeli", "Cide Hamete Benengeli",
             "El historiador arábigo al que Cervantes atribuye desde aquí la crónica; «Benengeli» suena a «berenjena», y los moros, dice la novela, son «muy amigos de berenjenas»."),
            ("morisco aljamiado", "Morisco aljamiado",
             "Morisco que sabía castellano: el traductor a quien se paga con dos arrobas de pasas y dos hanegas de trigo por verter la historia en poco más de mes y medio."),
        ],
        "en": [
            ("Alcana of Toledo", "The Alcana of Toledo",
             "A merchants’ street by the cathedral, where the “second author” buys the Arabic pamphlets: the story presents itself as a translation found by chance."),
            ("Cid Hamete Benengeli", "Cid Hamete Benengeli",
             "The Arab historian to whom Cervantes attributes the chronicle from here on; “Benengeli” echoes *berenjena*, aubergine, of which the Moors, says the novel, are very fond."),
            ("Morisco", "The Morisco",
             "A Moor who knew Castilian: the translator paid two arrobas of raisins and two bushels of wheat to turn the history into Spanish in little more than six weeks."),
        ],
    },
    "c10": {
        "es": [
            ("Santa Hermandad", "La Santa Hermandad",
             "Tribunal y policía rural de los Reyes Católicos, que perseguía los delitos cometidos en despoblado: Sancho teme que los persiga por la batalla del vizcaíno."),
            ("bálsamo de Fierabrás", "El bálsamo de Fierabrás",
             "En el cantar del gigante Fierabrás, el bálsamo con que se embalsamó a Cristo curaba toda herida; don Quijote lo hará con aceite, vino, sal y romero en el capítulo XVII."),
            ("yelmo de Mambrino", "El yelmo de Mambrino",
             "Yelmo encantado del rey moro Mambrino, que hacía invulnerable a quien lo llevaba, en los poemas de Boiardo y Ariosto; don Quijote lo hallará en una bacía de barbero."),
        ],
        "en": [
            ("Holy Brotherhood", "The Holy Brotherhood",
             "The rural constabulary and court of the Catholic Monarchs, which pursued crimes committed in open country: Sancho fears it will come after them for the battle with the Biscayan."),
            ("balsam of Fierabras", "The balsam of Fierabras",
             "In the chanson of the giant Fierabras, the balm with which Christ was embalmed healed every wound; Don Quixote will brew it from oil, wine, salt and rosemary in Chapter XVII."),
            ("Mambrino’s helmet", "Mambrino’s helmet",
             "The enchanted helmet of the Moorish king Mambrino, which made its wearer invulnerable in the poems of Boiardo and Ariosto; Don Quixote will find it in a barber’s basin."),
        ],
    },
    "c11": {
        "es": [
            ("edad dorada", "La edad dorada",
             "El discurso de la Edad de Oro sigue a Ovidio y a Virgilio: una edad sin «tuyo» ni «mío», sin arados ni leyes, que las bellotas de los cabreros traen a la memoria del caballero."),
            ("rabel", "El rabel",
             "Instrumento pastoril de tres cuerdas, tocado con arco: con él Antonio acompaña el romance que le compuso su tío el beneficiado, en versos octosílabos asonantados."),
            ("hojas de romero", "El romero",
             "Remedio de pastores para la oreja que el vizcaíno dejó medio cortada: don Quijote, que había prometido el bálsamo de Fierabrás, se deja curar con hojas mascadas y sal."),
        ],
        "en": [
            ("golden age", "The golden age",
             "The discourse on the Golden Age follows Ovid and Virgil: an age without “mine” and “thine”, without ploughs or laws, which the goatherds’ acorns bring back to the knight’s mind."),
            ("rebeck", "The rebeck",
             "A three-stringed pastoral fiddle played with a bow: on it Antonio accompanies the ballad his uncle the prebendary composed for him, in the octosyllables of the Spanish *romance*."),
            ("leaves of rosemary", "Rosemary",
             "A goatherds’ remedy for the ear the Biscayan left half cut off: Don Quixote, who had promised the balsam of Fierabras, lets himself be treated with chewed leaves and salt."),
        ],
    },
    "c12": {
        "es": [
            ("Grisóstomo", "Grisóstomo",
             "Estudiante de Salamanca vuelto pastor por amor de Marcela: abre la novela pastoril intercalada que los cabreros cuentan y que acaba, en el capítulo XIV, en su entierro."),
            ("cris", "Cris y estil",
             "Pedro dice «cris» por eclipse y «estil» por estéril, y don Quijote lo corrige; el cabrero sigue su cuento sin darse por enterado."),
            ("Marcela", "Marcela",
             "Huérfana rica criada por su tío el cura, que se hace pastora para vivir libre; su hermosura ha llenado el campo de enamorados vestidos de pastores."),
        ],
        "en": [
            ("Chrysostom", "Chrysostom",
             "A student of Salamanca turned shepherd for love of Marcela: he opens the pastoral tale the goatherds tell, which ends, in Chapter XIV, at his burial."),
            ("cris", "Cris and estility",
             "Pedro says “cris” for eclipse and “estility” for sterility, and Don Quixote corrects him; the goatherd goes on with his story unconcerned."),
            ("Marcela", "Marcela",
             "A rich orphan brought up by her uncle the priest, who turns shepherdess to live free; her beauty has filled the countryside with suitors dressed as shepherds."),
        ],
    },
    "c13": {
        "es": [
            ("Vivaldo", "Vivaldo",
             "Uno de los caminantes que van al entierro; discreto y burlón, sonsaca a don Quijote sobre su profesión y su dama para «ver hasta dónde llegaba su locura»."),
            ("linaje", "El linaje de Dulcinea",
             "Preguntado por la alcurnia de su señora, don Quijote recorre las casas nobles de Italia, Castilla y Portugal para concluir que la del Toboso, «aunque moderna», las supera."),
            ("Lanzarote", "Lanzarote del Lago",
             "El caballero de la Tabla Redonda, amante de la reina Ginebra; don Quijote lo cita, con la dueña Quintañona, como modelo del caballero que sirve a una dama."),
        ],
        "en": [
            ("Vivaldo", "Vivaldo",
             "One of the travellers on their way to the burial; shrewd and mocking, he draws Don Quixote out about his profession and his lady “to see how far his craze went”."),
            ("lineage", "Dulcinea’s lineage",
             "Asked about his lady’s ancestry, Don Quixote runs through the noble houses of Italy, Castile and Portugal to conclude that that of El Toboso, “though modern”, surpasses them."),
            ("Lancelot", "Lancelot of the Lake",
             "The knight of the Round Table, lover of Queen Guinevere; Don Quixote cites him, with the duenna Quintañona, as the model of a knight in a lady’s service."),
        ],
    },
    "c14": {
        "es": [
            ("Canción desesperada, no te quejes", "Canción desesperada",
             "La canción de Grisóstomo es una canción petrarquista en estancias de dieciséis versos, cerrada por este envío; Cervantes la había escrito antes de la novela."),
            ("Tarquino", "Tarquino",
             "Ambrosio compara a Marcela con Tulia, la hija que pasó con su carro sobre el cadáver de su padre, Servio Tulio, para que reinara su marido Tarquino."),
            ("Yace aquí de un amador", "El epitafio",
             "Redondillas para la losa de Grisóstomo: el epitafio cierra la novela pastoril y devuelve a don Quijote a su camino, en busca de Marcela para ofrecerle su ayuda."),
        ],
        "en": [
            ("Lay of despair, grieve not", "The lay of despair",
             "Chrysostom’s song is a Petrarchan *canzone* in sixteen-line stanzas, closed by this envoi; Cervantes had written it before the novel."),
            ("Tarquin", "Tarquin",
             "Ambrosio likens Marcela to Tullia, the daughter who drove her chariot over the corpse of her father, Servius Tullius, so that her husband Tarquin might reign."),
            ("Beneath the stone before your eyes", "The epitaph",
             "Quatrains for Chrysostom’s slab: the epitaph closes the pastoral tale and sends Don Quixote back to the road, in search of Marcela to offer her his help."),
        ],
    },
}

COVER_BLURB = {
    "es": "Edición de muestra compuesta con Postext: las láminas de Gustave Doré (1863) acompañan el prólogo y los catorce capítulos de las dos primeras partes del libro de 1605, según el texto de Project Gutenberg, con glosas al margen escritas para esta edición.",
    "en": "A sample edition set with Postext: Gustave Doré’s plates (1863) accompany the preface and the fourteen chapters of the first two parts of the 1605 book, in John Ormsby’s translation (1885) as published by Project Gutenberg, with margin glosses written for this edition.",
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
