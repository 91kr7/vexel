import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ContentColumns, DefinitionList, type DefinitionListProps } from '../../src/ui';
import { ImageDetailPanel } from '../../src/images/ImageDetailPanel';

/**
 * **Contract and state only — and that is a decision, stated here on the spot.**
 * REQ ids belong to `plan-docker_management_app-detail_property_columns` (REQ-43).
 *
 * **jsdom has no layout and reports every box as zero.** A column-count, a height
 * or a "the label is beside its value" assertion written here would therefore
 * pass on any build, the delivered defect included — which is the trap this
 * project has already paid for twice. **Every geometric assertion of this work
 * lives in the Playwright tree**, in
 * `image-detail-property-columns.spec.ts`, `container-detail-property-columns.spec.ts`,
 * `property-columns-sweep.spec.ts` and `property-columns-derived-count.spec.ts` —
 * the last of which measures the five surfaces that used to state their own
 * count, and replaced the guard that held them still while they did.
 *
 * What is checkable here, and is checked, is the **contract**: what a caller can
 * state, what the markup associates with what, which class each call site
 * declares, and that no feature file states a layout constant. These assertions
 * stand **beside** the geometry and never instead of it (REQ-40).
 */

const uiRoot = join(process.cwd(), 'src', 'ui');
const source = (path: string) => readFileSync(join(process.cwd(), 'src', path), 'utf8');

const ITEMS = [
  { label: 'Id', value: 'sha256:abcdef012345' },
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
    // What it accepts, and the whole of it: the item list and the content class.
    expect(props).toMatch(/items:\s*DefinitionItem\[\]/);
    expect(props).toMatch(/contentClass\?:\s*ContentClass/);
  });

  /**
   * REQ-25 — **the count is removed, not deprecated.** A prop left in place with
   * a warning leaves the product with two competing answers to "how many
   * columns", which is the finding the whole report rests on. The type is what
   * must refuse it, so the refusal is asserted where a type can be checked: the
   * `@ts-expect-error` below fails `npm run test:typecheck -w client` if
   * `columns` is ever accepted again — and fails it just as loudly if the line
   * stops being an error for having been quietly deleted.
   */
  it('refuses a caller-stated count in the type, not merely in the prose', () => {
    const refused: DefinitionListProps = {
      items: ITEMS,
      // @ts-expect-error a caller cannot state a column count: the prop does not exist.
      columns: 2,
    };
    // The value exists so that the type above is checked; what is checked at runtime is the source.
    expect(refused.items).toHaveLength(ITEMS.length);

    // Comments stripped: the prose legitimately explains the count the arrangement derives. What
    // must be gone is the identifier — the prop, its default and the class it selected.
    const code = source(join('ui', 'data', 'DefinitionList.tsx'))
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    // Not preceded by a hyphen or a word character: `content-columns`, the module the shared rule
    // lives in, is the arrangement's own home and is not a caller-stated count.
    expect(code, 'the component still declares a caller-stated count').not.toMatch(/(?<![-\w])columns\b/);
    expect(code, 'the retired two-track class is still emitted').not.toMatch(/columns-2/);
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

  /**
   * **REQ-32 is discharged, and this assertion inverts rather than disappearing.**
   *
   * What stood here was *"the copy affordance stays inside its own band, beside
   * its own value ... the one item with `copyValue`, and only it"* — the fence
   * bug-4 put around the control while bug-5 was still to be worked. bug-5 is
   * this fix, and it removed the control and the `copyValue` field with it
   * (plan-docker_management_app-remove_copy_controls/REQ-8, REQ-24), so that
   * sentence is now false in both halves.
   *
   * It is inverted here rather than deleted so the record of what changed lives
   * in the check itself: a band renders its label and its value **and nothing
   * else**, and the retired field is gone from the type — which
   * `npm run test:typecheck -w client` proves for every call site at once, and
   * which is stated here where the count of the delivered thirteen was taken.
   */
  it('renders a band as its label and its value alone, with no control beside them', () => {
    const { container } = render(<DefinitionList items={ITEMS} />);
    const idBand = container.querySelector('.ui-definition-list__row')!;
    const value = idBand.querySelector('.ui-definition-list__value')!;

    expect(value.textContent).toBe('sha256:abcdef012345');
    expect(within(value as HTMLElement).queryAllByRole('button')).toEqual([]);
    // Over the whole section, not the first band: no band of any list carries one.
    expect(container.querySelectorAll('button').length).toBe(0);
  });

  // REQ-8 — removed from the public API, not deprecated and not defaulted: the field is not on the
  // item type, so a caller that passes one does not compile.
  it('states no copy field on the item type', () => {
    const text = source(join('ui', 'data', 'DefinitionList.tsx'));
    const item = text.slice(text.indexOf('export interface DefinitionItem'), text.indexOf('export interface DefinitionListProps'));

    expect(item, 'the item type still carries the retired copy field').not.toMatch(/copyValue/);
    expect(item.replace(/\/\*[\s\S]*?\*\//g, ''), 'the item type declares something besides its label and its value').toMatch(
      /^[\s\S]*label:\s*string;[\s\S]*value:\s*ReactNode;[\s\S]*$/,
    );
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
    // The properties take the default deliberately. They are the panel primitive's own grid now
    // rather than a list this file lays out (plan-ui-coherence-optimisation/REQ-61), so the block
    // read is the `properties` prop, and the default is expressed by stating no class at all.
    const properties = text.slice(text.indexOf('properties={'), text.indexOf('<Stack'));
    expect(properties.length, 'the image panel states no properties on the panel primitive').toBeGreaterThan(0);
    expect(properties, 'the properties state a content class where they take the default').not.toMatch(/contentClass/);
    expect(text, 'the image panel states a content class for its property grid where it takes the default').not.toMatch(/propertiesContentClass/);
  });

  // The `Labels` clause of this check named the Inspect tab's own section, which the payload-derived
  // rebuild removed outright (`…-inspect_full_payload/REQ-3`): what replaces it is the assertion that
  // the tab states no reading list, and no content class, at all.
  it('the container panel declares its content classes on the Config tab alone', () => {
    const text = source('containers/ContainerDetailPanel.tsx');
    const inspectView = text.slice(text.indexOf('function renderInspectView'), text.indexOf('function renderInspectView') + 1500);
    expect(inspectView, 'the container panel has no Inspect view at all').not.toBe('');
    expect(inspectView, 'the Inspect tab states a content class for a payload it does not lay out itself').not.toMatch(/contentClass=/);
    expect(inspectView, 'the Inspect tab still curates a reading list of its own').not.toMatch(/<DefinitionList|<FieldList/);
    // The Config tab's split is the library's named arrangement, not a template string.
    expect(text).toMatch(/<Grid arrangement="pair">/);
    // Read within the view mode alone, which is the tail of `renderConfigView`: the edit form
    // heads a group `Mounts` too, and its groups are row editors rather than reading lists. The
    // read view **ends** at `Edit configuration` now that the action closes the tab (REQ-50), so
    // each group is the last statement of its own title before that point.
    const readViewEnd = text.indexOf('Edit configuration');
    expect(readViewEnd, 'the container panel has no Edit configuration action at all').toBeGreaterThan(-1);
    const section = (title: string) => {
      const start = text.lastIndexOf(`title="${title}"`, readViewEnd);
      expect(start, `the container panel's read view has no ${title} group`).toBeGreaterThan(-1);
      return text.slice(start, readViewEnd);
    };
    // **What the two `DefinitionList`s became** (`…-tabs_composition_refactor/REQ-54` … REQ-56):
    // the environment and the mounts read one entry per row at their group's full width, which is
    // the library's free-text class on `FieldList`, and the mounts ask for the `content`
    // arrangement so a volume source takes the room its destination does not need. What this
    // assertion named is unchanged — the reading groups state a **content class** and nothing else
    // about their layout — so it is re-pointed at the lists that carry it now rather than dropped
    // with the element it used to name (REQ-43).
    expect(section('Environment variables'), 'the Environment variables group does not read one entry per row at the group’s full width').toMatch(
      /<FieldList[^>]*contentClass="free-text"/s,
    );
    expect(section('Mounts'), 'the Mounts group does not read one entry per row at the group’s full width').toMatch(/<FieldList[^>]*contentClass="free-text"/s);
    expect(section('Mounts'), 'the Mounts group does not ask for the content arrangement').toMatch(/<FieldList[^>]*arrangement="content"/s);
    // `Port mappings` takes the short-scalar class, so it goes on flowing as many entries per line
    // as its own card carries — stated or taken as the library's default, but never a wider one.
    const ports = section('Port mappings');
    expect(ports, 'the Port mappings group is not a reading field list').toMatch(/<FieldList/s);
    // The list's own opening tag, and not the group's whole source: the group holds a placeholder
    // and a heading too, and a class named anywhere in them would answer for the list.
    const portsList = ports.slice(ports.indexOf('<FieldList'), ports.indexOf('items=', ports.indexOf('<FieldList')));
    expect(portsList, 'the Port mappings list declares a class wider than the short scalar').not.toMatch(/contentClass="(free-text|long-single-line)"/);
  });
});

describe('no feature file anywhere states a count, a template or a width for a property section', () => {
  /**
   * REQ-25, REQ-27 — **checked over the sources, not claimed in a plan.** The
   * five surfaces that used to pass `columns={2}` are named one by one, because
   * "four and a shrug" is the way this is got wrong; and the check is then made
   * over **every** feature file, so a sixth call site cannot reintroduce a count
   * quietly.
   *
   * Scoped to the property sections on purpose. `DataTable` states its own
   * columns — they are its data — and the screen-level `Grid` still takes a free
   * template string for the layouts this work deliberately leaves alone, so a
   * check written against the file as a whole would either be false or would
   * have to be softened until it said nothing.
   */
  const featureRoot = join(process.cwd(), 'src');

  /**
   * The surfaces that stated a count, and **how each one states its property
   * section now**.
   *
   * They were five. Four were the swarm screen's panels, and they left with the
   * area on 2026-08-27 (plan-docker_management_app-swarm_removal/REQ-1); the
   * coverage baseline is the one that remains, and it renders the list directly.
   * The rule they were all read against is unchanged and is asserted here in
   * full: the caller states the class and **never** the count.
   */
  const THE_SURFACES = [{ path: 'coverage/CoverageMatrixScreen.tsx', tag: 'DefinitionList', contentClass: null }] as const;

  /**
   * Every `.tsx` under `src` that is not the library itself: the feature layer.
   *
   * `__conformance-fixture__` is skipped, exactly as `blur-policy.test.ts`,
   * `overlay-glass.test.tsx` and `truncation-contract.test.tsx` skip it:
   * `ui-conformance-check.test.ts` writes deliberately illegal sources there for
   * the length of its own run and removes them afterwards, so a scan of the live
   * tree that picked one up would be reading **another test's fixture** as
   * feature code — and, this scan being an `it.each` that enumerates at
   * collection time and reads at run time, would fail with `ENOENT` on a file
   * that had been correctly cleaned up in between (CLAUDE.md, "Tests" — a test
   * depends on nothing another test did). Observed exactly so in a full run.
   */
  function featureFiles(directory = featureRoot): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.name === '__conformance-fixture__') return [];
      if (entry.isDirectory()) return entry.name === 'ui' ? [] : featureFiles(path);
      return entry.name.endsWith('.tsx') ? [path] : [];
    });
  }

  /**
   * The props of every occurrence of a tag, brace-aware: an `items={[…]}` holds
   * arrow functions, so a scan that stopped at the first `>` would cut the props
   * in half and pass whatever came after.
   */
  function propsOf(text: string, tag: string): string[] {
    const opener = `<${tag}`;
    const found: string[] = [];
    for (let start = text.indexOf(opener); start !== -1; start = text.indexOf(opener, start + 1)) {
      let depth = 0;
      let cursor = start + opener.length;
      while (cursor < text.length) {
        const character = text[cursor];
        if (character === '{') depth += 1;
        else if (character === '}') depth -= 1;
        else if (character === '>' && depth === 0) break;
        cursor += 1;
      }
      found.push(text.slice(start + opener.length, cursor));
    }
    return found;
  }

  it('the surfaces that stated a count state none, and take the class their content calls for', () => {
    for (const { path, tag, contentClass } of THE_SURFACES) {
      const sections = propsOf(source(path), tag);
      expect(sections.length, `${path} no longer states a property section through <${tag}> at all`).toBeGreaterThan(0);
      const stating = sections.filter((props) => /\bproperties=\{|\bitems=\{/.test(props));
      expect(stating.length, `${path} renders <${tag}> but hands it no properties`).toBeGreaterThan(0);

      for (const props of stating) {
        // The half that has never moved and never may: **no count, at any width.**
        expect(props, `${path} states a column count`).not.toMatch(/\bcolumns\s*=/);
        expect(props, `${path} states a track template`).not.toMatch(/1fr|repeat\(auto-|grid-template/);

        if (contentClass === null) {
          // Short scalar, taken deliberately: this list holds versions and API numbers.
          expect(props, `${path} declares a content class where it takes the short-scalar default`).not.toMatch(/[cC]ontentClass/);
        } else {
          // …and the half that follows the content: the class the section's own content calls for.
          expect(props, `${path} no longer states the class its content calls for`).toMatch(
            new RegExp(`[cC]ontentClass="${contentClass}"`),
          );
        }
      }
    }
  });

  it.each(featureFiles().map((path) => [path.slice(featureRoot.length + 1), path] as const))(
    '%s passes no count, template, width or length to a property section',
    (name, path) => {
      const text = readFileSync(path, 'utf8');
      expect(text, `${name} names the retired two-track class`).not.toMatch(/ui-definition-list--columns-2/);
      for (const tag of ['DefinitionList', 'ContentColumns']) {
        for (const props of propsOf(text, tag)) {
          expect(props, `${name} states a column count on a ${tag}`).not.toMatch(/columns\s*=/);
          expect(props, `${name} states a track template on a ${tag}`).not.toMatch(/1fr|repeat\(auto-|grid-template/);
          expect(props, `${name} carries an inline style on a ${tag}`).not.toMatch(/style\s*=\s*\{/);
          expect(props, `${name} states a length on a ${tag}`).not.toMatch(/\d+px|minWidth|maxWidth|width=/);
        }
      }
    },
  );
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
    // A repository digest **of its own**, deliberately: this file measures the property set, and
    // `Digest` is drawn only when the daemon reports a digest that is not the image id
    // (plan-ui-coherence-optimisation/REQ-58, whose two shapes are checked in
    // `image-detail-panel.test.tsx`). The fixture's digest used to be a prefix of its own id, which
    // after that change would have measured the set one band short of the one bug-4 certified.
    digest: 'sha256:1f0c4a72b8e5',
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

  // REQ-31, REQ-15 — every property, in its declared order, with its label and its value. Content,
  // deliberately: it answers a different symptom from the geometry — a section present and blank —
  // and it certifies nothing about the arrangement (REQ-40). The `Copy` that used to be asserted
  // beside `Id` left on 2026-08-14 and the assertion inverts with it
  // (plan-docker_management_app-remove_copy_controls/REQ-24).
  it('renders the nine properties in their declared order, with no control beside Id', async () => {
    const image = { id: inspect.id, shortId: 'd9e853e87e55', tags: inspect.tags, digest: inspect.digest, platforms: inspect.platforms, sizeBytes: inspect.sizeBytes, createdAt: inspect.createdAt };
    render(<ImageDetailPanel image={image} onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText('Exposed ports')).toBeTruthy());
    const labels = Array.from(document.querySelectorAll('.ui-definition-list__label')).map((label) => label.textContent);
    // `Content size` names what this number measures — the image's own content, against the list's
    // `DISK USAGE` (plan-ui-coherence-optimisation/REQ-59). The set, its order and its count are
    // otherwise exactly the ones bug-4 certified.
    expect(labels.slice(0, 9)).toEqual(['Id', 'Tags', 'Digest', 'Platform(s)', 'Content size', 'Created', 'Entrypoint', 'Command', 'Exposed ports']);

    const idBand = document.querySelector('.ui-definition-list__row')!;
    const idValue = idBand.querySelector('.ui-definition-list__value') as HTMLElement;
    // The value is still there in full, and it is the band's only content (REQ-16).
    expect(idValue.textContent).toBe(inspect.id.slice(0, 19));
    expect(within(idValue).queryAllByRole('button')).toEqual([]);

    // The collapsible sections are closed by default and stay so: nothing about their state changes
    // with the arrangement (REQ-16).
    expect(document.querySelectorAll('.ui-definition-list')).toHaveLength(1);
  });
});
