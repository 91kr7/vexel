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

  // log-stream.md — a change of activeMatchLineId brings that line into view without changing follow
  it('does not change follow when the active match changes', () => {
    const onFollowChange = vi.fn();
    const buffer = lines(50);
    const { rerender } = render(<LogStream lines={buffer} follow={false} onFollowChange={onFollowChange} activeMatchLineId="2" />);

    rerender(<LogStream lines={buffer} follow={false} onFollowChange={onFollowChange} activeMatchLineId="40" />);

    expect(onFollowChange).not.toHaveBeenCalled();
  });
});
