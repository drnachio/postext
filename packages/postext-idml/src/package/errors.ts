// Errors of reading an IDML package: every failure the reader can name
// is one of these, with a code a host can show its own words for.

export type IdmlErrorCode =
  | 'notZip' // the bytes are no zip archive
  | 'notIdml' // a zip, but no IDML package (no designmap, another mimetype)
  | 'indd' // an InDesign document (.indd), not its markup
  | 'tooLarge' // a part, or the whole package, over the size the reader takes
  | 'tooManyParts'
  | 'missingPart' // the designmap names a part the package lacks
  | 'malformed' // a part that is not XML, or not the XML of its kind
  | 'unsafePath'; // an entry or a reference that leaves the package

export class IdmlError extends Error {
  readonly code: IdmlErrorCode;
  /** The part concerned, when one is. */
  readonly part?: string;
  constructor(code: IdmlErrorCode, message: string, part?: string) {
    super(message);
    this.name = 'IdmlError';
    this.code = code;
    if (part !== undefined) this.part = part;
  }
}
