/** `<Note>…</Note>`: an aside in the guide's "try it" style. */
export function Note({ children }: { children?: React.ReactNode }) {
  return <aside className="cb-note">{children}</aside>;
}
