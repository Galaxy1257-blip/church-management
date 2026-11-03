// A bundle's own version name usually already says what language it is, so
// "Twi (TWI (Asante))" is one name said twice.
export function translationLabel(t: { translation: string; language: string }): string {
  const name = t.translation.trim();
  const language = t.language.trim();
  if (!language || name.toLowerCase().includes(language.toLowerCase())) return name;
  return `${language} (${name})`;
}
