declare module 'hypher' {
  export interface HyphenationLanguage {
    patterns: Record<string, string>;
    leftmin: number;
    rightmin: number;
    exceptions?: string[];
  }

  export default class Hypher {
    constructor(language: HyphenationLanguage);
    hyphenate(word: string): string[];
    hyphenateText(text: string, minLength?: number): string;
  }
}

declare module 'hyphenation.en-us' {
  const language: import('hypher').HyphenationLanguage;
  export default language;
}
declare module 'hyphenation.es' {
  const language: import('hypher').HyphenationLanguage;
  export default language;
}
declare module 'hyphenation.fr' {
  const language: import('hypher').HyphenationLanguage;
  export default language;
}
declare module 'hyphenation.de' {
  const language: import('hypher').HyphenationLanguage;
  export default language;
}
declare module 'hyphenation.it' {
  const language: import('hypher').HyphenationLanguage;
  export default language;
}
declare module 'hyphenation.pt' {
  const language: import('hypher').HyphenationLanguage;
  export default language;
}
declare module 'hyphenation.ca' {
  const language: import('hypher').HyphenationLanguage;
  export default language;
}
declare module 'hyphenation.nl' {
  const language: import('hypher').HyphenationLanguage;
  export default language;
}
