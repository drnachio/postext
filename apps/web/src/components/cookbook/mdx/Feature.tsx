import Link from "next/link";
import { docAnchor } from "@/lib/cookbook/docLinks";
import type { RecipeView } from "../recipe/model";

/** `<Feature id="side-captions">…</Feature>`: an inline link to the
 *  feature's docs section (its label when the tag is empty). Server
 *  component; the page binds `view`. */
export function Feature({ view, id, children }: { view: RecipeView; id: string; children?: React.ReactNode }) {
  const feature = view.registry.features[id];
  if (!feature) return <>{children ?? id}</>;
  const href = docAnchor(feature.docs, view.locale);
  const text = children ?? feature.label[view.locale];
  if (!href) return <>{text}</>;
  return (
    <Link href={href} title={feature.definition[view.locale]}>
      {text}
    </Link>
  );
}
