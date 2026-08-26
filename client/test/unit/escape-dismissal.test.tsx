import { useRef, useState } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, DataTable, DetailPanel, Frame, Grid, Menu, Modal, Stack, Terminal, type DataTableColumn } from '../../src/ui';
import * as libraryEntryPoint from '../../src/ui';
// Internal to the library on purpose (ui-library/specs/escape-arbitration.md).
import { useKeystrokeRegion } from '../../src/ui/controls/escape-arbitration';

afterEach(cleanup);

/**
 * The declarations of a CSS rule. jsdom loads no stylesheet, so a contract the
 * library expresses in CSS — space reserved for a control, or a focus ring shown
 * to the keyboard alone — is read from the stylesheet itself, as
 * `data-table.test.tsx` does.
 */
function ruleBody(css: string, selector: string): string {
  const match = new RegExp(`(?:^|\\}|\\*/)\\s*${selector.replace(/[.\-:]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`no CSS rule for ${selector}`);
  return match[1];
}

function stylesheet(...segments: string[]): string {
  return readFileSync(join(process.cwd(), 'src', 'ui', ...segments), 'utf8');
}

interface Row {
  id: string;
}

const columns: DataTableColumn<Row>[] = [{ id: 'id', header: 'ID', render: (row) => row.id }];

function panelRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.ui-detail-panel');
}

function closeControl() {
  return screen.queryByRole('button', { name: 'Close detail' });
}

describe('DetailPanel — the presentation variant (REQ-1, REQ-2, REQ-13, REQ-14)', () => {
  // detail-panel.md — `dismissal` defaults to `'close-control'`, the presentation the panel has always had
  it('presents its close control when no dismissal is asked for', () => {
    render(<DetailPanel onClose={vi.fn()}>body</DetailPanel>);

    expect(closeControl()).toBeInTheDocument();
  });

  // detail-panel.md — `'close-control'` presents the close control, which calls onClose
  it('presents the close control when it is asked for, and closes with it', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <DetailPanel dismissal="close-control" onClose={onClose}>
        body
      </DetailPanel>,
    );

    await user.click(closeControl()!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // detail-panel.md — `'opening-gesture'` presents no close control, and nothing takes its place
  it('presents no close control at all in the opening-gesture presentation', () => {
    render(
      <DetailPanel dismissal="opening-gesture" onClose={vi.fn()}>
        body
      </DetailPanel>,
    );

    expect(closeControl()).not.toBeInTheDocument();
    expect(document.querySelector('.ui-detail-panel__close')).toBeNull();
    // No collapse link, no chevron, no rendered keyboard hint: the panel's only
    // control is the one its own body carries, and this body carries none.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(panelRoot()!.textContent).toBe('body');
  });

  // detail-panel.md — without the control, the header keeps no padding reserved for it
  it('reserves no space where the close control would have been', () => {
    render(
      <DetailPanel dismissal="opening-gesture" title="Title" onClose={vi.fn()}>
        body
      </DetailPanel>,
    );

    const css = stylesheet('glass', 'detail-panel.css');
    expect(panelRoot()!.className).toContain('ui-detail-panel--no-close');
    // The presentation that has the control reserves its space; the one without
    // it gives that space back instead of leaving a gap where the glyph sat.
    expect(ruleBody(css, '.ui-detail-panel__header')).toMatch(/padding-right:\s*\d+px/);
    expect(ruleBody(css, '.ui-detail-panel--no-close .ui-detail-panel__header')).toMatch(/padding-right:\s*0/);
  });
});

describe('DetailPanel — Escape dismissal (REQ-5, REQ-6, REQ-10)', () => {
  // detail-panel.md — `Escape` calls onClose in the opening-gesture presentation
  it('closes the opening-gesture panel on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <DetailPanel dismissal="opening-gesture" onClose={onClose}>
        body
      </DetailPanel>,
    );

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // detail-panel.md — `Escape` dismisses from wherever the focus sits inside the panel's body (REQ-6)
  it('closes the panel from a control reached by Tab inside its own body', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <DetailPanel dismissal="opening-gesture" onClose={onClose}>
        <Button onClick={vi.fn()}>Inside the panel</Button>
      </DetailPanel>,
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'Inside the panel' })).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // detail-panel.md — the presentation with a close control claims no key, so images gains no Escape route (REQ-14)
  it('leaves Escape alone in the presentation that keeps its close control', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DetailPanel onClose={onClose}>body</DetailPanel>);

    await user.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
  });

  // escape-arbitration.md — a claim is held only while the surface is rendered
  it('stops claiming the key once the panel is gone', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const view = render(
      <DetailPanel dismissal="opening-gesture" onClose={onClose}>
        body
      </DetailPanel>,
    );

    view.unmount();
    await user.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Escape arbitration — with nothing claiming the key (REQ-10)', () => {
  /** Every `keydown` listener installed on the document, counted as it is installed and removed. */
  function documentKeydownSpies() {
    const added: string[] = [];
    const removed: string[] = [];
    const originalAdd = document.addEventListener.bind(document);
    const originalRemove = document.removeEventListener.bind(document);
    vi.spyOn(document, 'addEventListener').mockImplementation(((type: string, ...rest: unknown[]) => {
      if (type === 'keydown') added.push(type);
      return originalAdd(type as keyof DocumentEventMap, ...(rest as [never, never]));
    }) as typeof document.addEventListener);
    vi.spyOn(document, 'removeEventListener').mockImplementation(((type: string, ...rest: unknown[]) => {
      if (type === 'keydown') removed.push(type);
      return originalRemove(type as keyof DocumentEventMap, ...(rest as [never, never]));
    }) as typeof document.removeEventListener);
    return { added, removed };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // escape-arbitration.md — with no claim standing, no listener is bound at all
  it('binds no document keydown listener while no surface claims the key', () => {
    const { added } = documentKeydownSpies();

    render(<DetailPanel onClose={vi.fn()}>body</DetailPanel>);

    expect(added).toHaveLength(0);
  });

  // escape-arbitration.md — the listener is installed with the first claim and removed with the last
  it('binds one listener with the first claim and removes it with the last', () => {
    const { added, removed } = documentKeydownSpies();

    const view = render(
      <DetailPanel dismissal="opening-gesture" onClose={vi.fn()}>
        body
      </DetailPanel>,
    );
    expect(added).toHaveLength(1);
    expect(removed).toHaveLength(0);

    view.unmount();
    expect(removed).toHaveLength(1);
  });

  // escape-arbitration.md — with no claimant the key is left entirely alone: nothing is prevented, nothing is swallowed
  it('neither prevents nor swallows the key when nothing claims it', async () => {
    const user = userEvent.setup();
    const observed: Array<{ prevented: boolean }> = [];
    const observer = (event: Event) => {
      if ((event as KeyboardEvent).key === 'Escape') observed.push({ prevented: event.defaultPrevented });
    };
    document.addEventListener('keydown', observer);
    try {
      render(<DetailPanel onClose={vi.fn()}>body</DetailPanel>);

      await user.keyboard('{Escape}');

      expect(observed).toHaveLength(1);
      expect(observed[0].prevented).toBe(false);
    } finally {
      document.removeEventListener('keydown', observer);
    }
  });
});

describe('Escape arbitration — the innermost claimant, and only it (REQ-7, REQ-9)', () => {
  function PanelWithMenu({ onClose }: { onClose: () => void }) {
    const [open, setOpen] = useState(true);
    if (!open) return null;
    return (
      <DetailPanel
        dismissal="opening-gesture"
        onClose={() => {
          setOpen(false);
          onClose();
        }}
      >
        <Menu label="More actions for web-1" entries={[{ id: 'rename', label: 'Rename…', onSelect: vi.fn() }]} />
      </DetailPanel>
    );
  }

  // menu.md, escape-arbitration.md — a menu opened over the panel takes the key and closes alone; the panel takes the next one
  it('closes the open menu on the first Escape and the panel on the second', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PanelWithMenu onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'More actions for web-1' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(panelRoot()).not.toBeNull();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(panelRoot()).toBeNull();
  });

  // menu.md — the focus still returns to the trigger when Escape closes the menu
  it('returns the focus to the menu trigger when Escape closes the menu', async () => {
    const user = userEvent.setup();
    render(<PanelWithMenu onClose={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'More actions for web-1' });

    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(trigger).toHaveFocus();
  });

  function PanelUnderDialog({ onClose }: { onClose: () => void }) {
    const [panelOpen, setPanelOpen] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setDialogOpen(true)}>Open the dialog</Button>
        {panelOpen ? (
          <DetailPanel
            dismissal="opening-gesture"
            onClose={() => {
              setPanelOpen(false);
              onClose();
            }}
          >
            panel body
          </DetailPanel>
        ) : null}
        <Modal open={dialogOpen} title="Confirm: web-1" onClose={() => setDialogOpen(false)}>
          dialog body
        </Modal>
      </>
    );
  }

  // modal.md — while a dialog is open, Escape closes no dialog and dismisses nothing behind it (REQ-9)
  it('dismisses neither the dialog nor the panel behind it while a dialog is open', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PanelUnderDialog onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Open the dialog' }));
    expect(screen.getByText('dialog body')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.getByText('dialog body')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(panelRoot()).not.toBeNull();
  });

  // modal.md, escape-arbitration.md — closing the dialog withdraws its claim, so the next Escape reaches the panel
  it('lets the next Escape reach the panel once the dialog is closed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PanelUnderDialog onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Open the dialog' }));
    await user.click(document.querySelector('.ui-modal-overlay') as HTMLElement);
    expect(screen.queryByText('dialog body')).not.toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  function PanelUnderDrawer({ onClose }: { onClose: () => void }) {
    const [panelOpen, setPanelOpen] = useState(true);
    return (
      <Frame rail="navigation" header="Containers">
        {panelOpen ? (
          <DetailPanel
            dismissal="opening-gesture"
            onClose={() => {
              setPanelOpen(false);
              onClose();
            }}
          >
            panel body
          </DetailPanel>
        ) : null}
      </Frame>
    );
  }

  // frame.md — the open phone drawer holds the innermost claim: one Escape closes the drawer, the next one the panel
  it('closes the phone navigation drawer on the first Escape and the panel on the second', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PanelUnderDrawer onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(document.querySelector('.ui-frame__rail--open')).not.toBeNull();

    await user.keyboard('{Escape}');

    expect(document.querySelector('.ui-frame__rail--open')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(panelRoot()).not.toBeNull();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Escape arbitration — a region that owns its keystrokes (REQ-8)', () => {
  function PanelWithOwnedRegion({ onClose }: { onClose: () => void }) {
    const regionRef = useRef<HTMLDivElement>(null);
    useKeystrokeRegion(regionRef);
    return (
      <DetailPanel dismissal="opening-gesture" onClose={onClose}>
        <div ref={regionRef} data-testid="owned-region">
          <Button onClick={vi.fn()}>Inside the session</Button>
        </div>
      </DetailPanel>
    );
  }

  // escape-arbitration.md — an Escape whose origin is inside an owning region is delivered to no claimant
  it('delivers no Escape typed inside an owning region, and leaves the panel open', async () => {
    const onClose = vi.fn();
    render(<PanelWithOwnedRegion onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Inside the session' }), { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
    expect(panelRoot()).not.toBeNull();
  });

  // escape-arbitration.md — the region answers for what is typed inside it, not for the rest of the screen
  it('still delivers an Escape typed outside the owning region', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PanelWithOwnedRegion onClose={onClose} />);

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('Terminal', () => {
    beforeEach(() => {
      // The real Terminal (xterm.js) needs browser APIs jsdom does not provide;
      // these no-op stand-ins let it mount so its own contract can be checked.
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }),
      );
      vi.stubGlobal(
        'ResizeObserver',
        class {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    // terminal.md — every keystroke typed into the terminal belongs to the session, Escape included
    it('loses no Escape typed into a live terminal hosted in the panel', () => {
      const onClose = vi.fn();
      render(
        <DetailPanel dismissal="opening-gesture" onClose={onClose}>
          <Terminal />
        </DetailPanel>,
      );

      const host = document.querySelector('.ui-terminal-host') as HTMLElement;
      expect(host).not.toBeNull();
      fireEvent.keyDown(host, { key: 'Escape' });

      expect(onClose).not.toHaveBeenCalled();
      expect(panelRoot()).not.toBeNull();
    });
  });
});

// The list that lost its `DataTable` carries the dismissal target on the primitive it is made of
// (`plan-docker_management_app-container_detail_close/REQ-11`, `containers_card_view/REQ-1`).
describe.each([
  { name: 'Stack', selector: '.ui-stack', Region: Stack },
  { name: 'Grid', selector: '.ui-grid', Region: Grid },
])('$name — the dismissal focus target (container_detail_close/REQ-11)', ({ selector, Region }) => {
  function RegionWithPanel({ onClose }: { onClose: () => void }) {
    const [open, setOpen] = useState(true);
    return (
      <Region dismissalFocusTarget>
        <Button onClick={vi.fn()}>A card</Button>
        {open ? (
          <DetailPanel
            dismissal="opening-gesture"
            onClose={() => {
              setOpen(false);
              onClose();
            }}
          >
            <Button onClick={vi.fn()}>Inside the panel</Button>
          </DetailPanel>
        ) : null}
      </Region>
    );
  }

  it('marks the region as the dismissal focus target, focusable but not a tab stop', () => {
    render(
      <Region dismissalFocusTarget>
        <Button onClick={vi.fn()}>A card</Button>
      </Region>,
    );

    const list = document.querySelector(selector) as HTMLElement;
    expect(list).toHaveAttribute('data-ui-dismissal-focus-target');
    expect(list).toHaveAttribute('tabindex', '-1');
  });

  it('leaves a region that was not asked for it exactly as it was', () => {
    render(
      <Region>
        <Button onClick={vi.fn()}>A card</Button>
      </Region>,
    );

    const plain = document.querySelector(selector) as HTMLElement;
    expect(plain.hasAttribute('data-ui-dismissal-focus-target')).toBe(false);
    expect(plain.hasAttribute('tabindex')).toBe(false);
  });

  it('adds no tab stop to the screen', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Button onClick={vi.fn()}>Before</Button>
        <Region dismissalFocusTarget>
          <Button onClick={vi.fn()}>A card</Button>
        </Region>
        <Button onClick={vi.fn()}>After</Button>
      </>,
    );

    screen.getByRole('button', { name: 'Before' }).focus();
    await user.tab();

    expect(screen.getByRole('button', { name: 'A card' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
  });

  it('lands the focus on the region when Escape closes a panel opened inside it', async () => {
    const user = userEvent.setup();
    render(<RegionWithPanel onClose={vi.fn()} />);

    screen.getByRole('button', { name: 'Inside the panel' }).focus();
    await user.keyboard('{Escape}');

    expect(document.querySelector('.ui-detail-panel')).toBeNull();
    expect(document.activeElement).toBe(document.querySelector(selector));
  });
});

describe('DataTable — the dismissal focus target (REQ-11)', () => {
  function TableWithPanel({ onClose }: { onClose: () => void }) {
    const [expanded, setExpanded] = useState<string | undefined>('row-0');
    return (
      <DataTable
        columns={columns}
        rows={[{ id: 'row-0' }, { id: 'row-1' }]}
        rowKey={(row) => row.id}
        selectedRowKey={expanded}
        expandedRowKey={expanded}
        renderExpanded={() => (
          <DetailPanel
            dismissal="opening-gesture"
            onClose={() => {
              setExpanded(undefined);
              onClose();
            }}
          >
            <Button onClick={vi.fn()}>Inside the panel</Button>
          </DetailPanel>
        )}
      />
    );
  }

  // data-table.md — the list region is the dismissal focus target of everything inside it
  it('marks the list region as the dismissal focus target, focusable but not a tab stop', () => {
    render(<DataTable columns={columns} rows={[{ id: 'row-0' }]} rowKey={(row) => row.id} />);

    const list = document.querySelector('.ui-data-table') as HTMLElement;
    expect(list).toHaveAttribute('data-ui-dismissal-focus-target');
    expect(list).toHaveAttribute('tabindex', '-1');
  });

  // data-table.md — it adds no stop to the tab order: Tab walks the screen exactly as it did before
  it('adds no tab stop to the screen', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Button onClick={vi.fn()}>Before</Button>
        <DataTable columns={columns} rows={[{ id: 'row-0' }, { id: 'row-1' }]} rowKey={(row) => row.id} />
        <Button onClick={vi.fn()}>After</Button>
      </>,
    );

    screen.getByRole('button', { name: 'Before' }).focus();
    await user.tab();

    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
  });

  // data-table.md — rows stay as they are: no tab stop, no role, no expanded state announced
  it('leaves the rows themselves without a tab stop, a role or an expanded state', () => {
    render(<TableWithPanel onClose={vi.fn()} />);

    for (const row of document.querySelectorAll('.ui-data-table__row')) {
      expect(row.hasAttribute('tabindex')).toBe(false);
      expect(row.hasAttribute('role')).toBe(false);
      expect(row.hasAttribute('aria-expanded')).toBe(false);
    }
  });

  // detail-panel.md — the point of interaction is handed to the nearest enclosing target before the panel unmounts
  it('lands the focus on the list region when Escape closes a panel expanded inside the table', async () => {
    const user = userEvent.setup();
    render(<TableWithPanel onClose={vi.fn()} />);

    screen.getByRole('button', { name: 'Inside the panel' }).focus();
    await user.keyboard('{Escape}');

    const list = document.querySelector('.ui-data-table') as HTMLElement;
    expect(document.querySelector('.ui-detail-panel')).toBeNull();
    expect(document.activeElement).toBe(list);
    expect(document.activeElement).not.toBe(document.body);
  });

  // data-table.md — the focus is shown for the keyboard alone, so a pointer-driven dismissal draws no ring
  it('shows the list region focus to the keyboard alone', () => {
    const css = stylesheet('data', 'data-table.css');

    expect(ruleBody(css, '.ui-data-table:focus')).toMatch(/outline:\s*none/);
    expect(ruleBody(css, '.ui-data-table:focus-visible')).toMatch(/outline:\s*[^;]*solid/);
  });
});

describe('Escape arbitration — the library entry point (REQ-13)', () => {
  // escape-arbitration.md, library-entry-point.md — internal to the library, not re-exported publicly
  it('exports the panel variant publicly and keeps the arbitration internal', () => {
    const exported = Object.keys(libraryEntryPoint);

    expect(exported).toContain('DetailPanel');
    for (const internal of ['claimEscape', 'useEscapeClaim', 'ownKeystrokes', 'useKeystrokeRegion', 'focusDismissalTarget']) {
      expect(exported).not.toContain(internal);
    }
  });
});
