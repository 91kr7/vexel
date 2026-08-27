/**
 * The find over a whole payload — `ui-library/specs/payload-explorer.md`, serving
 * `…-inspect_full_payload/REQ-19`, REQ-20, REQ-21, REQ-23.
 */
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PAYLOAD_SCALARS_SECTION, PayloadExplorer } from '../../src/ui';

afterEach(cleanup);

const payload = {
  Id: 'a1b2c3d4e5f6',
  Name: '/web-nginx',
  State: { Status: 'running', ExitCode: 0, Health: { Log: [{ Output: 'connection refused' }] } },
  HostConfig: { Memory: 536870912, RestartPolicy: { Name: 'unless-stopped', MaximumRetryCount: 0 } },
  NetworkSettings: { Ports: { '80/tcp': [{ HostIp: '0.0.0.0', HostPort: '8080' }] } },
};

const entrySections = [PAYLOAD_SCALARS_SECTION, 'State'];

interface DrawnSection {
  title: string;
  open: boolean;
}

function sections(): DrawnSection[] {
  return Array.from(document.querySelectorAll('.ui-payload-sections > .ui-collapsible-section')).map((section) => ({
    title: section.querySelector('.ui-collapsible-section__title')?.textContent ?? '',
    open: section.querySelector('.ui-collapsible-section__header')?.getAttribute('aria-expanded') === 'true',
  }));
}

function openSections(): string[] {
  return sections().filter((section) => section.open).map((section) => section.title);
}

function bandLabels(): string[] {
  return Array.from(document.querySelectorAll('.ui-payload-band__label')).map((label) => label.textContent ?? '');
}

function findControl(): HTMLElement {
  return screen.getByLabelText('Find in payload');
}

function matchCountText(): string | null {
  return document.querySelector('.ui-payload-explorer__matches')?.textContent ?? null;
}

function headerOf(title: string): HTMLElement {
  const section = Array.from(document.querySelectorAll<HTMLElement>('.ui-collapsible-section')).find(
    (candidate) => candidate.querySelector('.ui-collapsible-section__title')?.textContent === title,
  );
  expect(section, `no "${title}" section is drawn`).toBeDefined();
  return section!.querySelector<HTMLElement>('.ui-collapsible-section__header')!;
}

function renderExplorer(extra: { trailing?: ReactNode } = {}) {
  render(<PayloadExplorer payload={payload} defaultOpenSections={entrySections} {...extra} />);
  return userEvent.setup();
}

describe('PayloadExplorer — the entry state (REQ-11, REQ-19)', () => {
  // REQ-19 — one find control above the sections, and the sections underneath it
  it('draws one find control above the sections', () => {
    renderExplorer();

    expect(findControl()).toBeInTheDocument();
    const explorer = document.querySelector('.ui-payload-explorer')!;
    expect(Array.from(explorer.children).indexOf(document.querySelector('.ui-payload-explorer__find')!)).toBe(0);
  });

  // REQ-11 — the whole payload, with the sections the caller named open and every other one closed
  it('draws the whole payload with only the sections the caller named open', () => {
    renderExplorer();

    expect(sections().map((section) => section.title)).toEqual(['Fields', 'State', 'HostConfig', 'NetworkSettings']);
    expect(openSections()).toEqual(['Fields', 'State']);
  });

  // REQ-20 — with nothing typed there is no count to state
  it('states no match count while the control is empty', () => {
    renderExplorer();

    expect(matchCountText()).toBeNull();
  });
});

describe('PayloadExplorer — the find filters (REQ-19, REQ-20, REQ-21)', () => {
  // REQ-19 — while the control holds text only the matching fields are on screen
  it('leaves only the matching fields on screen', async () => {
    const user = renderExplorer();

    await user.type(findControl(), 'RestartPolicy');

    expect(sections().map((section) => section.title)).toEqual(['HostConfig']);
    expect(bandLabels()).toEqual(['Name', 'MaximumRetryCount']);
  });

  // REQ-19 — the section holding a match opens itself, with no header pressed by hand
  it('opens the section holding a match without a header being pressed', async () => {
    const user = renderExplorer();

    await user.type(findControl(), 'RestartPolicy');

    expect(openSections()).toEqual(['HostConfig']);
  });

  // REQ-21 — a value buried in a collapsed, deeply nested array is found like a top-level scalar
  it('finds a value buried inside a collapsed, deeply nested array', async () => {
    const user = renderExplorer();

    await user.type(findControl(), 'connection refused');

    expect(openSections()).toEqual(['State']);
    expect(bandLabels()).toEqual(['Output']);
  });

  // REQ-19 — the match is on a literal as well as on a key name
  it('finds a field by the value the operator expects', async () => {
    const user = renderExplorer();

    await user.type(findControl(), '8080');

    expect(sections().map((section) => section.title)).toEqual(['NetworkSettings']);
    expect(bandLabels()).toEqual(['HostPort']);
  });

  // REQ-19 — a top-level scalar match opens the gathered scalars section
  it('opens the gathered scalars section for a match among the top-level scalars', async () => {
    const user = renderExplorer();

    await user.type(findControl(), 'web-nginx');

    expect(openSections()).toEqual(['Fields']);
    expect(bandLabels()).toEqual(['Name']);
  });

  // REQ-20 — the find states how many fields matched, in the singular at one
  it('states how many fields matched', async () => {
    const user = renderExplorer();

    await user.type(findControl(), 'web-nginx');
    expect(matchCountText()).toBe('1 matching field');

    await user.clear(findControl());
    await user.type(findControl(), 'Memory');
    expect(matchCountText()).toBe('1 matching field');

    await user.clear(findControl());
    await user.type(findControl(), 'Host');
    expect(matchCountText()).toMatch(/^\d+ matching fields$/);
  });

  // REQ-20 — a search matching nothing says so instead of leaving a blank surface
  it('says nothing matched rather than drawing a blank surface', async () => {
    const user = renderExplorer();

    await user.type(findControl(), 'nothing-carries-this');

    expect(sections(), 'the sections are still drawn beside the empty state').toEqual([]);
    expect(document.querySelector('.ui-empty-state'), 'the surface is left blank').not.toBeNull();
    expect(document.querySelector('.ui-empty-state__title')?.textContent?.length).toBeGreaterThan(0);
    expect(matchCountText()).toBe('0 matching fields');
  });
});

describe('PayloadExplorer — clearing the find (REQ-20)', () => {
  // REQ-20 — clearing restores the whole payload and the entry section state, not what was open before
  it('restores the whole payload and the entry sections, not whatever was open before the search', async () => {
    const user = renderExplorer();
    await user.click(headerOf('NetworkSettings'));
    await user.click(headerOf('State'));
    expect(openSections()).toEqual(['Fields', 'NetworkSettings']);

    await user.type(findControl(), 'RestartPolicy');
    await user.clear(findControl());

    expect(sections().map((section) => section.title)).toEqual(['Fields', 'State', 'HostConfig', 'NetworkSettings']);
    expect(openSections()).toEqual(['Fields', 'State']);
    expect(matchCountText()).toBeNull();
  });

  // REQ-20 — emptying the control key by key restores it as surely as clearing it in one go
  it('restores the entry state when the term is deleted one keystroke at a time', async () => {
    const user = renderExplorer();
    const control = findControl();

    await user.type(control, 'RestartPolicy');
    expect(sections().map((section) => section.title)).toEqual(['HostConfig']);
    await user.keyboard('{Backspace>13/}');

    expect(control).toHaveValue('');
    expect(sections().map((section) => section.title)).toEqual(['Fields', 'State', 'HostConfig', 'NetworkSettings']);
    expect(openSections()).toEqual(['Fields', 'State']);
    expect(matchCountText()).toBeNull();
  });

  // REQ-20 — a control holding only blank space is not a filter
  it('treats a control holding only blank space as no filter at all', async () => {
    const user = renderExplorer();

    await user.type(findControl(), '   ');

    expect(sections().map((section) => section.title)).toEqual(['Fields', 'State', 'HostConfig', 'NetworkSettings']);
    expect(matchCountText()).toBeNull();
  });
});

describe('PayloadExplorer — the sections stay operable, and the trailing content (REQ-12, REQ-19)', () => {
  // REQ-19 — a section header still opens and closes its own section while a filter is on
  it('lets a header open and close its section while the filter is on', async () => {
    const user = renderExplorer();

    await user.type(findControl(), 'Host');
    expect(openSections()).toContain('HostConfig');

    await user.click(headerOf('HostConfig'));

    expect(openSections()).not.toContain('HostConfig');
  });

  // REQ-12 — the trailing content follows every payload-derived section while the find is empty
  it('draws the trailing content after the sections while the find is empty', () => {
    render(<PayloadExplorer payload={payload} defaultOpenSections={entrySections} trailing={<div data-testid="trailing">raw</div>} />);

    const surface = document.querySelector('.ui-payload-sections')!;
    expect(Array.from(surface.children).at(-1)).toBe(screen.getByTestId('trailing'));
  });

  // payload-explorer.md — a filtered result holds the fields that matched and nothing else
  it('drops the trailing content while the find holds text', async () => {
    render(<PayloadExplorer payload={payload} defaultOpenSections={entrySections} trailing={<div data-testid="trailing">raw</div>} />);
    const user = userEvent.setup();

    await user.type(findControl(), 'RestartPolicy');

    expect(screen.queryByTestId('trailing')).toBeNull();
  });

  // REQ-24 — the explorer adds no control of its own beyond the find and the section headers
  it('adds no control beyond the find field and the section headers', () => {
    renderExplorer();

    const explorer = document.querySelector('.ui-payload-explorer')!;
    const controls = Array.from(explorer.querySelectorAll('button, a, [role="button"]'));
    expect(controls.every((control) => control.classList.contains('ui-collapsible-section__header'))).toBe(true);
  });
});
