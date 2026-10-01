// mikasa-mobile/wakeWordMatcher.ts
// Fast, robust on-device keyword matcher for "Hey Mikasa" & "Mikasa"

export interface WakeWordResult {
  matched: boolean;
  trigger?: 'hey mikasa' | 'mikasa';
  rawText: string;
  normalizedText: string;
  remainder: string;
}

// Canonical wake triggers supported
const WAKE_PATTERNS = [
  { trigger: 'hey mikasa', regex: /^(?:(?:uh|um|oh|yo)\s+)?(?:hey|ay|ai|ei|hi|hello)\s*[,.-]?\s*mikasa\b/i },
  { trigger: 'mikasa', regex: /^(?:(?:uh|um|oh|yo)\s+)?(?:ok\s+|okay\s+)?mikasa\b/i }
];

export function normalizeSpeechText(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/\b(?:mi\s+casa|micasa|mecasa)\b/gi, 'mikasa')
    .replace(/[^\w\s\u0980-\u09FF]/g, ' ') // Preserve alphanumeric & Bengali, strip commas/exclamations
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Evaluates whether a spoken phrase contains the wake word.
 * Returns the matched trigger, matched boolean, and any remaining command text.
 */
export function matchWakeWord(text: string): WakeWordResult {
  if (!text || typeof text !== 'string') {
    return { matched: false, rawText: '', normalizedText: '', remainder: '' };
  }

  const raw = text.trim();
  const normalized = normalizeSpeechText(raw);

  if (!normalized) {
    return { matched: false, rawText: raw, normalizedText: '', remainder: '' };
  }

  // Pattern 1: 'Hey Mikasa' (or 'Hi/Ei/Oi/Hello Mikasa', supports natural spoken prefixes)
  const heyPattern = /(?:^|\b)(?:(?:uh|um|oh|yo|so|acha|arre|bolo|ei\s+je)\s+)?(?:hey|ay|ai|ei|oi|hi|hello)\s*[,.-]?\s*mikasa\b/i;
  // Pattern 2: standalone 'Mikasa' or 'Ok Mikasa'
  const mikasaPattern = /(?:^|\b)(?:(?:uh|um|oh|yo|so|acha|arre|bolo)\s+)?(?:ok\s+|okay\s+)?mikasa\b/i;

  let match = normalized.match(heyPattern);
  let trigger: 'hey mikasa' | 'mikasa' = 'hey mikasa';
  if (!match) {
    match = normalized.match(mikasaPattern);
    trigger = 'mikasa';
  }

  if (match && typeof match.index === 'number') {
    const after = normalized.slice(match.index + match[0].length).replace(/^[\s,.:;!?-]+/, '');
    return {
      matched: true,
      trigger,
      rawText: raw,
      normalizedText: normalized,
      remainder: after
    };
  }

  return {
    matched: false,
    rawText: raw,
    normalizedText: normalized,
    remainder: ''
  };
}

declare const module: any;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    matchWakeWord,
    normalizeSpeechText
  };
}
