import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { CodeViewer, ConsoleSurface, DefinitionList, LogStream, type ConsoleEntry, type DefinitionItem } from '../../src/ui';

/**
 * **The render sites and the surfaces behind them hold what their specs say
 * they hold — and nothing else.** REQ ids belong to
 * `plan-docker_management_app-remove_copy_controls`.
 *
 * Written from the component specs (`ui-library/specs/{definition-list,
 * code-viewer,log-stream,console-surface}.md`), never from the implementation.
 *
 * **The masked-value site and the seven swarm ones left on 2026-08-27** with the
 * area and with the component that carried the join tokens
 * (plan-docker_management_app-swarm_removal/REQ-1, REQ-14). The registry login's
 * own masked field is a different component and is covered by its own check.
 *
 * **The criterion is a control, never a word.** Every assertion below counts the
 * interactive elements a container holds and compares that list against the
 * survivors its spec names (`Download`, `Re-run`, `Show`/`Hide`, the caller's one
 * extra action). An icon-only control, a control under another name, or a control
 * carrying no text at all is still a member of that list and still fails —
 * which a search for a label would not (REQ-25).
 *
 * **No geometric claim is made here.** jsdom reports every box as zero, so a
 * height, a gap or a column count asserted in this tree would pass on any build,
 * defect included; those are `e2e/copy-affordance-geometry.spec.ts`'s. What this
 * tree can say is *which elements exist* — the presence of an action row element
 * is checked here, the space it consumes is not.
 *
 */

/** A control the operator can operate, whatever it is called and whether or not it carries text. */
const CONTROL_SELECTOR = 'button, [role="button"], a[href], input:not([type="hidden"])';

afterEach(cleanup);

/** The controls a container holds, by their accessible text — `<tag>` for one that carries none. */
function controlsIn(container: Element): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)).map(
    (control) => control.textContent?.trim() || `<${control.tagName.toLowerCase()}>`,
  );
}

function bands(root: ParentNode = document.body): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.ui-definition-list__row'));
}

/** Every band of a section, over all of them and never the first (REQ-26). */
function controlsPerBand(root: ParentNode = document.body): string[] {
  return bands(root).flatMap((band) => controlsIn(band).map((control) => `${band.querySelector('.ui-definition-list__label')?.textContent}: ${control}`));
}

/**
 * REQ-3 — a `title` carrying the value is the same affordance under another name,
 * and the cheapest way to reintroduce it: it takes no control and no clipboard.
 */
function titledElements(root: ParentNode = document.body): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[title]')).map((element) => `${element.tagName.toLowerCase()}[title=${element.getAttribute('title')}]`);
}

// ─── REQ-8 · the retired field is off the public API, provably ───────────────

/**
 * **The positive form of REQ-8, and the only one there is.** A field left on the
 * type with no renderer typechecks exactly as well as no field at all, so the
 * suite passing says nothing on its own; this states the removal as a type the
 * compiler has to agree with. If the field ever comes back, this line stops
 * compiling and `npm run test:typecheck -w client` fails — which is where the
 * requirement says it must fail.
 */
const retiredCopyFieldIsNotOnTheItemType: 'copyValue' extends keyof DefinitionItem ? never : true = true;

// ─── the five library render sites ───────────────────────────────────────────

describe('DefinitionList — a band is its label and its value (ui-library/specs/definition-list.md)', () => {
  const ITEMS: DefinitionItem[] = [
    { label: 'Id', value: 'sha256:d9e853e87e55' },
    { label: 'Mountpoint', value: '/var/lib/docker/volumes/data/_data' },
    { label: 'Command', value: '–' },
  ];

  // "A band renders its label and its value and nothing else" (REQ-7, REQ-13, REQ-26).
  it('renders no control in any band, over every band of the section', () => {
    render(<DefinitionList items={ITEMS} />);

    expect(bands()).toHaveLength(ITEMS.length);
    expect(controlsPerBand(), 'a property band still holds a control beside its value').toEqual([]);
  });

  // REQ-16 — beside the behavioural half, never instead of it: the value is still there, verbatim.
  it('shows every value exactly as it was given', () => {
    render(<DefinitionList items={ITEMS} />);

    const values = Array.from(document.querySelectorAll('.ui-definition-list__value')).map((value) => value.textContent);
    expect(values).toEqual(ITEMS.map((item) => item.value));
  });

  // REQ-3 — nothing replaces the control: no title carrying the value, no handler on the value.
  it('puts the value in no attribute, so no tooltip carries it either', () => {
    render(<DefinitionList items={ITEMS} />);

    expect(titledElements(), 'a band carries a title attribute, which is the removed affordance renamed').toEqual([]);
  });

  // A value the caller builds itself is still a value: the component adds nothing to it.
  it('adds nothing of its own to a value the caller renders', () => {
    const value: ReactNode = <span data-testid="callers-value">whatever the caller drew</span>;
    render(<DefinitionList items={[{ label: 'Path', value }]} />);

    expect(screen.getByTestId('callers-value')).toBeInTheDocument();
    expect(controlsPerBand()).toEqual([]);
  });

  /**
   * **The criterion is shown to be able to fail, on this very build.**
   *
   * Every assertion above is an empty list, and an empty list is what a detector
   * that finds nothing produces too — the exact way a removal is certified by a
   * check that could never have caught it. So the same detector is pointed at a
   * band that *does* hold a control, built here in the test rather than by
   * changing anything that ships, and it must report it. The control carries no
   * text at all, which is the icon-only instance a search for a label would miss
   * (REQ-25). No feature file passes a value like this one — that is what the
   * source-level check asserts, and this states what would happen if one did.
   */
  it('reports a control smuggled in as a value, text or no text', () => {
    render(<DefinitionList items={[{ label: 'Id', value: <button type="button" aria-label="anything" /> }]} />);

    expect(controlsPerBand()).toEqual(['Id: <button>']);
  });

  // And the same for the tooltip route: a title on a value is found when there is one.
  it('reports a value carrying a title attribute when there is one', () => {
    render(<DefinitionList items={[{ label: 'Id', value: <span title="sha256:the-whole-thing">sha256:short</span> }]} />);

    expect(titledElements()).toEqual(['span[title=sha256:the-whole-thing]']);
  });
});

describe('CodeViewer — the block draws nothing above the payload (ui-library/specs/code-viewer.md)', () => {
  const CODE = '{\n  "Id": "sha256:0123456789abcdef",\n  "Image": "alpine:3.20"\n}';

  // "The block draws nothing above the payload" (REQ-7, REQ-11).
  it('draws no action row element at all, and no control anywhere in the block', () => {
    const { container } = render(<CodeViewer code={CODE} />);
    const block = container.querySelector('.ui-code-viewer')!;

    expect(block.querySelector('.ui-code-viewer__actions'), 'the action row survives the only child it held').toBeNull();
    expect(controlsIn(block), 'the code block still holds a control').toEqual([]);
  });

  // REQ-16, REQ-19 — "shown in full as selectable text": the payload the fallback rests on is the
  // whole payload, character for character.
  it('shows the payload in full, exactly as it was given', () => {
    const { container } = render(<CodeViewer code={CODE} />);

    expect(container.querySelector('.ui-code-viewer__code')?.textContent).toBe(CODE);
    expect(titledElements(container)).toEqual([]);
  });
});

describe('LogStream — the action row holds Download or is not drawn (ui-library/specs/log-stream.md)', () => {
  const LINES = [
    { id: '1', text: 'hello-from-stdout' },
    { id: '2', text: 'second-line' },
  ];

  // "When it is not given the row has nothing to hold and is not rendered at all" (REQ-12).
  it('draws no action row at all when no download file name is given', () => {
    const { container } = render(<LogStream lines={LINES} />);

    expect(container.querySelectorAll('.ui-log-stream__actions'), 'an action row survives with nothing to hold').toHaveLength(0);
  });

  // "an action row appears above the region holding a download action" — that one, and no other
  // (REQ-7, REQ-13).
  it('holds the download action and nothing besides it when a file name is given', () => {
    const { container } = render(<LogStream lines={LINES} downloadFileName="whatever-logs.txt" />);
    const actions = container.querySelector('.ui-log-stream__actions')!;

    expect(actions).not.toBeNull();
    expect(controlsIn(actions)).toEqual(['Download']);
  });

  // REQ-20 — the equivalent that remains, on the surface it remains on: the whole buffer, one line
  // per row. The cost the report records is that this is now the only route off the surface.
  it('still saves the whole buffer under the name it was given', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn().mockReturnValue('blob:whatever');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    try {
      render(<LogStream lines={LINES} downloadFileName="whatever-logs.txt" />);
      await user.click(screen.getByRole('button', { name: 'Download' }));

      const blob = createObjectURL.mock.calls[0]![0] as Blob;
      expect(await blob.text()).toBe('hello-from-stdout\nsecond-line');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('ConsoleSurface — an entry keeps its status and its re-run (ui-library/specs/console-surface.md)', () => {
  function entry(overrides: Partial<ConsoleEntry> = {}): ConsoleEntry {
    return {
      id: 'first',
      command: 'docker ps',
      lines: [{ id: 'a', text: 'CONTAINER ID' }],
      status: 'exit 0',
      statusTone: 'success',
      ...overrides,
    };
  }

  function surface(props: Partial<Parameters<typeof ConsoleSurface>[0]> = {}) {
    return render(<ConsoleSurface entries={[entry(), entry({ id: 'second', command: 'docker info' })]} value="" onChange={() => undefined} onSubmit={() => undefined} {...props} />);
  }

  // "Re-run (on every entry, only when onRerun is set)" — so with no `onRerun` an entry offers no
  // control whatever, and with one it offers that alone (REQ-7, REQ-13, REQ-26).
  it('offers no control at all on any entry when no re-run is offered', () => {
    const { container } = surface();

    const groups = Array.from(container.querySelectorAll('.ui-console-surface__entry-actions'));
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => controlsIn(group))).toEqual([[], []]);
  });

  it('offers the re-run and nothing besides it, on every entry and not the first', () => {
    const { container } = surface({ onRerun: () => undefined });

    const groups = Array.from(container.querySelectorAll('.ui-console-surface__entry-actions'));
    expect(groups.map((group) => controlsIn(group))).toEqual([['Re-run'], ['Re-run']]);
    // REQ-13 — the badges beside it are untouched: the group did not lose a sibling's neighbours.
    expect(groups.every((group) => group.querySelector('.ui-badge') !== null)).toBe(true);
  });

  // REQ-18 — the transcript itself is unchanged: the command as typed, and its output under it.
  it('keeps the command as it was given and its output under it', () => {
    const { container } = surface({ onRerun: () => undefined });

    expect(container.querySelector('.ui-console-surface__command')?.textContent).toBe('docker ps');
    expect(container.querySelector('.ui-console-surface__line')?.textContent).toBe('CONTAINER ID');
  });
});

describe('the removal left the public API stating what it states', () => {
  // REQ-8 — read here as a value so the type-level statement above is part of a test that runs,
  // rather than a declaration a reader could take for dead code.
  it('states no copy field on the definition-list item type', () => {
    expect(retiredCopyFieldIsNotOnTheItemType).toBe(true);
  });
});
