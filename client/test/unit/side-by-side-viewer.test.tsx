import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SideBySideViewer } from '../../src/ui';

afterEach(cleanup);

describe('SideBySideViewer (plan-docker_management_app/REQ-64)', () => {
  // side-by-side-viewer.md — each side is shown under its own header
  it("renders each side's own header", () => {
    render(
      <SideBySideViewer
        left={{ header: 'image-a:latest', content: 'left content' }}
        right={{ header: 'image-b:latest', content: 'right content' }}
      />,
    );

    expect(screen.getByText('image-a:latest')).toBeInTheDocument();
    expect(screen.getByText('image-b:latest')).toBeInTheDocument();
  });

  // side-by-side-viewer.md — content: undefined renders an EmptyState titled emptyMessage instead of a viewer
  it('renders the default "no content on this side" empty state when a side has no content', () => {
    render(<SideBySideViewer left={{ header: 'left' }} right={{ header: 'right', content: 'right content' }} />);

    expect(screen.getByText('No content on this side')).toBeInTheDocument();
    expect(screen.getByText('right content')).toBeInTheDocument();
  });

  // side-by-side-viewer.md — a custom emptyMessage replaces the generic one
  it('renders a custom emptyMessage instead of the default one', () => {
    render(<SideBySideViewer left={{ header: 'left', emptyMessage: 'Not present on this side' }} right={{ header: 'right', content: 'x' }} />);

    expect(screen.getByText('Not present on this side')).toBeInTheDocument();
    expect(screen.queryByText('No content on this side')).not.toBeInTheDocument();
  });

  // side-by-side-viewer.md — content present renders TextViewer (mode 'text', the default) or HexDumpViewer (mode 'hex')
  it('renders a hex dump for mode "hex" and line-numbered text for mode "text" (the default)', () => {
    render(
      <SideBySideViewer
        left={{ header: 'left', content: '6865 6c6c 6f', mode: 'hex' }}
        right={{ header: 'right', content: 'line one\nline two' }}
      />,
    );

    expect(document.querySelector('.ui-content-viewer__hex')).not.toBeNull();
    expect(document.querySelector('.ui-content-viewer__line')).not.toBeNull();
    expect(screen.getByText('line one')).toBeInTheDocument();
    expect(screen.getByText('line two')).toBeInTheDocument();
  });

  // side-by-side-viewer.md — scrolling either side scrolls the other to the same position
  it('scrolls the right side to match when the left side is scrolled', () => {
    render(
      <SideBySideViewer
        left={{ header: 'left', content: 'left content' }}
        right={{ header: 'right', content: 'right content' }}
      />,
    );
    const [leftScroller, rightScroller] = Array.from(document.querySelectorAll<HTMLElement>('.ui-scroll-area'));

    Object.defineProperty(leftScroller!, 'scrollTop', { value: 120, writable: true });
    fireEvent.scroll(leftScroller!);

    expect(rightScroller!.scrollTop).toBe(120);
  });

  // side-by-side-viewer.md — the sync never loops: one side's own scroll event never re-triggers itself through the other
  it('does not loop back and re-trigger the source side when syncing the other side', () => {
    render(
      <SideBySideViewer
        left={{ header: 'left', content: 'left content' }}
        right={{ header: 'right', content: 'right content' }}
      />,
    );
    const [leftScroller, rightScroller] = Array.from(document.querySelectorAll<HTMLElement>('.ui-scroll-area'));

    Object.defineProperty(leftScroller!, 'scrollTop', { value: 50, writable: true });
    Object.defineProperty(rightScroller!, 'scrollTop', { value: 0, writable: true, configurable: true });

    // Firing the scroll event synchronously, as the DOM does, must not leave the right scroller's
    // own scroll handler re-driving the left one back — this would only manifest as an exception
    // (a re-entrant, ever-recursing handler) rather than a value difference in this synchronous test.
    expect(() => fireEvent.scroll(leftScroller!)).not.toThrow();
    expect(rightScroller!.scrollTop).toBe(50);
  });
});
