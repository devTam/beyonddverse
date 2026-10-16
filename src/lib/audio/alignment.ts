import type { WordTiming } from "../../../packages/video/src/captions";

const small = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function numberWords(value: number): string {
  if (value < 20) return small[value];
  if (value < 100) return tens[Math.floor(value / 10)] + (value % 10 ? small[value % 10] : "");
  if (value < 1000) return small[Math.floor(value / 100)] + "hundred" + (value % 100 ? numberWords(value % 100) : "");
  return String(value);
}
const normalize = (word: string) => word.toLocaleLowerCase("en").replace(/\d+/g, (value) => numberWords(Number(value))).replace(/[^\p{L}\p{N}]/gu, "");

/** Map the approved words to provider boundaries, tolerating punctuation and numeric spelling only. */
export function alignNarration(text: string, segments: Array<{ text: string; startSecond: number; endSecond: number }>, durationMs: number): WordTiming[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  let offset = 0;
  const observed = segments.flatMap((segment) => {
    const tokens = segment.text.trim().split(/\s+/).map((word) => normalize(word)).filter(Boolean);
    const weight = tokens.reduce((sum, word) => sum + word.length, 0);
    const start = Math.max(0, segment.startSecond * 1000);
    const end = Math.min(durationMs, segment.endSecond * 1000);
    if (end <= start) throw new Error("Narration alignment has invalid segment times.");
    let cursor = start;
    return tokens.map((word) => {
      const from = offset, startMs = cursor;
      offset += word.length;
      cursor += (end - start) * word.length / weight;
      return { word, from, to: offset, startMs, endMs: cursor };
    });
  });
  if (!observed.length || words.map(normalize).join("") !== observed.map((word) => word.word).join("")) throw new Error("Narration alignment differs from the approved script. Regenerate or correct the narration before rendering.");
  offset = 0;
  return words.map((word) => {
    const from = offset;
    offset += normalize(word).length;
    const first = observed.find((token) => token.to > from) ?? observed.at(-1)!;
    const last = observed.find((token) => token.to >= offset) ?? observed.at(-1)!;
    return {
      word,
      startMs: Math.round(first.startMs + (first.endMs - first.startMs) * Math.max(0, from - first.from) / first.word.length),
      endMs: Math.round(last.startMs + (last.endMs - last.startMs) * Math.max(0, offset - last.from) / last.word.length),
    };
  });
}
