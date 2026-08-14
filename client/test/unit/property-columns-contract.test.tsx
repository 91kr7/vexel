import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ContentColumns, DefinitionList } from '../../src/ui';
import { ImageDetailPanel } from '../../src/images/ImageDetailPanel';

/**
 * **Contract and state only — and that is a decision, stated here on the spot.**
 * REQ ids belong to `plan-docker_management_app-detail_property_columns` (REQ-43).
 *
 * **jsdom has no layout and reports every box as zero.** A column-count, a height
 * or a "the label is beside its value" assertion written here would therefore
 * pass on any build, the delivered defect included — which is the trap this
 * project has already paid for twice. **Every geometric assertion of this batch
 * lives in the Playwright tree**, in
 * `image-detail-property-columns.spec.ts`, `container-detail-property-columns.spec.ts`,
 * `property-columns-sweep.spec.ts` and `property-columns-untouched-guard.spec.ts`.
 *
 * What is checkable here, and is checked, is the **contract**: what a caller can
 * state, what the markup associates with what, which class each call site
 * declares, and that no feature file states a layout constant. These assertions
 * stand **beside** the geometry and never instead of it (REQ-40).
 */

const uiRoot = join(process.cwd(), 'src', 'ui');
const source = (path: string) => readFileSync(join(process.cwd(), 'src', path), 'utf8');

const ITEMS = [
  { label: 'Id', value: 'sha256:abcdef012345', copyValue: 'sha256:abcdef012345' },
  { label: 'Tags', value: 'alpine:3.20' },
  { label: 'Created', value: '2026-04-16T23:53:24.896953537Z' },
];

afterEach(cleanup);

describe('DefinitionList — what a caller may state', () => {
  // REQ-3, REQ-5 — the caller states a content class and nothing else: a caller cannot know the
  // width it will be given, so a pixel length or a track template is the wrong shape for it.
  it('offers no pixel length and no track template on its public API', () => {
    const text = source(join('ui', 'data', 'DefinitionList.tsx'));
    // Comments stripped first: what is asserted is what the props *declare*, and the prose beside
    // them legitimately explains the widths the arrangement derives.
    const props = text.slice(text.indexOf('export interface DefinitionListProps'), text.indexOf('/** Label → value bands')).replace(/\/\*[\s\S]*?\*\//g, '');

    expect(props, 'the props declare a width, a minimum or a maximum').not.toMatch(/width|minWidth|maxWidth|min-width/i);
    expect(props, 'the props declare a track template').not.toMatch(/template|1fr|repeat\(/);
    expect(props, 'the props accept a length').not.toMatch(/\d+px|gap/);
    // What it does accept: the item list, the content class, and the caller-stated count that is
    // deliberately still here and is retired by the work that takes it off its five call sites.
    expect(props).toMatch(/items:\s*DefinitionItem\[\]/);
    expect(props).toMatch(/contentClass\?:\s*ContentClass/);
    expect(props).toMatch(/columns\?:\s*1 \| 2/);
  });

  // REQ-6 — three declared classes, short scalar the default. Asserted through the arrangement each
  // one selects, which is state, not geometry: nothing here claims a column count.
  it('declares exactly three content classes and defaults to short scalar', () => {
    const text = source(join('ui', 'layout', 'content-columns.ts'));
    expect(text).toMatch(/export type ContentClass = 'short-scalar' \| 'long-single-line' \| 'free-text'/);

    const { container: withDefault } = render(<DefinitionList items={ITEMS} />);
    const { container: explicit } = render(<DefinitionList items={ITEMS} contentClass="short-scalar" />);
    expect(withDefault.firstElementChild?.className, 'the default is not the short-scalar arrangement').toBe(explicit.firstElementChild?.className);

    const arrangements = (['short-scalar', 'long-single-line', 'free-text'] as const).map((contentClass) => {
      const { container } = render(<DefinitionList items={ITEMS} contentClass={contentClass} />);
      return container.firstElementChild?.className ?? '';
    });
    expect(new Set(arrangements).size, 'two content classes select the same arrangement, so one of them is not honoured').toBe(3);
  });
});

describe('DefinitionList — the markup a screen reader is handed', () => {
  /**
   * REQ-10, REQ-14 — **the assertion that goes red on the neatest-looking wrong
   * implementation.** A `display: contents` or subgrid arrangement puts the
   * label span and the value span in tracks of their own: it reads column-first
   * to assistive technology and comes apart the moment one value wraps. The band
   * stays one element holding both.
   */
  it('keeps each label→value pair in one element carrying both spans', () => {
    const { container } = render(<DefinitionList items={ITEMS} />);
    const list = container.firstElementChild!;
    const bands = Array.from(list.children);

    expect(bands, 'the list does not hold exactly one element per item — labels and values have been split into siblings').toHaveLength(ITEMS.length);
    for (const [index, band] of bands.entries()) {
      const labels = band.querySelectorAll('.ui-definition-list__label');
      const values = band.querySelectorAll('.ui-definition-list__value');
      expect(labels, `band ${index} does not carry exactly one label`).toHaveLength(1);
      expect(values, `band ${index} does not carry exactly one value`).toHaveLength(1);
      expect(labels[0]!.textContent).toBe(ITEMS[index]!.label);
      expect(values[0]!.textContent).toContain(String(ITEMS[index]!.value));
    }
  });

  // REQ-10 — the declared order is the document order, whatever the arrangement.
  it('renders the items in the order they were declared', () => {
    const { container } = render(<DefinitionList items={ITEMS} contentClass="long-single-line" />);
    const labels = Array.from(container.querySelectorAll('.ui-definition-list__label')).map((label) => label.textContent);
    expect(labels).toEqual(ITEMS.map((item) => item.label));
  });

  // REQ-32 — the copy affordance stays inside its own band, beside its own value. bug-5 concerns it
  // and is worked next; nothing here anticipates it either way.
  it('keeps a copy affordance inside the band of the value it copies', () => {
    const { container } = render(<DefinitionList items={ITEMS} />);
    const idBand = container.querySelector('.ui-definition-list__row')!;
    const value = idBand.querySelector('.ui-definition-list__value')!;
    expect(within(value as HTMLElement).getByRole('button', { name: 'Copy' })).toBeTruthy();
    // The one item with `copyValue`, and only it.
    expect(container.querySelectorAll('button').length).toBe(1);
  });
});

describe('ContentColumns — the same rule for a list of single values', () => {
  // REQ-13, REQ-19 — one home for the rule: the pair form and the value form select different
  // arrangements of the same three classes, rather than two components that look 90% alike.
  it('places each child in its own band and shares the three classes with the pair form', () => {
    const { container } = render(
      <ContentColumns contentClass="long-single-line">
        <span>PATH=/usr/local/sbin:/usr/local/bin</span>
        <span>NODE_ENV=production</span>
      </ContentColumns>,
    );
    const list = container.firstElementChild!;
    expect(list.children, 'a child is not one band of the arrangement').toHaveLength(2);

    const { container: pair } = render(<DefinitionList items={ITEMS} contentClass="long-single-line" />);
    expect(list.className, 'the value form and the pair form select the same arrangement, so the label run is being paid for twice').not.toBe(pair.firstElementChild?.className);
  });

  it('defaults to short scalar, as the pair form does', () => {
    const { container: withDefault } = render(<ContentColumns>{[<span key="a">a</span>]}</ContentColumns>);
    const { container: explicit } = render(<ContentColumns contentClass="short-scalar">{[<span key="a">a</span>]}</ContentColumns>);
    expect(withDefault.firstElementChild?.className).toBe(explicit.firstElementChild?.className);
  });
});

describe('the two reported call sites state no layout constant', () => {
  const panels = [
    ['images/ImageDetailPanel.tsx', 'the image detail panel'],
    ['containers/ContainerDetailPanel.tsx', 'the container detail panel'],
  ] as const;

  // REQ-27, REQ-36 — grep-able, and checked as such: no count, no track template, no width, no
  // `style`, no CSS import. The `1fr` of the Config tab's split in particular must be gone.
  it.each(panels)('%s states no count, template, width, style or stylesheet', (path, name) => {
    const text = source(path);
    expect(text, `${name} states a column count`).not.toMatch(/columns\s*=/);
    expect(text, `${name} states a track template`).not.toMatch(/1fr|repeat\(auto-|grid-template/);
    expect(text, `${name} carries an inline style`).not.toMatch(/style\s*=\s*\{/);
    expect(text, `${name} imports a stylesheet`).not.toMatch(/import\s+'.*\.css'/);
    expect(text, `${name} states a minimum or maximum width`).not.toMatch(/minWidth|maxWidth|width=/);
  });

  // REQ-6, REQ-16, REQ-17 — the class each section declares, on record here as well as in
  // `ui-library/specs/content-columns.md`, so "it inherited the default" stays a decision rather
  // than an accident.
  it('the image panel declares long single-line for Environment and Labels, and free text for History', () => {
    const text = source('images/ImageDetailPanel.tsx');
    const section = (title: string) => {
      const start = text.indexOf(`title="${title}"`);
      expect(start, `the image panel has no ${title} section`).toBeGreaterThan(-1);
      return text.slice(start, text.indexOf('</CollapsibleSection>', start));
    };
    expect(section('Environment')).toMatch(/contentClass="long-single-line"/);
    expect(section('Labels')).toMatch(/contentClass="long-single-line"/);
    expect(section('History')).toMatch(/contentClass="free-text"/);
    // The nine properties take the default deliberately: the first list of the file states nothing.
    const nineProperties = text.slice(text.indexOf('<DefinitionList'), text.indexOf('CollapsibleSection'));
    expect(nineProperties, 'the nine properties state a content class where they take the default').not.toMatch(/contentClass/);
  });

  it('the container panel declares long single-line for Labels and takes the default elsewhere', () => {
    const text = source('containers/ContainerDetailPanel.tsx');
    const labels = text.slice(text.indexOf('title="Labels"'), text.indexOf('title="Labels"') + 400);
    expect(labels).toMatch(/contentClass="long-single-line"/);
    // The Config tab's split is the library's named arrangement, not a template string.
    expect(text).toMatch(/<Grid arrangement="pair">/);
    // The environment · mounts list is the shared rule's value form at the long-single-line class.
    expect(text).toMatch(/<ContentColumns contentClass="long-single-line">/);
  });
});

describe('the library component keeps no knowledge of the domain', () => {
  // The standing rule: a UI-library component receives data and callbacks, and knows nothing about
  // Docker. Checked on the files this batch adds or changes.
  it.each([
    ['data/DefinitionList.tsx'],
    ['layout/ContentColumns.tsx'],
    ['layout/content-columns.ts'],
    ['layout/Grid.tsx'],
  ])('%s carries no domain vocabulary', (path) => {
    const text = readFileSync(join(uiRoot, path), 'utf8');
    // "container" and "image" are deliberately not on this list: they are the vocabulary of layout
    // and of CSS ("containing block", "background image"), not of the domain.
    for (const word of ['docker', 'daemon', 'registry', 'swarm', 'volume', 'inspect', 'entrypoint']) {
      expect(text.toLowerCase(), `it names "${word}"`).not.toContain(word);
    }
  });
});

describe('the image panel still shows every property it showed', () => {
  const inspect = {
    id: 'sha256:d9e853e87e55f7a5b2f0f1e7c0c2b9a1d3c4e5f60718293a4b5c6d7e8f901234',
    tags: ['alpine:3.20'],
    digest: 'sha256:d9e853e87e55',
    platforms: ['linux/arm64/v8'],
    sizeBytes: 4_089_446,
    createdAt: '2026-04-16T23:53:24.896953537Z',
    entrypoint: [],
    command: ['/bin/sh'],
    exposedPorts: [],
    env: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'],
    labels: {},
    history: [{ createdAt: '2026-04-16T23:53:24Z', createdBy: '/bin/sh -c #(nop) ADD file:… in / ', sizeBytes: 4_089_446 }],
    raw: { Id: 'sha256:d9e853e87e55' },
  };

  beforeEach(() => {
    // The panel's read hook subscribes to daemon events through a module-level EventSource, which
    // jsdom does not provide.
    vi.stubGlobal(
      'EventSource',
      class {
        addEventListener() {}
        close() {}
      },
    );
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => inspect })));
  });

  afterEach(() => vi.unstubAllGlobals());

  // REQ-31, REQ-15 — every property, in its declared order, with its label, its value and its copy
  // control. Content, deliberately: it answers a different symptom from the geometry — a section
  // present and blank — and it certifies nothing about the arrangement (REQ-40).
  it('renders the nine properties in their declared order, with the Copy beside Id', async () => {
    const image = { id: inspect.id, shortId: 'd9e853e87e55', tags: inspect.tags, digest: inspect.digest, platforms: inspect.platforms, sizeBytes: inspect.sizeBytes, createdAt: inspect.createdAt };
    render(<ImageDetailPanel image={image} onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText('Exposed ports')).toBeTruthy());
    const labels = Array.from(document.querySelectorAll('.ui-definition-list__label')).map((label) => label.textContent);
    expect(labels.slice(0, 9)).toEqual(['Id', 'Tags', 'Digest', 'Platform(s)', 'Size', 'Created', 'Entrypoint', 'Command', 'Exposed ports']);

    const idBand = document.querySelector('.ui-definition-list__row')!;
    expect(within(idBand.querySelector('.ui-definition-list__value') as HTMLElement).getByRole('button', { name: 'Copy' })).toBeTruthy();

    // The collapsible sections are closed by default and stay so: nothing about their state changes
    // with the arrangement (REQ-16).
    expect(document.querySelectorAll('.ui-definition-list')).toHaveLength(1);
  });
});
