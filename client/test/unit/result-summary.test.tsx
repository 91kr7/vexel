import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ResultSummary } from '../../src/ui';

afterEach(cleanup);

describe('ResultSummary (ui-library/specs/result-summary.md)', () => {
  // result-summary.md — "the title and the headline on one line, then the item lines, each as
  // label -> value"
  it('shows the title, the headline and one line per item', () => {
    render(
      <ResultSummary
        title="Last prune"
        headline="1.2GB reclaimed"
        items={[
          { label: 'Stopped containers', value: '2 items · 1.2GB' },
          { label: 'Unused networks', value: '1 item · 0B' },
        ]}
      />,
    );

    expect(screen.getByText('Last prune')).toBeInTheDocument();
    expect(screen.getByText('1.2GB reclaimed')).toBeInTheDocument();
    expect(screen.getByText('Stopped containers')).toBeInTheDocument();
    expect(screen.getByText('2 items · 1.2GB')).toBeInTheDocument();
    expect(screen.getByText('1 item · 0B')).toBeInTheDocument();
  });

  // result-summary.md — "no lines when items is empty or absent"
  it('shows no lines when it is given no items', () => {
    const { container } = render(<ResultSummary title="Last prune" headline="0B reclaimed" />);

    expect(screen.getByText('0B reclaimed')).toBeInTheDocument();
    expect(container.querySelectorAll('li')).toHaveLength(0);
  });

  // result-summary.md — "failed marks the line as the failed part of an otherwise successful outcome"
  it('marks the failed line apart from the ones that succeeded', () => {
    const { container } = render(
      <ResultSummary
        title="Last prune"
        headline="1.2GB reclaimed"
        items={[
          { label: 'Stopped containers', value: '2 items · 1.2GB' },
          { label: 'Build cache', value: 'failed — buildx is not installed', failed: true },
        ]}
      />,
    );

    const failedLines = container.querySelectorAll('[class*="--failed"]');
    expect(failedLines).toHaveLength(1);
    expect(failedLines[0]?.textContent).toContain('buildx is not installed');
  });

  // result-summary.md — "It reports, it does not act: the block carries no control of its own."
  it('carries no control of its own', () => {
    render(
      <ResultSummary title="Last prune" headline="1.2GB reclaimed" items={[{ label: 'Stopped containers', value: '2 items · 1.2GB' }]} tone="success" />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
