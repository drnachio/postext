import cli from '../package.json' with { type: 'json' };
import engine from 'postext/package.json' with { type: 'json' };

/** This CLI's version (it equals the bundled engine's on every release). */
export const VERSION: string = cli.version;
/** The postext engine compiled into this executable. */
export const ENGINE_VERSION: string = engine.version;
