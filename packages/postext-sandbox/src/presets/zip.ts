// `.postext` files: a preset bundle directory zipped. The codec lives in
// `postext/bundle`; re-exported here under the sandbox's module layout.

export { openBundleZip, zipBundle, POSTEXT_EXTENSION, POSTEXT_MIME, MANIFEST_FILE } from 'postext/bundle';
export type { OpenedBundleZip } from 'postext/bundle';
