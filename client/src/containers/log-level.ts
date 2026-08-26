import type { LogStreamLevel } from '../ui';

/**
 * The level a log line's own text **states**, and nothing else: a colour put on
 * a line that never claimed to be an error costs the trust in every other line,
 * so a line carrying no recognised marker gets no level at all.
 *
 * A domain reading and a deliberate guess, which is why it lives here and never
 * in the UI library.
 */

/** Level names, in the exact spellings the reading admits. Nothing else is a marker. */
const MARKERS: Record<LogStreamLevel, string[]> = {
  error: ['ERROR', 'ERR', 'FATAL', 'CRITICAL', 'CRIT', 'PANIC', 'SEVERE', 'EMERG', 'ALERT'],
  warn: ['WARN', 'WARNING'],
};

// A marker is a whole token: preceded by the line's start, a space or an opening
// bracket, and followed by its end, a space or a closing/punctuating character.
// `=` and `_` are deliberately absent from both sides, so `LOG_LEVEL=ERROR`
// states nothing; `-` and `/` likewise, so `error-report` and `/api/error/` do
// not either.
const OPENS = String.raw`(?:^|[\s([{<|])`;
const CLOSES = String.raw`(?=$|[\s)\]}>|:;,.!])`;

/** Upper case only: the word `error` inside a sentence or a path is not a marker. */
function bareMarker(markers: string[]): RegExp {
  return new RegExp(`${OPENS}(?:${markers.join('|')})${CLOSES}`);
}

/** `level=warning`, `lvl: err`, `"severity":"CRITICAL"` — the key and the value both case-insensitive. */
function declaredLevel(markers: string[]): RegExp {
  return new RegExp(String.raw`(?:^|[\s{,[])"?(?:level|lvl|severity)"?\s*[:=]\s*"?(?:${markers.join('|')})(?![\w-])`, 'i');
}

/** The line's first token, in any case, immediately followed by a colon: `error: cannot connect`. */
function leadingMarker(markers: string[]): RegExp {
  return new RegExp(String.raw`^\s*(?:${markers.join('|')})\s*:`, 'i');
}

const READINGS: { level: LogStreamLevel; forms: RegExp[] }[] = (['error', 'warn'] as LogStreamLevel[]).map((level) => ({
  level,
  forms: [bareMarker(MARKERS[level]), declaredLevel(MARKERS[level]), leadingMarker(MARKERS[level])],
}));

/**
 * `'error'`, `'warn'`, or `undefined` for every line that states neither — which
 * is a result and not a failure: the caller leaves such a line neutral.
 * Error outranks warn wherever a line states both.
 */
export function readLogLevel(text: string): LogStreamLevel | undefined {
  return READINGS.find((reading) => reading.forms.some((form) => form.test(text)))?.level;
}
