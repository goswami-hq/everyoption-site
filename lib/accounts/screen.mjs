// The automatic screen on anything a doctor types for a card (plan, stage 2): no links, emails or phone numbers in
// free text, no patient stories, no promise or superlative words. Blocked text is refused with its reasons; nobody
// reviews routine edits.
export const BLURB_MAX = 300;

const RULES = [
  ["link", /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(com|org|net|health|clinic|md|us|io|co|info|care|doctor|edu)\b/i],
  ["email", /[^\s@]+@[^\s@]+\.[a-z]{2,}/i],
  ["phone", /(?:\+?1[\s.-]*)?\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}\b/],
  ["patient_story", new RegExp([
    String.raw`\b(my|our|a|one|this|that|the) patients?\b[^.]{0,60}\b(was|were|is|had|has|told|said|says|felt|came|went|got|walked|reported|able|story|stories|experience)\b`,
    String.raw`\bpatients? (told|said|says|reported|felt|came|stories|story|testimonials?|reviews?|experiences?)\b`,
    String.raw`\btestimonials?\b`,
    String.raw`\b\d{1,3}[- ]?(year|yr)s?[- ]old\b`,
    String.raw`\bcase (report|study|studies)\b`,
    String.raw`\b(she|he|they) (felt|walked|went home|was able|were able|could|is now|are now|was pain|had no)\b`,
  ].join("|"), "i")],
  ["patient_story", /\b(Mr|Mrs|Ms)\.? [A-Z][a-z]+/],
  ["promise", /\bguarantee(d|s)?\b|\bbest\b|\bcur(e|es|ed|ing)\b|\bmiracle\b|\bpainless\b|\brisk[- ]free\b|#\s?1\b|\bnumber one\b|\btop[- ]rated\b|\bworld[- ]class\b|\b100\s?%/i],
];

export function screen(text, max = BLURB_MAX, skip = []) {
  const s = String(text ?? "");
  const reasons = [];
  if (s.length > max) reasons.push("too_long");
  for (const [name, rx] of RULES) if (!skip.includes(name) && rx.test(s) && !reasons.includes(name)) reasons.push(name);
  return { ok: reasons.length === 0, reasons };
}
