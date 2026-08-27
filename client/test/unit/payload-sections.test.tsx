/**
 * An arbitrary payload drawn as its own shape — `ui-library/specs/payload-sections.md`,
 * serving `…-inspect_full_payload/REQ-3`, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-13,
 * REQ-14, REQ-15, REQ-17, REQ-24, REQ-29, REQ-35.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PAYLOAD_SCALARS_SECTION, PayloadSections, payloadPathKey } from '../../src/ui';

afterEach(cleanup);

interface DrawnSection {
  title: string;
  summary: string;
  open: boolean;
}

function sections(): DrawnSection[] {
  return Array.from(document.querySelectorAll('.ui-payload-sections > .ui-collapsible-section')).map((section) => ({
    title: section.querySelector('.ui-collapsible-section__title')?.textContent ?? '',
    summary: section.querySelector('.ui-collapsible-section__summary')?.textContent ?? '',
    open: section.querySelector('.ui-collapsible-section__header')?.getAttribute('aria-expanded') === 'true',
  }));
}

function sectionNamed(title: string): HTMLElement {
  const found = Array.from(document.querySelectorAll<HTMLElement>('.ui-payload-sections > .ui-collapsible-section')).find(
    (section) => section.querySelector('.ui-collapsible-section__title')?.textContent === title,
  );
  expect(found, `no "${title}" section is drawn; the payload is drawn as ${sections().map((one) => one.title).join(', ') || 'nothing'}`).toBeDefined();
  return found!;
}

interface DrawnBand {
  label: string;
  value: string;
  reading: string | null;
  empty: boolean;
}

function bands(root: ParentNode = document): DrawnBand[] {
  return Array.from(root.querySelectorAll('.ui-payload-band')).map((band) => {
    const value = band.querySelector('.ui-payload-band__value');
    return {
      label: band.querySelector('.ui-payload-band__label')?.textContent ?? '',
      value: value?.textContent ?? '',
      reading: band.querySelector('.ui-payload-band__reading')?.textContent ?? null,
      empty: value?.classList.contains('ui-payload-band__value--empty') ?? false,
    };
  });
}

function bandNamed(label: string, root: ParentNode = document): DrawnBand {
  const found = bands(root).find((band) => band.label === label);
  expect(found, `no band labelled "${label}" is drawn; the bands are ${bands(root).map((one) => one.label).join(', ') || 'none'}`).toBeDefined();
  return found!;
}

function group(label: string, root: ParentNode = document): HTMLElement {
  const found = Array.from(root.querySelectorAll<HTMLElement>('.ui-payload-group')).find(
    (candidate) => candidate.querySelector('.ui-payload-group__label')?.textContent === label,
  );
  expect(found, `no group labelled "${label}" is drawn`).toBeDefined();
  return found!;
}

function groupCount(label: string, root: ParentNode = document): string {
  return group(label, root).querySelector('.ui-payload-group__count')?.textContent ?? '';
}

describe('PayloadSections — sections from the payload itself (REQ-8, REQ-9, REQ-10)', () => {
  const payload = {
    Id: 'a1b2c3',
    Created: '2026-01-01T00:00:00Z',
    State: { Status: 'running', ExitCode: 0 },
    Args: ['sleep', '300'],
    Name: '/web-nginx',
    SomethingNobodyHasSeen: { Nested: true },
  };

  // REQ-8, REQ-10 — a section per composite top-level key, one leading section for the scalars, in the payload's own order
  it("draws the gathered scalars first and then a section per composite key, in the payload's own key order", () => {
    render(<PayloadSections payload={payload} />);

    expect(sections().map((section) => section.title)).toEqual(['Fields', 'State', 'Args', 'SomethingNobodyHasSeen']);
  });

  // REQ-8 — the leading section takes the caller's own heading
  it('heads the gathered scalars with the title the caller asks for', () => {
    render(<PayloadSections payload={payload} scalarsTitle="Top-level fields" />);

    expect(sections()[0]!.title).toBe('Top-level fields');
  });

  // REQ-9 — each section states how much it holds while it is still closed
  it('states how much each section holds, fields for an object and items for an array', () => {
    render(<PayloadSections payload={payload} />);

    expect(sections()).toEqual([
      { title: 'Fields', summary: '3 fields', open: false },
      { title: 'State', summary: '2 fields', open: false },
      { title: 'Args', summary: '2 items', open: false },
      { title: 'SomethingNobodyHasSeen', summary: '1 field', open: false },
    ]);
  });

  // REQ-9 — the count reads in the singular at one
  it('states a single item and a single field in the singular', () => {
    render(<PayloadSections payload={{ Only: 1, One: ['a'], Single: { a: 1 } }} />);

    expect(sections().map((section) => section.summary)).toEqual(['1 field', '1 item', '1 field']);
  });

  // REQ-9 — every section is independently collapsible, from its own header
  it('opens and closes one section from its own header without touching the others', async () => {
    const user = userEvent.setup();
    render(<PayloadSections payload={payload} defaultOpenKeys={[PAYLOAD_SCALARS_SECTION]} />);
    expect(sections().map((section) => section.open)).toEqual([true, false, false, false]);

    await user.click(sectionNamed('State').querySelector('.ui-collapsible-section__header')!);

    expect(sections().map((section) => section.open)).toEqual([true, true, false, false]);
  });

  // REQ-4 — a key the payload does not carry is nowhere in the rendering
  it('draws no field the payload does not hold', () => {
    render(<PayloadSections payload={{ Id: 'a1b2c3' }} defaultOpenKeys={[PAYLOAD_SCALARS_SECTION]} />);

    expect(sections().map((section) => section.title)).toEqual(['Fields']);
    expect(bands().map((band) => band.label)).toEqual(['Id']);
    expect(screen.queryByText('SizeRw')).toBeNull();
  });
});

describe('PayloadSections — nesting drawn as nesting (REQ-13, REQ-14)', () => {
  const payload = {
    HostConfig: {
      Binds: ['/host:/container:rw'],
      PortBindings: { '80/tcp': [{ HostIp: '', HostPort: '8080' }] },
      LogConfig: { Type: 'json-file', Config: {} },
    },
    Mounts: [
      { Type: 'volume', Name: 'data' },
      { Type: 'bind', Source: '/srv' },
    ],
  };

  function renderOpen() {
    render(<PayloadSections payload={payload} defaultOpenKeys={['HostConfig', 'Mounts']} />);
  }

  // REQ-13 — a nested object is a labelled group of its own fields, to whatever depth the payload goes
  it('draws a nested object as a labelled group holding its own fields, at any depth', () => {
    renderOpen();

    const logConfig = group('LogConfig');
    expect(bandNamed('Type', logConfig).value).toBe('json-file');
    const portBindings = group('PortBindings');
    expect(bandNamed('HostPort', portBindings).value).toBe('8080');
  });

  // REQ-9 — a nested group states its own count too
  it("states a nested group's own count beside its label", () => {
    renderOpen();

    expect(groupCount('LogConfig')).toBe('2 fields');
    expect(groupCount('Binds')).toBe('1 item');
  });

  // REQ-14 — an array of scalars reads as separate items identified by position
  it('draws an array of scalars as items keyed by their position, never as one joined string', () => {
    render(<PayloadSections payload={{ Args: ['sleep', '300', 'extra'] }} defaultOpenKeys={['Args']} />);

    expect(bands().map((band) => ({ label: band.label, value: band.value }))).toEqual([
      { label: '[0]', value: 'sleep' },
      { label: '[1]', value: '300' },
      { label: '[2]', value: 'extra' },
    ]);
  });

  // REQ-14 — an array of objects gives each item a group of its own
  it('gives every item of an array of objects a group of its own', () => {
    renderOpen();

    const mounts = sectionNamed('Mounts');
    expect(bandNamed('Type', group('[0]', mounts)).value).toBe('volume');
    expect(bandNamed('Type', group('[1]', mounts)).value).toBe('bind');
  });

  // REQ-13 — no value anywhere is a line of stringified JSON
  it('stringifies no composite value anywhere on the surface', () => {
    renderOpen();

    for (const band of bands()) {
      expect(band.value, `the band "${band.label}" carries stringified JSON`).not.toMatch(/^[[{].*[\]}]$/);
    }
    expect(document.body.textContent).not.toContain('[object Object]');
  });
});

describe('PayloadSections — empty is empty and zero is zero (REQ-6, REQ-7)', () => {
  const payload = {
    Zero: 0,
    False: false,
    StringZero: '0',
    NullId: null,
    Blank: '',
    Labels: {},
    Dns: [],
  };

  // REQ-6 — an empty value is drawn in its own place, marked as empty and naming what is empty
  it('marks each empty value in its own place, naming what is empty', () => {
    render(<PayloadSections payload={payload} defaultOpenKeys={[PAYLOAD_SCALARS_SECTION, 'Labels', 'Dns']} />);

    expect(bandNamed('NullId')).toMatchObject({ value: 'empty (null)', empty: true });
    expect(bandNamed('Blank')).toMatchObject({ value: 'empty (text)', empty: true });
  });

  // REQ-6 — a section whose whole value is empty draws the marker as its body rather than nothing
  it("draws an empty section's marker as its body rather than leaving it blank", async () => {
    const user = userEvent.setup();
    render(<PayloadSections payload={payload} />);

    expect(sections().map((section) => section.title)).toEqual(['Fields', 'Labels', 'Dns']);
    await user.click(sectionNamed('Labels').querySelector('.ui-collapsible-section__header')!);
    await user.click(sectionNamed('Dns').querySelector('.ui-collapsible-section__header')!);

    expect(sectionNamed('Labels').querySelector('.ui-collapsible-section__body')?.textContent).toBe('empty (object)');
    expect(sectionNamed('Dns').querySelector('.ui-collapsible-section__body')?.textContent).toBe('empty (list)');
  });

  // REQ-6 — an empty nested composite is a field of its own, not collapsed away into its parent
  it('keeps an empty nested object and an empty nested list in their own places', () => {
    render(<PayloadSections payload={{ HostConfig: { Labels: {}, Dns: [], Memory: 0 } }} defaultOpenKeys={['HostConfig']} />);

    expect(bandNamed('Labels')).toMatchObject({ value: 'empty (object)', empty: true });
    expect(bandNamed('Dns')).toMatchObject({ value: 'empty (list)', empty: true });
  });

  // REQ-7 — `0`, `false` and `"0"` read as themselves and are never marked empty
  it('draws zero, false and the string zero as the values they are', () => {
    render(<PayloadSections payload={payload} defaultOpenKeys={[PAYLOAD_SCALARS_SECTION]} />);

    expect(bandNamed('Zero')).toMatchObject({ value: '0', empty: false });
    expect(bandNamed('False')).toMatchObject({ value: 'false', empty: false });
    expect(bandNamed('StringZero')).toMatchObject({ value: '0', empty: false });
  });
});

describe("PayloadSections — the label, the literal and the caller's reading (REQ-15, REQ-17, REQ-35)", () => {
  // REQ-15 — a leaf carries the payload's own key name as its label
  it('labels a leaf with the key name the payload used', () => {
    render(<PayloadSections payload={{ NanoCpus: 1500000000 }} defaultOpenKeys={[PAYLOAD_SCALARS_SECTION]} />);

    expect(bands().map((band) => band.label)).toEqual(['NanoCpus']);
  });

  // REQ-17 — a reading is drawn beside the literal and never in place of it
  it("draws the caller's reading beside the literal, leaving the literal exactly as the payload had it", () => {
    render(
      <PayloadSections
        payload={{ Memory: 536870912 }}
        defaultOpenKeys={[PAYLOAD_SCALARS_SECTION]}
        reading={(path) => (path.join('.') === 'Memory' ? { node: '512.0 MB' } : undefined)}
      />,
    );

    expect(bandNamed('Memory')).toMatchObject({ value: '536870912', reading: '512.0 MB' });
  });

  // payload-sections.md — the reading is consulted for composite nodes too
  it('consults the reading for a composite node as well as for a leaf', () => {
    render(
      <PayloadSections
        payload={{ HostConfig: { Binding: { HostPort: '8080' } } }}
        defaultOpenKeys={['HostConfig']}
        reading={(path) => (path.join('.') === 'HostConfig.Binding' ? { node: '0.0.0.0:8080 → 80/tcp' } : undefined)}
      />,
    );

    expect(group('Binding').querySelector('.ui-payload-band__reading')?.textContent).toBe('0.0.0.0:8080 → 80/tcp');
  });

  // payload-sections.md — a `danger` tone draws the literal itself as bad news
  it('tones the literal itself when the caller asks for danger, and leaves it untoned otherwise', () => {
    const reading = vi.fn((path: readonly string[]) => (path.join('.') === 'ExitCode' ? { tone: 'danger' as const } : undefined));
    render(<PayloadSections payload={{ ExitCode: 137, RestartCount: 0 }} defaultOpenKeys={[PAYLOAD_SCALARS_SECTION]} reading={reading} />);

    const toneOf = (label: string) =>
      Array.from(document.querySelectorAll('.ui-payload-band'))
        .find((band) => band.querySelector('.ui-payload-band__label')?.textContent === label)!
        .querySelector('.ui-payload-band__value')!
        .className.includes('ui-payload-band__value--tone-danger');
    expect(toneOf('ExitCode')).toBe(true);
    expect(toneOf('RestartCount'), 'a value the caller read as ordinary is drawn as bad news').toBe(false);
  });

  // REQ-35 — every value is drawn in full, whatever it holds
  it('draws a secret-carrying value in full, with no masking and no truncation', () => {
    const secret = 'DATABASE_PASSWORD=s3cr3t-token-value-that-is-quite-long';
    render(<PayloadSections payload={{ Env: [secret] }} defaultOpenKeys={['Env']} />);

    expect(bandNamed('[0]').value).toBe(secret);
  });
});

describe('PayloadSections — no affordance beyond the section headers (REQ-24)', () => {
  const payload = { Id: 'a1b2c3', State: { Status: 'running' }, Env: ['FOO=bar'] };

  // REQ-24 — the only control on the surface is a section header: no copy button, no click-to-copy
  it('offers no control of any kind beside the section headers', () => {
    render(<PayloadSections payload={payload} defaultOpenKeys={[PAYLOAD_SCALARS_SECTION, 'State', 'Env']} />);

    const surface = document.querySelector('.ui-payload-sections')!;
    const controls = Array.from(surface.querySelectorAll('button, a, [role="button"], [onclick]'));
    expect(controls.every((control) => control.classList.contains('ui-collapsible-section__header'))).toBe(true);
    expect(surface.textContent?.toLowerCase(), 'the surface offers something to copy').not.toContain('copy');
  });
});

describe('PayloadSections — the open state a caller drives (REQ-11, REQ-19)', () => {
  const payload = { Id: 'a1b2c3', State: { Status: 'running' }, Mounts: [{ Type: 'volume' }] };

  // REQ-11 — with no `openKeys` the sections hold their own state, opened per `defaultOpenKeys`
  it('holds its own open state when the caller states none, opening what the defaults name', () => {
    render(<PayloadSections payload={payload} defaultOpenKeys={[PAYLOAD_SCALARS_SECTION, 'State']} />);

    expect(sections().map((section) => ({ title: section.title, open: section.open }))).toEqual([
      { title: 'Fields', open: true },
      { title: 'State', open: true },
      { title: 'Mounts', open: false },
    ]);
  });

  // REQ-19 — given `openKeys` the sections are exactly as open as the caller says, and every press is reported
  it('is opened exactly as the caller states and reports every header press instead of acting on it', async () => {
    const user = userEvent.setup();
    const onToggleSection = vi.fn();
    render(<PayloadSections payload={payload} openKeys={['Mounts']} onToggleSection={onToggleSection} defaultOpenKeys={[PAYLOAD_SCALARS_SECTION]} />);

    expect(sections().map((section) => ({ title: section.title, open: section.open }))).toEqual([
      { title: 'Fields', open: false },
      { title: 'State', open: false },
      { title: 'Mounts', open: true },
    ]);

    await user.click(sectionNamed('State').querySelector('.ui-collapsible-section__header')!);

    expect(onToggleSection).toHaveBeenCalledWith('State', true);
    expect(sectionNamed('State').querySelector('.ui-collapsible-section__header')!.getAttribute('aria-expanded'), 'a controlled section opened itself').toBe('false');
  });

  // REQ-19 — `visiblePaths` draws the paths it holds and nothing else
  it('draws only the paths the caller declares visible', () => {
    const visible = new Set([payloadPathKey(['State']), payloadPathKey(['State', 'Status'])]);
    render(<PayloadSections payload={payload} openKeys={['State']} visiblePaths={visible} />);

    expect(sections().map((section) => section.title)).toEqual(['State']);
    expect(bands().map((band) => band.label)).toEqual(['Status']);
  });

  // REQ-12 — whatever the caller trails the payload with is drawn after every payload-derived section
  it('draws the trailing content after every payload-derived section', () => {
    render(<PayloadSections payload={payload} trailing={<div data-testid="trailing">last</div>} />);

    const children = Array.from(document.querySelector('.ui-payload-sections')!.children);
    expect(children.at(-1)).toBe(screen.getByTestId('trailing'));
  });
});
