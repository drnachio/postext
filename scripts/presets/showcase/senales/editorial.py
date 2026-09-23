"""Editorial content of the `senales` magazine: wording of the two editions,
the article table (slug, section kicker, photographs) in the order of the
PDF, the curated data panels transcribed from the infographic pages, and
the credits."""
from __future__ import annotations

BOOK = {
    "es": {
        "title": "Señales 2020",
        "subtitle": "Hacia una contaminación cero en Europa",
        "series": "Agencia Europea de Medio Ambiente",
        "publisher": "Edición de muestra compuesta con Postext · Texto © AEMA, Copenhague, 2020",
        "contents": "Índice",
        "credits": "Créditos y fuentes",
        "references": "Referencias",
        "editorial": "Editorial",
        "interview": "Entrevista",
        "figure": ("Foto", "Fotos", "foto"),
        "table": ("Tabla", "Tablas", "tabla"),
        "photo_note": "Fotografía de dominio público (CC0) publicada en Unsplash y archivada en Wikimedia Commons; sustituye a la imagen de la edición original.",
        "sources_label": "Fuentes",
        "data_label": "Los datos",
        "quote_label": "",
    },
    "en": {
        "title": "Signals 2020",
        "subtitle": "Towards zero pollution in Europe",
        "series": "European Environment Agency",
        "publisher": "Sample edition set with Postext · Text © EEA, Copenhagen, 2020",
        "contents": "Contents",
        "credits": "Credits and sources",
        "references": "References",
        "editorial": "Editorial",
        "interview": "Interview",
        "figure": ("Photo", "Photos", "photo"),
        "table": ("Table", "Tables", "table"),
        "photo_note": "Public-domain photograph (CC0) published on Unsplash and archived on Wikimedia Commons; it replaces the picture of the original edition.",
        "sources_label": "Sources",
        "data_label": "The data",
        "quote_label": "",
    },
}

# Articles in PDF order: slug, section kicker, photographs (opener, inline).
ARTICLES = [
    {"slug": "editorial", "kicker": {"es": "Editorial", "en": "Editorial"}, "photos": ["cover", "editorial"], "colour": "#1f6f8b"},
    {"slug": "aire", "kicker": {"es": "Aire", "en": "Air"}, "photos": ["air-1", "air-2"], "colour": "#2a7f97"},
    {"slug": "agua", "kicker": {"es": "Agua", "en": "Water"}, "photos": ["water-1", "water-2"], "colour": "#2b6ca3"},
    {"slug": "suelo", "kicker": {"es": "Tierra y suelo", "en": "Land and soil"}, "photos": ["soil-1", "soil-2"], "colour": "#8a6a3b"},
    {"slug": "quimicos", "kicker": {"es": "Sustancias químicas", "en": "Chemicals"}, "photos": ["chemicals-1", "chemicals-2"], "colour": "#6b4c9a"},
    {"slug": "quien-contamina-paga", "kicker": {"es": "Entrevista", "en": "Interview"}, "photos": ["polluter-1", "polluter-2"], "colour": "#4a4a45"},
    {"slug": "industria", "kicker": {"es": "Industria", "en": "Industry"}, "photos": ["industry-1", "industry-2"], "colour": "#b5542a"},
    {"slug": "ruido", "kicker": {"es": "Ruido", "en": "Noise"}, "photos": ["noise-1", "noise-2"], "colour": "#c0392b"},
    {"slug": "salud", "kicker": {"es": "Entrevista", "en": "Interview"}, "photos": ["health-1", "health-2"], "colour": "#3c8a55"},
]

# Data panels transcribed from the infographic pages that the extractor
# cannot read as text (keyed by the PDF page of the English edition; the
# Spanish edition has the same pagination).
PANELS = {
    8: {  # What is pollution? — sources
        "kind": "list",
        "items": {
            "es": [
                "**El transporte** es responsable de alrededor del 45 % de las emisiones de óxidos de nitrógeno (NOx) en Europa y de una parte importante de las emisiones totales de otros contaminantes fundamentales.",
                "**El tráfico por carretera** es la fuente de ruido ambiental más habitual, con más de 100 millones de personas afectadas por niveles perjudiciales en Europa.",
                "**La producción y la distribución de energía** son la fuente principal de las emisiones de óxidos de azufre (SOx) y una fuente importante de emisiones de NOx.",
                "**El sector agrícola** es responsable de más del 90 % de las emisiones de amoniaco en Europa y de casi el 20 % de las emisiones de compuestos orgánicos volátiles distintos del metano (COVDM), como benceno y etanol.",
                "**Las prácticas agrícolas no sostenibles** contaminan el suelo, el agua, el aire y los alimentos, sobreexplotan los recursos naturales y provocan la pérdida de biodiversidad y la degradación del ecosistema.",
                "**La calefacción de los hogares** es una fuente importante de contaminación por polvo: los edificios comerciales, institucionales y residenciales son responsables del 53 % de las emisiones de partículas finas (PM2,5). Los hogares también emiten contaminantes al agua.",
                "**La producción de residuos** y su mala gestión contribuyen a contaminar el aire y afectan a los ecosistemas. Los vertederos, los vertidos ilegales y las basuras crean más riesgos, como la contaminación del suelo y las basuras marinas.",
            ],
            "en": [
                "**Transport** is responsible for around 45 % of Europe's emissions of nitrogen oxides (NOx) and a significant proportion of the total emissions of other key pollutants.",
                "**Road traffic** is the most widespread source of environmental noise, with more than 100 million people affected by harmful levels in Europe.",
                "**Energy production and distribution** are the main source of sulphur oxides (SOx) emissions and a major source of NOx emissions.",
                "**The agricultural sector** is responsible for more than 90 % of Europe's ammonia emissions and almost 20 % of emissions of non-methane volatile organic compounds (NMVOCs), such as benzene and ethanol.",
                "**Unsustainable farming practices** lead to pollution of soil, water, air and food, overexploitation of natural resources, and biodiversity loss and ecosystem degradation.",
                "**Domestic heating** is an important source of dust pollution: commercial, institutional and residential buildings account for 53 % of fine particulate matter (PM2.5) emissions. Households are also a source of pollution discharges to water.",
                "**Waste** production and poor waste management contribute to air pollution and affect ecosystems. Dump sites, illegal disposal and littering create further risks, including soil pollution and marine litter.",
            ],
        },
        "sources": {
            "es": "Visualizador de datos NEDC y visualizador de datos LRTAP; informe de la AEMA «El medio ambiente en Europa: estado y perspectivas 2020»; indicador de la AEMA sobre la exposición de la población europea al ruido.",
            "en": "NEDC data viewer and LRTAP data viewer; EEA report ‘The European environment — state and outlook 2020’; EEA indicator ‘Exposure of Europe’s population to environmental noise’.",
        },
    },
    17: {  # Air quality problems in Europe's cities — exposure table
        "kind": "table",
        "caption": {
            "es": "Proporción de la población urbana de la UE expuesta a concentraciones de contaminantes del aire por encima de los valores de referencia de la UE y la OMS en 2016-2018",
            "en": "Share of the EU urban population exposed to air pollutant concentrations above EU and WHO reference values in 2016-2018",
        },
        "header": {"es": ["Contaminante", "Valores límite/objetivo de la UE", "Directrices de la OMS"], "en": ["Pollutant", "EU limit/target values", "WHO guidelines"]},
        "rows": [
            ["PM2.5", "4-8 %", "74-78 %"],
            ["PM10", "13-17 %", "43-48 %"],
            ["O3", "12-34 %", "96-99 %"],
            ["NO2", "4-7 %", "4-7 %"],
            ["BaP", "15-20 %", "75-90 %"],
            ["SO2", "< 1 %", "19-31 %"],
        ],
        "sources": {"es": "Informe de la AEMA «Medio ambiente sano, vidas sanas».", "en": "EEA report ‘Healthy environment, healthy lives’."},
    },
    57: {  # Noise pollution — impacts
        "kind": "stats",
        "lead": {
            "es": "El 20 % de la población de la UE —una de cada cinco personas— vive en zonas en las que los niveles de ruido se consideran perjudiciales para la salud.",
            "en": "20 % of the EU population — one in five people — live in areas where noise levels are considered harmful to health.",
        },
        "stats": {
            "es": [("22 000 000", "personas con gran molestia"), ("6 500 000", "personas con gran alteración del sueño"), ("48 000", "casos de cardiopatías"), ("12 000", "muertes prematuras"), ("12 500", "niños con deterioro cognitivo")],
            "en": [("22 000 000", "people highly annoyed"), ("6 500 000", "people with high sleep disturbance"), ("48 000", "cases of heart disease"), ("12 000", "premature deaths"), ("12 500", "children with cognitive impairment")],
        },
        "sources": {"es": "Informe de la AEMA «El ruido en Europa 2020».", "en": "EEA report ‘Environmental noise in Europe — 2020’."},
    },
}

COVER_BLURB = {
    "es": "Edición de muestra compuesta con Postext a partir de «Señales de la AEMA 2020 — Hacia una contaminación cero en Europa», Agencia Europea de Medio Ambiente, Copenhague, 2020 (ISBN 978-92-9480-340-5, doi:10.2800/211427). © AEMA, 2020; se autoriza la reproducción siempre que se reconozca la fuente. Las fotografías de la edición original se han sustituido por imágenes de dominio público (CC0) de Unsplash archivadas en Wikimedia Commons; los paneles de datos se han transcrito de las infografías originales.",
    "en": "Sample edition set with Postext from ‘EEA Signals 2020 — Towards zero pollution in Europe’, European Environment Agency, Copenhagen, 2020 (ISBN 978-92-9480-267-5, doi:10.2800/40627). © EEA, 2020; reproduction is authorised provided the source is acknowledged. The photographs of the original edition have been replaced by public-domain (CC0) Unsplash pictures archived on Wikimedia Commons; the data panels are transcribed from the original infographics.",
}

CREDITS = {
    "es": [
        "**Texto.** «Señales de la AEMA 2020 — Hacia una contaminación cero en Europa», Agencia Europea de Medio Ambiente, Luxemburgo: Oficina de Publicaciones de la Unión Europea, 2020. © AEMA, Copenhague, 2020. Se autoriza la reproducción siempre que se reconozca la fuente. Los textos se han extraído del PDF oficial en español sin modificaciones, salvo la supresión de las llamadas a las referencias, que se recogen al final.",
        "**Fotografías.** Las imágenes de la edición original (fotografías del concurso REDISCOVER Nature de la AEMA y de Unsplash, con derechos reservados) se han sustituido por fotografías de dominio público (CC0) publicadas en Unsplash y archivadas en Wikimedia Commons; la lista siguiente indica autor y enlace de cada una.",
        "**Tipografía.** Open Sans (Steve Matteson) y Outfit (Rodrigo Fuenzalida), bajo la SIL Open Font License 1.1; las licencias acompañan a las fuentes en el paquete.",
    ],
    "en": [
        "**Text.** ‘EEA Signals 2020 — Towards zero pollution in Europe’, European Environment Agency, Luxembourg: Publications Office of the European Union, 2020. © EEA, Copenhagen, 2020. Reproduction is authorised provided the source is acknowledged. The texts are taken from the official English PDF unchanged, except that the reference call-outs have been removed; the references are listed at the end.",
        "**Photographs.** The pictures of the original edition (EEA REDISCOVER Nature competition entries and Unsplash photographs, rights reserved) have been replaced by public-domain (CC0) photographs published on Unsplash and archived on Wikimedia Commons; the list below gives the author and link of each.",
        "**Type.** Open Sans (Steve Matteson) and Outfit (Rodrigo Fuenzalida), under the SIL Open Font License 1.1; the licences travel with the fonts in the bundle.",
    ],
}
