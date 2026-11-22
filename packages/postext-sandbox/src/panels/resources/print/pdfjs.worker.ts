// pdf.js's own worker (#1669), run as a module worker of the Sandbox's so
// a bundler serves it beside the page: a PDF (or an Illustrator file saved
// PDF-compatible) is parsed here, off the page. pdf.js 6 runs no code built
// from the file (it has no eval path left to turn off).

import 'pdfjs-dist/build/pdf.worker.min.mjs';
