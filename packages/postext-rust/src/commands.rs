//! The commands of the postext command line: a builder each, made by the
//! client's method of the same name.

use std::ffi::OsStr;
use std::fmt::Display;

use serde_json::Value;

use crate::args::{Book, Books, join};
use crate::client::Postext;
use crate::command::{Command, Kind, OutMode, ReadsBook, TakesFonts, WritesFile, sealed::Sealed};
use crate::report::{
    CheckReport, DesignReport, ImageReport, ImportDocxReport, ImportIdmlReport, InfoReport, Report, UnpackReport,
};

/// The commands, as types: `Command<'_, kind::Pdf>` builds a `pdf` run.
pub mod kind {
    macro_rules! kinds {
        ($($(#[$m:meta])* $name:ident;)*) => {$(
            $(#[$m])*
            #[derive(Debug, Clone, Copy)]
            pub struct $name;
        )*};
    }

    kinds! {
        /// `postext pdf`
        Pdf;
        /// `postext html`
        Html;
        /// `postext epub`
        Epub;
        /// `postext image`
        Image;
        /// `postext images`
        Images;
        /// `postext docx`
        Docx;
        /// `postext pack`
        Pack;
        /// `postext design`
        Design;
        /// `postext idml`
        Idml;
        /// `postext info`
        Info;
        /// `postext check`
        Check;
        /// `postext build`
        Build;
        /// `postext import-docx`
        ImportDocx;
        /// `postext unpack`
        Unpack;
        /// `postext import-idml`
        ImportIdml;
    }
}

macro_rules! kind {
    ($name:ident, $command:literal, $report:ty, $out:ident $(, input = $input:literal)? $(, font_defaults = $fd:literal)?; $($marker:ident),*) => {
        impl Sealed for kind::$name {}
        impl Kind for kind::$name {
            const COMMAND: &'static str = $command;
            $(const INPUT: &'static str = $input;)?
            const OUT: OutMode = OutMode::$out;
            $(const FONT_DEFAULTS: bool = $fd;)?
            type Report = $report;
        }
        $(impl $marker for kind::$name {})*
    };
}

kind!(Pdf, "pdf", Report, File; ReadsBook, TakesFonts, WritesFile);
kind!(Html, "html", Report, File; ReadsBook, TakesFonts, WritesFile);
kind!(Epub, "epub", Report, File; ReadsBook, TakesFonts, WritesFile);
kind!(Image, "image", ImageReport, File; ReadsBook, TakesFonts, WritesFile);
kind!(Images, "images", Report, Required; ReadsBook, TakesFonts);
kind!(Docx, "docx", Report, File; ReadsBook, TakesFonts, WritesFile);
kind!(Pack, "pack", Report, File; ReadsBook, TakesFonts, WritesFile);
kind!(Design, "design", DesignReport, File; ReadsBook, TakesFonts, WritesFile);
kind!(Idml, "idml", Report, File; ReadsBook, WritesFile);
kind!(Info, "info", InfoReport, Never; ReadsBook, TakesFonts);
kind!(Check, "check", CheckReport, Never; ReadsBook, TakesFonts);
kind!(Build, "build", Report, Never; ReadsBook, TakesFonts);
kind!(ImportDocx, "import-docx", ImportDocxReport, Required, input = "book.docx", font_defaults = false;);
kind!(Unpack, "unpack", UnpackReport, Required, font_defaults = false;);
kind!(ImportIdml, "import-idml", ImportIdmlReport, Required, input = "document.idml";);

macro_rules! options {
    ($kind:ident { $($(#[$m:meta])* $fn:ident: $how:ident $flag:literal;)* }) => {
        impl Command<'_, kind::$kind> {
            $(options!(@one $(#[$m])* $fn $how $flag);)*
        }
    };
    (@one $(#[$m:meta])* $fn:ident text $flag:literal) => {
        $(#[$m])*
        pub fn $fn(self, value: impl AsRef<OsStr>) -> Self {
            self.opt($flag, value)
        }
    };
    (@one $(#[$m:meta])* $fn:ident switch $flag:literal) => {
        $(#[$m])*
        pub fn $fn(self, on: bool) -> Self {
            self.flag($flag, on)
        }
    };
    (@one $(#[$m:meta])* $fn:ident count $flag:literal) => {
        $(#[$m])*
        pub fn $fn(self, value: u32) -> Self {
            self.opt($flag, value.to_string())
        }
    };
    (@one $(#[$m:meta])* $fn:ident real $flag:literal) => {
        $(#[$m])*
        pub fn $fn(self, value: impl Into<f64>) -> Self {
            self.opt($flag, value.into().to_string())
        }
    };
}

options!(Pdf {
    /// Tagged PDF/UA (default: the book's setting).
    accessible: switch "accessible";
    /// `rgb`, `cmyk` or `grayscale`.
    color_space: text "color-space";
    /// `none`, `x1a` or `x4`.
    pdfx: text "pdfx";
    /// `fogra39`, `fogra51`, `swop5`, `gracol2006`… or an `.icc` file.
    profile: text "profile";
    /// The book's outline as PDF bookmarks.
    outlines: switch "outlines";
    /// Pages printed in negative.
    page_negative: switch "page-negative";
});

options!(Html {
    /// `single` (one column) or `multi` (side by side).
    mode: text "mode";
    /// `embed` or `folder`.
    assets: text "assets";
});

options!(Epub {
    /// `fixed` (default) or `reflowable`.
    layout: text "layout";
    /// A cover picture.
    cover: text "cover";
});

options!(Image {
    /// `png`, `jpeg` or `webp`.
    format: text "format";
    /// Resolution (default 150).
    dpi: real "dpi";
    /// JPEG and WebP quality, 1 to 100.
    quality: count "quality";
    /// The page as printed: trim, bleed and print colours.
    print_preview: switch "print-preview";
});

options!(Images {
    /// Pages to render: `"1-10"`, `"#1-#20"` (default: all).
    pages: text "pages";
    /// File names: `"page-{n}"`, `"p-{label}"`…
    pattern: text "pattern";
    /// Pages rendered at once.
    jobs: count "jobs";
    /// `png`, `jpeg` or `webp`.
    format: text "format";
    /// Resolution (default 150).
    dpi: real "dpi";
    /// JPEG and WebP quality, 1 to 100.
    quality: count "quality";
    /// The pages as printed: trim, bleed and print colours.
    print_preview: switch "print-preview";
});

options!(Docx {
    /// `semantic` (content only, in plain styles), `formatted` (the book's
    /// design, the default) or `facsimile` (the PDF's pages in text boxes).
    variant: text "variant";
    /// Embed the book's faces (default on; `false` names them only).
    embed_fonts: switch "embed-fonts";
});

options!(Pack {
    /// The bundle's id.
    id: text "id";
    /// The bundle's description.
    description: text "description";
    /// A thumbnail picture.
    thumbnail: text "thumbnail";
    /// Render the first page as the thumbnail.
    auto_thumbnail: switch "auto-thumbnail";
});

options!(Design {
    /// The design file's name.
    design_name: text "design-name";
    /// Its id.
    id: text "id";
    /// Its description.
    description: text "description";
});

options!(Idml {
    /// `embed` (inside the file, default) or `link` (beside it in `Links/`).
    images: text "images";
    /// `keep` (lines as Postext broke them, default) or `reflow` (left to
    /// InDesign's composer).
    lines: text "lines";
    /// `facing` or `single` (default: facing for mirrored margins).
    spreads: text "spreads";
    /// Write the font files beside the package, in `Document fonts/` (needs
    /// a file `out`).
    fonts: switch "fonts";
});

options!(Info {
    /// Lay the book out to count its pages.
    pages: switch "pages";
});

options!(Check {
    /// Any warning fails the check.
    strict: switch "strict";
    /// The print preflight too (resolution, colour, fonts).
    preflight: switch "preflight";
});

options!(Build {
    /// A PDF here.
    pdf: text "pdf";
    /// HTML here.
    html: text "html";
    /// An EPUB here.
    epub: text "epub";
    /// Page images in this folder.
    images: text "images";
    /// A Word document here.
    docx: text "docx";
    /// As [`variant`](Command::<kind::Docx>::variant) in `docx`.
    docx_variant: text "docx-variant";
    /// As `embed_fonts` in `docx`.
    docx_fonts: switch "docx-fonts";
    /// An InDesign package here.
    idml: text "idml";
    /// As `images` in `idml`.
    idml_images: text "idml-images";
    /// As `lines` in `idml`.
    idml_lines: text "idml-lines";
    /// As `spreads` in `idml`.
    idml_spreads: text "idml-spreads";
    /// As `fonts` in `idml`.
    idml_fonts: switch "idml-fonts";
    /// Pages to render as images.
    pages: text "pages";
    /// Image file names.
    pattern: text "pattern";
    /// Pages rendered at once.
    jobs: count "jobs";
    /// As in `pdf`.
    accessible: switch "accessible";
    /// As in `pdf`.
    color_space: text "color-space";
    /// As in `pdf`.
    pdfx: text "pdfx";
    /// As in `pdf`.
    profile: text "profile";
    /// As in `pdf`.
    outlines: switch "outlines";
    /// As in `pdf`.
    page_negative: switch "page-negative";
    /// As in `html`.
    mode: text "mode";
    /// As in `html`.
    assets: text "assets";
    /// As in `epub`.
    layout: text "layout";
    /// As in `epub`.
    cover: text "cover";
    /// As in `images`.
    format: text "format";
    /// As in `images`.
    dpi: real "dpi";
    /// As in `images`.
    quality: count "quality";
    /// As in `images`.
    print_preview: switch "print-preview";
});

options!(ImportDocx {
    /// Only report the edits; change nothing.
    dry_run: switch "dry-run";
    /// The pictures folder.
    resources: text "resources";
    /// A book whose design the new book takes.
    template: text "template";
    /// One chapter per heading of the top level.
    split: switch "split";
    /// The book's language.
    locale: text "locale";
    /// A configuration file.
    config: text "config";
    /// The book's title.
    name: text "name";
    /// The import's quality report.
    quality_report: switch "report";
    /// Render the first page as the thumbnail.
    auto_thumbnail: switch "auto-thumbnail";
});

options!(Unpack {
    /// Write over a folder that is not empty.
    force: switch "force";
});

options!(ImportIdml {
    /// In a package with several IDML documents, the one to import (`Book/Book.idml`).
    document: text "document";
    /// `pages` (composed pages as in the document), `flow` (a flowing book)
    /// or `auto` (default).
    layout: text "layout";
    /// Where the linked pictures are.
    links: text "links";
    /// The book's title.
    name: text "name";
    /// The book's language.
    locale: text "locale";
    /// Read hidden objects too.
    hidden: switch "hidden";
    /// Read the pasteboard too.
    pasteboard: switch "pasteboard";
    /// Read non-printing objects too.
    non_printing: switch "non-printing";
    /// `visible` (default) or `all`.
    conditions: text "conditions";
    /// Tracked changes: `accept` (default) or `reject`.
    changes: text "changes";
    /// `false` leaves master-page items out.
    masters: switch "masters";
    /// The import's quality report.
    quality_report: switch "report";
    /// Render the first page as the thumbnail.
    auto_thumbnail: switch "auto-thumbnail";
    /// Where downloaded fonts are kept.
    cache_dir: text "cache-dir";
});

impl Command<'_, kind::Design> {
    /// The parts to take (`["page", "text", "headings"]`; default: all).
    pub fn parts<I, S>(self, parts: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        self.opt("parts", join(parts))
    }
}

impl Command<'_, kind::Check> {
    /// Return the report when the check finds problems, instead of
    /// [`Error::ProblemsFound`](crate::Error::ProblemsFound) (`passed` is
    /// then `false`).
    pub fn allow_problems(self) -> Self {
        self.problems_allowed()
    }
}

impl Command<'_, kind::ImportDocx> {
    /// Merge the edits made in Word into this book (a folder or `.postext`),
    /// instead of making a new book at `out`.
    pub fn into_book(self, book: impl AsRef<OsStr>) -> Self {
        self.input(book)
    }

    /// A configuration given as JSON.
    pub fn config_json(self, config: &Value) -> Self {
        self.json_opt("config", config, "config.json")
    }

    /// Return the report when an edit could not be applied, instead of
    /// [`Error::ProblemsFound`](crate::Error::ProblemsFound).
    pub fn allow_problems(self) -> Self {
        self.problems_allowed()
    }
}

impl Command<'_, kind::ImportIdml> {
    /// Where the cover finds the document's fonts (repeats; replaces the
    /// client's). For a package, faces found there are carried instead of
    /// the package's.
    pub fn font_dir(self, dir: impl AsRef<OsStr>) -> Self {
        self.add_font_dir(dir)
    }

    /// Never download fonts from Google Fonts (default: the client's).
    pub fn offline(self, offline: bool) -> Self {
        self.set_offline(offline)
    }
}

impl Postext {
    /// Typeset the book into a PDF.
    pub fn pdf(&self, book: impl Into<Books>) -> Command<'_, kind::Pdf> {
        Command::new(self, book.into())
    }

    /// The laid-out pages as HTML: a path ending in `.html` (or `"-"`) gets
    /// one self-contained file, any other path a folder.
    pub fn html(&self, book: impl Into<Books>) -> Command<'_, kind::Html> {
        Command::new(self, book.into())
    }

    /// An EPUB 3 book.
    pub fn epub(&self, book: impl Into<Books>) -> Command<'_, kind::Epub> {
        Command::new(self, book.into())
    }

    /// One page as an image. `page`: as printed (`"12"`, `"iv"`, or a number)
    /// or by position (`"#1"`).
    pub fn image(&self, book: impl Into<Books>, page: impl Display) -> Command<'_, kind::Image> {
        Command::new(self, book.into()).opt("page", page.to_string())
    }

    /// Every page (or [`pages`](Command::<kind::Images>::pages)) as images in
    /// the folder `out`. [`Report::outputs`] lists the files.
    pub fn images(&self, book: impl Into<Books>) -> Command<'_, kind::Images> {
        Command::new(self, book.into())
    }

    /// A Word document.
    pub fn docx(&self, book: impl Into<Books>) -> Command<'_, kind::Docx> {
        Command::new(self, book.into())
    }

    /// Pack a book folder, or loose Markdown files (the chapters, in
    /// order), into a `.postext` bundle.
    pub fn pack(&self, book: impl Into<Books>) -> Command<'_, kind::Pack> {
        Command::new(self, book.into())
    }

    /// Take the book's design into a design file (default
    /// `<book>.design.postext`): a `.postext` with no chapters, holding the
    /// settings of the parts asked for and the font files and colour
    /// profile they name. Give it to any book with `design()`.
    pub fn design(&self, book: impl Into<Books>) -> Command<'_, kind::Design> {
        Command::new(self, book.into())
    }

    /// The laid-out pages as an InDesign Markup package.
    pub fn idml(&self, book: impl Into<Books>) -> Command<'_, kind::Idml> {
        Command::new(self, book.into())
    }

    /// Describe the book: chapters, resources, fonts, locales.
    pub fn info(&self, book: impl Into<Books>) -> Command<'_, kind::Info> {
        Command::new(self, book.into())
    }

    /// Lay the book out and report its problems. When it finds an error (any
    /// warning with `strict`), the run is
    /// [`Error::ProblemsFound`](crate::Error::ProblemsFound), whose report
    /// lists them.
    pub fn check(&self, book: impl Into<Books>) -> Command<'_, kind::Check> {
        Command::new(self, book.into())
    }

    /// Lay the book out once and write several outputs. For `--watch`, use
    /// [`run_inherit`](Postext::run_inherit).
    pub fn build(&self, book: impl Into<Books>) -> Command<'_, kind::Build> {
        Command::new(self, book.into())
    }

    /// Turn a Word document (a path or bytes) into a new book at `out` (a
    /// folder or a `.postext` file), or with
    /// [`into_book`](Command::<kind::ImportDocx>::into_book) merge the edits
    /// made in Word to an exported file back into the book.
    pub fn import_docx(&self, docx: impl Into<Book>) -> Command<'_, kind::ImportDocx> {
        Command::new(self, Books(vec![docx.into()]))
    }

    /// Extract a `.postext` bundle into the folder `out`.
    pub fn unpack(&self, bundle: impl Into<Book>) -> Command<'_, kind::Unpack> {
        Command::new(self, Books(vec![bundle.into()]))
    }

    /// Turn an InDesign document (`.idml`), or a zipped InDesign package
    /// that holds one, into a new book at `out` (a folder or a `.postext`
    /// file). Given as bytes, linked pictures are found only through
    /// [`links`](Command::<kind::ImportIdml>::links).
    pub fn import_idml(&self, idml: impl Into<Book>) -> Command<'_, kind::ImportIdml> {
        Command::new(self, Books(vec![idml.into()]))
    }
}
