import { describe, expect, it } from "vitest";
import { parseUsfm } from "./import-web";

describe("WEB USFM importer", () => {
  it("removes annotations while preserving verse text", () => {
    const parsed = parseUsfm('\\id GEN World English Bible\n\\c 1\n\\v 1 \\w In|strong="H1"\\w* the beginning.\\f + \\ft note\\f*\n\\v 2 The earth.');
    expect(parsed?.name).toBe("Genesis");
    expect(parsed?.verses).toEqual([{ chapter: 1, number: 1, text: "In the beginning." }, { chapter: 1, number: 2, text: "The earth." }]);
  });
});
