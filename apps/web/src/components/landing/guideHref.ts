/** The Postext guide in the Sandbox, in the edition of the site's locale.
 *  Open it with a full page load: the Sandbox reads its permalink hash when
 *  it mounts, before a client-side navigation has put the new URL in place. */
export function guideSandboxHref(locale: string): string {
  const lang = locale.startsWith("zh") ? "zh-Hans" : locale.startsWith("es") ? "es" : locale.startsWith("ca") ? "ca" : locale.startsWith("ar") ? "ar" : locale.startsWith("ja") ? "ja" : locale.startsWith("pt") ? "pt-BR" : locale.startsWith("fr") ? "fr" : locale.startsWith("de") ? "de" : locale.startsWith("it") ? "it" : "en";
  return `/${locale}/sandbox#preset=postext-guide&lang=${lang}&view=canvas&restore=ask`;
}
