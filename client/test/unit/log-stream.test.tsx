import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LogStream, type LogStreamLine } from '../../src/ui';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function lines(count: number, prefix = 'line'): LogStreamLine[] {
  return Array.from({ length: count }, (_, index) => ({ id: String(index), text: `${prefix}-${index}` }));
}

/**
 * The style rules of the log stream's own stylesheet, selector and declarations,
 * comments stripped. Resolved from the client workspace root (vitest's working
 * directory), not import.meta.url: the jsdom environment does not preserve a
 * file: scheme.
 */
function regionRules(): { selector: string; declarations: string }[] {
  const css = readFileSync(join(process.cwd(), 'src/ui/data/log-stream.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((rule) => ({ selector: rule[1].trim(), declarations: rule[2] }));
}

/** jsdom performs no layout, so the scroll geometry the component reads is defined by hand. */
function setGeometry(element: HTMLElement, geometry: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
  Object.defineProperty(element, 'scrollHeight', { value: geometry.scrollHeight, configurable: true });
  Object.defineProperty(element, 'clientHeight', { value: geometry.clientHeight, configurable: true });
  element.scrollTop = geometry.scrollTop;
}

describe('LogStream (REQ-30, REQ-31)', () => {
  // log-stream.md — an empty-state title replaces the region when there are no lines
  it('shows the default empty-state title when there is no line, and the caller\'s when given', () => {
    const { rerender } = render(<LogStream lines={[]} />);
    expect(screen.getByText('No log output.')).toBeInTheDocument();

    rerender(<LogStream lines={[]} emptyLabel="Waiting for output…" />);
    expect(screen.getByText('Waiting for output…')).toBeInTheDocument();
  });

  // log-stream.md — one row per line, in the given order, with the timestamp column only when asked for
  it('shows the timestamp column only when showTimestamps is on', () => {
    const withTimestamps: LogStreamLine[] = [{ id: '1', text: 'hello', timestamp: '10:00:00' }];
    const { rerender } = render(<LogStream lines={withTimestamps} />);
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.queryByText('10:00:00')).not.toBeInTheDocument();

    rerender(<LogStream lines={withTimestamps} showTimestamps />);
    expect(screen.getByText('10:00:00')).toBeInTheDocument();
  });

  // log-stream.md — every occurrence of `highlight` is marked, case-insensitively
  it('marks every occurrence of the highlighted substring, ignoring case', () => {
    const { container } = render(
      <LogStream
        lines={[
          { id: '1', text: 'Error here and error there' },
          { id: '2', text: 'nothing to see' },
        ]}
        highlight="error"
      />,
    );

    const marks = Array.from(container.querySelectorAll('mark'));
    expect(marks.map((mark) => mark.textContent)).toEqual(['Error', 'error']);
  });

  // log-stream.md — only the lines in and around the visible window are mounted, but the scrollbar still reflects the full count
  it('mounts only a window of lines while reserving the height of the whole buffer', () => {
    const { container } = render(<LogStream lines={lines(1000)} lineHeight={20} />);

    const rows = container.querySelectorAll('.ui-log-stream__line');
    expect(rows.length).toBeLessThan(1000);
    expect(rows.length).toBeGreaterThan(0);

    const content = container.querySelector('.ui-log-stream__lines') as HTMLElement;
    const totalHeight = Array.from(content.children).reduce(
      (sum, child) => sum + Number.parseInt((child as HTMLElement).style.height || '0', 10),
      0,
    );
    expect(totalHeight).toBe(1000 * 20);
  });

  // log-stream.md — the download action exists only when a file name is given, and saves the buffer under it
  it('offers a download only when a file name is given, and saves the buffer under that name', async () => {
    const user = userEvent.setup();
    const buffer: LogStreamLine[] = [
      { id: '1', text: 'first' },
      { id: '2', text: 'second' },
    ];
    const { rerender } = render(<LogStream lines={buffer} />);
    expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument();

    // The saved file is only observable through the object URL the component
    // builds and the anchor it activates; both are stubbed and restored here.
    const created: Blob[] = [];
    const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'createObjectURL', {
      value: (blob: Blob) => {
        created.push(blob);
        return 'blob:log';
      },
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true });
    const downloadNames: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloadNames.push(this.download);
    });

    try {
      rerender(<LogStream lines={buffer} downloadFileName="web-nginx-logs.txt" />);
      await user.click(screen.getByRole('button', { name: 'Download' }));

      expect(downloadNames).toEqual(['web-nginx-logs.txt']);
      expect(created).toHaveLength(1);
      await expect(created[0].text()).resolves.toBe('first\nsecond');
    } finally {
      if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
      if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
    }
  });

  // log-stream.md — "Jump to live" is shown only when follow is off, and turns following back on
  it('shows "Jump to live" only while follow is off and turns following back on', async () => {
    const user = userEvent.setup();
    const onFollowChange = vi.fn();
    const { rerender } = render(<LogStream lines={lines(3)} follow onFollowChange={onFollowChange} />);
    expect(screen.queryByRole('button', { name: 'Jump to live' })).not.toBeInTheDocument();

    rerender(<LogStream lines={lines(3)} follow={false} onFollowChange={onFollowChange} />);
    await user.click(screen.getByRole('button', { name: 'Jump to live' }));

    expect(onFollowChange).toHaveBeenCalledWith(true);
  });

  // log-stream.md — while follow is on, the region stays scrolled to the last line as new lines arrive
  it('keeps the region scrolled to the last line while following', () => {
    const { container, rerender } = render(<LogStream lines={lines(10)} follow />);
    const region = container.querySelector('.ui-scroll-area') as HTMLElement;
    setGeometry(region, { scrollHeight: 200, clientHeight: 100, scrollTop: 0 });

    Object.defineProperty(region, 'scrollHeight', { value: 400, configurable: true });
    rerender(<LogStream lines={lines(20)} follow />);

    expect(region.scrollTop).toBe(400);
  });

  // log-stream.md — scrolling away from the bottom stops following; scrolling back to the bottom resumes it
  it('stops following when scrolled away from the bottom and resumes when scrolled back', () => {
    const onFollowChange = vi.fn();
    const { container, rerender } = render(<LogStream lines={lines(100)} follow onFollowChange={onFollowChange} />);
    const region = container.querySelector('.ui-scroll-area') as HTMLElement;

    setGeometry(region, { scrollHeight: 2000, clientHeight: 320, scrollTop: 500 });
    fireEvent.scroll(region);
    expect(onFollowChange).toHaveBeenLastCalledWith(false);

    onFollowChange.mockClear();
    rerender(<LogStream lines={lines(100)} follow={false} onFollowChange={onFollowChange} />);
    setGeometry(region, { scrollHeight: 2000, clientHeight: 320, scrollTop: 1680 });
    fireEvent.scroll(region);
    expect(onFollowChange).toHaveBeenLastCalledWith(true);
  });

  // log-stream.md — no animation and no blur on **the region**, its lines, their match
  // highlighting or their scroller: a large, frequently repainted surface. The floating control is
  // the one exception, so a blanket assertion here would either forbid it or stop guarding the
  // region (plan-liquid_glass_overlays/REQ-7, REQ-17).
  it('declares neither an animation nor a blur on the log region itself', () => {
    for (const rule of regionRules().filter((rule) => !rule.selector.includes('__jump'))) {
      expect(rule.declarations).not.toMatch(/animation\s*:/);
      expect(rule.declarations).not.toMatch(/transition\s*:/);
      expect(rule.declarations).not.toMatch(/backdrop-filter\s*:/);
      expect(rule.declarations).not.toMatch(/filter\s*:\s*blur\(/);
    }
  });

  // log-stream.md — the jump-to-live control is the one blurred thing here, and it takes the
  // material rather than restating any of it (plan-liquid_glass_overlays/REQ-17)
  it('gives the jump-to-live control the overlay glass material, declaring none of it here', () => {
    const jumpRules = regionRules().filter((rule) => rule.selector.includes('__jump'));

    expect(jumpRules.length).toBeGreaterThan(0);
    for (const rule of jumpRules) {
      expect(rule.selector).toContain('.ui-overlay-glass');
      expect(rule.declarations).not.toMatch(/blur\(/);
    }
  });

  // log-stream.md — and the control the stylesheet describes is the one the component renders
  // while follow is off (plan-liquid_glass_overlays/REQ-17)
  it('renders the jump-to-live control carrying the material', () => {
    const { container } = render(<LogStream lines={lines(3)} follow={false} onFollowChange={vi.fn()} />);

    const jump = container.querySelector('.ui-log-stream__jump') as HTMLElement;
    expect(jump.classList.contains('ui-overlay-glass')).toBe(true);
    expect(jump.querySelector('button')?.textContent).toBe('Jump to live');
  });

  // log-stream.md — "toolbar? — controls belonging to the stream … placed on that **same** action
  // row, before the download action" (plan-ui-coherence-optimisation/REQ-62)
  it('places the toolbar on the same action row as the download, before it', () => {
    const { container } = render(
      <LogStream lines={lines(3)} downloadFileName="web-nginx-logs.txt" toolbar={<button type="button">Search</button>} />,
    );

    const rows = container.querySelectorAll('.ui-log-stream__actions');
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    const search = screen.getByRole('button', { name: 'Search' });
    const download = screen.getByRole('button', { name: 'Download' });
    expect(row.contains(search), 'the toolbar is not on the stream\'s action row').toBe(true);
    expect(row.contains(download), 'the download is not on the stream\'s action row').toBe(true);
    expect(
      search.compareDocumentPosition(download) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the download is not after the toolbar on the row',
    ).toBeGreaterThan(0);
  });

  // log-stream.md — "the action row is rendered only when it has something to hold: with neither
  // toolbar nor downloadFileName it is not drawn at all, so it consumes no height and no gap"
  it('draws the action row for a toolbar alone, and not at all for neither', () => {
    const { container, rerender } = render(<LogStream lines={lines(3)} />);
    expect(container.querySelectorAll('.ui-log-stream__actions')).toHaveLength(0);

    rerender(<LogStream lines={lines(3)} toolbar={<button type="button">Search</button>} />);
    expect(container.querySelectorAll('.ui-log-stream__actions')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument();
  });

  // log-stream.md — "What toolbar holds changes nothing about the region: the same lines are
  // mounted, the same buffer is downloaded"
  it('changes nothing about the region when the toolbar slot is filled', async () => {
    const user = userEvent.setup();
    const buffer = lines(400);
    const { container, rerender } = render(<LogStream lines={buffer} downloadFileName="web-nginx-logs.txt" />);
    const withoutToolbar = container.querySelectorAll('.ui-log-stream__line').length;

    rerender(
      <LogStream lines={buffer} downloadFileName="web-nginx-logs.txt" toolbar={<button type="button">Search</button>} />,
    );

    expect(container.querySelectorAll('.ui-log-stream__line').length).toBe(withoutToolbar);

    const created: Blob[] = [];
    const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'createObjectURL', {
      value: (blob: Blob) => {
        created.push(blob);
        return 'blob:log';
      },
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      await user.click(screen.getByRole('button', { name: 'Download' }));

      // The whole buffer, not the mounted window: the region is virtualised.
      const saved = await created[0].text();
      expect(saved.split('\n')).toHaveLength(buffer.length);
      expect(saved.split('\n').length).toBeGreaterThan(withoutToolbar);
    } finally {
      if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
      if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
    }
  });

  // log-stream.md — a change of activeMatchLineId brings that line into view without changing follow
  it('does not change follow when the active match changes', () => {
    const onFollowChange = vi.fn();
    const buffer = lines(50);
    const { rerender } = render(<LogStream lines={buffer} follow={false} onFollowChange={onFollowChange} activeMatchLineId="2" />);

    rerender(<LogStream lines={buffer} follow={false} onFollowChange={onFollowChange} activeMatchLineId="40" />);

    expect(onFollowChange).not.toHaveBeenCalled();
  });
});

/**
 * The `toolbar` slot's composer form, and the per-line level distinction
 * (plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-27,
 * REQ-29, REQ-30, REQ-31).
 */
describe('LogStream — the composed action row and the levelled lines', () => {
  /** The classes a drawn line carries, found by the text it draws. */
  function lineClasses(container: HTMLElement, text: string): string[] {
    const row = [...container.querySelectorAll('.ui-log-stream__line')].find(
      (line) => line.querySelector('.ui-log-stream__text')?.textContent === text,
    );
    if (!row) throw new Error(`no line is drawn for "${text}"`);
    return [...row.classList].sort();
  }

  /** The CSS properties every rule whose selector names `fragment` declares. */
  function declaredProperties(fragment: string): Set<string> {
    const properties = new Set<string>();
    for (const rule of regionRules().filter((rule) => rule.selector.includes(fragment))) {
      for (const declaration of rule.declarations.split(';')) {
        const property = declaration.split(':')[0]?.trim();
        if (property) properties.add(property);
      }
    }
    return properties;
  }

  // log-stream.md — "given as a composer — it is called with the download action … and returns the
  // row's whole content, so the caller may present its controls as groups of its own **with the
  // download among them** instead of fixed at the row's end. Nothing is added at the row's end in
  // this form."
  it('hands the download to a toolbar composer and appends nothing after what it returns', () => {
    const { container } = render(
      <LogStream
        lines={lines(3)}
        downloadFileName="web-nginx-logs.txt"
        toolbar={(download) => (
          <>
            <button type="button">Search</button>
            {download}
            <button type="button">Last</button>
          </>
        )}
      />,
    );

    const rows = container.querySelectorAll('.ui-log-stream__actions');
    expect(rows, 'the composed toolbar did not get one action row').toHaveLength(1);
    const row = rows[0]!;
    const download = screen.getByRole('button', { name: 'Download' });
    expect(row.contains(download), 'the composed download is not on the stream\'s action row').toBe(true);
    // One download, and at the place the caller put it: nothing was appended at the row's end.
    expect(screen.getAllByRole('button', { name: 'Download' })).toHaveLength(1);
    const last = screen.getByRole('button', { name: 'Last' });
    expect(
      download.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the download was moved to the row\'s end instead of being left where the composer placed it',
    ).toBeGreaterThan(0);
  });

  // log-stream.md — the composer "is called with the download action (or `null` when no
  // `downloadFileName` is given)"
  it('calls the composer with null when no download is offered', () => {
    let handed: unknown = 'never called';
    render(
      <LogStream
        lines={lines(3)}
        toolbar={(download) => {
          handed = download;
          return <button type="button">Search</button>;
        }}
      />,
    );

    expect(handed).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument();
  });

  // log-stream.md — "What `toolbar` holds — and which of its two forms is used — changes nothing
  // about the region … The download action is the same action in both forms, saving the same buffer
  // under the same name."
  it('changes nothing about the region or the download when the toolbar is composed', async () => {
    const user = userEvent.setup();
    const buffer = lines(400);
    const { container, rerender } = render(<LogStream lines={buffer} downloadFileName="web-nginx-logs.txt" />);
    const mountedWithContentForm = container.querySelectorAll('.ui-log-stream__line').length;

    rerender(
      <LogStream
        lines={buffer}
        downloadFileName="web-nginx-logs.txt"
        toolbar={(download) => (
          <>
            {download}
            <button type="button">Search</button>
          </>
        )}
      />,
    );

    expect(container.querySelectorAll('.ui-log-stream__line').length).toBe(mountedWithContentForm);

    const created: Blob[] = [];
    const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'createObjectURL', {
      value: (blob: Blob) => {
        created.push(blob);
        return 'blob:log';
      },
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true });
    const downloadNames: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloadNames.push(this.download);
    });

    try {
      await user.click(screen.getByRole('button', { name: 'Download' }));

      expect(downloadNames).toEqual(['web-nginx-logs.txt']);
      // The whole buffer, not the mounted window: the region is virtualised.
      expect((await created[0].text()).split('\n')).toHaveLength(buffer.length);
    } finally {
      if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
      if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
    }
  });

  // log-stream.md — "lines carrying a `level` are distinguished by it"; "a line carrying no `level`
  // is drawn in the region's ordinary treatment" (REQ-29)
  it('distinguishes a line by the level it carries and leaves one without a level ordinary', () => {
    const { container } = render(
      <LogStream
        lines={[
          { id: '1', text: 'plain line' },
          { id: '2', text: 'levelled error line', level: 'error' },
          { id: '3', text: 'levelled warn line', level: 'warn' },
        ]}
      />,
    );

    const ordinary = lineClasses(container, 'plain line');
    const error = lineClasses(container, 'levelled error line');
    const warn = lineClasses(container, 'levelled warn line');

    expect(error, 'an error line is drawn exactly like an ordinary one').not.toEqual(ordinary);
    expect(warn, 'a warn line is drawn exactly like an ordinary one').not.toEqual(ordinary);
    expect(error, 'the two levels are drawn alike').not.toEqual(warn);
    // The ordinary line carries the region's own treatment and nothing added to it.
    expect(error).toEqual(expect.arrayContaining(ordinary));
    expect(warn).toEqual(expect.arrayContaining(ordinary));
  });

  // log-stream.md — "The component deduces nothing from a line's text: the level is the caller's
  // reading, never this component's." (REQ-29)
  it('deduces no level from a line\'s own text', () => {
    const { container } = render(
      <LogStream
        lines={[
          { id: '1', text: 'plain line' },
          { id: '2', text: 'ERROR: cannot connect' },
          { id: '3', text: 'WARN retrying in 3s' },
        ]}
      />,
    );

    expect(lineClasses(container, 'ERROR: cannot connect')).toEqual(lineClasses(container, 'plain line'));
    expect(lineClasses(container, 'WARN retrying in 3s')).toEqual(lineClasses(container, 'plain line'));
  });

  // log-stream.md — "The two distinctions are carried on **different channels** and are therefore
  // readable at once … A line that is both an `stderr` line and an `error` line shows both, and
  // neither replaces the other." (REQ-30)
  it('shows the level and the stream at once, neither replacing the other', () => {
    const { container } = render(
      <LogStream
        lines={[
          { id: '1', text: 'stdout ordinary', stream: 'stdout' },
          { id: '2', text: 'stdout error', stream: 'stdout', level: 'error' },
          { id: '3', text: 'stderr ordinary', stream: 'stderr' },
          { id: '4', text: 'stderr error', stream: 'stderr', level: 'error' },
        ]}
      />,
    );

    const ordinary = lineClasses(container, 'stdout ordinary');
    const levelMark = lineClasses(container, 'stdout error').filter((name) => !ordinary.includes(name));
    const streamMark = lineClasses(container, 'stderr ordinary').filter((name) => !ordinary.includes(name));

    expect(levelMark, 'nothing distinguishes an error line from an ordinary one').not.toHaveLength(0);
    expect(streamMark, 'nothing distinguishes an stderr line from an stdout one').not.toHaveLength(0);
    expect(streamMark, 'the stream is marked the same way the level is').not.toEqual(levelMark);
    // Both marks at once on the line that is both.
    expect(lineClasses(container, 'stderr error')).toEqual(expect.arrayContaining([...levelMark, ...streamMark]));
  });

  // log-stream.md — the two distinctions ride different channels in the stylesheet as well, which
  // is what makes them readable at once rather than one hiding the other (REQ-30)
  it('declares the level and the stream distinctions on properties that cannot hide each other', () => {
    const levelProperties = new Set([...declaredProperties('__line--error'), ...declaredProperties('__line--warn')]);
    const streamProperties = declaredProperties('__line--stderr');

    expect(levelProperties.size, 'the level classes declare nothing at all').toBeGreaterThan(0);
    expect(streamProperties.size, 'the stderr class declares nothing at all').toBeGreaterThan(0);
    const shared = [...levelProperties].filter((property) => streamProperties.has(property));
    expect(shared, 'the level and the stream are drawn with the same property, so one hides the other').toEqual([]);
  });

  // log-stream.md — "The line's own text is rendered exactly as it was given, whatever distinction
  // is applied to it … with every occurrence of `highlight` still marked over the distinction. No
  // level, stream or match treatment adds, removes or rewrites a character of it." (REQ-31)
  it('renders a distinguished line\'s text verbatim, with the matches still marked over it', () => {
    const text = 'ERROR: connection refused for https://host/errors/list';
    const { container } = render(
      <LogStream
        lines={[{ id: '1', text, stream: 'stderr', level: 'error' }]}
        highlight="error"
        activeMatchLineId="1"
      />,
    );

    const row = container.querySelector('.ui-log-stream__line') as HTMLElement;
    expect(row.textContent, 'the distinguished line no longer reads as the caller wrote it').toBe(text);
    expect(row.querySelector('.ui-log-stream__text')?.textContent).toBe(text);
    // The marks are inside the distinguished line, over its treatment rather than instead of it.
    const marks = [...row.querySelectorAll('mark')].map((mark) => mark.textContent);
    expect(marks).toEqual(['ERROR', 'error']);
  });
});
