/**
 * F18 — the raw console's daemon payload (`plan-ui-coherence-optimisation/REQ-76`, `REQ-77`).
 *
 * The payload the Engine API returns is one line with no spaces in it, and the delivered build drew
 * it as a wall of JSON broken wherever the edge of the box happened to fall — in the middle of a
 * digest, an image reference or a mount path. What REQ-76 promises is measurable and is measured
 * here: **no line breaks mid-token**, the block **stays inside its surface** at all three viewports,
 * and the text is **real, complete and selectable** — which is checked with a real mouse selection
 * and a character-for-character comparison, since nothing about a `textContent` read would notice a
 * value the operator cannot actually take out of the block.
 *
 * The one stated exception is in the contract and is honoured here rather than assumed away: where
 * **no line can hold a token at any width** — a 64-character digest inside the block at 375px —
 * staying inside the surface wins over staying whole. So a break is a defect only when the token it
 * cuts would have fitted, which is what the measurement below distinguishes: the token's own advance
 * width, summed across the fragments it was broken into, against the block's content width.
 *
 * The fixture is one labelled container, removed in a `finally`; every assertion is about the
 * payload of that container and about nothing the operator's daemon holds.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { readOnceSettled } from './support/settled.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

/** The three viewports the plan is written against. */
const VIEWPORTS = [
  { width: 1440, height: 1000 },
  { width: 1280, height: 800 },
  { width: 375, height: 812 },
];

interface BrokenToken {
  text: string;
  /** The token's own advance width, summed over the fragments it was broken into. */
  width: number;
  lines: number;
  /** The character each break falls after, which is what says which kind of break it is. */
  breaksAfter: string[];
}

interface PayloadGeometry {
  text: string;
  /** How many lines the block is actually laid over. */
  renderedLines: number;
  blockWidth: number;
  blockRight: number;
  /** The right edge of the surface's own content box. */
  surfaceRight: number;
  /** How far the payload block itself can be scrolled sideways: 0 is "nothing is hidden". */
  blockOverflow: number;
  /** How far the surface holding it can be, which the payload is only one candidate cause of. */
  surfaceOverflow: number;
  /** Whatever reaches past the surface's content box, named, so a failure says what overflows. */
  overflowing: { className: string; isThePayload: boolean; right: number; text: string }[];
  tokens: number;
  /** Tokens laid over more than one line, whatever the reason. */
  broken: BrokenToken[];
  /** Breaks falling inside a token at no opportunity the text offers: the arbitrary ones. */
  arbitrary: number;
  /** Of those, the ones a line could have held: what REQ-76 refuses. */
  avoidable: BrokenToken[];
}

async function createFixtureContainer(name: string): Promise<string> {
  const { stdout } = await execFileAsync('docker', [
    'run',
    '-d',
    '--name',
    name,
    ...ownershipArgs(name),
    '--label',
    'vexel.e2e.payload=wrapping',
    'alpine:3.20',
    'sleep',
    '600',
  ]);
  return stdout.trim();
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

function screenContent(page: Page): Locator {
  return page.locator('.ui-frame__content');
}

function prompt(page: Page): Locator {
  return page.getByLabel('Console prompt');
}

function entryFor(page: Page, command: string): Locator {
  return page.locator('.ui-console-surface__entry', {
    has: page.locator('.ui-console-surface__command', { hasText: command }),
  });
}

async function submit(page: Page, command: string): Promise<void> {
  await prompt(page).fill(command);
  await prompt(page).press('Enter');
}

/**
 * Opens the console and waits for the startup history read to have landed, so an assertion on the
 * transcript never races the load. The screen is pinned rather than inherited: the last active one
 * survives by design (REQ-115).
 */
async function openConsole(page: Page): Promise<void> {
  const historyRead = page.waitForResponse(
    (response) => response.url().includes('/api/console/history') && response.request().method() === 'GET',
  );
  await openApp(page, 'raw-console');
  await historyRead;
  await expect(screenContent(page).getByRole('heading', { name: 'Raw command & API console' })).toBeVisible();
}

/** The entry's longest output line: the daemon body, as against the status line beside it. */
async function payloadLine(entry: Locator): Promise<Locator> {
  const lines = entry.locator('.ui-console-surface__line');
  const texts = await lines.allTextContents();
  const longest = texts.reduce((best, text, index) => (text.length > texts[best]!.length ? index : best), 0);
  return lines.nth(longest);
}

/**
 * The payload block, measured where it is drawn.
 *
 * A **token** here is what an operator takes out of the block in one piece: a double-quoted string,
 * or a bare run of characters between the payload's own separators. Each is measured with a range of
 * its own — the number of distinct lines its rectangles fall on, and the sum of their widths, which
 * is the token's advance width whether or not it was broken.
 */
async function measurePayload(line: Locator): Promise<PayloadGeometry> {
  return await line.evaluate((element) => {
    const text = element.textContent ?? '';

    // The offsets of the text as one string, mapped onto the text nodes it is drawn from: the
    // wrapping opportunities are elements, so the payload is several nodes.
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const chunks: { node: Text; start: number }[] = [];
    let total = 0;
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      chunks.push({ node: node as Text, start: total });
      total += (node as Text).data.length;
    }
    const locate = (offset: number): [Text, number] => {
      let index = 0;
      while (index + 1 < chunks.length && chunks[index + 1]!.start <= offset) index += 1;
      const chunk = chunks[index]!;
      return [chunk.node, Math.min(offset - chunk.start, chunk.node.data.length)];
    };
    const rangeOver = (from: number, to: number): Range => {
      const range = document.createRange();
      const [startNode, startOffset] = locate(from);
      const [endNode, endOffset] = locate(to);
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      return range;
    };
    const linesOf = (rects: DOMRect[]) => new Set(rects.map((rect) => Math.round(rect.top))).size;

    const whole = rangeOver(0, total);
    const renderedLines = linesOf([...whole.getClientRects()]);

    const block = element.getBoundingClientRect();
    const blockStyle = getComputedStyle(element);
    const blockWidth =
      element.clientWidth - Number.parseFloat(blockStyle.paddingLeft) - Number.parseFloat(blockStyle.paddingRight);
    const scroller = element.closest('.ui-scroll-area') ?? element.parentElement!;
    const surface = scroller.getBoundingClientRect();

    const broken: { text: string; width: number; lines: number; breaksAfter: string[] }[] = [];
    let tokens = 0;
    // A quoted string, or a bare run between the payload's own separators.
    const pattern = /"(?:[^"\\]|\\.)*"|[^\s",;:{}[\]]+/g;
    for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
      tokens += 1;
      const from = match.index;
      const to = from + match[0].length;
      const rects = [...rangeOver(from, to).getClientRects()];
      const lines = linesOf(rects);
      if (lines > 1) {
        // Where the break actually fell: the character before it says whether it is an opportunity
        // the text itself offered (a hyphen, a whitespace) or an arbitrary cut.
        const tops: (number | null)[] = [];
        for (let offset = from; offset < to; offset += 1) {
          const characterRects = rangeOver(offset, offset + 1).getClientRects();
          tops.push(characterRects.length > 0 ? Math.round(characterRects[0]!.top) : null);
        }
        const breaksAfter: string[] = [];
        for (let index = 1; index < tops.length; index += 1) {
          if (tops[index] !== null && tops[index - 1] !== null && tops[index] !== tops[index - 1]) {
            breaksAfter.push(text[from + index - 1]!);
          }
        }
        broken.push({
          text: match[0],
          width: rects.reduce((sum, rect) => sum + rect.width, 0),
          lines,
          breaksAfter,
        });
      }
    }
    // payload-wrapping.md — "A wrap falls on a break opportunity the text itself offers — one of the
    // boundaries above, a whitespace, or a hyphen the text contains". Everything else inside a token
    // is an arbitrary break.
    const arbitrarilyBroken = broken.filter((token) => token.breaksAfter.some((character) => !/[-\s]/.test(character)));

    return {
      text,
      renderedLines,
      blockWidth,
      blockRight: block.right,
      surfaceRight: surface.left + scroller.clientWidth,
      blockOverflow: element.scrollWidth - element.clientWidth,
      surfaceOverflow: scroller.scrollWidth - scroller.clientWidth,
      // What actually reaches past the surface's own content box, if anything does: the payload
      // block is one of the things the surface holds, and a failure has to name which one it is.
      overflowing: [...scroller.querySelectorAll('*')]
        .filter((candidate) => candidate.getBoundingClientRect().right > surface.left + scroller.clientWidth + 1)
        .map((candidate) => ({
          className: candidate.className,
          isThePayload: candidate === element,
          right: Math.round(candidate.getBoundingClientRect().right),
          text: (candidate.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
        })),
      tokens,
      broken,
      arbitrary: arbitrarilyBroken.reduce(
        (count, token) => count + token.breaksAfter.filter((character) => !/[-\s]/.test(character)).length,
        0,
      ),
      // The single stated exception: a token no line can hold at any width. An arbitrary break in a
      // token that would have fitted is the defect REQ-76 names.
      avoidable: arbitrarilyBroken.filter((token) => token.width <= blockWidth - 1),
    };
  });
}

test.describe('Raw console — the daemon payload (REQ-76, REQ-77)', () => {
  // plan-ui-coherence-optimisation/REQ-76 — "no line breaks mid-token, the block stays inside its
  // surface at all three viewports, and the payload remains real, complete, selectable text";
  // ui-library/specs/payload-wrapping.md — the one exception, a token no line can hold.
  test('the payload wraps at its own token boundaries and stays inside its surface at all three viewports', async ({ page }) => {
    test.setTimeout(120_000);
    const name = `vexel-e2e-payload-${Date.now()}`;
    try {
      const id = await createFixtureContainer(name);
      await openConsole(page);
      await screenContent(page).getByRole('button', { name: 'Engine API' }).click();
      const command = `GET /containers/${id}/json`;
      await submit(page, command);

      const entry = entryFor(page, command);
      await expect(entry).toContainText('HTTP 200', { timeout: 20_000 });
      const line = await payloadLine(entry);
      await expect(line).toBeVisible();

      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        // The transcript is virtualised by nothing, but the resize reflows it: measured once the
        // layout has settled rather than on the frame the resize lands in — by the suite's own
        // sampler rather than by a fixed sleep, which is a guess in both directions
        // (`support/settled.ts`).
        const geometry = await readOnceSettled(
          page,
          () => measurePayload(line),
          (previous, current) => JSON.stringify(previous) === JSON.stringify(current),
        );
        const at = `${viewport.width}×${viewport.height}`;

        console.log(
          `[REQ-76] ${at} — ${geometry.text.length} characters over ${geometry.renderedLines} lines,`
          + ` ${geometry.tokens} tokens, ${geometry.broken.length} broken, ${geometry.arbitrary} arbitrary break(s),`
          + ` ${geometry.avoidable.length} of them avoidable,`
          + ` block ${Math.round(geometry.blockWidth)}px, overflow ${geometry.blockOverflow}px on the block`
          + ` and ${geometry.surfaceOverflow}px on the surface holding it`,
        );
        if (geometry.overflowing.length > 0) {
          console.log(`[REQ-76] ${at} — past the surface's content box: ${JSON.stringify(geometry.overflowing)}`);
        }
        for (const token of geometry.broken) {
          console.log(
            `[REQ-76] ${at} — broken over ${token.lines} lines after [${token.breaksAfter.join('][')}]:`
            + ` ${token.width.toFixed(1)}px of token in a ${geometry.blockWidth.toFixed(1)}px block`
            + ` — ${token.text.slice(0, 80)}`,
          );
        }

        expect(
          geometry.avoidable.map((token) => token.text),
          `[REQ-76] ${at}: a token a line could have held was cut in half at no break opportunity of its own`,
        ).toEqual([]);
        expect(geometry.blockOverflow, `[REQ-76] ${at}: the payload has to be scrolled sideways to be read`).toBeLessThanOrEqual(1);
        expect(geometry.blockRight, `[REQ-76] ${at}: the payload is drawn past the right edge of its surface`).toBeLessThanOrEqual(
          geometry.surfaceRight + 1,
        );
        expect(
          geometry.overflowing.filter((element) => element.isThePayload),
          `[REQ-76] ${at}: the payload block is what reaches past its surface`,
        ).toEqual([]);
        // Real and complete: what the block holds parses as the daemon's own object, and it is the
        // container this test created.
        expect(JSON.parse(geometry.text).Id, `[REQ-76] ${at}: the payload on screen is not the daemon's own`).toBe(id);
      }
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-ui-coherence-optimisation/REQ-76 — "the payload remains real, complete, selectable text".
  // A real mouse selection at the value's own coordinates, compared character for character: a
  // `textContent` read would pass on a block whose value cannot be taken out of it by hand.
  test('a value can be selected out of the payload with the mouse, character for character', async ({ page }) => {
    test.setTimeout(120_000);
    const name = `vexel-e2e-payload-select-${Date.now()}`;
    try {
      const id = await createFixtureContainer(name);
      await page.setViewportSize(VIEWPORTS[0]!);
      await openConsole(page);
      await screenContent(page).getByRole('button', { name: 'Engine API' }).click();
      const command = `GET /containers/${id}/json`;
      await submit(page, command);

      const entry = entryFor(page, command);
      await expect(entry).toContainText('HTTP 200', { timeout: 20_000 });
      const line = await payloadLine(entry);
      await line.scrollIntoViewIfNeeded();
      // The transcript scrolls itself when an entry arrives; the coordinates are read once it has
      // stopped, since a selection is driven by coordinates and nothing else.
      await page.waitForTimeout(800);

      // A value of the payload as the daemon wrote it, chosen among those actually under the
      // pointer: the container's own id where the region shows it, the longest visible value
      // otherwise. What is asserted is that the value comes back whole, not which value it is.
      const target = await line.evaluate((element, preferred: string) => {
        const text = element.textContent ?? '';
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const chunks: { node: Text; start: number }[] = [];
        let total = 0;
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          chunks.push({ node: node as Text, start: total });
          total += (node as Text).data.length;
        }
        const locate = (offset: number): [Text, number] => {
          let index = 0;
          while (index + 1 < chunks.length && chunks[index + 1]!.start <= offset) index += 1;
          const chunk = chunks[index]!;
          return [chunk.node, Math.min(offset - chunk.start, chunk.node.data.length)];
        };
        const rectOf = (from: number, to: number): DOMRect[] => {
          const range = document.createRange();
          const [startNode, startOffset] = locate(from);
          const [endNode, endOffset] = locate(to);
          range.setStart(startNode, startOffset);
          range.setEnd(endNode, endOffset);
          return [...range.getClientRects()];
        };

        const scroller = element.closest('.ui-scroll-area') ?? element;
        const view = scroller.getBoundingClientRect();
        const candidates: { text: string; left: number; right: number; top: number; bottom: number }[] = [];
        const pattern = /"[^"\\]{12,}"/g;
        for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
          // A value appearing twice would make the comparison ambiguous.
          if (text.indexOf(match[0]) !== text.lastIndexOf(match[0])) continue;
          const rects = rectOf(match.index, match.index + match[0].length);
          if (rects.length !== 1) continue;
          const rect = rects[0]!;
          if (rect.top < view.top + 4 || rect.bottom > view.bottom - 4) continue;
          candidates.push({ text: match[0], left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
        }
        const chosen =
          candidates.find((candidate) => candidate.text === preferred)
          ?? candidates.sort((left, right) => right.text.length - left.text.length)[0];
        return chosen === undefined
          ? null
          : { ...chosen, scrollTop: scroller.scrollTop, isTheContainerId: chosen.text === preferred };
      }, `"${id}"`);

      expect(target, '[REQ-76] no value of the payload is laid on one line inside the visible region').not.toBeNull();
      console.log(
        `[REQ-76] selecting ${target!.isTheContainerId ? 'the container id' : 'a value'} of ${target!.text.length}`
        + ` characters, drawn at x=${Math.round(target!.left)}…${Math.round(target!.right)}, y=${Math.round(target!.top)}`,
      );

      // A real pointer, at the value's own coordinates: two pixels outside each edge, which is the
      // far half of the neighbouring character, so the caret snaps to the value's own boundaries.
      const middle = (target!.top + target!.bottom) / 2;
      await page.mouse.move(target!.left - 2, middle);
      await page.mouse.down();
      await page.mouse.move(target!.left + 4, middle, { steps: 4 });
      await page.mouse.move(target!.right + 2, middle, { steps: 12 });
      await page.mouse.up();

      const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
      const scrolled = await line.evaluate((element) => (element.closest('.ui-scroll-area') ?? element).scrollTop);
      console.log(`[REQ-76] selected ${selected.length} characters, wanted ${target!.text.length}`);
      expect(scrolled, '[REQ-76] the region scrolled between the measurement and the drag, so the pointer aimed elsewhere').toBe(
        target!.scrollTop,
      );

      expect(selected, '[REQ-76] the mouse selection does not return the value the daemon sent').toBe(target!.text);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-ui-coherence-optimisation/REQ-77 — "Every entry keeps `Re-run` and its status badges with
  // their delivered spacing … and no copy affordance returns"
  // (plan-docker_management_app-remove_copy_controls/REQ-7 removed one per transcript entry here).
  test('every entry of the transcript keeps its badges and its Re-run, spaced alike, and none of them offers a copy', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(VIEWPORTS[0]!);
    await openConsole(page);

    const commands = [
      `docker ps --filter label=vexel.e2e.transcript-a-${Date.now()}`,
      `docker ps --filter label=vexel.e2e.transcript-b-${Date.now()}`,
      `docker ps --filter label=vexel.e2e.transcript-c-${Date.now()}`,
    ];
    for (const command of commands) {
      await submit(page, command);
      await expect(entryFor(page, command)).toContainText('exit 0', { timeout: 20_000 });
    }

    // Every entry, not merely the first.
    for (const command of commands) {
      const entry = entryFor(page, command);
      await expect(entry.getByRole('button', { name: 'Re-run' })).toBeVisible();
      await expect(entry.locator('.ui-badge', { hasText: 'docker CLI' })).toHaveCount(1);
      await expect(entry.locator('.ui-badge', { hasText: 'exit 0' })).toHaveCount(1);
    }

    // The spacing they were delivered with, read as the one spacing the cluster has: every entry's
    // badges and `Re-run` are set out the same way, and the gap is a real one.
    const clusters = await page.locator('.ui-console-surface__entry-actions').evaluateAll((elements) =>
      elements.map((element) => {
        const children = [...element.children].map((child) => child.getBoundingClientRect());
        const gaps: number[] = [];
        for (let index = 1; index < children.length; index += 1) {
          gaps.push(Math.round((children[index]!.left - children[index - 1]!.right) * 100) / 100);
        }
        return { items: children.length, gaps, gap: Number.parseFloat(getComputedStyle(element).columnGap) };
      }),
    );
    console.log(`[REQ-77] ${clusters.length} entries — clusters ${JSON.stringify(clusters)}`);

    const measured = clusters.filter((cluster) => cluster.items > 1);
    expect(measured.length, '[REQ-77] no entry draws its badges beside its Re-run').toBeGreaterThanOrEqual(3);
    expect(
      new Set(measured.map((cluster) => JSON.stringify(cluster.gaps))).size,
      '[REQ-77] the entries do not space their badges and their Re-run alike',
    ).toBe(1);
    expect(new Set(measured.map((cluster) => cluster.gap)).size, '[REQ-77] the entries are not spaced alike').toBe(1);
    for (const cluster of measured) {
      expect(Math.min(...cluster.gaps), '[REQ-77] the badges and Re-run of an entry are drawn on top of one another').toBeGreaterThan(0);
    }

    // A real pointer at the visible control's own centre, on the **last** entry: the affordance is
    // on every entry and works from every entry.
    const last = entryFor(page, commands[commands.length - 1]!);
    await last.getByRole('button', { name: 'Re-run' }).click();
    await expect(entryFor(page, commands[commands.length - 1]!)).toHaveCount(2, { timeout: 20_000 });

    // No copy affordance returned to any entry.
    const transcript = page.locator('.ui-console-surface__transcript');
    await expect(transcript.getByRole('button', { name: /copy/i })).toHaveCount(0);
    await expect(transcript.locator('[aria-label*="opy"]')).toHaveCount(0);
  });

  // raw-console-screen.md — "**This screen has no empty state.** An empty transcript is a console
  // that has not been used yet and says so on its own prompt line; nothing on the screen is drawn on
  // an empty-state surface." (plan-ui-coherence-optimisation/REQ-77)
  test('the screen draws no empty state, with an empty transcript or a full one', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(VIEWPORTS[0]!);
    await openConsole(page);

    // The data directory is emptied before every test, so this transcript starts empty.
    await expect(page.locator('.ui-console-surface__entry')).toHaveCount(0);
    await expect(screenContent(page).locator('.ui-empty-state')).toHaveCount(0);

    const command = `docker ps --filter label=vexel.e2e-empty-state-${Date.now()}`;
    await submit(page, command);
    await expect(entryFor(page, command)).toContainText('exit 0', { timeout: 20_000 });

    await expect(screenContent(page).locator('.ui-empty-state')).toHaveCount(0);
  });
});
