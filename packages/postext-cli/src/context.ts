import type { Options } from './args';
import type { Reporter } from './log';

/** What a command runs with. */
export interface CommandContext {
  command: string;
  /** Positional arguments: the book, the files. */
  inputs: string[];
  opts: Options;
  reporter: Reporter;
}
