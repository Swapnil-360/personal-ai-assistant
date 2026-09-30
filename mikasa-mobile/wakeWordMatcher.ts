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
  { trigger: 'hey mikasa', regex: /^(?:hey|ay|ai|ei|hi)\s*[,.-]?\s*mikasa\b/i },
  { trigger: 'mikasa', regex: /^mikasa\b/i }
];

export function normalizeSpeechText(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
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

  for (const { trigger, regex } of WAKE_PATTERNS) {
    const rawMatch = raw.match(regex);
    if (rawMatch) {
      const rawAfter = raw.slice(rawMatch[0].length).replace(/^[\s,.:;!?-]+/, '');
      return {
        matched: true,
        trigger: trigger as 'hey mikasa' | 'mikasa',
        rawText: raw,
        normalizedText: normalized,
        remainder: rawAfter
      };
    }

    const normMatch = normalized.match(regex);
    if (normMatch) {
      const normAfter = normalized.slice(normMatch[0].length).replace(/^[\s,.:;!?-]+/, '');
      return {
        matched: true,
        trigger: trigger as 'hey mikasa' | 'mikasa',
        rawText: raw,
        normalizedText: normalized,
        remainder: normAfter
      };
    }
  }

  return {
    matched: false,
    rawText: raw,
    normalizedText: normalized,
    remainder: ''
  };
}

// CommonJS compatibility export for hybrid testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    matchWakeWord,
    normalizeSpeechText
  };
}
