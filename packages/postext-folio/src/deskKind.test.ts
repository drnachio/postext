import { describe, expect, it } from "vitest";
import { deskKind } from "./procedural.js";

// #1582: a surface type Folio does not know lies the book on the default
// desk instead of stopping the scene.
describe("deskKind", () => {
  it("keeps a known desk and no desk", () => {
    expect(deskKind("marble")).toBe("marble");
    expect(deskKind("none")).toBe("none");
  });

  it("lays an unknown or missing type on oak", () => {
    expect(deskKind("concrete")).toBe("oak");
    expect(deskKind(undefined)).toBe("oak");
    expect(deskKind(42)).toBe("oak");
  });
});
