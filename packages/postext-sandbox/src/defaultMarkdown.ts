export const DEFAULT_MARKDOWN_EN = `# Postext: A Programmable Typesetter for the Web

Postext is an **open-source layout engine** designed to bring the sophistication of professional print typography to modern web development. For centuries, the world of editorial design has refined techniques for placing text, images, and annotations on a page with extraordinary precision. These techniques encompass everything from careful column balancing to meticulous orphan and widow prevention, from intelligent hyphenation to elegant footnote placement. Until now, the web has lacked a tool capable of reproducing these standards in a programmable, declarative way.

The core mission of Postext is to bridge that gap. It takes **semantic content** written in enriched Markdown and transforms it into a fully resolved layout where every element has a precise position, measured in real typographic units. This layout can then be rendered to multiple output formats, including interactive web pages and print-ready PDF documents.

## The Problem Postext Solves

### The Limitations of CSS for Editorial Layout

Modern CSS is a remarkably powerful tool for building user interfaces. Flexbox, Grid, and container queries give developers fine-grained control over how components are arranged on screen. However, CSS was designed primarily for _application layout_, not for _editorial layout_. There is a fundamental difference between the two:

- **Application layout** arranges interactive components such as buttons, forms, navigation bars, and cards within a viewport that the user can scroll
- **Editorial layout** arranges flowing text, images, tables, figures, and annotations across a series of fixed-dimension pages or columns, following strict typographic rules inherited from centuries of print tradition

CSS handles the first case brilliantly. For the second case, it falls short in critical ways:

1. **No native multi-column text flow with reflow awareness**
   - The CSS _columns_ property exists, but it cannot balance column heights intelligently
   - It cannot handle resources that span columns or float to specific positions within a column grid
   - It provides no mechanism for keeping headings together with their following paragraphs
2. **No orphan and widow prevention across columns**
   - While CSS has _orphans_ and _widows_ properties, browser support is inconsistent
   - These properties do not work across column boundaries in the way that professional typesetters expect
   - Editorial-grade prevention requires awareness of the entire page geometry, not just a single text container
3. **No integrated resource placement strategies**
   - Print layouts routinely place figures at the top of the next available column, or float them into the margin, or break them across the full width of the page
   - CSS floats are primitive compared to these strategies and cannot negotiate with surrounding text flow
4. **No footnote or margin note systems**
   - Footnotes in print appear at the bottom of the column where they are referenced, consuming space from the text area above
   - Margin notes align vertically with the paragraph that references them
   - CSS offers no mechanism for either of these

### What Existing Tools Miss

There are, of course, tools that address parts of this problem. Word processors like Microsoft Word and Google Docs handle basic pagination. Desktop publishing applications like Adobe InDesign provide complete editorial control. LaTeX is the gold standard for academic typesetting. However, none of these tools are designed for the web:

- They do not produce _responsive_ layouts that adapt to different screen sizes
- They do not integrate with modern frontend frameworks like React or Vue
- They cannot be embedded as a component within a larger web application
- Their output is static, not interactive

Postext occupies a unique position in this landscape. It is a **JavaScript library** that runs in the browser, takes Markdown as input, applies professional typographic rules, and produces a React component as output. It is designed to be embedded, configured, and extended by web developers who want publication-grade results without leaving their familiar toolchain.

## How Postext Works

### The Processing Pipeline

The Postext layout engine processes content through a carefully orchestrated pipeline. Each stage builds upon the results of the previous one, gradually transforming raw Markdown into a complete, precisely measured layout. Understanding this pipeline is key to understanding the design philosophy of the project.

#### Input Layer

The process begins with the **input layer**, where the developer provides two things:

1. **Content** in enriched Markdown format
   - The main body of text, written using standard Markdown syntax
   - Headings, paragraphs, lists, emphasis, and other inline formatting
   - Special markers that reference external resources or notes
2. **Configuration** that defines the layout rules
   - Page dimensions, margins, and DPI settings
   - Column count, gutter width, and balancing preferences
   - Typography rules for orphan prevention, widow prevention, and hyphenation
   - Resource placement strategies for images, tables, and figures
   - Reference system settings for footnotes, endnotes, and margin notes

The separation of content and configuration is deliberate and important. The same Markdown document can produce radically different layouts simply by changing the configuration. A single-column layout for mobile screens, a two-column layout for tablets, and a three-column layout for wide desktop monitors can all originate from the same source text.

#### Measurement Layer

Before the engine can decide where to place each element, it must know how much space each element occupies. This is the role of the **measurement layer**, which is built on a library called _pretext_.

The measurement challenge is significant. Text rendering is complex because the width and height of a paragraph depend on the font, the font size, the line height, the available width, the hyphenation rules, and many other factors. Traditionally, the only way to measure text accurately in a browser is to render it into the DOM and read back the computed dimensions. This approach is slow, as it triggers layout reflows that can block the main thread for hundreds of milliseconds.

Postext takes a fundamentally different approach. The _pretext_ library performs **DOM-free text measurement** using canvas font metrics and pure arithmetic. This technique is between 300 and 600 times faster than DOM-based measurement. It works by:

1. Loading font metrics from the canvas API
   - Glyph widths and advance metrics
   - Ascender and descender measurements
   - Kerning pair adjustments when available
2. Computing line breaks using the Knuth-Plass algorithm
   - Evaluating all possible break points in a paragraph
   - Choosing the set of breaks that minimizes a penalty function
   - Accounting for hyphenation opportunities
3. Calculating the resulting block dimensions
   - Total height including all lines and inter-line spacing
   - Maximum line width for alignment purposes
   - Baseline positions for grid alignment

This measurement approach is the critical innovation that makes Postext practical. Without it, the engine would need to perform thousands of DOM reflows during layout computation, making interactive editing impossible.

#### Layout Engine

The **layout engine** is the heart of Postext. It takes the measured elements and arranges them on pages and columns according to the configured rules. This is where the editorial intelligence lives.

The layout engine operates iteratively. It makes an initial placement pass and then refines the result through successive iterations, adjusting element positions to satisfy constraints that may conflict with each other. For example:

- A heading must stay with its following paragraph, which might require moving both to the next column
- Moving content to the next column might create a widow in the current column
- Eliminating that widow might require pulling content back, which could break the heading-paragraph constraint

These circular dependencies are resolved through a **convergence loop** that runs up to five iterations. In practice, most layouts converge within two or three iterations. The engine detects when no further improvements can be made and stops early.

The layout engine produces a data structure that describes the exact position and dimensions of every element on every page. This structure is format-agnostic, meaning it contains pure geometry without any rendering-specific information.

#### Output Layer

The final stage is the **output layer**, which takes the abstract geometry and renders it to a specific format:

- **Web renderer** produces HTML elements with precise CSS positioning
   - Each element is absolutely positioned within its page container
   - Text is rendered with exact font sizes, line heights, and baseline positions
   - The result is a React component that can be embedded in any web application
- **PDF renderer** produces print-ready documents
   - Uses the same geometry data as the web renderer
   - Generates vector-based output suitable for professional printing
   - Preserves all typographic details including exact character positions

## Typography Features

### Orphan and Widow Prevention

In professional typography, an **orphan** is a single line of a paragraph that appears alone at the top of a column or page, separated from the rest of its paragraph. A **widow** is a single line that appears alone at the bottom of a column or page. Both are considered serious typographic flaws because they disrupt the visual rhythm of the text and make it harder for readers to maintain their flow.

Postext provides configurable orphan and widow prevention:

- The _orphans_ setting specifies the minimum number of lines that must appear at the beginning of a paragraph before a column break
- The _widows_ setting specifies the minimum number of lines that must appear at the end of a paragraph after a column break
- The engine will adjust column breaks, move content between columns, and even modify line breaks within paragraphs to satisfy these constraints
- When constraints conflict, the engine uses a priority system to determine which rule takes precedence

### Hyphenation and Rag Optimization

**Hyphenation** is the practice of breaking words at syllable boundaries when they fall at the end of a line. Proper hyphenation improves the evenness of line lengths and reduces the visual disturbance caused by large gaps between words in justified text.

Postext supports hyphenation through configurable dictionaries:

- Language-specific hyphenation patterns that define valid break points within words
- Minimum character counts before and after the hyphen to prevent awkward breaks
- Maximum consecutive hyphenated lines to avoid a distracting staircase effect on the right margin
- Hyphenation penalty values that influence the Knuth-Plass algorithm when choosing between a hyphenated break and a looser line

**Rag optimization** refers to the smoothing of the right edge of left-aligned text, which is called the _rag_. An unoptimized rag can appear jagged, with short lines followed by long lines in an erratic pattern. Postext optimizes the rag by:

1. Evaluating the visual quality of the right margin across multiple lines
2. Adjusting word spacing within acceptable limits
3. Choosing break points that produce a gradually varying rag rather than an abrupt one
4. Considering hyphenation as a tool for rag smoothing, not just line fitting

### Spacing and Rhythm

Vertical spacing in editorial typography follows strict rules that maintain the visual rhythm of the page. Postext enforces these rules through its configuration system:

- **Heading spacing** controls the distance above and below headings of each level
   - Larger headings receive more space above them to visually separate them from the preceding section
   - The space below a heading is smaller than the space above it, creating a visual connection between the heading and its content
- **Paragraph spacing** can be configured as either indentation or vertical gaps
   - Traditional book typography uses first-line indentation with no vertical gap between paragraphs
   - Modern digital typography often uses vertical gaps with no indentation
   - Postext supports both approaches and allows mixing them
- **List spacing** controls the distance between list items and between nested levels
   - Items within a list can be tightly or loosely spaced
   - Nested lists can have additional indentation and different bullet styles at each level
- **Baseline grid alignment** snaps text to a regular vertical grid
   - This ensures that text in adjacent columns aligns horizontally
   - It creates a sense of order and stability across the entire page
   - Elements that break the grid, such as headings with larger font sizes, can be configured to realign to the grid afterward

## Column-Based Layouts

### Multi-Column Text Flow

One of the most distinctive features of editorial layout is the use of multiple columns. Columns serve several purposes in professional typography:

- They keep line lengths within the optimal range for reading comfort, which is generally considered to be between 45 and 75 characters per line
- They allow more text to appear on a single page without requiring an uncomfortably small font size
- They create visual variety and structure on the page
- They provide opportunities for sophisticated resource placement

Postext supports flexible multi-column configurations:

1. **Column count** can be set to any positive integer
   - Single-column layouts for narrow viewports or focused reading
   - Two-column layouts for articles and essays
   - Three or more columns for newsletters, magazines, and reference materials
2. **Gutter width** controls the space between columns
   - Wider gutters make columns feel more independent
   - Narrower gutters allow more text per page but require a visual separator
3. **Column rules** are optional vertical lines drawn between columns
   - Their weight, style, and color are configurable
   - They help readers distinguish between columns when gutters are narrow
4. **Column spanning** allows certain elements to break the column grid
   - A heading might span two of three columns
   - A figure might span the full width of the page
   - A pull quote might float across the gutter between two columns

### Column Balancing

When text flows through multiple columns, the columns often end at different heights. The last column on a page might contain only a few lines while the others are full. This looks unfinished and unprofessional.

**Column balancing** is the process of distributing text evenly across columns so that they end at approximately the same height. This is a surprisingly difficult computational problem because:

- Moving text between columns changes line breaks, which changes the height of each column
- Figures and other non-text elements have fixed heights that cannot be split
- Footnotes associated with text in a column must appear at the bottom of that same column, consuming space
- Orphan and widow constraints may prevent certain distributions

Postext approaches column balancing through iterative refinement:

1. First, it fills columns sequentially to establish a baseline distribution
2. Then, it calculates the ideal column height by dividing the total content height by the number of columns
3. It redistributes content to approach this ideal height, respecting all constraints
4. It repeats the redistribution until the column heights converge or the maximum iteration count is reached

### Mixed Column Structures

Not all content on a page needs to follow the same column structure. A common pattern in editorial design is to begin a section with a full-width introductory paragraph, then transition to a multi-column layout for the body text. Another pattern places a wide image or table across the full width of the page, interrupting the multi-column flow and resuming it below.

Postext supports these mixed structures through **section overrides**:

- Each section of a document can specify its own column configuration
- Transitions between section types are handled automatically
- The engine manages the vertical space consumed by each section and ensures that content flows correctly from one to the next

## Resource Placement

### Placement Strategies

In editorial design, resources such as images, tables, figures, and pull quotes are not simply inserted inline at the point where they are referenced. Instead, they are placed according to strategies that optimize the visual quality of the page and the readability of the surrounding text.

Postext supports several placement strategies:

- **Top of column** places the resource at the top of the current or next available column
   - This is the most common strategy in academic and professional publishing
   - The resource is anchored to the top of the column, and text flows below it
   - If the resource is too tall for the remaining space, it is deferred to the next column
- **Inline** places the resource at the exact point where it is referenced in the text
   - The text flow is interrupted, the resource is inserted, and the text resumes below
   - This is the simplest strategy but can lead to awkward page breaks if the resource falls near the bottom of a column
- **Float left and float right** place the resource at the left or right edge of the column
   - Text wraps around the resource, flowing to the opposite side
   - The resource can be configured to extend into the gutter or margin
   - Multiple floats can coexist in the same column if there is sufficient space
- **Full-width break** interrupts the column layout entirely
   - The resource spans the full width of the page
   - All columns above and below the resource are synchronized
   - This is commonly used for large images, wide tables, or section dividers
- **Margin** places the resource in the page margin
   - The resource is aligned vertically with the paragraph that references it
   - This is used for small illustrations, icons, or supplementary annotations

### Aspect Ratio and Sizing

When placing resources, Postext preserves aspect ratios and provides multiple sizing options:

1. **Natural size** uses the intrinsic dimensions of the resource
2. **Column width** scales the resource to fill the width of a single column
3. **Span width** scales the resource to span a specified number of columns including gutters
4. **Full width** scales the resource to fill the entire text area
5. **Custom dimensions** allow the developer to specify exact width and height values

The engine ensures that resources never overflow their containers and adjusts surrounding text flow to accommodate the final dimensions.

## Reference Systems

### Footnotes

Footnotes are one of the most complex features in editorial typography. A footnote must appear at the bottom of the column where it is referenced, and the space it occupies must be subtracted from the available text area in that column. This creates a feedback loop:

- Adding a footnote to a column reduces the available text space
- Reducing the text space might push the footnote reference to the next column
- If the reference moves, the footnote must move with it, changing the text space in both columns

Postext handles this complexity through its convergence loop. The engine places footnotes tentatively, checks whether their references are still on the same column, and adjusts positions iteratively until everything settles.

Footnote configuration includes:

- **Marker style** determines how footnotes are numbered or symbolized
   - Superscript numbers are the most common choice
   - Symbols such as asterisks, daggers, and double daggers are traditional in some contexts
   - Custom marker sequences can be defined for specialized applications
- **Separator** is the horizontal rule drawn between the text area and the footnote area
   - Its width, style, and spacing are configurable
- **Font size** for footnote text is typically smaller than the body text
   - The size, line height, and spacing are independently configurable

### Endnotes

Unlike footnotes, endnotes are collected and displayed at the end of a section or at the end of the entire document. They are simpler to implement because they do not compete for space with the body text in the same column. However, they still require careful numbering and cross-referencing.

Postext supports both per-section and per-document endnote collection:

- **Per-section endnotes** appear at the end of each major section, making them easier for readers to find
- **Per-document endnotes** are gathered at the very end, following the traditional academic convention
- The numbering can restart at each section or continue sequentially through the entire document

### Margin Notes

Margin notes are brief annotations that appear in the page margin, aligned vertically with the paragraph that references them. They are commonly used in textbooks, technical manuals, and annotated editions to provide supplementary context without interrupting the main text flow.

Postext places margin notes with the following considerations:

- The note is vertically aligned with the start of the referencing paragraph
- If multiple notes reference paragraphs that are close together, the notes are stacked with appropriate spacing to avoid overlap
- The available margin width determines the maximum width of the note text
- Margin notes can appear on the left margin, the right margin, or alternate between the two on facing pages

## Configuration and Customization

### The Configuration Object

Every aspect of the Postext layout can be controlled through a single, comprehensive configuration object. This object is deeply structured, with nested sections for each area of concern:

- **Page configuration**
   - Width and height in real units, such as centimeters, millimeters, inches, or points
   - Margins for each side of the page, independently configurable
   - DPI setting that controls the resolution for pixel-based calculations
   - Background color for the page surface
   - Cut lines for print production
   - Baseline grid settings including line height and grid color
- **Column configuration**
   - Number of columns per page or section
   - Gutter width between columns
   - Column rule appearance and visibility
   - Balancing behavior and tolerance
- **Typography configuration**
   - Orphan and widow minimum line counts
   - Hyphenation language, minimum characters, and maximum consecutive hyphens
   - Paragraph spacing mode, whether indentation or vertical gaps
   - Heading spacing above and below each level
   - Keep-together rules that prevent page breaks between related elements
- **Resource placement configuration**
   - Default placement strategy for each resource type
   - Sizing behavior and maximum dimensions
   - Spacing around placed resources
- **Reference configuration**
   - Footnote marker style and separator appearance
   - Endnote collection mode and numbering
   - Margin note positioning and width

### Section Overrides

For documents with varied layouts, Postext allows **section-level overrides** that change the configuration for specific parts of the document:

1. A title page might use a single column with large margins
2. The main body might use two columns with standard margins
3. An appendix might use three narrow columns with minimal margins
4. A full-page image section might have no columns and no margins

Each section override specifies which configuration values to change. Unspecified values inherit from the base configuration. This layered approach keeps configuration manageable even for complex documents.

### Preset Sizes

Postext includes a set of **preset page sizes** that correspond to common book and document formats:

- **11 x 17 cm** for small paperback books and pocket guides
- **12 x 19 cm** for standard fiction paperbacks
- **17 x 24 cm** for textbooks and technical manuals
- **21 x 28 cm** for large-format publications and magazines
- **Custom** dimensions for any non-standard format

Each preset automatically sets the width and height, but the developer can override individual dimensions or switch to fully custom values at any time.

## Project Vision and Roadmap

### A Foundation for Editorial Web Content

Postext is not intended to replace CSS for application layout. It is a specialized tool for a specific and underserved need, namely the presentation of long-form, structured content with the visual quality that readers expect from professionally produced publications. The project aims to make this level of quality accessible to web developers without requiring expertise in traditional typesetting.

The long-term vision includes:

- **Responsive editorial layouts** that adapt intelligently to different screen sizes, not by simply reflowing text into a single column, but by choosing appropriate column counts, margin sizes, and resource placement strategies for each viewport
- **Collaborative editing** where authors write content in Markdown and designers configure layout rules, each working in their area of expertise
- **Accessible output** that preserves semantic structure and supports screen readers, keyboard navigation, and high-contrast modes
- **Print and digital parity** where the same content and configuration produce visually consistent results in both web and PDF formats

### Development Phases

The development of Postext is organized into four major phases:

1. **Foundation**
   - Core data structures and type system
   - Markdown parser with resource and note extensions
   - Basic single-column layout with measurement
   - Default configuration and preset system
2. **Editorial Layout**
   - Multi-column text flow with intelligent reflow
   - Column balancing with constraint satisfaction
   - Resource placement with all supported strategies
   - Orphan and widow prevention across columns and pages
3. **Professional Typography**
   - Hyphenation with language-specific dictionaries
   - Rag optimization for left-aligned text
   - Footnote, endnote, and margin note systems
   - Advanced spacing rules and baseline grid alignment
   - Pull quotes, drop caps, and decorative elements
4. **Output and Integration**
   - Web renderer with precise CSS positioning
   - PDF renderer for print production
   - Interactive sandbox for experimentation and learning
   - Plugin system for custom renderers and extensions
   - Documentation, tutorials, and example projects

### Contributing to the Project

Postext is an open-source project that welcomes contributions from developers, designers, and typographers. There are many ways to get involved:

- **Report issues** when you encounter bugs or unexpected behavior
- **Suggest features** that would make the engine more useful for your needs
- **Contribute code** by picking up an open issue and submitting a pull request
- **Improve documentation** by writing tutorials, examples, or explanations
- **Share your layouts** to demonstrate what Postext can do and inspire others

The project is maintained with a commitment to quality, clarity, and respect for the long tradition of typographic craftsmanship that it seeks to bring to the web.
`;

export const DEFAULT_MARKDOWN_ES = `# Postext: Un Tipografo Programable para la Web

Postext es un **motor de maquetacion de codigo abierto** disenado para llevar la sofisticacion de la tipografia profesional de imprenta al desarrollo web moderno. Durante siglos, el mundo del diseno editorial ha perfeccionado tecnicas para colocar texto, imagenes y anotaciones en una pagina con extraordinaria precision. Estas tecnicas abarcan desde el cuidadoso equilibrio de columnas hasta la meticulosa prevencion de huerfanas y viudas, desde la separacion silabica inteligente hasta la elegante colocacion de notas al pie. Hasta ahora, la web no ha contado con una herramienta capaz de reproducir estos estandares de manera programable y declarativa.

La mision fundamental de Postext es cerrar esa brecha. Toma **contenido semantico** escrito en Markdown enriquecido y lo transforma en una maquetacion completamente resuelta donde cada elemento tiene una posicion precisa, medida en unidades tipograficas reales. Esta maquetacion puede entonces renderizarse en multiples formatos de salida, incluyendo paginas web interactivas y documentos PDF listos para impresion.

## El Problema que Postext Resuelve

### Las Limitaciones de CSS para la Maquetacion Editorial

El CSS moderno es una herramienta extraordinariamente potente para construir interfaces de usuario. Flexbox, Grid y las consultas de contenedor otorgan a los desarrolladores un control detallado sobre como se disponen los componentes en pantalla. Sin embargo, CSS fue disenado principalmente para _maquetacion de aplicaciones_, no para _maquetacion editorial_. Existe una diferencia fundamental entre ambas:

- **La maquetacion de aplicaciones** organiza componentes interactivos como botones, formularios, barras de navegacion y tarjetas dentro de un viewport por el que el usuario puede desplazarse
- **La maquetacion editorial** organiza texto fluido, imagenes, tablas, figuras y anotaciones a lo largo de una serie de paginas o columnas de dimensiones fijas, siguiendo reglas tipograficas estrictas heredadas de siglos de tradicion impresa

CSS maneja el primer caso de forma brillante. Para el segundo, se queda corto en aspectos criticos:

1. **Sin flujo de texto multicolumna nativo con conciencia de reflow**
   - La propiedad CSS _columns_ existe, pero no puede equilibrar la altura de las columnas de forma inteligente
   - No puede manejar recursos que abarquen columnas o floten a posiciones especificas dentro de una cuadricula de columnas
   - No proporciona un mecanismo para mantener los encabezados junto con sus parrafos siguientes
2. **Sin prevencion de huerfanas y viudas entre columnas**
   - Aunque CSS tiene las propiedades _orphans_ y _widows_, el soporte en navegadores es inconsistente
   - Estas propiedades no funcionan a traves de los limites de las columnas de la manera que los tipografos profesionales esperan
   - La prevencion de grado editorial requiere conocimiento de la geometria completa de la pagina, no solo de un unico contenedor de texto
3. **Sin estrategias integradas de colocacion de recursos**
   - Las maquetaciones impresas colocan rutinariamente figuras en la parte superior de la siguiente columna disponible, o las flotan en el margen, o las rompen a lo largo del ancho completo de la pagina
   - Los floats de CSS son primitivos comparados con estas estrategias y no pueden negociar con el flujo de texto circundante
4. **Sin sistemas de notas al pie ni notas marginales**
   - Las notas al pie en imprenta aparecen en la parte inferior de la columna donde se referencian, consumiendo espacio del area de texto superior
   - Las notas marginales se alinean verticalmente con el parrafo que las referencia
   - CSS no ofrece ningun mecanismo para ninguna de las dos

### Lo que las Herramientas Existentes no Cubren

Existen, por supuesto, herramientas que abordan partes de este problema. Los procesadores de texto como Microsoft Word y Google Docs manejan la paginacion basica. Las aplicaciones de autoedicion como Adobe InDesign proporcionan control editorial completo. LaTeX es el estandar de referencia para la composicion tipografica academica. Sin embargo, ninguna de estas herramientas esta disenada para la web:

- No producen maquetaciones _responsivas_ que se adapten a diferentes tamanos de pantalla
- No se integran con frameworks frontend modernos como React o Vue
- No pueden incrustarse como un componente dentro de una aplicacion web mas grande
- Su salida es estatica, no interactiva

Postext ocupa una posicion unica en este panorama. Es una **biblioteca JavaScript** que se ejecuta en el navegador, toma Markdown como entrada, aplica reglas tipograficas profesionales y produce un componente React como salida. Esta disenada para ser incrustada, configurada y extendida por desarrolladores web que desean resultados de calidad editorial sin abandonar su cadena de herramientas habitual.

## Como Funciona Postext

### El Pipeline de Procesamiento

El motor de maquetacion de Postext procesa el contenido a traves de un pipeline cuidadosamente orquestado. Cada etapa se construye sobre los resultados de la anterior, transformando gradualmente el Markdown sin procesar en una maquetacion completa y medida con precision. Comprender este pipeline es clave para entender la filosofia de diseno del proyecto.

#### Capa de Entrada

El proceso comienza con la **capa de entrada**, donde el desarrollador proporciona dos cosas:

1. **Contenido** en formato Markdown enriquecido
   - El cuerpo principal del texto, escrito usando la sintaxis estandar de Markdown
   - Encabezados, parrafos, listas, enfasis y otro formato en linea
   - Marcadores especiales que referencian recursos externos o notas
2. **Configuracion** que define las reglas de maquetacion
   - Dimensiones de la pagina, margenes y ajustes de DPI
   - Cantidad de columnas, ancho de medianil y preferencias de equilibrio
   - Reglas tipograficas para prevencion de huerfanas, prevencion de viudas e hifenacion
   - Estrategias de colocacion de recursos para imagenes, tablas y figuras
   - Configuracion del sistema de referencias para notas al pie, notas finales y notas marginales

La separacion entre contenido y configuracion es deliberada e importante. El mismo documento Markdown puede producir maquetaciones radicalmente diferentes simplemente cambiando la configuracion. Una maquetacion de una sola columna para pantallas moviles, una maquetacion de dos columnas para tablets y una maquetacion de tres columnas para monitores de escritorio amplios pueden originarse del mismo texto fuente.

#### Capa de Medicion

Antes de que el motor pueda decidir donde colocar cada elemento, debe saber cuanto espacio ocupa cada uno. Este es el papel de la **capa de medicion**, que esta construida sobre una biblioteca llamada _pretext_.

El desafio de la medicion es significativo. La renderizacion de texto es compleja porque el ancho y la altura de un parrafo dependen de la fuente, el tamano de la fuente, la altura de linea, el ancho disponible, las reglas de hifenacion y muchos otros factores. Tradicionalmente, la unica forma de medir texto con precision en un navegador es renderizarlo en el DOM y leer las dimensiones calculadas. Este enfoque es lento, ya que desencadena reflows de maquetacion que pueden bloquear el hilo principal durante cientos de milisegundos.

Postext adopta un enfoque fundamentalmente diferente. La biblioteca _pretext_ realiza **medicion de texto sin DOM** utilizando metricas tipograficas del canvas y aritmetica pura. Esta tecnica es entre 300 y 600 veces mas rapida que la medicion basada en DOM. Funciona de la siguiente manera:

1. Cargando metricas tipograficas desde la API del canvas
   - Anchos de glifos y metricas de avance
   - Mediciones de ascendentes y descendentes
   - Ajustes de pares de kerning cuando estan disponibles
2. Calculando los saltos de linea mediante el algoritmo de Knuth-Plass
   - Evaluando todos los posibles puntos de quiebre en un parrafo
   - Eligiendo el conjunto de quiebres que minimiza una funcion de penalizacion
   - Teniendo en cuenta las oportunidades de hifenacion
3. Calculando las dimensiones del bloque resultante
   - Altura total incluyendo todas las lineas y el espaciado interlineal
   - Ancho maximo de linea para propositos de alineacion
   - Posiciones de linea base para la alineacion con la cuadricula

Este enfoque de medicion es la innovacion critica que hace que Postext sea practico. Sin el, el motor necesitaria realizar miles de reflows del DOM durante el calculo de la maquetacion, haciendo imposible la edicion interactiva.

#### Motor de Maquetacion

El **motor de maquetacion** es el corazon de Postext. Toma los elementos medidos y los dispone en paginas y columnas de acuerdo con las reglas configuradas. Aqui es donde reside la inteligencia editorial.

El motor de maquetacion opera de forma iterativa. Realiza una pasada inicial de colocacion y luego refina el resultado a traves de iteraciones sucesivas, ajustando las posiciones de los elementos para satisfacer restricciones que pueden entrar en conflicto entre si. Por ejemplo:

- Un encabezado debe mantenerse junto con su parrafo siguiente, lo que podria requerir mover ambos a la siguiente columna
- Mover contenido a la siguiente columna podria crear una viuda en la columna actual
- Eliminar esa viuda podria requerir traer contenido de vuelta, lo que podria romper la restriccion encabezado-parrafo

Estas dependencias circulares se resuelven mediante un **bucle de convergencia** que ejecuta hasta cinco iteraciones. En la practica, la mayoria de las maquetaciones convergen en dos o tres iteraciones. El motor detecta cuando no se pueden realizar mas mejoras y se detiene anticipadamente.

El motor de maquetacion produce una estructura de datos que describe la posicion exacta y las dimensiones de cada elemento en cada pagina. Esta estructura es independiente del formato, lo que significa que contiene geometria pura sin informacion especifica de renderizacion.

#### Capa de Salida

La etapa final es la **capa de salida**, que toma la geometria abstracta y la renderiza en un formato especifico:

- **Renderizador web** produce elementos HTML con posicionamiento CSS preciso
   - Cada elemento se posiciona de forma absoluta dentro de su contenedor de pagina
   - El texto se renderiza con tamanos de fuente, alturas de linea y posiciones de linea base exactos
   - El resultado es un componente React que puede incrustarse en cualquier aplicacion web
- **Renderizador PDF** produce documentos listos para imprimir
   - Utiliza los mismos datos geometricos que el renderizador web
   - Genera salida basada en vectores adecuada para la impresion profesional
   - Preserva todos los detalles tipograficos incluyendo las posiciones exactas de los caracteres

## Caracteristicas Tipograficas

### Prevencion de Huerfanas y Viudas

En la tipografia profesional, una **huerfana** es una sola linea de un parrafo que aparece aislada en la parte superior de una columna o pagina, separada del resto de su parrafo. Una **viuda** es una sola linea que aparece aislada en la parte inferior de una columna o pagina. Ambas se consideran defectos tipograficos graves porque interrumpen el ritmo visual del texto y dificultan que los lectores mantengan su fluidez de lectura.

Postext proporciona prevencion configurable de huerfanas y viudas:

- El ajuste de _orphans_ especifica el numero minimo de lineas que deben aparecer al comienzo de un parrafo antes de un salto de columna
- El ajuste de _widows_ especifica el numero minimo de lineas que deben aparecer al final de un parrafo despues de un salto de columna
- El motor ajustara los saltos de columna, movera contenido entre columnas e incluso modificara los saltos de linea dentro de los parrafos para satisfacer estas restricciones
- Cuando las restricciones entran en conflicto, el motor utiliza un sistema de prioridades para determinar que regla tiene precedencia

### Hifenacion y Optimizacion del Margen

La **hifenacion** es la practica de dividir palabras en los limites silabicos cuando caen al final de una linea. Una hifenacion adecuada mejora la uniformidad de las longitudes de linea y reduce la perturbacion visual causada por grandes espacios entre palabras en el texto justificado.

Postext soporta la hifenacion a traves de diccionarios configurables:

- Patrones de hifenacion especificos por idioma que definen los puntos de quiebre validos dentro de las palabras
- Conteos minimos de caracteres antes y despues del guion para prevenir quiebres inconvenientes
- Maximo de lineas hifenadas consecutivas para evitar un efecto de escalera que distraiga en el margen derecho
- Valores de penalizacion de hifenacion que influyen en el algoritmo de Knuth-Plass al elegir entre un quiebre hifenado y una linea mas holgada

La **optimizacion del margen derecho** se refiere al suavizado del borde derecho del texto alineado a la izquierda, que se denomina _rag_. Un margen derecho sin optimizar puede parecer irregular, con lineas cortas seguidas de lineas largas en un patron erratico. Postext optimiza el margen derecho mediante:

1. Evaluacion de la calidad visual del margen derecho a lo largo de multiples lineas
2. Ajuste del espaciado entre palabras dentro de limites aceptables
3. Eleccion de puntos de quiebre que produzcan un margen derecho que varie gradualmente en lugar de uno abrupto
4. Consideracion de la hifenacion como herramienta para suavizar el margen derecho, no solo para ajustar lineas

### Espaciado y Ritmo

El espaciado vertical en la tipografia editorial sigue reglas estrictas que mantienen el ritmo visual de la pagina. Postext aplica estas reglas a traves de su sistema de configuracion:

- **Espaciado de encabezados** controla la distancia por encima y por debajo de los encabezados de cada nivel
   - Los encabezados mas grandes reciben mas espacio por encima para separarlos visualmente de la seccion anterior
   - El espacio debajo de un encabezado es menor que el espacio por encima, creando una conexion visual entre el encabezado y su contenido
- **Espaciado de parrafos** puede configurarse como sangria o como espacios verticales
   - La tipografia de libros tradicional utiliza sangria de primera linea sin espacio vertical entre parrafos
   - La tipografia digital moderna suele usar espacios verticales sin sangria
   - Postext soporta ambos enfoques y permite mezclarlos
- **Espaciado de listas** controla la distancia entre elementos de la lista y entre niveles anidados
   - Los elementos dentro de una lista pueden estar espaciados de forma compacta o holgada
   - Las listas anidadas pueden tener sangria adicional y diferentes estilos de vineta en cada nivel
- **Alineacion a la cuadricula de linea base** ajusta el texto a una cuadricula vertical regular
   - Esto asegura que el texto en columnas adyacentes se alinee horizontalmente
   - Crea una sensacion de orden y estabilidad en toda la pagina
   - Los elementos que rompen la cuadricula, como los encabezados con tamanos de fuente mas grandes, pueden configurarse para realinearse con la cuadricula despues

## Maquetacion Basada en Columnas

### Flujo de Texto Multicolumna

Una de las caracteristicas mas distintivas de la maquetacion editorial es el uso de multiples columnas. Las columnas sirven a varios propositos en la tipografia profesional:

- Mantienen las longitudes de linea dentro del rango optimo para la comodidad de lectura, que se considera generalmente entre 45 y 75 caracteres por linea
- Permiten que mas texto aparezca en una sola pagina sin requerir un tamano de fuente incomodamente pequeno
- Crean variedad visual y estructura en la pagina
- Proporcionan oportunidades para la colocacion sofisticada de recursos

Postext soporta configuraciones multicolumna flexibles:

1. **La cantidad de columnas** puede establecerse en cualquier entero positivo
   - Maquetaciones de una sola columna para viewports estrechos o lectura enfocada
   - Maquetaciones de dos columnas para articulos y ensayos
   - Tres o mas columnas para boletines, revistas y materiales de referencia
2. **El ancho del medianil** controla el espacio entre columnas
   - Medianiles mas anchos hacen que las columnas se sientan mas independientes
   - Medianiles mas estrechos permiten mas texto por pagina pero requieren un separador visual
3. **Las lineas de columna** son lineas verticales opcionales dibujadas entre columnas
   - Su grosor, estilo y color son configurables
   - Ayudan a los lectores a distinguir entre columnas cuando los medianiles son estrechos
4. **El cruce de columnas** permite que ciertos elementos rompan la cuadricula de columnas
   - Un encabezado podria abarcar dos de tres columnas
   - Una figura podria abarcar el ancho completo de la pagina
   - Una cita destacada podria flotar a traves del medianil entre dos columnas

### Equilibrio de Columnas

Cuando el texto fluye a traves de multiples columnas, las columnas a menudo terminan a diferentes alturas. La ultima columna de una pagina podria contener solo unas pocas lineas mientras las demas estan llenas. Esto se ve inacabado y poco profesional.

El **equilibrio de columnas** es el proceso de distribuir el texto uniformemente entre las columnas para que terminen aproximadamente a la misma altura. Este es un problema computacional sorprendentemente dificil porque:

- Mover texto entre columnas cambia los saltos de linea, lo que cambia la altura de cada columna
- Las figuras y otros elementos no textuales tienen alturas fijas que no pueden dividirse
- Las notas al pie asociadas con texto en una columna deben aparecer en la parte inferior de esa misma columna, consumiendo espacio
- Las restricciones de huerfanas y viudas pueden impedir ciertas distribuciones

Postext aborda el equilibrio de columnas mediante refinamiento iterativo:

1. Primero, llena las columnas secuencialmente para establecer una distribucion base
2. Luego, calcula la altura ideal de columna dividiendo la altura total del contenido por el numero de columnas
3. Redistribuye el contenido para acercarse a esta altura ideal, respetando todas las restricciones
4. Repite la redistribucion hasta que las alturas de las columnas convergen o se alcanza el numero maximo de iteraciones

### Estructuras de Columnas Mixtas

No todo el contenido de una pagina necesita seguir la misma estructura de columnas. Un patron comun en el diseno editorial es comenzar una seccion con un parrafo introductorio a ancho completo, y luego hacer la transicion a una maquetacion multicolumna para el texto del cuerpo. Otro patron coloca una imagen o tabla ancha a lo largo del ancho completo de la pagina, interrumpiendo el flujo multicolumna y reanudandolo debajo.

Postext soporta estas estructuras mixtas a traves de **sobrecargas de seccion**:

- Cada seccion de un documento puede especificar su propia configuracion de columnas
- Las transiciones entre tipos de seccion se manejan automaticamente
- El motor gestiona el espacio vertical consumido por cada seccion y asegura que el contenido fluya correctamente de una a la siguiente

## Colocacion de Recursos

### Estrategias de Colocacion

En el diseno editorial, los recursos como imagenes, tablas, figuras y citas destacadas no se insertan simplemente de forma inline en el punto donde se referencian. En su lugar, se colocan de acuerdo con estrategias que optimizan la calidad visual de la pagina y la legibilidad del texto circundante.

Postext soporta varias estrategias de colocacion:

- **Parte superior de la columna** coloca el recurso en la parte superior de la columna actual o la siguiente disponible
   - Esta es la estrategia mas comun en publicaciones academicas y profesionales
   - El recurso se ancla en la parte superior de la columna y el texto fluye debajo
   - Si el recurso es demasiado alto para el espacio restante, se aplaza a la siguiente columna
- **En linea** coloca el recurso en el punto exacto donde se referencia en el texto
   - El flujo de texto se interrumpe, el recurso se inserta y el texto se reanuda debajo
   - Esta es la estrategia mas simple pero puede llevar a saltos de pagina incomodos si el recurso cae cerca del final de una columna
- **Flotante izquierdo y flotante derecho** colocan el recurso en el borde izquierdo o derecho de la columna
   - El texto se envuelve alrededor del recurso, fluyendo hacia el lado opuesto
   - El recurso puede configurarse para extenderse hacia el medianil o el margen
   - Multiples flotantes pueden coexistir en la misma columna si hay suficiente espacio
- **Quiebre a ancho completo** interrumpe la maquetacion de columnas completamente
   - El recurso abarca el ancho completo de la pagina
   - Todas las columnas por encima y por debajo del recurso se sincronizan
   - Esto se usa comunmente para imagenes grandes, tablas anchas o divisores de seccion
- **Margen** coloca el recurso en el margen de la pagina
   - El recurso se alinea verticalmente con el parrafo que lo referencia
   - Esto se usa para pequenas ilustraciones, iconos o anotaciones complementarias

### Relacion de Aspecto y Dimensionado

Al colocar recursos, Postext preserva las relaciones de aspecto y proporciona multiples opciones de dimensionado:

1. **Tamano natural** utiliza las dimensiones intrinsecas del recurso
2. **Ancho de columna** escala el recurso para llenar el ancho de una sola columna
3. **Ancho de expansion** escala el recurso para abarcar un numero especificado de columnas incluyendo medianiles
4. **Ancho completo** escala el recurso para llenar toda el area de texto
5. **Dimensiones personalizadas** permiten al desarrollador especificar valores exactos de ancho y alto

El motor asegura que los recursos nunca desborden sus contenedores y ajusta el flujo de texto circundante para acomodar las dimensiones finales.

## Sistemas de Referencias

### Notas al Pie

Las notas al pie son una de las caracteristicas mas complejas de la tipografia editorial. Una nota al pie debe aparecer en la parte inferior de la columna donde se referencia, y el espacio que ocupa debe restarse del area de texto disponible en esa columna. Esto crea un bucle de retroalimentacion:

- Agregar una nota al pie a una columna reduce el espacio de texto disponible
- Reducir el espacio de texto podria empujar la referencia de la nota al pie a la siguiente columna
- Si la referencia se mueve, la nota al pie debe moverse con ella, cambiando el espacio de texto en ambas columnas

Postext maneja esta complejidad a traves de su bucle de convergencia. El motor coloca las notas al pie provisionalmente, verifica si sus referencias todavia estan en la misma columna y ajusta las posiciones iterativamente hasta que todo se estabiliza.

La configuracion de notas al pie incluye:

- **Estilo de marcador** determina como se numeran o simbolizan las notas al pie
   - Los numeros en superindice son la opcion mas comun
   - Simbolos como asteriscos, obelos y dobles obelos son tradicionales en algunos contextos
   - Se pueden definir secuencias de marcadores personalizadas para aplicaciones especializadas
- **Separador** es la linea horizontal dibujada entre el area de texto y el area de notas al pie
   - Su ancho, estilo y espaciado son configurables
- **Tamano de fuente** para el texto de las notas al pie es tipicamente menor que el texto del cuerpo
   - El tamano, la altura de linea y el espaciado son configurables de forma independiente

### Notas Finales

A diferencia de las notas al pie, las notas finales se recopilan y muestran al final de una seccion o al final del documento completo. Son mas simples de implementar porque no compiten por espacio con el texto del cuerpo en la misma columna. Sin embargo, todavia requieren numeracion y referencias cruzadas cuidadosas.

Postext soporta la recopilacion de notas finales tanto por seccion como por documento:

- **Notas finales por seccion** aparecen al final de cada seccion principal, haciendolas mas faciles de encontrar para los lectores
- **Notas finales por documento** se recopilan al final, siguiendo la convencion academica tradicional
- La numeracion puede reiniciarse en cada seccion o continuar secuencialmente a lo largo del documento completo

### Notas Marginales

Las notas marginales son anotaciones breves que aparecen en el margen de la pagina, alineadas verticalmente con el parrafo que las referencia. Se usan comunmente en libros de texto, manuales tecnicos y ediciones anotadas para proporcionar contexto complementario sin interrumpir el flujo principal del texto.

Postext coloca las notas marginales con las siguientes consideraciones:

- La nota se alinea verticalmente con el inicio del parrafo que la referencia
- Si multiples notas referencian parrafos que estan cerca entre si, las notas se apilan con el espaciado apropiado para evitar superposiciones
- El ancho disponible del margen determina el ancho maximo del texto de la nota
- Las notas marginales pueden aparecer en el margen izquierdo, el margen derecho, o alternar entre ambos en paginas enfrentadas

## Configuracion y Personalizacion

### El Objeto de Configuracion

Cada aspecto de la maquetacion de Postext puede controlarse a traves de un unico objeto de configuracion integral. Este objeto esta profundamente estructurado, con secciones anidadas para cada area de interes:

- **Configuracion de pagina**
   - Ancho y alto en unidades reales como centimetros, milimetros, pulgadas o puntos
   - Margenes para cada lado de la pagina, configurables de forma independiente
   - Ajuste de DPI que controla la resolucion para calculos basados en pixeles
   - Color de fondo para la superficie de la pagina
   - Lineas de corte para produccion de impresion
   - Ajustes de la cuadricula de linea base incluyendo altura de linea y color de la cuadricula
- **Configuracion de columnas**
   - Numero de columnas por pagina o seccion
   - Ancho del medianil entre columnas
   - Apariencia y visibilidad de las lineas de columna
   - Comportamiento y tolerancia del equilibrio
- **Configuracion tipografica**
   - Conteos minimos de lineas para huerfanas y viudas
   - Idioma de hifenacion, caracteres minimos y maximo de guiones consecutivos
   - Modo de espaciado de parrafos, ya sea sangria o espacios verticales
   - Espaciado de encabezados por encima y por debajo de cada nivel
   - Reglas de agrupacion que previenen saltos de pagina entre elementos relacionados
- **Configuracion de colocacion de recursos**
   - Estrategia de colocacion predeterminada para cada tipo de recurso
   - Comportamiento de dimensionado y dimensiones maximas
   - Espaciado alrededor de los recursos colocados
- **Configuracion de referencias**
   - Estilo de marcador de notas al pie y apariencia del separador
   - Modo de recopilacion y numeracion de notas finales
   - Posicionamiento y ancho de notas marginales

### Sobrecargas de Seccion

Para documentos con maquetaciones variadas, Postext permite **sobrecargas a nivel de seccion** que cambian la configuracion para partes especificas del documento:

1. Una pagina de titulo podria usar una sola columna con margenes amplios
2. El cuerpo principal podria usar dos columnas con margenes estandar
3. Un apendice podria usar tres columnas estrechas con margenes minimos
4. Una seccion de imagen a pagina completa podria no tener columnas ni margenes

Cada sobrecarga de seccion especifica que valores de configuracion cambiar. Los valores no especificados se heredan de la configuracion base. Este enfoque por capas mantiene la configuracion manejable incluso para documentos complejos.

### Tamanos Predefinidos

Postext incluye un conjunto de **tamanos de pagina predefinidos** que corresponden a formatos comunes de libros y documentos:

- **11 x 17 cm** para libros de bolsillo pequenos y guias de bolsillo
- **12 x 19 cm** para libros de bolsillo de ficcion estandar
- **17 x 24 cm** para libros de texto y manuales tecnicos
- **21 x 28 cm** para publicaciones de gran formato y revistas
- **Personalizado** para cualquier formato no estandar

Cada tamano predefinido establece automaticamente el ancho y la altura, pero el desarrollador puede sobreescribir dimensiones individuales o cambiar a valores completamente personalizados en cualquier momento.

## Vision del Proyecto y Hoja de Ruta

### Una Base para el Contenido Editorial en la Web

Postext no pretende reemplazar CSS para la maquetacion de aplicaciones. Es una herramienta especializada para una necesidad especifica y desatendida, concretamente la presentacion de contenido largo y estructurado con la calidad visual que los lectores esperan de publicaciones producidas profesionalmente. El proyecto tiene como objetivo hacer que este nivel de calidad sea accesible para los desarrolladores web sin requerir experiencia en composicion tipografica tradicional.

La vision a largo plazo incluye:

- **Maquetaciones editoriales responsivas** que se adapten inteligentemente a diferentes tamanos de pantalla, no simplemente refluyendo el texto en una sola columna, sino eligiendo cantidades de columnas, tamanos de margen y estrategias de colocacion de recursos apropiados para cada viewport
- **Edicion colaborativa** donde los autores escriben contenido en Markdown y los disenadores configuran las reglas de maquetacion, cada uno trabajando en su area de experiencia
- **Salida accesible** que preserve la estructura semantica y soporte lectores de pantalla, navegacion por teclado y modos de alto contraste
- **Paridad entre impresion y digital** donde el mismo contenido y configuracion produzcan resultados visualmente consistentes tanto en formato web como PDF

### Fases de Desarrollo

El desarrollo de Postext esta organizado en cuatro fases principales:

1. **Fundamentos**
   - Estructuras de datos centrales y sistema de tipos
   - Parser de Markdown con extensiones de recursos y notas
   - Maquetacion basica de una sola columna con medicion
   - Configuracion predeterminada y sistema de presets
2. **Maquetacion Editorial**
   - Flujo de texto multicolumna con reflow inteligente
   - Equilibrio de columnas con satisfaccion de restricciones
   - Colocacion de recursos con todas las estrategias soportadas
   - Prevencion de huerfanas y viudas entre columnas y paginas
3. **Tipografia Profesional**
   - Hifenacion con diccionarios especificos por idioma
   - Optimizacion del margen derecho para texto alineado a la izquierda
   - Sistemas de notas al pie, notas finales y notas marginales
   - Reglas avanzadas de espaciado y alineacion a la cuadricula de linea base
   - Citas destacadas, capitulares decorativas y elementos ornamentales
4. **Salida e Integracion**
   - Renderizador web con posicionamiento CSS preciso
   - Renderizador PDF para produccion de impresion
   - Sandbox interactivo para experimentacion y aprendizaje
   - Sistema de plugins para renderizadores y extensiones personalizadas
   - Documentacion, tutoriales y proyectos de ejemplo

### Contribuir al Proyecto

Postext es un proyecto de codigo abierto que da la bienvenida a contribuciones de desarrolladores, disenadores y tipografos. Hay muchas formas de participar:

- **Reportar incidencias** cuando se encuentren errores o comportamientos inesperados
- **Sugerir funcionalidades** que harian el motor mas util para las necesidades de cada uno
- **Contribuir codigo** tomando una incidencia abierta y enviando un pull request
- **Mejorar la documentacion** escribiendo tutoriales, ejemplos o explicaciones
- **Compartir maquetaciones** para demostrar lo que Postext puede hacer e inspirar a otros

El proyecto se mantiene con un compromiso con la calidad, la claridad y el respeto por la larga tradicion de artesania tipografica que busca llevar a la web.
`;
