"""Editorial content of the `pintura-espanola` catalogue: wording of the
book in both languages, the artists' sections with their band colours, the
commentaries written for works without a usable Wikipedia article, the
introduction and the credits."""
from __future__ import annotations

BOOK = {
    "es": {
        "title": "Pintura española",
        "subtitle": "Catorce obras maestras en colecciones de acceso abierto, del Greco a Sorolla",
        "series": "Catálogo de muestra",
        "publisher": "Postext · Catálogo de muestra · 2026",
        "intro": "Sobre este catálogo",
        "contents": "Índice",
        "credits": "Créditos y fuentes",
        "cat": ("Cat.", "Cat.", "cat."),
        "part_label": "Sección",
        "plate_note": "Imagen de dominio público (CC0) publicada por el museo en acceso abierto.",
        "museum": {
            "met": "The Metropolitan Museum of Art, Nueva York",
            "nga": "National Gallery of Art, Washington",
            "cma": "Cleveland Museum of Art",
            "msorolla": "Museo Sorolla, Madrid",
        },
        "source_wiki": "Comentario adaptado del artículo «__title__» de Wikipedia en español (revisión __revid__, CC BY-SA 4.0).",
        "source_own": "Comentario escrito para esta edición (CC BY 4.0).",
        "bio_source": "Semblanza adaptada de Wikipedia en español (CC BY-SA 4.0).",
    },
    "en": {
        "title": "Spanish Painting",
        "subtitle": "Fourteen masterpieces from open-access collections, from El Greco to Sorolla",
        "series": "Sample catalogue",
        "publisher": "Postext · Sample catalogue · 2026",
        "intro": "About this catalogue",
        "contents": "Contents",
        "credits": "Credits and sources",
        "cat": ("Cat.", "Cat.", "cat."),
        "part_label": "Section",
        "plate_note": "Public-domain image (CC0) released by the museum under its open-access programme.",
        "museum": {
            "met": "The Metropolitan Museum of Art, New York",
            "nga": "National Gallery of Art, Washington",
            "cma": "Cleveland Museum of Art",
            "msorolla": "Museo Sorolla, Madrid",
        },
        "source_wiki": "Commentary adapted from the English Wikipedia article “__title__” (revision __revid__, CC BY-SA 4.0).",
        "source_own": "Commentary written for this edition (CC BY 4.0).",
        "bio_source": "Biographical note adapted from the English Wikipedia (CC BY-SA 4.0).",
    },
}

# Sections in catalogue order: artist key → roman number, dates line and band colour
# (sampled from the works: Greco's storm sky, Ribera's shadow, Velázquez's
# oxblood, Zurbarán's ash, Murillo's ochre, Goya's grey-green, Sorolla's sea).
PARTS = [
    {"artist": "greco", "number": "I", "band": "#3d4a63", "dates": {"es": "Candía, 1541 – Toledo, 1614", "en": "Candia, 1541 – Toledo, 1614"}},
    {"artist": "ribera", "number": "II", "band": "#4a3b32", "dates": {"es": "Játiva, 1591 – Nápoles, 1652", "en": "Xàtiva, 1591 – Naples, 1652"}},
    {"artist": "velazquez", "number": "III", "band": "#6e3535", "dates": {"es": "Sevilla, 1599 – Madrid, 1660", "en": "Seville, 1599 – Madrid, 1660"}},
    {"artist": "zurbaran", "number": "IV", "band": "#55534d", "dates": {"es": "Fuente de Cantos, 1598 – Madrid, 1664", "en": "Fuente de Cantos, 1598 – Madrid, 1664"}},
    {"artist": "murillo", "number": "V", "band": "#8a6a3b", "dates": {"es": "Sevilla, 1617 – Sevilla, 1682", "en": "Seville, 1617 – Seville, 1682"}},
    {"artist": "goya", "number": "VI", "band": "#5f6b5a", "dates": {"es": "Fuendetodos, 1746 – Burdeos, 1828", "en": "Fuendetodos, 1746 – Bordeaux, 1828"}},
    {"artist": "sorolla", "number": "VII", "band": "#2f6f86", "dates": {"es": "Valencia, 1863 – Cercedilla, 1923", "en": "Valencia, 1863 – Cercedilla, 1923"}},
]

# Word budget for a Wikipedia commentary and the minimum below which the
# commentary written here is used instead.
WIKI_BUDGET = 270
WIKI_MIN_WORDS = 130
BIO_WORDS = 120

# Commentaries written for this edition (CC BY 4.0), used when the work has
# no Wikipedia article in that language or the article is too short.
OWN = {
    "zurbaran-lucia": {
        "es": [
            "Santa Lucía avanza hacia el espectador como una dama sevillana vestida de fiesta: brocado dorado, manto rojo, cuello de encaje. Solo dos objetos delatan a la mártir de Siracusa: la palma que sostiene en una mano y, en la otra, la bandeja con los dos ojos que, según la leyenda, le fueron arrancados y que la convirtieron en patrona de la vista.",
            "Zurbarán pintó decenas de santas así, de cuerpo entero y en procesión, para conventos y para el comercio con América. El fondo neutro y la luz lateral, que modela los pliegues con la rotundidad de una escultura, concentran la atención en la figura y en la serenidad de su rostro. La naturalidad con la que la santa lleva su atributo más terrible, como quien porta una fuente en un banquete, es el rasgo más inquietante y más zurbaranesco del cuadro.",
        ],
        "en": [
            "Saint Lucy steps towards us dressed like a Sevillian lady on a feast day: gold brocade, a red mantle, a lace collar. Only two objects give away the martyr of Syracuse: the palm she holds in one hand and, in the other, the dish with the two eyes that, according to legend, were torn from her and made her the patron saint of sight.",
            "Zurbarán painted dozens of such saints, full length and processional, for convents and for the trade with the Americas. The neutral ground and the raking light, which models the folds with the solidity of sculpture, focus attention on the figure and the composure of her face. The naturalness with which the saint carries her most terrible attribute, like a dish served at a banquet, is the most unsettling and the most Zurbaranesque trait of the picture.",
        ],
    },
    "zurbaran-nazaret": {
        "es": [
            "En una estancia en penumbra, Cristo niño trenza una corona de espinas y acaba de pincharse un dedo. Enfrente, la Virgen ha dejado la costura sobre el regazo y llora en silencio: comprende lo que anuncia esa gota de sangre. Nadie más asiste a la escena, salvo dos palomas y una luz que baja en diagonal desde lo alto.",
            "Zurbarán convierte un episodio devocional en una escena doméstica de gran intimidad, sostenida por un bodegón disperso: el jarro con lirios y rosas, los libros, la fruta sobre la mesa, la taza en el suelo. Cada objeto tiene su carga simbólica, pero está pintado con la misma atención que un cuadro de cocina. La composición, en dos mitades unidas por la mirada de María, es una de las más sobrias y conmovedoras del pintor extremeño; se conocen varias versiones del asunto, y esta, de hacia 1640, es la más completa.",
        ],
        "en": [
            "In a dim room the boy Christ is weaving a crown of thorns and has just pricked his finger. Across from him the Virgin has let her sewing fall into her lap and weeps in silence: she understands what that drop of blood foretells. No one else witnesses the scene but two doves and a light that falls diagonally from above.",
            "Zurbarán turns a devotional episode into a domestic scene of great intimacy, held together by a scattered still life: the jug of lilies and roses, the books, the fruit on the table, the cup on the floor. Every object carries its symbolic charge, yet each is painted with the attention of a kitchen picture. The composition, two halves joined by Mary's gaze, is among the most sober and moving of the Extremaduran painter's work; several versions of the subject are known, and this one, from about 1640, is the most complete.",
        ],
    },
    "murillo-virgen": {
        "es": [
            "Sentada sobre un banco de piedra, la Virgen sostiene al Niño de pie sobre su regazo mientras él se vuelve hacia quien mira. No hay trono, ni ángeles, ni corona: solo una madre joven de rostro andaluz, un paño blanco y un fondo de nubes que se abre en luz detrás de las figuras.",
            "Es el Murillo de la última década, el del llamado estilo vaporoso: contornos que se diluyen, carnaciones cálidas, una pincelada suelta que deja respirar la tela. Imágenes como esta, pensadas para la devoción privada de las casas sevillanas, hicieron de Murillo el pintor más copiado de Europa durante el siglo siguiente y explican la ternura, a veces malentendida como dulzura, que se asocia a su nombre.",
        ],
        "en": [
            "Seated on a stone bench, the Virgin steadies the Child standing on her lap as he turns towards the viewer. There is no throne, no angels, no crown: only a young mother with an Andalusian face, a white cloth and a background of clouds that opens into light behind the figures.",
            "This is the Murillo of the final decade, of the so-called vaporous style: contours that dissolve, warm flesh tones, a loose brush that lets the canvas breathe. Images like this one, made for private devotion in Sevillian homes, made Murillo the most copied painter in Europe during the following century and account for the tenderness, sometimes misread as sweetness, attached to his name.",
        ],
    },
    "ribera-pedro": {
        "es": [
            "San Pedro acaba de negar tres veces a Cristo y llora. Ribera lo pinta de medio cuerpo, con las manos entrelazadas y los ojos enrojecidos vueltos hacia lo alto; a su lado, las llaves del cielo descansan sobre la roca. El fondo oscuro y la luz cruda que cae sobre la frente y las manos proceden directamente de Caravaggio.",
            "El lienzo es una de las obras más tempranas que se conocen del pintor de Játiva, realizada en Roma hacia 1612–1613, antes de establecerse definitivamente en Nápoles. Ya está aquí todo lo que hará célebre a Ribera: la piel de los viejos pintada arruga a arruga, la barba de pinceladas sueltas, el dramatismo contenido de un rostro que no pide compasión, solo perdón. El Metropolitan lo adquirió en 2012.",
        ],
        "en": [
            "Saint Peter has just denied Christ three times and weeps. Ribera paints him half length, hands clasped and reddened eyes turned upwards; beside him the keys of heaven rest on the rock. The dark ground and the raw light falling on brow and hands come straight from Caravaggio.",
            "The canvas is one of the earliest known works by the painter from Xàtiva, made in Rome around 1612–1613, before he settled for good in Naples. Everything that would make Ribera famous is already here: the skin of old men painted wrinkle by wrinkle, the beard in loose strokes, the restrained drama of a face that asks not for pity but for forgiveness. The Metropolitan Museum acquired it in 2012.",
        ],
    },
    "goya-sabasa": {
        "es": [
            "María García Pérez de Castro, conocida como Sabasa García, tenía poco más de veinte años cuando Goya la retrató. La tradición cuenta que el pintor la vio en casa de su tío, el ministro Evaristo Pérez de Castro, mientras trabajaba en el retrato de este, y que pidió pintarla al momento.",
            "El resultado es uno de los retratos femeninos más directos de Goya. La joven, envuelta en un chal de gasa color crema, mira de frente sobre un fondo vacío, sin joyas ni atributos que distraigan; toda la pintura se concentra en el rostro, en los rizos oscuros y en la transparencia del tejido sobre los brazos. La factura, rápida y segura, y la ausencia de adornos anuncian el retrato moderno del siglo XIX.",
        ],
        "en": [
            "María García Pérez de Castro, known as Sabasa García, was barely in her twenties when Goya painted her. Tradition has it that the painter saw her at the house of her uncle, the minister Evaristo Pérez de Castro, while working on his portrait, and asked to paint her on the spot.",
            "The result is one of Goya's most direct portraits of a woman. The young sitter, wrapped in a shawl of cream-coloured gauze, looks straight out from an empty ground, without jewels or attributes to distract; the whole painting is concentrated in the face, the dark curls and the transparency of the fabric over her arms. The quick, assured handling and the absence of ornament announce the modern portrait of the nineteenth century.",
        ],
    },
    "goya-pontejos": {
        "en": [
            "María Ana de Pontejos y Sandoval, Marquesa de Pontejos, was painted by Goya around 1786, the year of her marriage to the brother of the Count of Floridablanca, the king's first minister. She stands full length in a garden, in a pale silk dress of the latest French fashion, a carnation in her hand and a pug at her feet.",
            "Goya, newly appointed painter to the king, adopts the format of the courtly portrait and the pastel palette of the rococo, yet the picture is already his own: the dress is painted as a cloud of grey and rose, the landscape is a mere suggestion, and the doll-like stiffness of the pose is offset by the frankness of the face. It is one of the earliest of the great society portraits that would occupy him for the next thirty years.",
        ],
    },
    "murillo-ventana": {
        "en": [
            "Two women look out of a window: a girl leans on the sill and smiles at someone in the street, while an older woman, half hidden by the shutter, covers her laugh with her veil. The window frame is the frame of the picture, and the joke, whatever it is, is shared with the viewer.",
            "Murillo's genre scenes, with their street children and market girls, were as sought after in his lifetime as his religious paintings. This one, from about 1655–1660, is among the finest: the two figures are painted with the dignity of a portrait, the light is that of a Seville afternoon, and the meaning is left open, between the innocent curiosity of the girl and the knowing amusement of her companion.",
        ],
    },
    "sorolla-paseo": {
        "es": [
            "Dos mujeres vestidas de blanco caminan por la orilla de la playa de Valencia, contra el viento, en una tarde de verano de 1909. Son Clotilde, la esposa del pintor, con sombrero, velo y sombrilla, y María, su hija mayor, que sujeta el ala del suyo. El mar ocupa el fondo entero; no hay horizonte ni cielo.",
            "Sorolla pintó el lienzo al regresar de Nueva York, donde su exposición en la Hispanic Society acababa de convertirlo en un pintor célebre en Estados Unidos. Es un cuadro de gran formato, casi cuadrado, resuelto con la rapidez de un apunte: las telas blancas, teñidas de azul, malva y amarillo por la luz reflejada, están construidas con brochazos anchos, y la arena y el agua apenas se distinguen. Nunca se vendió; quedó en la casa familiar de Madrid, hoy Museo Sorolla, como una de las imágenes más queridas del pintor.",
        ],
        "en": [
            "Two women in white walk along the shore of the beach at Valencia, into the wind, on a summer afternoon in 1909. They are Clotilde, the painter's wife, in hat, veil and parasol, and María, his eldest daughter, holding down the brim of hers. The sea fills the whole background; there is no horizon and no sky.",
            "Sorolla painted the canvas on his return from New York, where his exhibition at the Hispanic Society had just made him a celebrated painter in the United States. It is a large, almost square picture handled with the speed of a sketch: the white fabrics, tinged blue, mauve and yellow by reflected light, are built with broad strokes, and sand and water are barely told apart. It was never sold; it stayed in the family house in Madrid, now the Museo Sorolla, as one of the painter's best-loved images.",
        ],
    },
}

INTRO = {
    "es": [
        "Este catálogo reúne catorce pinturas españolas: trece conservadas en tres museos norteamericanos que han liberado sus colecciones bajo licencia CC0, el Metropolitan de Nueva York, la National Gallery de Washington y el Cleveland Museum of Art, y una del Museo Sorolla de Madrid reproducida a partir de la digitalización de dominio público de Google Art Project. Todas las imágenes pueden reutilizarse sin restricción.",
        "La selección recorre tres siglos de pintura, del Greco a Sorolla, ordenada por artistas. Cada obra ocupa una doble página: a la izquierda, la ficha y un comentario; a la derecha, la lámina a página completa. Los comentarios se han adaptado de los artículos de Wikipedia cuando existía uno dedicado a la obra, y se han escrito para esta edición en los demás casos; la fuente se indica al pie de cada texto.",
        "El catálogo es una demostración de Postext: un solo documento en Markdown genera el libro completo, con las aperturas de sección a color, las láminas flotantes, el índice y los créditos, y lo compone en español o en inglés a partir del mismo diseño.",
    ],
    "en": [
        "This catalogue gathers fourteen Spanish paintings: thirteen held by three American museums that have released their collections under a CC0 licence, the Metropolitan Museum in New York, the National Gallery in Washington and the Cleveland Museum of Art, and one from the Museo Sorolla in Madrid reproduced from the public-domain Google Art Project scan. Every image may be reused without restriction.",
        "The selection spans three centuries of painting, from El Greco to Sorolla, arranged by artist. Each work takes a double-page spread: on the left, the catalogue entry and a commentary; on the right, the full-page plate. The commentaries are adapted from Wikipedia where an article on the work exists and were written for this edition otherwise; the source is stated at the foot of each text.",
        "The catalogue is a demonstration of Postext: a single Markdown document produces the whole book, with its coloured section openers, floating plates, contents page and credits, and sets it in Spanish or English from the same design.",
    ],
}

COVER_BLURB = {
    "es": "Catálogo de muestra compuesto con Postext a partir de reproducciones de dominio público (CC0) del Metropolitan Museum of Art, la National Gallery of Art y el Cleveland Museum of Art, y de una digitalización de dominio público del Museo Sorolla (Google Art Project, Wikimedia Commons). Textos: Wikipedia (CC BY-SA 4.0) y esta edición (CC BY 4.0).",
    "en": "Sample catalogue set with Postext from public-domain (CC0) reproductions released by the Metropolitan Museum of Art, the National Gallery of Art and the Cleveland Museum of Art, and from a public-domain Museo Sorolla scan (Google Art Project, Wikimedia Commons). Texts: Wikipedia (CC BY-SA 4.0) and this edition (CC BY 4.0).",
}

CREDITS = {
    "es": [
        "**Imágenes.** Trece reproducciones son archivos publicados por los museos bajo dedicación al dominio público (Creative Commons Zero, CC0): The Metropolitan Museum of Art (Open Access), National Gallery of Art (Open Access Policy) y Cleveland Museum of Art (Open Access). La obra del Museo Sorolla procede de la digitalización de Google Art Project publicada en Wikimedia Commons como dominio público. Las obras son de dominio público por su antigüedad.",
        "**Textos.** Los comentarios señalados al pie como adaptados de Wikipedia proceden de la Wikipedia en español y se publican bajo licencia Creative Commons Atribución-CompartirIgual 4.0; la revisión consultada se indica en cada caso. Las semblanzas de las aperturas de sección se adaptan igualmente de Wikipedia. Los demás comentarios, la introducción y los créditos se han escrito para esta edición y se publican bajo CC BY 4.0.",
        "**Tipografía.** Bodoni Moda (Indestructible Type), EB Garamond (Georg Duffner y Octavio Pardo) e IBM Plex Sans Condensed (Mike Abbink, Bold Monday), todas bajo la SIL Open Font License 1.1; las licencias acompañan a las fuentes en el paquete.",
    ],
    "en": [
        "**Images.** Thirteen reproductions are files released by the museums under a public-domain dedication (Creative Commons Zero, CC0): The Metropolitan Museum of Art (Open Access), the National Gallery of Art (Open Access Policy) and the Cleveland Museum of Art (Open Access). The Museo Sorolla work comes from the Google Art Project scan published on Wikimedia Commons as public domain. The works themselves are in the public domain by age.",
        "**Texts.** The commentaries marked as adapted from Wikipedia come from the English Wikipedia and are published under the Creative Commons Attribution-ShareAlike 4.0 licence; the revision consulted is given in each case. The biographical notes on the section openers are likewise adapted from Wikipedia. The remaining commentaries, the introduction and these credits were written for this edition and are published under CC BY 4.0.",
        "**Type.** Bodoni Moda (Indestructible Type), EB Garamond (Georg Duffner and Octavio Pardo) and IBM Plex Sans Condensed (Mike Abbink, Bold Monday), all under the SIL Open Font License 1.1; the licences travel with the fonts in the bundle.",
    ],
}
