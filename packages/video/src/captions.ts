export type WordTiming = { word: string; startMs: number; endMs: number };
export type CaptionCue = { lines: string[]; startMs: number; endMs: number };

/** Greedy measured wrapping; each page has at most two lines and six spoken words. */
export function captionCues(timings: WordTiming[], maxWidth: number, measure: (text: string) => number): CaptionCue[] {
  const pieces = timings.flatMap((timing) => {
    if (timing.endMs <= timing.startMs) return [];
    const parts: string[] = [];
    let part = "";
    for (const char of timing.word) {
      if (part && measure(part + char) > maxWidth) { parts.push(part); part = ""; }
      part += char;
    }
    if (part) parts.push(part);
    let offset = 0;
    return parts.map((word) => {
      const startMs = timing.startMs + (timing.endMs - timing.startMs) * offset / timing.word.length;
      offset += word.length;
      return { word, startMs, endMs: timing.startMs + (timing.endMs - timing.startMs) * offset / timing.word.length };
    });
  });
  const cues: CaptionCue[] = [];
  let lines: string[] = [];
  let startMs = 0, endMs = 0, count = 0;
  const flush = () => {
    if (lines.length) cues.push({ lines, startMs, endMs });
    lines = []; count = 0;
  };
  for (const timing of pieces) {
    if (lines.length && (timing.startMs - endMs > 350 || count >= 6)) flush();
    const current = lines.at(-1);
    if (!current || measure(`${current} ${timing.word}`) > maxWidth) {
      if (lines.length === 2) flush();
      if (!lines.length) startMs = timing.startMs;
      lines.push(timing.word);
    } else lines[lines.length - 1] = `${current} ${timing.word}`;
    endMs = timing.endMs;
    count++;
  }
  flush();
  return cues;
}

export function activeCaption(cues: CaptionCue[], elapsedMs: number) {
  return cues.find((cue) => elapsedMs >= cue.startMs && elapsedMs < cue.endMs);
}

/** Locate the exact approved narration phrase using its original word positions. */
export function scriptureCueTime(narration: string, phrase: string, timings: WordTiming[]) {
  const offset = narration.indexOf(phrase);
  if (offset < 0) throw new Error("Scripture cue does not occur in narration.");
  const index = (narration.slice(0, offset).match(/\S+\s+/g) ?? []).length;
  const count = phrase.trim().split(/\s+/).length;
  return { startMs: timings[index]?.startMs ?? 0, endMs: Math.max(timings[Math.min(index + count - 1, timings.length - 1)]?.endMs ?? 0, (timings[index]?.startMs ?? 0) + 4000) };
}
