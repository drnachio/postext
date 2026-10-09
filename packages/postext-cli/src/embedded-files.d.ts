// Files embedded in the executable (`import path from './x.ttf' with { type: 'file' }`):
// the import is the file's path, inside the executable once compiled.
declare module '*.ttf' {
  const path: string;
  export default path;
}
declare module '*.icc' {
  const path: string;
  export default path;
}
declare module '*.wasm' {
  const path: string;
  export default path;
}
