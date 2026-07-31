// Template utilities shared across components

// Strip emoji, box characters, and other non-BMP characters that video fonts can't render.
// Accepts unknown input for defensive rendering — returns empty string for undefined/null.
export function stripEmoji(text: unknown): string {
  const str = String(text ?? '');
  return str.replace(
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{25A0}-\u{25FF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu,
    ''
  ).trim();
}
