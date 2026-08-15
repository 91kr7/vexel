/**
 * The field's focus handle (`ui-library/specs/search-field.md`), added so that an
 * empty state whose way out is "type a term" can send the cursor to the box
 * (`plan-ui-coherence-optimisation/REQ-38`).
 *
 * Two claims, and the second is the one that keeps the boundary: the handle
 * exposes `{ focus() }` **and nothing else**, so a caller can reach the field
 * without ever holding the element behind it. `TextField` forwards a real
 * element ref, and that forwarding is intra-library — it is how `SearchField`
 * reaches the input it renders.
 */
import { createRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SearchField, TextField, type SearchFieldHandle } from '../../src/ui';

afterEach(cleanup);

describe('SearchField — the focus handle (ui-library/specs/search-field.md)', () => {
  it('puts the cursor in the field when the handle is asked to', () => {
    const handle = createRef<SearchFieldHandle>();
    render(<SearchField ref={handle} value="" onChange={() => undefined} ariaLabel="Search repositories" />);
    expect(document.activeElement).not.toBe(screen.getByLabelText('Search repositories'));

    handle.current!.focus();

    expect(document.activeElement).toBe(screen.getByLabelText('Search repositories'));
  });

  it('exposes the one verb and no access to the element behind it', () => {
    const handle = createRef<SearchFieldHandle>();

    render(<SearchField ref={handle} value="" onChange={() => undefined} ariaLabel="Search repositories" />);

    expect(Object.keys(handle.current!)).toEqual(['focus']);
    expect(handle.current).not.toBeInstanceOf(HTMLElement);
  });
});

describe('TextField — the element ref it forwards (ui-library/specs/search-field.md)', () => {
  it('forwards a ref to the field itself', () => {
    const ref = createRef<HTMLInputElement>();

    render(<TextField ref={ref} value="" onChange={() => undefined} ariaLabel="Registry username" />);

    expect(ref.current).toBe(screen.getByLabelText('Registry username'));
  });
});
