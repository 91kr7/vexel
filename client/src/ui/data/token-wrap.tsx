import { Fragment, memo, useMemo } from 'react';

/**
 * Where a raw daemon payload is allowed to wrap.
 *
 * A daemon body arrives as one line with no spaces in it, so the only wrap the
 * browser can find on its own is an arbitrary one in the middle of whatever
 * character happens to sit at the edge of the box — a digest, an image
 * reference or a mount path cut in half. The break opportunities are therefore
 * placed here, at the payload's own token boundaries, and nowhere else.
 *
 * A boundary sits **after** a structural character that separates one token
 * from the next, outside any quoted string:
 * - `,` and `;` — one item from the next;
 * - `{` and `[` — a container from its first item;
 * - `:` only where it separates a key from its value, i.e. immediately after a
 *   closing quote. A colon inside a bare word (`alpine:3.20`, `sha256:1f2e…`,
 *   `0.0.0.0:8080->80/tcp`) is part of the token and is never a boundary.
 *
 * A quoted string is one token whatever it contains, so a value stays whole and
 * can be selected out of the payload in one piece. A closing `}` or `]` stays
 * attached to the token it closes, and a boundary is not emitted where the next
 * character is whitespace — whitespace already is a wrap opportunity, and one
 * placed in front of it would push the space onto the next line.
 */
export function splitAtTokenBoundaries(text: string): string[] {
  const segments: string[] = [];
  let start = 0;
  let inString = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    const separates =
      char === ',' || char === ';' || char === '{' || char === '[' || (char === ':' && text[index - 1] === '"');
    if (!separates) continue;

    const next = text[index + 1];
    if (next === undefined || /\s/.test(next)) continue;

    segments.push(text.slice(start, index + 1));
    start = index + 1;
  }

  segments.push(text.slice(start));
  return segments;
}

export interface TokenWrappedTextProps {
  text: string;
}

/**
 * A raw payload rendered as text that wraps at its own token boundaries.
 *
 * The opportunities are `<wbr>` elements: they carry no character of their own,
 * so the text stays exactly what the daemon sent — complete, selectable, and
 * copied without a stray break — while the surface stays free to lay it out over
 * as many lines as it needs.
 *
 * Memoised: a payload can be tens of thousands of characters and the transcript
 * around it re-renders on every incoming chunk.
 */
export const TokenWrappedText = memo(function TokenWrappedText({ text }: TokenWrappedTextProps) {
  const segments = useMemo(() => splitAtTokenBoundaries(text), [text]);

  if (segments.length <= 1) return <>{text}</>;

  return (
    <>
      {segments.map((segment, index) => (
        <Fragment key={index}>
          {index > 0 ? <wbr /> : null}
          {segment}
        </Fragment>
      ))}
    </>
  );
});
