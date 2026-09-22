"""Editorial content of the `openstax-fisica` textbook preset: wording of
both editions, the converter vocabulary, the sections left out of the
sample, and the credits."""
from __future__ import annotations

BOOK = {
    "es": {
        "title": "Física universitaria",
        "subtitle": "Volumen 1 · Capítulos 1 y 2: Unidades y medidas · Vectores",
        "series": "OpenStax · Edición de muestra",
        "publisher": "Texto e imágenes: OpenStax, Rice University · CC BY 4.0",
        "contents": "Índice",
        "credits": "Créditos y licencia",
        "chapter_label": "Capítulo",
        "outline": "Esquema del capítulo",
        "objectives": "Objetivos de aprendizaje",
        "key_terms": "Términos clave",
        "figure": ("Figura", "Figuras", "fig."),
        "table": ("Tabla", "Tablas", "tabla"),
        "source_line": "Texto y figuras de *Física universitaria, volumen 1* (OpenStax, Rice University), licencia Creative Commons Atribución 4.0. Acceso gratuito en https://openstax.org/details/books/física-universitaria-volumen-1",
        "words": {"here": "aquí", "answer": "Respuesta.", "check": "Compruebe lo aprendido", "example": "Ejemplo", "note": "Nota", "link": "Enlace", "lab": "Práctica", "tips": "Consejos", "aside": "Curiosidad"},
        "skip_sections": {"review-problems", "review-additional-problems", "review-challenge", "problemas", "problemas adicionales", "problemas de desafío"},
        "book_url": "https://openstax.org/details/books/física-universitaria-volumen-1",
        "attribution": "Física universitaria, volumen 1. OpenStax, Rice University. Licencia CC BY 4.0. Acceso gratuito en openstax.org.",
    },
    "en": {
        "title": "Physics",
        "subtitle": "Chapters 1 and 2: What is Physics? · Motion in One Dimension",
        "series": "OpenStax · Sample edition",
        "publisher": "Text and figures: OpenStax, Rice University · CC BY 4.0",
        "contents": "Contents",
        "credits": "Credits and licence",
        "chapter_label": "Chapter",
        "outline": "Chapter Outline",
        "objectives": "Learning Objectives",
        "key_terms": "Key Terms",
        "figure": ("Figure", "Figures", "fig."),
        "table": ("Table", "Tables", "table"),
        "source_line": "Text and figures from *Physics* (OpenStax, Rice University), Creative Commons Attribution 4.0 licence. Free access at https://openstax.org/details/books/physics",
        "words": {"here": "here", "answer": "Answer.", "check": "Check Your Understanding", "example": "Worked Example", "note": "Note", "link": "Link", "lab": "Snap Lab", "tips": "Tips For Success", "aside": "Fun in Physics"},
        "skip_sections": {"review-problems", "test prep multiple choice", "test prep short answer", "test prep extended response", "concept items", "critical thinking", "practice problems", "performance task"},
        "book_url": "https://openstax.org/details/books/physics",
        "attribution": "Physics. OpenStax, Rice University. CC BY 4.0 licence. Free access at openstax.org.",
    },
}

SKIP_NOTES = {"os-teacher"}

COVER_BLURB = {
    "es": "Edición de muestra compuesta con Postext a partir de los capítulos 1 y 2 de *Física universitaria, volumen 1* (OpenStax, Rice University, 2021), publicados bajo licencia Creative Commons Atribución 4.0 Internacional. La versión inglesa de este preset reproduce los capítulos 1 y 2 de *Physics* (OpenStax, 2020), con la misma licencia. Se han omitido las notas para el profesorado, los recursos interactivos y los conjuntos de problemas; las fórmulas se convirtieron de MathML a LaTeX.",
    "en": "Sample edition set with Postext from chapters 1 and 2 of *Physics* (OpenStax, Rice University, 2020), published under a Creative Commons Attribution 4.0 International licence. The Spanish version of this preset reproduces chapters 1 and 2 of *Física universitaria, volumen 1* (OpenStax, 2021), under the same licence. Teacher notes, interactive resources and the problem sets are left out; the formulas were converted from MathML to LaTeX.",
}

CREDITS = {
    "es": [
        "**Texto y figuras.** *Física universitaria, volumen 1*, OpenStax, Rice University, Houston, 2021. Licencia Creative Commons Atribución 4.0 Internacional (CC BY 4.0). Atribución requerida: «Acceso gratuito en https://openstax.org/details/books/física-universitaria-volumen-1». Los créditos de cada figura figuran en su pie, tal como los publica OpenStax; las modificaciones de esta edición se limitan al diseño, a la selección de secciones y a la conversión de las fórmulas.",
        "**Fuente.** Módulos CNXML y archivos de imagen del repositorio público openstax/osbooks-fisica-universitaria-bundle en GitHub.",
        "**Tipografía.** Source Serif 4 y Source Sans 3 (Adobe, Frank Grießhammer y Paul D. Hunt), bajo la SIL Open Font License 1.1; las licencias acompañan a las fuentes en el paquete. Fórmulas compuestas con MathJax.",
    ],
    "en": [
        "**Text and figures.** *Physics*, OpenStax, Rice University, Houston, 2020. Creative Commons Attribution 4.0 International licence (CC BY 4.0). Required attribution: “Access for free at https://openstax.org/details/books/physics”. Figure credits appear in the captions as OpenStax publishes them; this edition's changes are limited to the design, the choice of sections and the conversion of the formulas.",
        "**Source.** CNXML modules and image files from the public GitHub repository openstax/osbooks-physics.",
        "**Type.** Source Serif 4 and Source Sans 3 (Adobe, Frank Grießhammer and Paul D. Hunt), under the SIL Open Font License 1.1; the licences travel with the fonts in the bundle. Formulas set with MathJax.",
    ],
}
