/** Scene narration is the complete spoken lesson; body is only its derived transcript. */
export function lessonTranscript(scenes: Array<{ narration: string }>) {
  return scenes.map((scene) => scene.narration.trim()).join("\n\n");
}

export function estimatedDurationMs(text: string) {
  return Math.max(1000, Math.ceil(text.trim().split(/\s+/).length / 2.3 * 1000));
}

/** Split without dropping words; keep provider-sized, reviewable scenes. */
export function narrationChunks(text: string, maxWords = 90): string[] {
  return text.trim().split(/\n\s*\n/).filter(Boolean).flatMap((paragraph) => {
    const words = paragraph.trim().split(/\s+/);
    return Array.from({ length: Math.ceil(words.length / maxWords) }, (_, i) => words.slice(i * maxWords, (i + 1) * maxWords).join(" "));
  });
}

const books = "Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|1 Samuel|2 Samuel|1 Kings|2 Kings|1 Chronicles|2 Chronicles|Ezra|Nehemiah|Esther|Job|Psalms|Proverbs|Ecclesiastes|Song of Solomon|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|1 Corinthians|2 Corinthians|Galatians|Ephesians|Philippians|Colossians|1 Thessalonians|2 Thessalonians|1 Timothy|2 Timothy|Titus|Philemon|Hebrews|James|1 Peter|2 Peter|1 John|2 John|3 John|Jude|Revelation";
const references = () => new RegExp(`\\b(?:${books})\\s+\\d+:\\d+(?:[–-]\\d+)?\\b`, "g");

export function scenesFromText(text: string) {
  const chunks = narrationChunks(text).flatMap((chunk) => {
    const matches = [...chunk.matchAll(references())];
    const boundaries = [0, ...matches.slice(1).map((match) => match.index), chunk.length];
    return boundaries.slice(0, -1).map((start, index) => chunk.slice(start, boundaries[index + 1]).trim()).filter(Boolean);
  });
  return chunks.map((narration, index) => {
    const reference = narration.match(references())?.[0] ?? null;
    return {
      narration,
      presentation: index === 0 || index === chunks.length - 1 || index % 4 === 0 ? "presenter" : "cutaway",
      visualType: "illustration",
      visualPrompt: `Illustrate this explanation faithfully, without adding claims or embedded text: ${narration}`,
      scriptureRef: reference,
      scriptureCue: reference,
      durationMs: estimatedDurationMs(narration),
    };
  });
}
