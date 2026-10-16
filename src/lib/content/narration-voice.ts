/** Shared by generation, editorial approval, and the standalone render worker. */
export const NARRATION_VOICE_VERSION = "first-person-v1";

export const FIRST_PERSON_NARRATION_RULES = [
  "Write spoken teaching in the FIRST PERSON, as if I am personally explaining my own understanding directly to my audience.",
  "Use I/my for my interpretation and we/us/our when inviting the audience into the lesson. Neutral factual sentences are fine within this first-person teaching voice.",
  "The supplied explanation is MY teaching material, not a third-party source to describe. Never say 'the creator explains', 'according to the creator', 'the creator's interpretation', 'the author says', 'your explanation says', or similar attribution to the person who supplied it.",
  "For example, say 'I understand this passage to mean...' or 'Let us explore...' rather than 'The creator believes this passage means...'. Apply this voice to the full lesson, every short, and regenerated hooks and sections.",
  "Preserve my meaning, convictions, and uncertainty. Do not invent personal experiences, memories, credentials, or testimony to make the narration first-person.",
  "Keep Scripture quotations exact and in their original grammatical person. God may still be called the Creator; this rule concerns references to the human author of the supplied explanation.",
].join(" ");

// Leave quoted material alone: Scripture can contain first- or third-person speech.
const unquoted = (text: string) => text.replace(/“[^”]*”|"[^"]*"/g, " ");
const attribution = /\b(?:according to the (?:content )?creator|the content creator\b|the creator(?:['’]s) (?:explanation|interpretation|teaching|point|view)|the creator (?:explains|says|believes|emphasizes|argues|notes|points out|teaches|thinks|mentions|states|describes|suggests|concludes)|the (?:supplied|provided|creator['’]s) explanation (?:says|explains|emphasizes|suggests)|your explanation (?:says|explains|emphasizes|suggests)|the author (?:says|explains|believes|emphasizes|argues|notes))\b/i;

export function assertNoCreatorAttribution(text: string) {
  if (attribution.test(unquoted(text))) throw new Error("Narration must speak directly in your first-person teaching voice, without referring to the creator or author. Regenerate or revise the script.");
}

export function assertFirstPersonNarration(text: string) {
  assertNoCreatorAttribution(text);
  if (!/\b(?:I|me|my|mine|we|us|our|ours)\b/i.test(unquoted(text))) throw new Error("Narration must use your first-person teaching voice (I/my or we/us/our). Regenerate or revise the script.");
}

/** Local development preserves supplied teaching and adds only a direct teaching introduction. */
export function firstPersonDevelopmentExplanation(text: string) {
  assertNoCreatorAttribution(text);
  return /\b(?:I|me|my|mine|we|us|our|ours)\b/i.test(unquoted(text)) ? text : `Let us explore this together.\n\n${text}`;
}
