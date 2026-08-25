import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chip, ChipGroup, type ChipGroupItem } from '../../src/ui';

afterEach(cleanup);

describe('Chip (ui-library/specs/chip.md)', () => {
  // chip.md — actionLabel and onAction must both be given for the action to show
  it('renders a plain, action-less chip when the action is not given', () => {
    render(<Chip label="app-1" />);

    expect(screen.getByText('app-1')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a plain chip when only actionLabel is given, without onAction', () => {
    render(<Chip label="app-1" actionLabel="detach" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  // chip.md — a chip's inline action calls that chip's onAction
  it('calls onAction when the inline action is used', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<Chip label="app-1" actionLabel="detach" onAction={onAction} />);

    await user.click(screen.getByRole('button', { name: 'detach' }));

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  // chip.md — "meta? — a secondary reading shown after the label, muted (e.g. 256MB); omitted when
  // absent" (REQ-86: a repository's tags with the size each one weighs)
  it('shows the meta reading after the label, muted', () => {
    const { container } = render(<Chip label="1.27" meta="256MB" />);

    const chip = container.querySelector('.ui-chip')!;
    expect(chip).toHaveTextContent('1.27');
    expect(chip).toHaveTextContent('256MB');
    expect(chip.querySelector('.ui-chip__meta')).toHaveTextContent('256MB');
  });

  it('omits the meta reading when there is none', () => {
    const { container } = render(<Chip label="1.27" />);

    expect(container.querySelector('.ui-chip__meta')).toBeNull();
  });

  // chip.md — "its label, its meta reading when given, then its own inline action when given — in
  // that order"
  it('orders the label, the meta reading and the inline action', () => {
    const { container } = render(<Chip label="1.27" meta="256MB" actionLabel="pull" onAction={vi.fn()} />);

    const text = container.querySelector('.ui-chip')!.textContent ?? '';
    expect(text.indexOf('1.27')).toBeLessThan(text.indexOf('256MB'));
    expect(text.indexOf('256MB')).toBeLessThan(text.indexOf('pull'));
  });
});

describe('Chip — clickable as a whole (ui-library/specs/chip.md, REQ-103)', () => {
  // chip.md — "onSelect? — makes the whole chip the click target, for a chip that is itself a
  // starting point"; "a chip carrying onSelect → clicking anywhere on it calls onSelect"
  it('calls onSelect when the chip itself is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Chip label="docker manifest inspect" onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: 'docker manifest inspect' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onSelect from a click on the chip\'s meta reading, not only on its label', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { container } = render(<Chip label="docker sbom" meta="CLI" onSelect={onSelect} />);

    await user.click(container.querySelector('.ui-chip__meta')!);

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  // chip.md — "A chip with onSelect carries no inline action."
  it('shows no inline action on a chip that carries onSelect', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onAction = vi.fn();
    render(<Chip label="docker scout cves" actionLabel="detach" onAction={onAction} onSelect={onSelect} />);

    expect(screen.queryByRole('button', { name: 'detach' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'docker scout cves' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('leaves a chip without onSelect unclickable as a whole', () => {
    render(<Chip label="app-1" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('ChipGroup (ui-library/specs/chip.md)', () => {
  function items(): ChipGroupItem[] {
    return [
      { key: 'app-1', label: 'app-1', actionLabel: 'detach', onAction: vi.fn() },
      { key: 'app-2', label: 'app-2', actionLabel: 'detach', onAction: vi.fn() },
    ];
  }

  // chip.md — one chip per item, its own inline action next to its label when given
  it('shows one chip per item, each with its own inline action', () => {
    render(<ChipGroup items={items()} />);

    expect(screen.getByText('app-1')).toBeInTheDocument();
    expect(screen.getByText('app-2')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'detach' })).toHaveLength(2);
  });

  // chip.md — a chip's inline action calls that specific chip's onAction, not another's
  it('calls only the clicked chip\'s own onAction', async () => {
    const user = userEvent.setup();
    const [first, second] = items();

    render(<ChipGroup items={[first!, second!]} />);
    await user.click(screen.getAllByRole('button', { name: 'detach' })[0]!);

    expect(first!.onAction).toHaveBeenCalledTimes(1);
    expect(second!.onAction).not.toHaveBeenCalled();
  });

  // chip.md — addLabel and onAdd must both be given for the trailing add affordance to show
  it('shows no add affordance when addLabel/onAdd are not both given', () => {
    render(<ChipGroup items={[]} addLabel="+ Attach" />);

    expect(screen.queryByRole('button', { name: '+ Attach' })).not.toBeInTheDocument();
  });

  // chip.md — the trailing add affordance calls onAdd
  it('shows the trailing add affordance and calls onAdd when used', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<ChipGroup items={[]} addLabel="+ Attach" onAdd={onAdd} emptyLabel="No attached containers" />);

    await user.click(screen.getByRole('button', { name: '+ Attach' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  // chip.md — emptyLabel is shown in place of any chip when items is empty
  it('shows the empty-state label in place of any chip when there are no items', () => {
    render(<ChipGroup items={[]} emptyLabel="No attached containers" />);

    expect(screen.getByText('No attached containers')).toBeInTheDocument();
  });

  it('shows no empty-state label once at least one item is present', () => {
    render(<ChipGroup items={items()} emptyLabel="No attached containers" />);

    expect(screen.queryByText('No attached containers')).not.toBeInTheDocument();
  });

  // chip.md — "items: { key, label, meta?, actionLabel?, onAction?, onSelect? }[]": a group of
  // chips that are themselves starting points, each calling its own onSelect (REQ-103)
  it('calls only the clicked chip\'s own onSelect', async () => {
    const user = userEvent.setup();
    const first = { key: 'a', label: 'docker manifest inspect', onSelect: vi.fn() };
    const second = { key: 'b', label: 'docker trust inspect', onSelect: vi.fn() };

    render(<ChipGroup items={[first, second]} />);
    await user.click(screen.getByRole('button', { name: 'docker trust inspect' }));

    expect(second.onSelect).toHaveBeenCalledTimes(1);
    expect(first.onSelect).not.toHaveBeenCalled();
  });

  // chip.md — "items: { key, label, meta?, actionLabel?, onAction? }[] — each rendered as a Chip",
  // meta included: the tag chips of a repository carry the size each tag weighs (REQ-86)
  it('renders each item\'s own meta reading', () => {
    render(
      <ChipGroup
        items={[
          { key: 'v1', label: 'v1', meta: '256MB', actionLabel: 'pull', onAction: vi.fn() },
          { key: 'v2', label: 'v2', actionLabel: 'pull', onAction: vi.fn() },
        ]}
      />,
    );

    expect(screen.getByText('256MB')).toBeInTheDocument();
    expect(document.querySelectorAll('.ui-chip__meta')).toHaveLength(1);
  });
});

// chip.md, widened on 2026-08-25 — the muted prefix that names what the label is, and the accent
// tone that marks the salient chip among its neighbours. What makes a value salient is the
// caller's: the library states the emphasis, never the reason for it
// (plan-docker_management_app-containers_card_view/REQ-5, REQ-30).
/** The controls stylesheet, comments stripped, so a value named in a comment is never read as a declaration. */
const css = readFileSync(join(process.cwd(), 'src', 'ui', 'controls', 'controls.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations written for one selector, joined in source order. */
function declarationsOf(selector: string): string {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((rule) => rule[1].split(',').some((one) => one.trim() === selector))
    .map((rule) => rule[2])
    .join(' ');
}

describe('Chip — the prefix and the accent tone (containers_card_view/REQ-5)', () => {
  it('shows the prefix before the label, and the meta after it, in that order', () => {
    const { container } = render(<Chip prefix="image" label="nginx:1.27" meta="256MB" />);

    const chip = container.querySelector('.ui-chip')!;
    expect(chip.textContent).toBe('imagenginx:1.27256MB');
    expect(chip.querySelector('.ui-chip__prefix')?.textContent).toBe('image');
    expect(chip.querySelector('.ui-chip__label')?.textContent).toBe('nginx:1.27');
  });

  it('marks an accented chip as the salient one, and leaves a neutral one as it was', () => {
    const { container: accented, unmount } = render(<Chip label="49153→5432" tone="accent" />);
    expect(accented.querySelector('.ui-chip')?.className).toBe('ui-chip ui-chip--accent');
    unmount();

    const { container: neutral } = render(<Chip label="49153→5432" />);
    expect(neutral.querySelector('.ui-chip')?.className).toBe('ui-chip');
  });

  it('renders a chip asked for no prefix and no tone exactly as it did before those existed', () => {
    const { container } = render(<Chip label="app-1" />);

    const chip = container.querySelector('.ui-chip')!;
    expect(chip.className).toBe('ui-chip');
    expect(chip.querySelector('.ui-chip__prefix')).toBeNull();
    expect(chip.textContent).toBe('app-1');
  });

  it('takes the accent role\'s own tokens and the muted prefix treatment, declaring no colour of its own', () => {
    const accent = declarationsOf('.ui-chip--accent');
    expect(accent, 'the accent tone declares no treatment of its own').not.toBe('');
    expect(accent).toMatch(/var\(--color-accent[^)]*\)/);
    expect(accent, 'the accent tone writes a colour of its own').not.toMatch(/#[0-9a-f]{3,8}|rgba?\(|hsla?\(/i);
    // "Same muted treatment as meta, one declaration serving both positions": the muted colour is
    // written once for the two of them, and never a second time for the prefix alone.
    const shared = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(
      (rule) => rule[1].includes('.ui-chip__prefix') && rule[1].includes('.ui-chip__meta'),
    );
    expect(shared, 'the prefix and the meta share no declaration at all').not.toHaveLength(0);
    expect(shared.map((rule) => rule[2]).join(' ')).toContain('var(--color-text-muted)');
    const alone = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((rule) => rule[1].includes('.ui-chip__prefix') && !rule[1].includes('.ui-chip__meta'))
      .map((rule) => rule[2])
      .join(' ');
    expect(alone, 'the prefix restates a treatment the meta already declares').not.toMatch(/color\s*:|font-(size|weight|family)\s*:/);
  });
});

// chip.md, widened on 2026-08-25 — `block` takes a line of its own as a **field** rather than a
// pill, and `truncate` decides which end of the label gives way. `'start'` keeps the tail, for a
// value whose tail identifies it: an image's `name:tag` against its registry host
// (plan-docker_management_app-containers_card_view/REQ-5, REQ-12, REQ-30).
describe('Chip — the block field and its front truncation (containers_card_view/REQ-5)', () => {
  it('fills its line as a field, the prefix keeping its width and the label giving way', () => {
    const { container } = render(<Chip block prefix="image" label="registry.io/acme/payments:2.14.0" truncate="start" />);

    const chip = container.querySelector('.ui-chip')!;
    expect(chip.className).toContain('ui-chip--block');

    const block = declarationsOf('.ui-chip--block');
    expect(block, 'the block form is declared nowhere').not.toBe('');
    expect(block).toMatch(/width:\s*100%/);
    // "Rectangular rounding, since a stadium as wide as its container reads as a button."
    expect(block).toMatch(/border-radius:\s*var\(--radius-md\)/);
    expect(declarationsOf('.ui-chip--block .ui-chip__prefix'), 'the prefix gives way instead of the label').toMatch(/flex:\s*none/);
    expect(declarationsOf('.ui-chip--block .ui-chip__label')).toMatch(/min-width:\s*0/);
  });

  it('ellipsises the label at its front, carrying the whole value as its title', () => {
    const reference = 'registry.io/acme-platform/payments-service:2.14.0-rc3';
    const { container } = render(<Chip block prefix="image" label={reference} truncate="start" />);

    const label = container.querySelector('.ui-chip__label')!;
    expect(label.className).toContain('ui-truncating-line');
    expect(label.className).toContain('ui-truncating-line--start');
    expect(label.getAttribute('title')).toBe(reference);
    expect(label.textContent, 'the value is cut in the markup rather than by the ellipsis').toBe(reference);
  });

  it('ellipsises the label at its end when that is what is asked for', () => {
    const { container } = render(<Chip label="a-long-value" truncate="end" />);

    const label = container.querySelector('.ui-chip__label')!;
    expect(label.className).toContain('ui-truncating-line');
    expect(label.className).not.toContain('ui-truncating-line--start');
  });

  it('leaves a chip asked for neither exactly as it was: no truncation, no title, its own width', () => {
    const { container } = render(<Chip label="a-long-value" />);

    const chip = container.querySelector('.ui-chip')!;
    expect(chip.className).toBe('ui-chip');
    const label = chip.querySelector('.ui-chip__label')!;
    expect(label.className).toBe('ui-chip__label');
    expect(label.hasAttribute('title')).toBe(false);
  });
});
