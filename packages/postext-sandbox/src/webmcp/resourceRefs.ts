// Where a book names a resource by its id (the engine's parser decides what
// is a reference): moved into `postext/bundle` so that joining a part of a
// book (`joinBundleFiles`, `planPartJoin`) and the CLI rename references the
// same way the Sandbox does.

export { configPathsNaming, renameResourceInResources, renameResourceInText, resourceIdRanges } from 'postext/bundle';
