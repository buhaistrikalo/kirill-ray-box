export type SupportedLanguage = "ru" | "en";

export function detectLanguage(text: string): SupportedLanguage {
  const cyrillicLetters = text.match(/[А-Яа-яЁё]/g)?.length ?? 0;
  const latinLetters = text.match(/[A-Za-z]/g)?.length ?? 0;

  return cyrillicLetters > latinLetters ? "ru" : "en";
}

export function getTargetLanguage(
  sourceLanguage: SupportedLanguage,
): SupportedLanguage {
  return sourceLanguage === "ru" ? "en" : "ru";
}
