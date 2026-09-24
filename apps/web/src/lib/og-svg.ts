import { Fragment, isValidElement, type ReactElement, type ReactNode } from "react";

// A React SVG tree as static markup for next/og, which draws images through
// resvg: no CSS, so `<style>`, classes and inline styles (animation state)
// are dropped and `var(--x)` paints are resolved from `vars`. Function
// components are called in place. react-dom/server is off limits in the
// app router, and the trees here are plain SVG.

const escape = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const KEEP_CASE = new Set(["viewBox", "preserveAspectRatio"]);
const attrName = (k: string) => (KEEP_CASE.has(k) ? k : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));

export function svgMarkup(node: ReactNode, vars: Record<string, string> = {}): string {
  const resolve = (v: string) => v.replace(/var\((--[\w-]+)\)/g, (m, name: string) => vars[name] ?? m);
  const walk = (n: ReactNode): string => {
    if (n == null || typeof n === "boolean") return "";
    if (typeof n === "string" || typeof n === "number") return escape(String(n));
    if (Array.isArray(n)) return n.map(walk).join("");
    if (!isValidElement(n)) return "";
    const el = n as ReactElement<Record<string, unknown>>;
    const { children, ...props } = el.props as { children?: ReactNode } & Record<string, unknown>;
    if (el.type === Fragment) return walk(children);
    if (typeof el.type === "function") return walk((el.type as (p: unknown) => ReactNode)(el.props));
    if (el.type === "style") return "";
    const tag = el.type as string;
    let attrs = tag === "svg" ? ' xmlns="http://www.w3.org/2000/svg"' : "";
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false || k === "className" || k === "style" || k === "role" || k.startsWith("aria-")) continue;
      attrs += ` ${attrName(k)}="${escape(resolve(String(v)))}"`;
    }
    return `<${tag}${attrs}>${walk(children)}</${tag}>`;
  };
  return walk(node);
}
