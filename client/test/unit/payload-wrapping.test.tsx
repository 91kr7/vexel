import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { TokenWrappedText, splitAtTokenBoundaries } from '../../src/ui/data/token-wrap';

afterEach(cleanup);

// ui-library/specs/payload-wrapping.md — the one rule for laying a raw daemon payload over several
// lines: the break opportunities the payload itself offers, placed at its token boundaries and
// nowhere else, so no value is cut in half (plan-ui-coherence-optimisation/REQ-76).

/** A daemon body of the shape the console and the six detail panels draw: one line, no spaces. */
const DAEMON_BODY =
  '[{"Id":"9c1e0f5d2b3a4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5","Names":["/vexel-e2e-sample"],'
  + '"Image":"alpine:3.20","ImageID":"sha256:1f2e3d4c5b6a79889a0b1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f6071",'
  + '"Ports":[{"PrivatePort":80,"PublicPort":8080,"Type":"tcp"}],"Mounts":[{"Source":"/var/lib/docker/volumes/data/_data","RW":true}]}]';

/** The style rules of a stylesheet, selector and declarations, comments stripped. */
function rulesOf(relativePath: string): { selector: string; declarations: string }[] {
  const css = readFileSync(join(process.cwd(), relativePath), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((rule) => ({ selector: rule[1].trim(), declarations: rule[2] }));
}

function declarationsFor(relativePath: string, selector: string): string {
  return rulesOf(relativePath)
    .filter((rule) => rule.selector === selector)
    .map((rule) => rule.declarations)
    .join(' ');
}

describe('splitAtTokenBoundaries (plan-ui-coherence-optimisation/REQ-76)', () => {
  // payload-wrapping.md — "concatenating the result returns the input, character for character".
  // The cheapest guard against the failure mode that costs the operator the payload itself.
  it('returns the input character for character when its segments are concatenated', () => {
    const inputs = [
      DAEMON_BODY,
      '',
      '{}',
      'plain text with spaces',
      '{"escaped":"a\\"b:c","tail":[1,2,3]}',
      '{"unbalanced":"never closed,{[:',
      ',;{[:',
      '"',
      'alpine:3.20 0.0.0.0:8080->80/tcp',
    ];

    for (const input of inputs) {
      expect(splitAtTokenBoundaries(input).join(''), `round trip of ${JSON.stringify(input)}`).toBe(input);
    }
  });

  // payload-wrapping.md — a boundary sits after `,` `;` `{` `[` outside a quoted string, and after
  // `:` only where it immediately follows a closing `"`; a closing `}` stays attached to the token
  // it closes
  it('cuts after a separator outside a string, and after a colon only when it ends a key', () => {
    expect(splitAtTokenBoundaries('{"a":1,"b":2}')).toEqual(['{', '"a":', '1,', '"b":', '2}']);
    expect(splitAtTokenBoundaries('a;b')).toEqual(['a;', 'b']);
  });

  // payload-wrapping.md — "a closing } or ] stays attached to the token it closes"
  it('keeps a closing brace or bracket attached to the token it closes', () => {
    expect(splitAtTokenBoundaries('[{"a":1},{"b":2}]')).toEqual(['[', '{', '"a":', '1},', '{', '"b":', '2}]']);
  });

  // payload-wrapping.md — "a double-quoted string is one token whatever it contains", so a digest,
  // an image reference and a mount path are never cut in half
  it('treats a double-quoted string as one token, whatever it holds', () => {
    expect(splitAtTokenBoundaries('{"Image":"sha256:1f2e3d","Mount":"/var/lib/docker/volumes/data/_data"}')).toEqual([
      '{',
      '"Image":',
      '"sha256:1f2e3d",',
      '"Mount":',
      '"/var/lib/docker/volumes/data/_data"}',
    ]);
    // Every quoted string of a real body survives whole.
    const segments = splitAtTokenBoundaries(DAEMON_BODY);
    for (const quoted of DAEMON_BODY.match(/"(?:[^"\\]|\\.)*"/g) ?? []) {
      expect(segments.some((segment) => segment.includes(quoted)), `${quoted} was cut in two`).toBe(true);
    }
  });

  // payload-wrapping.md — "a \" inside it does not end it"
  it('does not end a string on an escaped quote', () => {
    expect(splitAtTokenBoundaries('"a\\"b:c",1')).toEqual(['"a\\"b:c",', '1']);
  });

  // payload-wrapping.md — "an unbalanced " merely leaves the rest of the line without boundaries"
  it('leaves the rest of the line without boundaries after an unbalanced quote', () => {
    expect(splitAtTokenBoundaries('{"a:1,2')).toEqual(['{', '"a:1,2']);
  });

  // payload-wrapping.md — "a : inside a bare word is part of the word"
  it('never cuts a bare word carrying a colon', () => {
    expect(splitAtTokenBoundaries('alpine:3.20 0.0.0.0:8080->80/tcp')).toEqual(['alpine:3.20 0.0.0.0:8080->80/tcp']);
  });

  // payload-wrapping.md — "no boundary is emitted where the next character is whitespace ... nor at
  // the very end of the text"
  it('emits no boundary before whitespace and none at the end of the text', () => {
    expect(splitAtTokenBoundaries('{ "a": 1, "b": 2 }')).toEqual(['{ "a": 1, "b": 2 }']);
    expect(splitAtTokenBoundaries('value,')).toEqual(['value,']);
  });
});

describe('TokenWrappedText (plan-ui-coherence-optimisation/REQ-76)', () => {
  // payload-wrapping.md — "Renders exactly the characters of text and no others: the opportunities
  // are <wbr> elements, which carry no character"
  it('renders exactly the characters of the payload, the opportunities carrying none', () => {
    const { container } = render(<TokenWrappedText text={DAEMON_BODY} />);

    expect(container.textContent).toBe(DAEMON_BODY);
    const breaks = container.querySelectorAll('wbr');
    expect(breaks.length).toBe(splitAtTokenBoundaries(DAEMON_BODY).length - 1);
    for (const opportunity of breaks) expect(opportunity.textContent).toBe('');
  });

  // payload-wrapping.md — "Where the text carries no boundary it renders as the plain string"
  it('renders a text with no boundary as the plain string', () => {
    const line = 'CONTAINER ID   IMAGE   COMMAND';
    const { container } = render(<TokenWrappedText text={line} />);

    expect(container.querySelectorAll('wbr')).toHaveLength(0);
    expect(container.textContent).toBe(line);
  });

  // payload-wrapping.md — "The text is never altered": no ellipsis, no clamp, and nothing invisible
  // added, so what a selection yields is the daemon's own text
  it('inserts no character of its own, visible or not', () => {
    const { container } = render(<TokenWrappedText text={DAEMON_BODY} />);

    // A zero-width space, a zero-width non-joiner, a soft hyphen, an ellipsis: the characters a
    // wrapping trick inserts, each of which would travel with a selected value.
    expect(container.textContent).not.toMatch(/[\u200B\u200C\u00AD\u2026]/);
    expect(JSON.parse(container.textContent ?? '')).toHaveLength(1);
  });
});

describe('the two blocks that draw a payload (plan-ui-coherence-optimisation/REQ-76)', () => {
  // payload-wrapping.md — "A token is split only when no line can hold it" and "the block's minimum
  // width is unchanged by this rule": an arbitrary break is the last resort, and `overflow-wrap:
  // anywhere` is the declaration that keeps it to that. `word-break: break-all` would break a token
  // at every width instead, and `break-word` also dictates the block's minimum width.
  it('declares the arbitrary break as a last resort only, on both blocks', () => {
    for (const [stylesheet, selector] of [
      ['src/ui/console/console-surface.css', '.ui-console-surface__line'],
      ['src/ui/data/data-table.css', '.ui-code-viewer__code'],
    ] as const) {
      const declarations = declarationsFor(stylesheet, selector);

      expect(declarations, `${selector} does not declare the last-resort wrap`).toMatch(/overflow-wrap\s*:\s*anywhere/);
      expect(declarations, `${selector} breaks tokens at every width`).not.toMatch(/word-break\s*:\s*break-all/);
      expect(declarations, `${selector} still uses the deprecated word-break`).not.toMatch(/word-break\s*:\s*break-word/);
      // The payload is never shortened to fit: no clamp, no ellipsis.
      expect(declarations, `${selector} truncates the payload`).not.toMatch(/text-overflow\s*:\s*ellipsis|-webkit-line-clamp/);
    }
  });
});
