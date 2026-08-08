import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CrossReference, CrossReferenceList } from '../../src/ui';

afterEach(cleanup);

describe('CrossReference (ui-library/specs/cross-reference.md)', () => {
  // cross-reference.md — "available and followable -> the kind, the label and a trailing 'leads to'
  // glyph", and "selecting a followable reference calls its onNavigate"
  it('shows the kind and the label and follows the reference when selected', async () => {
    const onNavigate = vi.fn();
    render(<CrossReference kind="cache entry" label="abc123" onNavigate={onNavigate} />);

    const reference = screen.getByRole('button');
    expect(reference.textContent).toContain('cache entry');
    expect(reference.textContent).toContain('abc123');

    await userEvent.click(reference);

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  // cross-reference.md — "available but not followable -> the kind and the label, without the
  // glyph, inert"
  it('shows an inert reference, with no action, when no onNavigate is given', () => {
    render(<CrossReference kind="cache entry" label="abc123" />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(document.querySelector('.ui-cross-reference')!.textContent).toContain('abc123');
  });

  // cross-reference.md — "unavailable -> the kind and the reason text, in a muted treatment,
  // inert", the reason serving as text and as tooltip
  it('shows the reason as its text and its tooltip, inert, when unavailable', () => {
    render(<CrossReference kind="cache entry" unavailableReason="This step only changed image metadata." />);

    const reference = document.querySelector('.ui-cross-reference--unavailable')!;
    expect(reference.textContent).toContain('This step only changed image metadata.');
    expect(reference.getAttribute('title')).toBe('This step only changed image metadata.');
    expect(screen.queryByRole('button')).toBeNull();
  });

  // cross-reference.md — "unavailableReason takes precedence over label/onNavigate: the reference
  // is rendered muted and inert"
  it('lets the unavailable reason take precedence over a label and a navigation callback', async () => {
    const onNavigate = vi.fn();
    render(<CrossReference kind="cache entry" label="abc123" onNavigate={onNavigate} unavailableReason="No record matches this step." />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(document.body.textContent).not.toContain('abc123');
    expect(document.body.textContent).toContain('No record matches this step.');
    await userEvent.click(document.querySelector('.ui-cross-reference--unavailable')!);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  // cross-reference.md — "A reference is never rendered blank: without a followable target it
  // always shows either its reason, or the list's empty label."
  it('is never rendered blank when unavailable', () => {
    render(<CrossReference unavailableReason="No record matches this step." />);

    expect(document.querySelector('.ui-cross-reference')!.textContent!.trim().length).toBeGreaterThan(0);
  });
});

describe('CrossReferenceList (ui-library/specs/cross-reference.md)', () => {
  // cross-reference.md — "items: each rendered as a CrossReference"
  it('renders one reference per item, each following its own callback', async () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <CrossReferenceList
        items={[
          { key: 'a', kind: 'nginx:1.27', label: 'layer 3 · RUN', onNavigate: first },
          { key: 'b', kind: 'redis:7', label: 'layer 1 · COPY', onNavigate: second },
        ]}
      />,
    );

    const references = screen.getAllByRole('button');
    expect(references).toHaveLength(2);
    expect(references[0]!.textContent).toContain('layer 3 · RUN');
    expect(references[1]!.textContent).toContain('redis:7');

    await userEvent.click(references[1]!);

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  // cross-reference.md — "unavailableReason: when given, replaces the whole set with one
  // unavailable reference carrying that reason"
  it('replaces the whole set with a single unavailable reference when a reason is given', () => {
    render(
      <CrossReferenceList
        items={[{ key: 'a', label: 'layer 3 · RUN', onNavigate: vi.fn() }]}
        unavailableReason="No local image carries a build step matching this record."
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(document.querySelectorAll('.ui-cross-reference--unavailable')).toHaveLength(1);
    expect(document.body.textContent).toContain('No local image carries a build step matching this record.');
    expect(document.body.textContent).not.toContain('layer 3 · RUN');
  });

  // cross-reference.md — "emptyLabel: shown when items is empty and no unavailableReason was given"
  it('shows the empty label when there is nothing to reference and no reason was given', () => {
    render(<CrossReferenceList items={[]} emptyLabel="Nothing related yet" />);

    expect(document.body.textContent).toContain('Nothing related yet');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
