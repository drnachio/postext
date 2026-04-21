export function cleanSoftHyphens(text: string): string {
  return text.replace(/\u00AD/g, '');
}
